import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { kickTelegramMember, telegramCall } from '@/lib/telegram/bot-api';

export const runtime = 'nodejs';

type TelegramUser = { id: number; username?: string; first_name?: string; last_name?: string };
type Member = { status: string; is_member?: boolean; user: TelegramUser };
type ChatMemberUpdate = { chat: { id: number | string }; date: number; invite_link?: { invite_link: string }; old_chat_member: Member; new_chat_member: Member };
type JoinRequest = { chat: { id: number | string }; from: TelegramUser; date: number; invite_link?: { invite_link: string } };
type TextMessage = { chat: { id: number | string; type: string }; from?: TelegramUser; text?: string };
type Update = { message?: TextMessage; chat_join_request?: JoinRequest; chat_member?: ChatMemberUpdate };

function hasValidSecret(header: string | null, expected: string) {
  if (!header) return false;
  const received = Buffer.from(header);
  const configured = Buffer.from(expected);
  return received.length === configured.length && timingSafeEqual(received, configured);
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

async function notifyUser(chatId: number | string, text: string) {
  await telegramCall('sendMessage', { chat_id: chatId, text });
}

async function handleConnectMessage(admin: ReturnType<typeof createAdminClient>, message: TextMessage) {
  const text = message.text ?? '';
  if (!message.from || message.chat.type !== 'private') return;
  const command = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?\s*$/i);
  if (!command) return;
  const payload = command[1]?.trim();
  if (!payload) {
    await notifyUser(message.chat.id, 'Hi! To connect Telegram, sign in to the membership website, choose “Connect my Telegram,” then open that one-time link here. Starting this bot by itself does not grant group access.');
    return;
  }
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(payload)) {
    await notifyUser(message.chat.id, 'That Telegram connection link is not valid. Sign in to the membership website and create a fresh link.');
    return;
  }

  const codeHash = hash(payload);
  const now = new Date().toISOString();
  const telegramUserId = String(message.from.id);
  const { data: code, error: codeError } = await admin.from('telegram_link_codes')
    .select('id,user_id,expires_at,used_at,claimed_at').eq('code_hash', codeHash).maybeSingle();
  if (codeError) throw codeError;
  if (!code || code.used_at || code.expires_at <= now) {
    await notifyUser(message.chat.id, 'That connection link has expired or was already used. Sign in to your membership page and create a new one.');
    return;
  }

  const { data: subscription, error: subscriptionError } = await admin.from('subscriptions').select('id')
    .eq('user_id', code.user_id).eq('status', 'active').gt('expires_at', now)
    .order('expires_at', { ascending: false }).limit(1).maybeSingle();
  if (subscriptionError) throw subscriptionError;
  const { data: existing, error: existingError } = await admin.from('telegram_members')
    .select('user_id,verified_at').eq('telegram_user_id', telegramUserId).maybeSingle();
  if (existingError) throw existingError;
  const { data: existingForUser, error: userMappingError } = await admin.from('telegram_members')
    .select('telegram_user_id').eq('user_id', code.user_id).not('verified_at', 'is', null).maybeSingle();
  if (userMappingError) throw userMappingError;
  if (!subscription || code.claimed_at || (existing && existing.user_id !== code.user_id) || existingForUser) {
    await notifyUser(message.chat.id, 'This Telegram account could not be connected. Make sure you are using the account you want to join the group with, and that your membership is active.');
    return;
  }

  const displayName = [message.from.first_name, message.from.last_name].filter(Boolean).join(' ').slice(0, 120) || null;
  const { data: claimed, error: claimError } = await admin.from('telegram_link_codes').update({
    claimed_at: now,
    claimed_telegram_user_id: telegramUserId,
    claimed_username: message.from.username ?? null,
    claimed_display_name: displayName,
  }).eq('id', code.id).is('used_at', null).is('claimed_at', null).gt('expires_at', now).select('id').maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) {
    await notifyUser(message.chat.id, 'This connection link has already been used or expired. Create a new one from your membership page.');
    return;
  }
  const accountLabel = `${displayName ?? 'Telegram user'}${message.from.username ? ` (@${message.from.username})` : ''}`;
  await notifyUser(message.chat.id, `Telegram account detected: ${accountLabel} (ID ending ${telegramUserId.slice(-4)}). No group access has been granted. Return to the signed-in membership website and confirm this is your account.`);
}

async function handleJoinRequest(admin: ReturnType<typeof createAdminClient>, request: JoinRequest) {
  const chatId = String(request.chat.id);
  const expectedChat = process.env.TELEGRAM_CHAT_ID;
  const telegramUserId = String(request.from.id);
  if (!expectedChat || chatId !== expectedChat) return;

  const now = new Date().toISOString();
  const { data: member, error: memberError } = await admin.from('telegram_members')
    .select('user_id,verified_at').eq('telegram_user_id', telegramUserId).maybeSingle();
  if (memberError) throw memberError;

  let valid = Boolean(member?.verified_at && request.invite_link?.invite_link);
  if (valid && member && request.invite_link) {
    const { data: invite, error: inviteError } = await admin.from('telegram_invites')
      .select('id,user_id,subscription_id,expires_at,used_at')
      .eq('invite_hash', hash(request.invite_link.invite_link)).maybeSingle();
    if (inviteError) throw inviteError;
    valid = Boolean(invite && invite.user_id === member.user_id && !invite.used_at && invite.expires_at > now);
    if (invite && valid) {
      const { data: subscription, error } = await admin.from('subscriptions').select('id')
        .eq('id', invite.subscription_id).eq('user_id', member.user_id).eq('status', 'active')
        .gt('expires_at', now).maybeSingle();
      if (error) throw error;
      valid = Boolean(subscription);
    }
    if (invite && valid) {
      await telegramCall('approveChatJoinRequest', { chat_id: chatId, user_id: request.from.id });
      const { error } = await admin.from('telegram_invites').update({ used_at: now }).eq('id', invite.id).is('used_at', null);
      if (error) throw error;
      return;
    }
  }
  await telegramCall('declineChatJoinRequest', { chat_id: chatId, user_id: request.from.id });
}

async function handleGroupJoin(admin: ReturnType<typeof createAdminClient>, change: ChatMemberUpdate) {
  const oldStatus = change.old_chat_member.status;
  const newMember = change.new_chat_member;
  const newStatus = newMember.status;
  const joined = (['member', 'administrator', 'creator'].includes(newStatus)
    || (newStatus === 'restricted' && newMember.is_member === true))
    && (['left', 'kicked'].includes(oldStatus)
      || (oldStatus === 'restricted' && change.old_chat_member.is_member === false));
  if (!joined) return;

  const expectedChat = process.env.TELEGRAM_CHAT_ID;
  const chatId = String(change.chat.id);
  const telegramUserId = String(newMember.user.id);
  if (!expectedChat || chatId !== expectedChat) return;

  const now = new Date().toISOString();
  const { data: member, error: memberError } = await admin.from('telegram_members')
    .select('user_id,verified_at').eq('telegram_user_id', telegramUserId).maybeSingle();
  if (memberError) throw memberError;
  const { data: subscription, error: subscriptionError } = member?.verified_at
    ? await admin.from('subscriptions').select('id').eq('user_id', member.user_id)
      .eq('status', 'active').gt('expires_at', now).order('expires_at', { ascending: false }).limit(1).maybeSingle()
    : { data: null, error: null };
  if (subscriptionError) throw subscriptionError;

  if (!member?.verified_at || !subscription) {
    await kickTelegramMember(chatId, telegramUserId);
    return;
  }

  const { error: updateError } = await admin.from('telegram_members').update({
    username: newMember.user.username ?? null,
    joined_at: new Date(change.date * 1000).toISOString(),
    kicked_at: null,
  }).eq('telegram_user_id', telegramUserId);
  if (updateError) throw updateError;
}

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !hasValidSecret(request.headers.get('x-telegram-bot-api-secret-token'), secret)) {
    console.error('Telegram webhook rejected: missing or mismatched TELEGRAM_WEBHOOK_SECRET.');
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  let update: Update | undefined;
  try {
    update = await request.json() as Update;
    const admin = createAdminClient();
    if (update.message) await handleConnectMessage(admin, update.message);
    if (update.chat_join_request) await handleJoinRequest(admin, update.chat_join_request);
    if (update.chat_member) await handleGroupJoin(admin, update.chat_member);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook handling failed:', error);
    if (update?.message?.chat.type === 'private') {
      try {
        await notifyUser(update.message.chat.id, 'I could not verify this Telegram connection right now. Return to the signed-in membership website, create a fresh Telegram link, and try again.');
        // The user has been told how to retry; stop Telegram from replaying this message update.
        return NextResponse.json({ ok: true });
      } catch (replyError) {
        console.error('Could not send Telegram connection error reply:', replyError);
      }
    }
    return NextResponse.json({ error: 'Webhook handling failed.' }, { status: 500 });
  }
}
