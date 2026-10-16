import 'server-only';
import type { createAdminClient } from '@/lib/supabase/admin';
import {
  sendSubscriptionExpiryWarningEmail,
  sendSubscriptionExpiredEmail,
} from '@/lib/email/gmail';

type AdminDb = ReturnType<typeof createAdminClient>;

export type ExpiryProcessResult = {
  checkedWarnings: number;
  sentWarnings: number;
  checkedExpired: number;
  sentExpired: number;
  warningsFailed: number;
  expiredFailed: number;
  dbNotice?: string;
};

export async function processSubscriptionExpiryEmails(
  admin: AdminDb,
  siteUrlOverride?: string
): Promise<ExpiryProcessResult> {
  const siteUrl = (siteUrlOverride || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const now = new Date();
  const nowIso = now.toISOString();

  const result: ExpiryProcessResult = {
    checkedWarnings: 0,
    sentWarnings: 0,
    checkedExpired: 0,
    sentExpired: 0,
    warningsFailed: 0,
    expiredFailed: 0,
  };

  // 1. Process Day-Before Expiry Warnings:
  // Target: Subscriptions that are currently active and will expire within the next 24 hours (now <= expires_at <= now + 24h)
  const warnHorizon = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  let warningSubs: any[] = [];
  try {
    const { data, error } = await admin
      .from('subscriptions')
      .select('id, user_id, plan_id, expires_at, expiry_warning_sent_at, plans(name)')
      .eq('status', 'active')
      .gte('expires_at', nowIso)
      .lte('expires_at', warnHorizon)
      .is('expiry_warning_sent_at', null)
      .limit(100);

    if (error) {
      if (error.code === 'PGRST204' || error.message?.includes('expiry_warning_sent_at')) {
        result.dbNotice = 'Missing expiry_warning_sent_at column. Apply supabase/migrations/202610160001_subscription_expiry_notifications.sql';
        console.warn('[EXPIRY CRON]', result.dbNotice);
      } else {
        console.error('[EXPIRY CRON] Warning query error:', error);
      }
    } else {
      warningSubs = data || [];
    }
  } catch (err) {
    console.error('[EXPIRY CRON] Unexpected error fetching warnings:', err);
  }

  result.checkedWarnings = warningSubs.length;

  for (const sub of warningSubs) {
    try {
      // Check if user already renewed (has a newer active subscription expiring later)
      const { data: futureSubs } = await admin
        .from('subscriptions')
        .select('id')
        .eq('user_id', sub.user_id)
        .eq('status', 'active')
        .gt('expires_at', sub.expires_at)
        .limit(1);

      if (futureSubs && futureSubs.length > 0) {
        // User already has an extended subscription, skip sending warning
        await admin
          .from('subscriptions')
          .update({ expiry_warning_sent_at: nowIso })
          .eq('id', sub.id);
        continue;
      }

      // Fetch user profile for email and name
      const { data: profile } = await admin
        .from('profiles')
        .select('email, full_name')
        .eq('id', sub.user_id)
        .maybeSingle();

      if (!profile?.email) continue;

      const planObj = Array.isArray(sub.plans) ? sub.plans[0] : sub.plans;
      const planName = planObj?.name || 'VIP Membership';

      await sendSubscriptionExpiryWarningEmail({
        to: profile.email,
        fullName: profile.full_name,
        planName,
        expiresAt: sub.expires_at,
        siteUrl,
      });

      await admin
        .from('subscriptions')
        .update({ expiry_warning_sent_at: nowIso })
        .eq('id', sub.id);

      result.sentWarnings += 1;
    } catch (err) {
      result.warningsFailed += 1;
      console.error('[EXPIRY CRON] Failed sending warning to sub:', sub.id, err);
    }
  }

  // 2. Process Day-After Expiry Notices:
  // Target: Subscriptions that expired at least 24 hours ago (expires_at <= now - 24h) and within recent window (expires_at >= now - 4d)
  const expiredMinAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const expiredMaxAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString();

  let expiredSubs: any[] = [];
  try {
    const { data, error } = await admin
      .from('subscriptions')
      .select('id, user_id, plan_id, expires_at, expired_email_sent_at, plans(name)')
      .lte('expires_at', expiredMinAgo)
      .gte('expires_at', expiredMaxAgo)
      .is('expired_email_sent_at', null)
      .limit(100);

    if (error) {
      if (error.code === 'PGRST204' || error.message?.includes('expired_email_sent_at')) {
        result.dbNotice = 'Missing expired_email_sent_at column. Apply supabase/migrations/202610160001_subscription_expiry_notifications.sql';
        console.warn('[EXPIRY CRON]', result.dbNotice);
      } else {
        console.error('[EXPIRY CRON] Expired query error:', error);
      }
    } else {
      expiredSubs = data || [];
    }
  } catch (err) {
    console.error('[EXPIRY CRON] Unexpected error fetching expired subs:', err);
  }

  result.checkedExpired = expiredSubs.length;

  for (const sub of expiredSubs) {
    try {
      // Check if user has an active subscription right now (renewed in the meantime)
      const { data: currentActive } = await admin
        .from('subscriptions')
        .select('id')
        .eq('user_id', sub.user_id)
        .eq('status', 'active')
        .gt('expires_at', nowIso)
        .limit(1);

      if (currentActive && currentActive.length > 0) {
        // User is currently active, skip expired notification
        await admin
          .from('subscriptions')
          .update({ expired_email_sent_at: nowIso })
          .eq('id', sub.id);
        continue;
      }

      // Fetch user profile
      const { data: profile } = await admin
        .from('profiles')
        .select('email, full_name')
        .eq('id', sub.user_id)
        .maybeSingle();

      if (!profile?.email) continue;

      const planObj = Array.isArray(sub.plans) ? sub.plans[0] : sub.plans;
      const planName = planObj?.name || 'VIP Membership';

      await sendSubscriptionExpiredEmail({
        to: profile.email,
        fullName: profile.full_name,
        planName,
        expiresAt: sub.expires_at,
        siteUrl,
      });

      await admin
        .from('subscriptions')
        .update({ expired_email_sent_at: nowIso })
        .eq('id', sub.id);

      result.sentExpired += 1;
    } catch (err) {
      result.expiredFailed += 1;
      console.error('[EXPIRY CRON] Failed sending expired notice to sub:', sub.id, err);
    }
  }

  return result;
}
