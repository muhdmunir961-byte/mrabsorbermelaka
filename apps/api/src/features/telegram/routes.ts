import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { currentUser } from '../../auth/guard.js';
import { parseInput } from '../../validate.js';
import { createTelegramLink, consumeTelegramLink, telegramWebhookSecret } from './service.js';

const TelegramUpdate = z
  .object({
    message: z
      .object({
        from: z.object({ id: z.union([z.number(), z.string()]) }),
        text: z.string().optional(),
      })
      .optional(),
  })
  .strict();

export const telegramRoutes: FastifyPluginAsync = async (app) => {
  app.post('/link', async (request) => {
    const user = currentUser(request);
    return createTelegramLink(user.employeeId);
  });

  app.post('/webhook', async (request, reply) => {
    if (request.headers['x-telegram-bot-api-secret-token'] !== telegramWebhookSecret()) {
      return reply.code(401).send({ status: 'ignored' });
    }
    const update = parseInput(TelegramUpdate, request.body);
    const text = update.message?.text ?? '';
    if (!text.startsWith('/start ')) return { status: 'ignored' };
    const token = text.slice('/start '.length).trim();
    if (!token || !update.message) return { status: 'ignored' };
    await consumeTelegramLink(token, String(update.message.from.id));
    return { status: 'linked' };
  });
};
