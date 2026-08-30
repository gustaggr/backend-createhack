import { createHmac } from 'node:crypto';

export function signWebhookPayload(payload: unknown, secret: string): string {
  const body = JSON.stringify(payload);
  return createHmac('sha256', secret).update(body).digest('hex');
}

export async function dispatchWebhook(
  url: string,
  payload: unknown,
  secret: string,
): Promise<void> {
  const signature = signWebhookPayload(payload, secret);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-With-Signature': signature,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Webhook respondeu com status ${response.status}`);
  }
}
