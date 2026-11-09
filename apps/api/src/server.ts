import { buildApp } from './app.js';
import { prisma } from './db.js';
import { env } from './env.js';
import { registerTelegramWebhook } from './features/telegram/service.js';

const app = await buildApp();

async function shutdown(signal: string): Promise<void> {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await prisma.$disconnect();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown(signal).then(() => process.exit(0));
  });
}

try {
  await app.listen({ port: env.API_PORT, host: env.API_HOST });
  try {
    const webhook = await registerTelegramWebhook();
    if (webhook === 'registered') {
      app.log.info('Telegram webhook registered');
    } else {
      // Said once, at startup, because a bot that never receives updates looks
      // like a webhook bug later and this line is the difference.
      app.log.warn(
        'Telegram webhook skipped: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and TELEGRAM_WEBHOOK_URL must all be set',
      );
    }
  } catch (error) {
    app.log.error({ err: error }, 'failed to register Telegram webhook');
  }
} catch (error) {
  app.log.error({ err: error }, 'failed to start');
  process.exitCode = 1;
}
