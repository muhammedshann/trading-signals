import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { kickTelegramMember, telegramCall, unbanTelegramMember } from '@/lib/telegram/bot-api';

export const runtime = 'nodejs';

type TelegramUser = { id: number; username?: string; first_name?: string; last_name?: string };
type Member = { status: string; is_member?: boolean; user: TelegramUser };
type ChatMemberUpdate = { chat: { id: number | string }; date: number; invite_link?: { invite_link: string }; old_chat_member: Member; new_chat_member: Member };
type JoinRequest = { chat: { id: number | string }; from: TelegramUser; date: number; invite_link?: { invite_link: string } };
type TextMessage = { message_id: number; chat: { id: number | string; type: string }; from?: TelegramUser; text?: string };
type CallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: { message_id: number; chat: { id: number | string; type: string }; text?: string };
  data?: string;
};
type Update = {
  message?: TextMessage;
  chat_join_request?: JoinRequest;
  chat_member?: ChatMemberUpdate;
  callback_query?: CallbackQuery;
};

function hasValidSecret(header: string | null, expected: string) {
  if (!header) return false;
  const received = Buffer.from(header);
  const configured = Buffer.from(expected);
  return received.length === configured.length && timingSafeEqual(received, configured);
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function notifyUser(chatId: number | string, text: string, replyMarkup?: Record<string, unknown>, parseMode: string = 'HTML') {
  const payload: Record<string, unknown> = { chat_id: chatId, text, parse_mode: parseMode };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  await telegramCall('sendMessage', payload);
}

async function generateInviteLink(
  chatId: string,
  userId: string,
  subscriptionId: string,
  admin: ReturnType<typeof createAdminClient>
): Promise<string> {
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const expireUnix = Math.floor(expiresAt.getTime() / 1000);
  let inviteLink: string;

  try {
    const invite = await telegramCall<{ invite_link: string }>('createChatInviteLink', {
      chat_id: chatId,
      expire_date: expireUnix,
      member_limit: 1,
      name: `member-${userId.slice(0, 8)}`,
    });
    inviteLink = invite.invite_link;
  } catch (err) {
    console.warn('createChatInviteLink with member_limit: 1 failed, trying creates_join_request: true:', err);
    const invite = await telegramCall<{ invite_link: string }>('createChatInviteLink', {
      chat_id: chatId,
      expire_date: expireUnix,
      creates_join_request: true,
      name: `member-${userId.slice(0, 8)}`,
    });
    inviteLink = invite.invite_link;
  }

  const inviteHash = hash(inviteLink);
  await admin.from('telegram_invites').insert({
    invite_hash: inviteHash,
    user_id: userId,
    subscription_id: subscriptionId,
    expires_at: expiresAt.toISOString(),
  });

  return inviteLink;
}

async function handleConnectMessage(admin: ReturnType<typeof createAdminClient>, message: TextMessage) {
  const text = message.text ?? '';
  if (!message.from || message.chat.type !== 'private') return;
  const telegramUserId = String(message.from.id);
  const now = new Date().toISOString();
  const chatId = process.env.TELEGRAM_CHAT_ID;

  const command = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?\s*$/i);
  if (!command) {
    if (/^\/verify(?:@\w+)?/i.test(text)) {
      const { data: pendingCode } = await admin.from('telegram_link_codes')
        .select('id,user_id,expires_at,used_at')
        .eq('claimed_telegram_user_id', telegramUserId)
        .is('used_at', null)
        .gt('expires_at', now)
        .order('claimed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pendingCode) {
        await notifyUser(message.chat.id, 'Tap <b>Yes, Verify & Join Group</b> below to complete verification:', {
          inline_keyboard: [
            [{ text: '✅ Yes, Verify & Join Group', callback_data: `verify:${pendingCode.id}` }],
            [{ text: '❌ Cancel', callback_data: `cancel:${pendingCode.id}` }],
          ],
        });
        return;
      }
    }
    return;
  }

  const payload = command[1]?.trim();

  // If user sent /start with no payload:
  if (!payload) {
    const { data: verifiedMember } = await admin.from('telegram_members')
      .select('user_id,verified_at')
      .eq('telegram_user_id', telegramUserId)
      .not('verified_at', 'is', null)
      .maybeSingle();

    if (verifiedMember) {
      const { data: subscription } = await admin.from('subscriptions')
        .select('id')
        .eq('user_id', verifiedMember.user_id)
        .eq('status', 'active')
        .gt('expires_at', now)
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subscription && chatId) {
        try {
          const inviteLink = await generateInviteLink(chatId, verifiedMember.user_id, subscription.id, admin);
          await notifyUser(
            message.chat.id,
            '👋 <b>Welcome back!</b>\n\nYour Telegram account is verified and connected to an active VIP Signals membership.\n\nTap below to enter the private group:',
            {
              inline_keyboard: [
                [{ text: '🚀 Enter VIP Signals Group', url: inviteLink }],
              ],
            }
          );
          return;
        } catch (err) {
          console.error('Failed to generate invite for existing verified member:', err);
        }
      }
    }

    await notifyUser(
      message.chat.id,
      '👋 <b>Welcome to SignalRoom VIP Signals!</b>\n\nTo connect your Telegram account and join the private group:\n1. Log in to your account on our website.\n2. In your member dashboard, click <b>Connect my Telegram</b>.\n3. Open that one-time link here to verify your account directly.'
    );
    return;
  }

  if (!/^[A-Za-z0-9_-]{20,128}$/.test(payload)) {
    await notifyUser(
      message.chat.id,
      '⚠️ <b>Invalid Link</b>\n\nThat Telegram connection link is not valid. Sign in to your membership dashboard on the website and create a fresh link.'
    );
    return;
  }

  const codeHash = hash(payload);
  const { data: code, error: codeError } = await admin.from('telegram_link_codes')
    .select('id,user_id,expires_at,used_at,claimed_at').eq('code_hash', codeHash).maybeSingle();
  if (codeError) throw codeError;
  if (!code || code.used_at || code.expires_at <= now) {
    await notifyUser(
      message.chat.id,
      '⚠️ <b>Expired Link</b>\n\nThat connection link has expired or was already used. Sign in to your membership page and create a new link.'
    );
    return;
  }

  const { data: subscription, error: subscriptionError } = await admin.from('subscriptions').select('id')
    .eq('user_id', code.user_id).eq('status', 'active').gt('expires_at', now)
    .order('expires_at', { ascending: false }).limit(1).maybeSingle();
  if (subscriptionError) throw subscriptionError;
  if (!subscription) {
    await notifyUser(
      message.chat.id,
      '⚠️ <b>Active Subscription Required</b>\n\nNo active membership subscription was found for this account. Please verify your membership on the website.'
    );
    return;
  }

  const { data: existingForTelegram, error: existingError } = await admin.from('telegram_members')
    .select('user_id,verified_at').eq('telegram_user_id', telegramUserId).maybeSingle();
  if (existingError) throw existingError;
  if (existingForTelegram && existingForTelegram.user_id !== code.user_id) {
    await notifyUser(
      message.chat.id,
      '⚠️ <b>Account Conflict</b>\n\nThis Telegram account is already connected to another membership. Each Telegram account can only be linked to one membership.'
    );
    return;
  }

  const { data: existingForUser, error: userMappingError } = await admin.from('telegram_members')
    .select('telegram_user_id').eq('user_id', code.user_id).not('verified_at', 'is', null).maybeSingle();
  if (userMappingError) throw userMappingError;
  if (existingForUser && existingForUser.telegram_user_id !== telegramUserId) {
    await notifyUser(
      message.chat.id,
      '⚠️ <b>Account Conflict</b>\n\nA different Telegram account is already connected to your membership. Contact support if you need to switch accounts.'
    );
    return;
  }

  if (existingForTelegram?.verified_at && existingForUser?.telegram_user_id === telegramUserId && chatId) {
    const inviteLink = await generateInviteLink(chatId, code.user_id, subscription.id, admin);
    await notifyUser(
      message.chat.id,
      '✅ <b>Account Already Verified!</b>\n\nYour Telegram account is already verified and connected to your active membership.\n\nTap below to enter the private group:',
      {
        inline_keyboard: [
          [{ text: '🚀 Enter VIP Signals Group', url: inviteLink }],
        ],
      }
    );
    return;
  }

  const displayName = [message.from.first_name, message.from.last_name].filter(Boolean).join(' ').slice(0, 120) || null;
  const { data: claimed, error: claimError } = await admin.from('telegram_link_codes').update({
    claimed_at: now,
    claimed_telegram_user_id: telegramUserId,
    claimed_username: message.from.username ?? null,
    claimed_display_name: displayName,
  }).eq('id', code.id).is('used_at', null).gt('expires_at', now).select('id').maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) {
    await notifyUser(
      message.chat.id,
      '⚠️ <b>Expired Link</b>\n\nThis connection link has already been used or expired. Create a new one from your membership page.'
    );
    return;
  }

  const accountLabel = escapeHtml(displayName ?? 'Telegram user');
  const usernameLabel = message.from.username ? ` (@${escapeHtml(message.from.username)})` : '';
  const promptText = `👋 <b>Membership Verification</b>\n\n` +
    `We found your active VIP Signals membership!\n\n` +
    `<b>Is this the Telegram account you want to verify and connect?</b>\n` +
    `👤 <b>Account:</b> ${accountLabel}${usernameLabel}\n` +
    `🆔 <b>Telegram ID:</b> <code>${telegramUserId}</code>\n\n` +
    `Tap <b>'Yes, Verify & Join Group'</b> below to confirm. The bot will instantly verify your account and provide direct entry into the VIP group:`;

  await notifyUser(message.chat.id, promptText, {
    inline_keyboard: [
      [{ text: '✅ Yes, Verify & Join Group', callback_data: `verify:${code.id}` }],
      [{ text: '❌ Cancel', callback_data: `cancel:${code.id}` }],
    ],
  });
}

async function handleCallbackQuery(admin: ReturnType<typeof createAdminClient>, query: CallbackQuery) {
  const data = query.data ?? '';
  const from = query.from;
  const telegramUserId = String(from.id);
  const now = new Date().toISOString();
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (data.startsWith('cancel:')) {
    await telegramCall('answerCallbackQuery', {
      callback_query_id: query.id,
      text: 'Verification cancelled.',
    });
    if (query.message) {
      await telegramCall('editMessageText', {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        text: '❌ <b>Verification Cancelled</b>\n\nYou can connect your Telegram account anytime from your member dashboard on the website.',
        parse_mode: 'HTML',
      }).catch(() => {});
    }
    return;
  }

  if (!data.startsWith('verify:')) return;
  const codeId = data.slice(7).trim();

  const { data: code, error: codeError } = await admin.from('telegram_link_codes')
    .select('id,user_id,expires_at,used_at,claimed_telegram_user_id')
    .eq('id', codeId)
    .maybeSingle();

  if (codeError) throw codeError;

  if (!code || code.used_at || code.expires_at <= now) {
    await telegramCall('answerCallbackQuery', {
      callback_query_id: query.id,
      text: 'This verification link has expired or was already used. Please get a fresh link from the website.',
      show_alert: true,
    });
    if (query.message) {
      await telegramCall('editMessageText', {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        text: '⚠️ <b>Verification Expired</b>\n\nThis verification link has expired or was already used. Please log in to the website and click "Connect my Telegram" to get a fresh link.',
        parse_mode: 'HTML',
      }).catch(() => {});
    }
    return;
  }

  if (code.claimed_telegram_user_id && code.claimed_telegram_user_id !== telegramUserId) {
    await telegramCall('answerCallbackQuery', {
      callback_query_id: query.id,
      text: 'This verification was initiated for a different Telegram account.',
      show_alert: true,
    });
    return;
  }

  const { data: subscription, error: subscriptionError } = await admin.from('subscriptions')
    .select('id')
    .eq('user_id', code.user_id)
    .eq('status', 'active')
    .gt('expires_at', now)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscriptionError) throw subscriptionError;
  if (!subscription) {
    await telegramCall('answerCallbackQuery', {
      callback_query_id: query.id,
      text: 'No active subscription found. Please check your membership on the website.',
      show_alert: true,
    });
    return;
  }

  const { data: existingForTelegram, error: telegramMappingError } = await admin.from('telegram_members')
    .select('user_id,verified_at').eq('telegram_user_id', telegramUserId).maybeSingle();
  if (telegramMappingError) throw telegramMappingError;
  if (existingForTelegram && existingForTelegram.user_id !== code.user_id) {
    await telegramCall('answerCallbackQuery', {
      callback_query_id: query.id,
      text: 'This Telegram account is already connected to another membership.',
      show_alert: true,
    });
    return;
  }

  const { data: existingForUser, error: userMappingError } = await admin.from('telegram_members')
    .select('telegram_user_id').eq('user_id', code.user_id).not('verified_at', 'is', null).maybeSingle();
  if (userMappingError) throw userMappingError;
  if (existingForUser && existingForUser.telegram_user_id !== telegramUserId) {
    await telegramCall('answerCallbackQuery', {
      callback_query_id: query.id,
      text: 'A different Telegram account is already connected to your membership.',
      show_alert: true,
    });
    return;
  }

  const displayName = [from.first_name, from.last_name].filter(Boolean).join(' ').slice(0, 120) || null;

  const { data: consumed, error: consumeError } = await admin.from('telegram_link_codes').update({
    used_at: now,
    claimed_at: now,
    claimed_telegram_user_id: telegramUserId,
    claimed_username: from.username ?? null,
    claimed_display_name: displayName,
  }).eq('id', code.id).is('used_at', null).select('id').maybeSingle();

  if (consumeError) throw consumeError;
  if (!consumed) {
    await telegramCall('answerCallbackQuery', {
      callback_query_id: query.id,
      text: 'This link was already consumed.',
      show_alert: true,
    });
    return;
  }

  if (!existingForTelegram) {
    const { error: insertError } = await admin.from('telegram_members').insert({
      telegram_user_id: telegramUserId,
      user_id: code.user_id,
      username: from.username ?? null,
      display_name: displayName,
      verified_at: now,
    });
    if (insertError) throw insertError;
  } else {
    const { error: updateError } = await admin.from('telegram_members').update({
      username: from.username ?? null,
      display_name: displayName,
      verified_at: now,
      kicked_at: null,
    }).eq('telegram_user_id', telegramUserId);
    if (updateError) throw updateError;
  }

  if (chatId) {
    try {
      await unbanTelegramMember(chatId, from.id);
    } catch (unbanErr) {
      console.warn('Could not unban member (may not be banned):', unbanErr);
    }
  }

  let inviteLink: string | null = null;
  if (chatId) {
    try {
      inviteLink = await generateInviteLink(chatId, code.user_id, subscription.id, admin);
    } catch (inviteErr) {
      console.error('Failed to generate invite link after verification:', inviteErr);
    }
  }

  await telegramCall('answerCallbackQuery', {
    callback_query_id: query.id,
    text: '✅ Verified successfully!',
  });

  const successText = inviteLink
    ? `🎉 <b>Verification Successful!</b>\n\nYour Telegram account is now verified and connected to your active VIP Signals membership.\n\nTap the button below to enter the private VIP Signals group:`
    : `🎉 <b>Verification Successful!</b>\n\nYour Telegram account is verified. Group configuration is being finalized.`;

  const replyMarkup = inviteLink
    ? {
        inline_keyboard: [
          [{ text: '🚀 Enter VIP Signals Group', url: inviteLink }],
        ],
      }
    : undefined;

  if (query.message) {
    await telegramCall('editMessageText', {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      text: successText,
      parse_mode: 'HTML',
      reply_markup: replyMarkup,
    }).catch(async (editErr) => {
      console.warn('editMessageText failed, sending new message:', editErr);
      if (inviteLink) {
        await notifyUser(
          from.id,
          `🎉 <b>Verification Successful!</b>\n\nTap below to enter the private VIP Signals group:\n\n<a href="${inviteLink}">👉 Join VIP Signals Group</a>`
        );
      }
    });
  } else if (inviteLink) {
    await notifyUser(
      from.id,
      `🎉 <b>Verification Successful!</b>\n\nTap below to enter the private VIP Signals group:\n\n<a href="${inviteLink}">👉 Join VIP Signals Group</a>`
    );
  }
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

  let valid = Boolean(member?.verified_at);
  if (valid && member) {
    if (request.invite_link?.invite_link) {
      const { data: invite, error: inviteError } = await admin.from('telegram_invites')
        .select('id,user_id,subscription_id,expires_at,used_at')
        .eq('invite_hash', hash(request.invite_link.invite_link)).maybeSingle();
      if (inviteError) throw inviteError;
      if (invite && (invite.user_id !== member.user_id || invite.used_at || invite.expires_at <= now)) {
        valid = false;
      }
    }

    if (valid) {
      const { data: subscription, error } = await admin.from('subscriptions').select('id')
        .eq('user_id', member.user_id).eq('status', 'active')
        .gt('expires_at', now).maybeSingle();
      if (error) throw error;
      valid = Boolean(subscription);
    }

    if (valid) {
      await telegramCall('approveChatJoinRequest', { chat_id: chatId, user_id: request.from.id });
      if (request.invite_link?.invite_link) {
        await admin.from('telegram_invites').update({ used_at: now })
          .eq('invite_hash', hash(request.invite_link.invite_link)).is('used_at', null);
      }
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
    if (update.callback_query) await handleCallbackQuery(admin, update.callback_query);
    if (update.chat_join_request) await handleJoinRequest(admin, update.chat_join_request);
    if (update.chat_member) await handleGroupJoin(admin, update.chat_member);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook handling failed:', error);
    if (update?.message?.chat.type === 'private') {
      try {
        await notifyUser(
          update.message.chat.id,
          '⚠️ I could not verify this Telegram connection right now. Return to the signed-in membership website, create a fresh Telegram link, and try again.'
        );
        return NextResponse.json({ ok: true });
      } catch (replyError) {
        console.error('Could not send Telegram connection error reply:', replyError);
      }
    }
    return NextResponse.json({ error: 'Webhook handling failed.' }, { status: 500 });
  }
}
