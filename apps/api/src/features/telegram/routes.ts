import type { FastifyPluginAsync } from 'fastify';
/* eslint-disable @typescript-eslint/require-await */
import { z } from 'zod';
import { currentUser } from '../../auth/guard.js';
import { parseInput } from '../../validate.js';
import {
  createTelegramLink,
  consumeTelegramLink,
  sendTelegramMessage,
  decideTelegramLeave,
  telegramWebhookSecret,
} from './service.js';

const TelegramUpdate = z
  .object({
    callback_query: z
      .object({
        id: z.string(),
        data: z.string().optional(),
        from: z.object({ id: z.union([z.number(), z.string()]) }),
      })
      .optional(),
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
    if (update.callback_query?.data?.startsWith('leave:')) {
      const [, rawDecision, requestId] = update.callback_query.data.split(':');
      if ((rawDecision !== 'APPROVE' && rawDecision !== 'REJECT') || !requestId)
        return { status: 'ignored' };
      await decideTelegramLeave(String(update.callback_query.from.id), requestId, rawDecision);
      await sendTelegramMessage(
        String(update.callback_query.from.id),
        `Permohonan telah ${rawDecision === 'APPROVE' ? 'diluluskan' : 'ditolak'}.`,
      );
      return { status: 'decided' };
    }
    const text = update.message?.text ?? '';
    if (text === '/start') {
      await sendTelegramMessage(
        String(update.message?.from.id),
        'Buka pautan Sahkan Telegram dari profil anda untuk memautkan akaun.',
      );
      return { status: 'help' };
    }
    if (!text.startsWith('/start ')) return { status: 'ignored' };
    const token = text.slice('/start '.length).trim();
    if (!token || !update.message) return { status: 'ignored' };
    await consumeTelegramLink(token, String(update.message.from.id));
    await sendTelegramMessage(
      String(update.message.from.id),
      'Telegram berjaya dipautkan. Kod masuk akan dihantar di sini.',
    );
    return { status: 'linked' };
  });
};
