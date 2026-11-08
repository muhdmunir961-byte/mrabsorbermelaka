import type { FastifyPluginAsync } from 'fastify';
/* eslint-disable @typescript-eslint/require-await */
import { z } from 'zod';
import { currentUser } from '../../auth/guard.js';
import { parseInput } from '../../validate.js';
import {
  createTelegramLink,
  createTelegramLinkForPhone,
  consumeTelegramLink,
  consumeFirstLoginLink,
  sendTelegramMessage,
  decideTelegramLeave,
  telegramWebhookSecret,
} from './service.js';

const TelegramUpdate = z
  .object({
    update_id: z.number().optional(),
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
        contact: z.object({ phone_number: z.string() }).optional(),
        text: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export const telegramRoutes: FastifyPluginAsync = async (app) => {
  app.post('/link', async (request) => {
    const user = currentUser(request);
    return createTelegramLink(user.employeeId);
  });

  app.post('/link-by-phone', async (request) => {
    const body = z.object({ phone: z.string() }).strict().parse(request.body);
    return createTelegramLinkForPhone(body.phone);
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
    if (update.message?.contact) {
      const phone = update.message.contact.phone_number.startsWith('+')
        ? update.message.contact.phone_number
        : `+${update.message.contact.phone_number}`;
      await consumeFirstLoginLink(phone, String(update.message.from.id));
      await sendTelegramMessage(
        String(update.message.from.id),
        'Nombor disahkan. Kod OTP sudah dihantar di sini.',
      );
      return { status: 'contact_linked' };
    }
    if (text === '/start') {
      await sendTelegramMessage(
        String(update.message?.from.id),
        'Tekan butang Kongsi nombor telefon supaya kami boleh sahkan akaun anda.',
        {
          keyboard: [[{ text: 'Kongsi nombor telefon', request_contact: true }]],
          one_time_keyboard: true,
          resize_keyboard: true,
        },
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
