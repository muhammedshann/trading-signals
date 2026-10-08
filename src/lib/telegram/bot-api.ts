import 'server-only';

export async function telegramCall<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Telegram bot is not configured.');
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Telegram ${method} failed.`);
  return result.result as T;
}

export async function kickTelegramMember(chatId: string, telegramUserId: number | string) {
  await telegramCall('banChatMember', { chat_id: chatId, user_id: telegramUserId });
}
import 'server-only';
