import 'server-only';
import type { createAdminClient } from '@/lib/supabase/admin';
import { sendMembershipReceiptEmail, type MembershipReceipt } from '@/lib/email/gmail';

type AdminClient = ReturnType<typeof createAdminClient>;

export async function sendReceiptOnce(admin: AdminClient, agreementId: string | null, receipt: MembershipReceipt) {
  if (!agreementId) return 'pending' as const;
  const now = new Date().toISOString();
  const staleSendingBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await admin.from('agreement_acceptances')
    .update({ receipt_email_status: 'failed' })
    .eq('id', agreementId)
    .eq('receipt_email_status', 'sending')
    .lt('receipt_email_updated_at', staleSendingBefore);

  const { data: claim, error: claimError } = await admin.from('agreement_acceptances')
    .update({ receipt_email_status: 'sending', receipt_email_updated_at: now })
    .eq('id', agreementId)
    .in('receipt_email_status', ['pending', 'failed'])
    .select('id')
    .maybeSingle();
  if (claimError) {
    console.error('Could not claim membership receipt email:', claimError);
    return 'failed' as const;
  }
  if (!claim) {
    const { data: current } = await admin.from('agreement_acceptances').select('receipt_email_status').eq('id', agreementId).maybeSingle();
    if (current?.receipt_email_status === 'sent') return 'sent' as const;
    if (current?.receipt_email_status === 'sending') return 'sending' as const;
    return 'pending' as const;
  }

  try {
    await sendMembershipReceiptEmail(receipt);
    const { error } = await admin.from('agreement_acceptances').update({
      receipt_email_status: 'sent', receipt_email_updated_at: new Date().toISOString(),
    }).eq('id', agreementId);
    if (error) throw error;
    return 'sent' as const;
  } catch (error) {
    console.error('Membership receipt email could not be sent:', error);
    await admin.from('agreement_acceptances').update({
      receipt_email_status: 'failed', receipt_email_updated_at: new Date().toISOString(),
    }).eq('id', agreementId);
    return 'failed' as const;
  }
}
