import 'server-only';
import Razorpay from 'razorpay';
export function razorpayClient() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) throw new Error('Razorpay is not configured.');
  return new Razorpay({ key_id, key_secret });
}
