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
    await registerTelegramWebhook();
    app.log.info('Telegram webhook registered');
  } catch (error) {
    app.log.error({ err: error }, 'failed to register Telegram webhook');
  }
} catch (error) {
  app.log.error({ err: error }, 'failed to start');
  process.exitCode = 1;
}
