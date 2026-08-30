import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

// Qualquer domínio ou subdomínio de gustagg.app (produção) — além disso, só
// a URL única configurada em FRONTEND_URL (uso local/dev).
const GUSTAGG_ORIGIN_PATTERN = /^https?:\/\/([a-z0-9-]+\.)*gustagg\.app(:\d+)?$/i;

function isAllowedOrigin(origin: string): boolean {
  if (GUSTAGG_ORIGIN_PATTERN.test(origin)) return true;
  return origin === (process.env.FRONTEND_URL ?? 'http://localhost:5174');
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Sem header Origin (curl, chamadas server-to-server, webhooks de saída) — libera.
      if (!origin || isAllowedOrigin(origin)) return callback(null, true);
      callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
    },
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(process.env.PORT ?? 80);
}
await bootstrap();
