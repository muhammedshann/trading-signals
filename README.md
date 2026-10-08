# Signalroom

An MVP Next.js membership site for a paid trading research community. It uses Next.js App Router, Supabase Auth/Postgres, and a server-side Razorpay order and verification flow. Designed for Vercel's serverless runtime; no custom server, worker, or paid infrastructure is required for the core application.

## Architecture and implementation plan

1. Public, server-rendered marketing and policy pages explain the research, membership and risks.
2. Supabase Auth uses cookie-backed sessions. The `profiles`, `plans`, `payments` and `subscriptions` tables are protected by row-level security.
3. A signed-in member requests a plan. The server reads the canonical amount from Postgres, creates a Razorpay order, and stores a pending payment. The browser never supplies a trusted amount.
4. Checkout returns a Razorpay signature. A server route checks the HMAC and account ownership. The Razorpay webhook separately checks its signature and activates a subscription idempotently on `payment.captured` / `order.paid`. Webhooks should be the durable source of truth; the browser return is for fast feedback.
5. The member dashboard reads account, plan, payment and expiry state from Postgres. An active member first connects their Telegram identity through a one-time bot link, then requests a private join-request link. The webhook approves only the connected Telegram account while its subscription is active; a daily Vercel Cron job removes expired members. The bot token, private chat ID and webhook secret remain server-side.
6. An admin claim in Supabase `app_metadata.role` protects the admin route. Admin visibility is covered by RLS. Payment and subscription writes are restricted to server/service-role paths, except authorized admin operations.

## Local setup

- Use Node.js 20.9 or newer.
- Copy `.env.example` to `.env.local` and configure Supabase and Razorpay values.
- Apply the Supabase migrations in order in the SQL editor: `202610080001_init.sql`, then `202610080002_profile_names.sql`.
- Apply subsequent schema migrations in order as well, including `202610080003_email_otp.sql`, `202610080004_agreement_acceptances.sql`, and `202610080005_receipt_email_status.sql`.
- Apply `202610080006_telegram_access.sql` after the earlier migrations to enable tracked Telegram invites and member records.
- Apply `202610080007_telegram_account_linking.sql` after migration 006 to enable one-time Telegram account linking.
- Apply `202610080008_telegram_link_confirmation.sql` after migration 007 to require signed-in website confirmation of the Telegram identity returned by the bot.
- Add the Supabase URL and anon key to the app. Add the service role key only as a server-side environment variable; never expose it with a `NEXT_PUBLIC_` prefix.
- In local test mode, set a Razorpay test Key ID (`rzp_test_…`) and Key Secret. The synchronous server verification checks the payment signature, order ownership, Razorpay payment record and captured status, so a webhook secret is not required for local checkout testing. For production, configure the webhook URL as `https://YOUR_DOMAIN/api/payments/webhook`, subscribe to `payment.captured`, `order.paid` and `payment.failed`, and set `RAZORPAY_WEBHOOK_SECRET`.
- Configure email OTP below, then run `npm install`, `npm run dev`; production build: `npm run build`.

## Email OTP setup

Signup collects a name, email, password and confirmation. The app issues and verifies its own short-lived OTP challenge in the `email_otp_challenges` table, then sends email directly through Gmail API. Supabase Auth is used only to create the verified account and establish password sessions; its email OTP sender and OTP limits are not in this flow. Each branded email has both a copyable code and a one-time link. Local requests link back to `localhost`; deployed requests use `NEXT_PUBLIC_SITE_URL`.

#### Google Cloud setup

1. In Google Cloud Console, enable the Gmail API and create an OAuth Client ID for a Web application. Add `https://developers.google.com/oauthplayground` as an authorized redirect URI for credential setup.
2. Configure the OAuth consent screen with the `https://www.googleapis.com/auth/gmail.send` scope and authorize the account that sends mail. For a personal app, add that account as a test user.
3. In OAuth 2.0 Playground, enable custom OAuth credentials, enter the client ID/secret, authorize the `gmail.send` scope and exchange the code for a refresh token. Set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` and `GMAIL_SENDER_EMAIL` in `.env.local` and Vercel. Keep these values server-side.
4. Apply `supabase/migrations/202610080003_email_otp.sql` in Supabase SQL Editor. This creates a table that is accessible only to the service role. The server HMACs OTPs using `OTP_HASH_SECRET` or, if unset, `SUPABASE_SERVICE_ROLE_KEY`.
5. Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` locally and your HTTPS origin in Vercel. No Supabase Auth Send Email hook is required for this flow; disable the hook you previously configured. Keep the Email provider enabled so password signup/session authentication continues to work.

Email requests are throttled by this app (45-second resend wait, up to five sends per email each hour); this is separate from the former Supabase email rate limit. OTPs expire after 10 minutes and are limited to five incorrect attempts. Google still applies its own sending and abuse limits; personal Gmail is commonly limited to about 500 messages/day. OAuth apps left in Testing can have Gmail-scope refresh tokens expire after seven days. See Google's [Gmail sending limits](https://support.google.com/mail/answer/6596) and [OAuth web server guidance](https://developers.google.com/identity/protocols/oauth2/web-server).

## Production configuration

Set all values from `.env.example` in Vercel Project Settings. Set `NEXT_PUBLIC_SITE_URL` to the production origin. Set a strong Supabase Auth site URL and redirect allowlist. Disable the old Supabase Send Email hook; the app sends OTP through Gmail API directly. Configure Razorpay live keys only after testing the full flow in test mode. Keep all Supabase service keys, OTP HMAC secret, Google OAuth values, Razorpay secrets, webhook secret and Telegram bot token server-only.

To make an administrator, set the Supabase Auth user's `app_metadata` to `{ "role": "admin" }` using a trusted server/admin tool. For the admin table label, also set that profile row's `role` to `admin`. Never use user-editable metadata for authorization.

## Telegram lifecycle

The app never publishes a permanent group URL. A paid member opens a one-time `/start` code from the signed-in website. The bot reads Telegram's stable numeric user ID and profile name from Telegram's webhook, but keeps the identity pending. The member must review that identity and confirm it on the signed-in website before it is linked; starting the bot alone grants no group access. The website then creates a short-lived join-request link. The webhook approves requests only when the confirmed Telegram account matches the paying website user, the invite is unused, and the subscription is active. Expired or unknown joins are declined or removed. The daily `/api/telegram/expire` job removes linked members without a current active subscription. On renewal, a fresh invite allows the same linked account to rejoin.

### Telegram setup guide

1. **Create the private community group.** In Telegram, create a new group, choose a name, and set it to **Private** in group settings. Do not publish an invite link in the website, social profiles, or messages. Keep yourself as owner.
2. **Create the bot.** Open the verified `@BotFather` account, send `/newbot`, choose a display name and a unique username ending in `bot`, then copy the API token it gives you. Treat the token like a password.
3. **Add bot as admin.** Add the bot to the group, promote it to administrator, and enable **Invite Users** and **Ban Users / Restrict Members**. It needs these to make individual links and remove expired members. It does not need rights to post, edit, or delete messages for this access flow.
4. **Get the private group ID.** Before setting the webhook, add the bot as admin and send `/start@YourBotUsername` as a message in the group. Temporarily call Telegram's `getUpdates` API using your token from a terminal or API client; inspect that update's group `chat.id`. Supergroup IDs are negative numbers, commonly starting `-100`. Do not paste a bot-token URL or `getUpdates` output into public chat. Once the webhook is configured, `getUpdates` cannot be used at the same time; use the Vercel function logs and `getWebhookInfo` for later diagnostics.
5. **Set environment variables.** Put these values in the project's `.env.local` for local configuration and in Vercel Project Settings → Environment Variables for **Production** (and Preview if needed):

   ```dotenv
   TELEGRAM_BOT_TOKEN=your_botfather_token
   TELEGRAM_CHAT_ID=-1001234567890
   TELEGRAM_WEBHOOK_SECRET=long_random_secret
   CRON_SECRET=another_long_random_secret
   ```

   Generate the two secrets in Terminal with `openssl rand -hex 32`. Keep them out of browser code and source control. Restart local Next.js after changing `.env.local`.
6. **Apply the database migrations.** In Supabase Dashboard → SQL Editor, run the complete contents of `supabase/migrations/202610080006_telegram_access.sql`, then `supabase/migrations/202610080007_telegram_account_linking.sql`, then `supabase/migrations/202610080008_telegram_link_confirmation.sql`. These create private service-role-only invite, member, and one-time connection-code tables, and fields for pending identity confirmation. Never run just the filenames as SQL.
7. **Deploy to Vercel.** Deploy the site with those environment variables. Telegram webhooks need a publicly reachable HTTPS deployment. The new `vercel.json` registers `/api/telegram/expire` at `00:00 UTC` daily. Vercel Hobby runs a cron once per day and may start it within roughly 59 minutes of its scheduled time, so removal can happen up to about a day after the subscription's expiry.
8. **Register the webhook.** After deployment, run the following in a terminal. Replace the domain and use the same token/secret as Vercel; do not share the completed command because it contains credentials:

   ```bash
   curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
     -d "url=https://YOUR_DOMAIN/api/telegram/webhook" \
     -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
     -d 'allowed_updates=["message","chat_join_request","chat_member","my_chat_member"]'
   ```

   `setWebhook` should return `"ok":true`. Check delivery status with Telegram's `getWebhookInfo` method; it must show the deployed webhook URL and no recent delivery error. Do not enable a webhook on `localhost`; Telegram cannot reach it.
9. **Test using a Razorpay test payment.** Buy a plan with the test gateway. On the success screen, open the bot and press **Start**, return to the page, and continue to the group invite. The bot approves the join request only for that connected Telegram account. Check `telegram_members` in Supabase for its verified mapping. Then, for a test account only, set its active subscription `expires_at` to a past timestamp in Supabase and invoke the expiry endpoint with `Authorization: Bearer YOUR_CRON_SECRET`. Confirm the member is removed. Renew/restore the test subscription, request another invite in the dashboard and rejoin. Restore any test dates after testing.

Members who were already inside the group before linking was enabled are not yet verified against website accounts. They should use the website's **Connect my Telegram** button while their membership is active, then request a fresh invite. Localhost cannot receive Telegram webhooks, so bot linking and automatic join approval require the deployed HTTPS site (or a public HTTPS development tunnel).

## Pre-payment agreement

The plans checkout requires a single unchecked risk agreement before the existing Razorpay order flow can start. `POST /api/agreements/accept` enforces acceptance server-side, captures the authenticated user, email, request IP, user agent, policy versions and a SHA-256 agreement hash. The payment order is linked to that acceptance. Only captured/verified payments update its Razorpay payment ID and activated subscription ID; failed or cancelled attempts do not create subscriptions. Verified payment displays an immediate receipt modal, starts Telegram account linking, and emails a confirmation receipt. Keep prior acceptance rows and increment document version constants in `src/lib/legal/agreement-copy.ts` when policy wording changes.

## Before launch

Replace the sample support contact language and verify legal entity, jurisdiction, tax, renewal and consumer-rights wording with qualified counsel. Add a real support email to the website. Confirm Razorpay account approval and local regulatory requirements for the specific content/service offered. This starter does not implement recurring Razorpay subscriptions; its monthly and annual plans are one-time period purchases and members renew manually.

### Production deployment checklist

- Connect the project to Vercel and add every value from `.env.example` in Vercel Project Settings → Environment Variables. Keep `SUPABASE_SERVICE_ROLE_KEY`, Gmail OAuth credentials, Razorpay secrets, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and `CRON_SECRET` server-only.
- Set `NEXT_PUBLIC_SITE_URL` to the exact production HTTPS origin. In Supabase Auth, configure the same production site URL and allowlisted redirect URLs.
- Use Razorpay live credentials only after testing. Create the Razorpay webhook at `https://YOUR_DOMAIN/api/payments/webhook`, subscribe to the documented capture/order/failure events, and set the matching `RAZORPAY_WEBHOOK_SECRET` in Vercel.
- Apply every Supabase migration through `202610080008_telegram_link_confirmation.sql` before enabling live purchases or Telegram access.
- Create a private Telegram group, make the bot an administrator with invite/restrict permissions, set the webhook to the production HTTPS endpoint, and test the connect → request → approve → expiry flow with a test subscription.
- Deploy to Production and check Vercel function logs, Cron Jobs, Supabase Auth URLs, and Razorpay webhook delivery before sharing the site.
- Never commit `.env.local`; `.gitignore` excludes it. If a secret was ever committed or shared, rotate it at its provider and update Vercel.

## Free-tier notes

Vercel deployment uses standard Next.js serverless routes. Supabase is the only database/auth provider. No Redis, background worker, file storage, or paid observability service is required. Configure webhook retries in Razorpay and monitor the Vercel function logs. The schema and app are ready to connect, but database credentials, Razorpay account setup, Telegram admin setup, and legal business details must be supplied by the operator.
# trading-signals
