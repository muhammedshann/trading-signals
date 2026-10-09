alter table public.email_otp_challenges
  drop constraint if exists email_otp_challenges_purpose_check;

alter table public.email_otp_challenges
  add constraint email_otp_challenges_purpose_check
  check (purpose in ('signup', 'login', 'reset'));
