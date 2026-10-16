import 'server-only';

function wrapBase64(value: string) {
  return Buffer.from(value, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
}

function encodeRawEmail(to: string, from: string, subject: string, textBody: string, htmlBody: string) {
  const boundary = `signalroom_${crypto.randomUUID().replaceAll('-', '')}`;
  const raw = [
    `From: Signalroom <${from}>`, `To: ${to}`, `Subject: ${subject}`,
    'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrapBase64(textBody),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrapBase64(htmlBody),
    `--${boundary}--`, '',
  ].join('\r\n');
  return Buffer.from(raw).toString('base64url');
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

async function getGmailAccessToken() {
  const sender = process.env.GMAIL_SENDER_EMAIL;
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!sender || !clientId || !clientSecret || !refreshToken) throw new Error('Google email credentials are not configured.');

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    cache: 'no-store',
  });
  const tokenResult = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
  if (!tokenResponse.ok || !tokenResult.access_token) {
    console.error('Google OAuth token refresh failed:', tokenResponse.status, tokenResult.error || 'unknown error', tokenResult.error_description || '');
    throw new Error('Google could not authorize the email sender.');
  }
  return { sender, accessToken: tokenResult.access_token };
}

async function sendGmailMessage(to: string, subject: string, textBody: string, htmlBody: string) {
  const { sender, accessToken } = await getGmailAccessToken();
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encodeRawEmail(to, sender, subject, textBody, htmlBody) }),
    cache: 'no-store',
  });
  if (!response.ok) {
    const details = await response.text();
    console.error('Gmail API send failed:', response.status, details.slice(0, 1000));
    throw new Error('Google could not send the email. Check the server log for the Gmail API response.');
  }
}

async function sendViaResend(to: string, subject: string, textBody: string, htmlBody: string) {
  const apiKey = process.env.RESEND_API_KEY!;
  const from = process.env.RESEND_FROM_EMAIL || 'Signalroom <onboarding@resend.dev>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text: textBody,
      html: htmlBody,
    }),
    cache: 'no-store',
  });
  if (!response.ok) {
    const details = await response.text();
    console.error('Resend API send failed:', response.status, details);
    throw new Error(`Resend could not send email: ${details}`);
  }
}

async function dispatchEmail(to: string, subject: string, textBody: string, htmlBody: string) {
  if (process.env.RESEND_API_KEY) {
    await sendViaResend(to, subject, textBody, htmlBody);
  } else {
    await sendGmailMessage(to, subject, textBody, htmlBody);
  }
}

export async function sendOtpEmail({ to, code, verificationUrl, purpose }: {
  to: string; code: string; verificationUrl: string | null; purpose: 'signup' | 'login' | 'reset';
}) {
  const hasResend = Boolean(process.env.RESEND_API_KEY);
  const sender = process.env.RESEND_FROM_EMAIL || process.env.GMAIL_SENDER_EMAIL;
  if (!hasResend && !sender) throw new Error('Email credentials are not configured.');

  const escapedUrl = verificationUrl ? escapeHtml(verificationUrl) : null;
  const title = purpose === 'signup' ? 'Confirm your email' : purpose === 'reset' ? 'Reset your password' : 'Your sign-in code';
  const instruction = purpose === 'signup' ? 'create your Signalroom account' : purpose === 'reset' ? 'reset your Signalroom password' : 'sign in to your Signalroom account';
  const linkText = verificationUrl ? `\n\nEnter the code in the open Signalroom page, or use this link to verify automatically:\n${verificationUrl}` : '';
  const textBody = `SIGNALROOM\n\n${title}\n\nYour one-time code is: ${code}\n\nEnter the code in the Signalroom page where you requested it.${linkText}\n\nIf you did not request this email, you can ignore it. Never share your code.`;
  const linkHtml = escapedUrl ? `<p style="margin:26px 0 20px"><a href="${escapedUrl}" style="display:inline-block;background:#173c35;color:#fff;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:7px">${purpose === 'signup' ? 'Verify email and continue' : 'Verify email'}</a></p><p style="color:#66736e;font-size:13px;line-height:1.6">If the button does not open, copy this link into the browser on the device where you started:<br><a href="${escapedUrl}" style="color:#285b50;word-break:break-all">${escapedUrl}</a></p>` : '';
  const htmlBody = `<!doctype html><html><body style="margin:0;background:#f3f5f3;font-family:Arial,Helvetica,sans-serif;color:#1c2925"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f3;padding:36px 14px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border:1px solid #e2e8e3;border-radius:12px"><tr><td style="padding:30px 32px"><div style="font-size:12px;font-weight:700;letter-spacing:2px;color:#285b50">SIGNALROOM</div><h1 style="margin:24px 0 8px;font-size:24px;line-height:1.3">${title}</h1><p style="margin:0;color:#5b6863;font-size:15px;line-height:1.65">Use this one-time code to ${instruction}.</p><div style="margin:22px 0;padding:17px;text-align:center;background:#f3f6f3;border:1px solid #e1e9e2;border-radius:8px;color:#173c35;font-size:30px;letter-spacing:8px;font-weight:700">${escapeHtml(code)}</div><p style="margin:0;color:#68736f;font-size:13px">Copy and paste this code into the page where you started.</p>${linkHtml}<p style="border-top:1px solid #e8ece9;margin:28px 0 0;padding-top:18px;color:#7a8580;font-size:12px;line-height:1.6">If you did not request this email, ignore it. Never share your verification code.</p></td></tr></table><p style="color:#89928e;font-size:11px;margin:18px 0 0">A secure message from Signalroom</p></td></tr></table></body></html>`;
  const subject = purpose === 'signup' ? 'Confirm your Signalroom account' : purpose === 'reset' ? 'Reset your Signalroom password' : 'Your Signalroom sign-in code';
  await dispatchEmail(to, subject, textBody, htmlBody);
}

export type MembershipReceipt = {
  to: string;
  planName: string;
  amountInr: number;
  paidAt: string;
  startsAt: string;
  expiresAt: string;
  acceptedAt: string;
  paymentId: string;
  subscriptionId: string;
  versions: { terms: string; riskDisclosure: string; privacy: string; refund: string };
  siteUrl: string;
};

export async function sendMembershipReceiptEmail(receipt: MembershipReceipt) {
  const money = `₹${receipt.amountInr.toLocaleString('en-IN')}`;
  const date = (value: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'Asia/Kolkata' }).format(new Date(value));
  const policyLinks = [
    ['Terms & Conditions', '/terms'], ['Risk Disclosure', '/risk-disclaimer'],
    ['Privacy Policy', '/privacy'], ['Refund/Cancellation Policy', '/refund-policy'],
  ] as const;
  const policiesText = policyLinks.map(([name, path]) => `${name}: ${receipt.siteUrl}${path}`).join('\n');
  const textBody = [
    'SIGNALROOM · PAYMENT CONFIRMATION', '', 'Your membership payment has been verified.', '',
    `Plan: ${receipt.planName}`, `Amount: ${money}`, `Paid on: ${date(receipt.paidAt)}`,
    `Access starts: ${date(receipt.startsAt)}`, `Access expires: ${date(receipt.expiresAt)}`,
    `Payment reference: ${receipt.paymentId}`, `Subscription reference: ${receipt.subscriptionId}`,
    `Agreement accepted: ${date(receipt.acceptedAt)}`,
    '', 'Agreement accepted at checkout:', `Terms: ${receipt.versions.terms}`,
    `Risk disclosure: ${receipt.versions.riskDisclosure}`, `Privacy: ${receipt.versions.privacy}`,
    `Refund/cancellation: ${receipt.versions.refund}`, '', policiesText,
    '', 'Trading involves risk. This membership does not guarantee returns. Review the linked policies and make independent trading decisions.',
  ].join('\n');
  const rows = [
    ['Plan', receipt.planName], ['Amount paid', money], ['Payment date', date(receipt.paidAt)],
    ['Access starts', date(receipt.startsAt)], ['Access expires', date(receipt.expiresAt)],
    ['Payment reference', receipt.paymentId], ['Subscription reference', receipt.subscriptionId],
    ['Agreement accepted', date(receipt.acceptedAt)],
    ['Terms & Conditions', receipt.versions.terms], ['Risk Disclosure', receipt.versions.riskDisclosure],
    ['Privacy Policy', receipt.versions.privacy], ['Refund/Cancellation Policy', receipt.versions.refund],
  ];
  const rowsHtml = rows.map(([label, value]) => `<tr><td style="padding:10px 12px;border-bottom:1px solid #e8ece9;color:#6b766e">${escapeHtml(label)}</td><td style="padding:10px 12px;border-bottom:1px solid #e8ece9;text-align:right;font-weight:600;color:#24362a">${escapeHtml(value)}</td></tr>`).join('');
  const linksHtml = policyLinks.map(([name, path]) => `<a href="${escapeHtml(receipt.siteUrl + path)}" style="color:#315c3c;margin-right:12px">${escapeHtml(name)}</a>`).join('');
  const htmlBody = `<!doctype html><html><body style="margin:0;background:#f3f5f3;font-family:Arial,Helvetica,sans-serif;color:#1c2925"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f3;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #e2e8e3;border-radius:12px"><tr><td style="padding:28px"><div style="font-size:12px;font-weight:700;letter-spacing:2px;color:#285b50">SIGNALROOM</div><h1 style="margin:22px 0 6px;font-size:23px">Payment confirmed</h1><p style="margin:0 0 22px;color:#647168;font-size:14px;line-height:1.6">Your membership is active. Keep this email for your records.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e8ece9;border-radius:8px;font-size:13px">${rowsHtml}</table><h2 style="font-size:14px;margin:24px 0 10px">Your policies</h2><p style="font-size:12px;line-height:2">${linksHtml}</p><p style="border-top:1px solid #e8ece9;margin:20px 0 0;padding-top:16px;color:#758078;font-size:12px;line-height:1.7">Trading involves risk. This membership does not guarantee returns. You are responsible for your own trading and investment decisions.</p></td></tr></table></td></tr></table></body></html>`;
  await dispatchEmail(receipt.to, 'Signalroom membership payment confirmed', textBody, htmlBody);
}

export type ExpiryNoticeEmailParams = {
  to: string;
  fullName: string | null;
  planName: string;
  expiresAt: string;
  siteUrl: string;
};

export async function sendSubscriptionExpiryWarningEmail(params: ExpiryNoticeEmailParams) {
  const dateFormatted = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(params.expiresAt));

  const renewUrl = `${params.siteUrl}/plans`;
  const recipientName = params.fullName?.trim() || 'VIP Member';

  const textBody = [
    'SIGNALROOM · VIP ACCESS EXPIRING SOON',
    '',
    `Hello ${recipientName},`,
    '',
    `This is a courtesy reminder that your Signalroom ${params.planName} access is scheduled to expire in 24 hours on:`,
    `${dateFormatted} (IST)`,
    '',
    'Renew now to maintain uninterrupted access to:',
    '• Real-time high-conviction trading signals',
    '• Daily market analysis and key levels',
    '• Private Telegram VIP community discussions',
    '',
    `Renew your access here: ${renewUrl}`,
    '',
    'If you have already renewed or upgraded, you can safely disregard this message.',
    '',
    'Signalroom · Premium Market Intelligence',
  ].join('\n');

  const htmlBody = `<!doctype html><html><body style="margin:0;background:#f3f5f3;font-family:Arial,Helvetica,sans-serif;color:#1c2925"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f3;padding:36px 14px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:540px;background:#fff;border:1px solid #e2e8e3;border-radius:14px;overflow:hidden"><tr><td style="background:#173c35;padding:24px 32px"><div style="font-size:12px;font-weight:700;letter-spacing:2px;color:#8bff28">SIGNALROOM VIP</div><h1 style="margin:10px 0 0;font-size:22px;color:#ffffff;line-height:1.3">Your membership expires tomorrow</h1></td></tr><tr><td style="padding:32px"><p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333">Hello <strong>${escapeHtml(recipientName)}</strong>,</p><p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#555">This is a reminder that your <strong>${escapeHtml(params.planName)}</strong> access is scheduled to expire in <strong>24 hours</strong> on:</p><div style="margin:18px 0;padding:16px 20px;background:#fff8ee;border:1px solid #ffe1b5;border-radius:10px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#b26a00;letter-spacing:1px">Expiry Date &amp; Time</div><div style="font-size:16px;font-weight:700;color:#1c2925;margin-top:4px">${escapeHtml(dateFormatted)}</div></div><p style="margin:20px 0 14px;font-size:14px;line-height:1.6;color:#555">To ensure you do not lose access to real-time trading signals and the private Telegram group, renew your membership before it expires:</p><p style="margin:26px 0 24px;text-align:center"><a href="${escapeHtml(renewUrl)}" style="display:inline-block;background:#173c35;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:8px;font-size:14px">Renew VIP Membership</a></p><p style="margin:0;font-size:12px;line-height:1.6;color:#888;border-top:1px solid #eee;padding-top:18px">If you have already renewed, you can safely ignore this email.</p></td></tr></table></td></tr></table></body></html>`;

  await dispatchEmail(params.to, 'Warning: Your Signalroom VIP access expires tomorrow', textBody, htmlBody);
}

export async function sendSubscriptionExpiredEmail(params: ExpiryNoticeEmailParams) {
  const dateFormatted = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(params.expiresAt));

  const renewUrl = `${params.siteUrl}/plans`;
  const recipientName = params.fullName?.trim() || 'VIP Member';

  const textBody = [
    'SIGNALROOM · VIP ACCESS EXPIRED',
    '',
    `Hello ${recipientName},`,
    '',
    `Your Signalroom ${params.planName} access expired yesterday on:`,
    `${dateFormatted} (IST)`,
    '',
    'Your access to the private Telegram community has now been paused.',
    '',
    'You can reactivate your VIP access at any time to rejoin the community and resume receiving trading signals immediately:',
    `${renewUrl}`,
    '',
    'Upon renewal, you can instantly reconnect your Telegram with 1-click in your dashboard.',
    '',
    'Signalroom · Premium Market Intelligence',
  ].join('\n');

  const htmlBody = `<!doctype html><html><body style="margin:0;background:#f3f5f3;font-family:Arial,Helvetica,sans-serif;color:#1c2925"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f3;padding:36px 14px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:540px;background:#fff;border:1px solid #e2e8e3;border-radius:14px;overflow:hidden"><tr><td style="background:#262626;padding:24px 32px"><div style="font-size:12px;font-weight:700;letter-spacing:2px;color:#ff9b91">SIGNALROOM NOTICE</div><h1 style="margin:10px 0 0;font-size:22px;color:#ffffff;line-height:1.3">Your VIP access has expired</h1></td></tr><tr><td style="padding:32px"><p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333">Hello <strong>${escapeHtml(recipientName)}</strong>,</p><p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#555">Your <strong>${escapeHtml(params.planName)}</strong> access expired on:</p><div style="margin:18px 0;padding:16px 20px;background:#fdf2f2;border:1px solid #f9d6d5;border-radius:10px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#d32f2f;letter-spacing:1px">Access Concluded</div><div style="font-size:16px;font-weight:700;color:#1c2925;margin-top:4px">${escapeHtml(dateFormatted)}</div></div><p style="margin:20px 0 14px;font-size:14px;line-height:1.6;color:#555">Your membership in the private Telegram signals group has been paused. You can reactivate your subscription at any time to resume uninterrupted market signals:</p><p style="margin:26px 0 24px;text-align:center"><a href="${escapeHtml(renewUrl)}" style="display:inline-block;background:#173c35;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:8px;font-size:14px">Reactivate VIP Membership</a></p><p style="margin:0;font-size:12px;line-height:1.6;color:#888;border-top:1px solid #eee;padding-top:18px">When you renew, your Telegram account can immediately reconnect with 1 click from your dashboard.</p></td></tr></table></td></tr></table></body></html>`;

  await dispatchEmail(params.to, 'Your Signalroom VIP access has expired — Reactivate anytime', textBody, htmlBody);
}

