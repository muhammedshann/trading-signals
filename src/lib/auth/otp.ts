import 'server-only';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function createOtp() {
  return String(randomInt(100000, 1000000));
}

export function createEmailLinkToken() {
  return randomBytes(32).toString('base64url');
}

export function hashOtpValue(email: string, purpose: string, value: string) {
  const secret = process.env.OTP_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Set OTP_HASH_SECRET or SUPABASE_SERVICE_ROLE_KEY.');
  return createHmac('sha256', secret).update(`${email.toLowerCase()}.${purpose}.${value}`).digest('hex');
}

export function equalHash(left: string, right: string) {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function getLocalOrPublicOrigin(request: Request) {
  const requestOrigin = request.headers.get('origin');
  if (requestOrigin) {
    try {
      const parsed = new URL(requestOrigin);
      if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname))) return parsed.origin;
    } catch {
      // Fall back to the configured site origin below.
    }
  }
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    try {
      const parsed = new URL(configured);
      const localHost = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
      if (parsed.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:' && localHost)) {
        return parsed.origin;
      }
    } catch {
      // Fall back to the request origin below.
    }
  }
  return new URL(request.url).origin;
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
import 'server-only';
