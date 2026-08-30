import { createHmac } from 'node:crypto';
import { generateOpaqueToken } from './token.util.js';

const AUTH_TTL_SECONDS = 30 * 60;

export interface ImageKitUploadAuth {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
  urlEndpoint: string;
}

/** Credenciais de upload direto do navegador pro ImageKit — a chave privada
 * nunca sai do backend, só assina o token+expire (HMAC-SHA1, formato exigido
 * pelo ImageKit). */
export function signUploadAuth(): ImageKitUploadAuth {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
  const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;
  if (!privateKey || !publicKey || !urlEndpoint) {
    throw new Error('ImageKit não está configurado (IMAGEKIT_PRIVATE_KEY/PUBLIC_KEY/URL_ENDPOINT)');
  }

  const token = generateOpaqueToken();
  const expire = Math.floor(Date.now() / 1000) + AUTH_TTL_SECONDS;
  const signature = createHmac('sha1', privateKey).update(token + expire).digest('hex');

  return { token, expire, signature, publicKey, urlEndpoint };
}

/** Apaga o arquivo no ImageKit — best-effort, chamador decide o que fazer com falha. */
export async function deleteImageKitFile(fileId: string): Promise<void> {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('ImageKit não está configurado (IMAGEKIT_PRIVATE_KEY)');
  }

  const response = await fetch(`https://api.imagekit.io/v1/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${Buffer.from(`${privateKey}:`).toString('base64')}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`ImageKit respondeu com status ${response.status} ao apagar o arquivo`);
  }
}
