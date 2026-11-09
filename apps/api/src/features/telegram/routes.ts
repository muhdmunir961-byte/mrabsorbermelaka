import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
/* eslint-disable @typescript-eslint/require-await */
import { z } from 'zod';
import { normalizeMalaysianPhone } from '@mr/shared';
import { ADMIN_ROLES, currentUser, requireRole } from '../../auth/guard.js';
import { AppError } from '../../errors.js';
import { parseInput } from '../../validate.js';
import {
  createTelegramLink,
  createTelegramLinkForPhone,
  consumeTelegramLink,
  requestTelegramLogin,
  notifyLoginApprovers,
  decideTelegramLogin,
  findEmployeeNameByPhone,
  sendTelegramMessage,
  decideTelegramLeave,
  telegramWebhookSecret,
  getTelegramWebhookInfo,
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
        contact: z
          .object({
            phone_number: z.string(),
            // Telegram sends the owner's id on a self-shared contact only. A
            // forwarded contact carries the other person's id, and accepting it
            // would let anyone claim a colleague's number.
            user_id: z.union([z.number(), z.string()]).optional(),
          })
          .optional(),
        text: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

/**
 * Telegram retries any update the webhook does not answer with 2xx, so a reply
 * that cannot be delivered must never throw: the user has blocked the bot or the
 * chat id is gone, and retrying will not change either. The failure is logged and
 * the update is acknowledged.
 */
async function sendReply(
  request: FastifyRequest,
  chatId: string,
  text: string,
  replyMarkup?: unknown,
): Promise<void> {
  try {
    await sendTelegramMessage(chatId, text, replyMarkup);
  } catch (error) {
    request.log.warn({ err: error, chatId }, 'failed to deliver Telegram reply');
  }
}

export const telegramRoutes: FastifyPluginAsync = async (app) => {
  app.post('/link', async (request) => {
    const user = currentUser(request);
    return createTelegramLink(user.employeeId);
  });

  app.post('/link-by-phone', async (request) => {
    const body = z.object({ phone: z.string() }).strict().parse(request.body);
    return createTelegramLinkForPhone(body.phone);
  });

  /**
   * Called by the login screen right after it requested an OTP for an unlinked
   * number. It tells the browser whether that number belongs to a registered
   * employee, so the screen can open the bot with a clear instruction. The actual
   * sign-in request is filed when the user shares their own contact in the bot:
   * only Telegram can prove which account owns which number.
   */
  app.post('/login-request', async (request) => {
    const body = z.object({ phone: z.string() }).strict().parse(request.body);
    const phone = normalizeMalaysianPhone(body.phone);
    const fullName = await findEmployeeNameByPhone(phone);
    return { phone, registered: fullName !== null };
  });

  // Diagnostics for a bot that receives no updates. Admin-only: it exposes the
  // webhook URL and Telegram's last delivery error, which is operator
  // information, not something an anonymous caller should be able to read.
  app.get('/webhook-info', async (request) => {
    requireRole(request, ADMIN_ROLES);
    return getTelegramWebhookInfo();
  });

  app.post('/webhook', async (request, reply) => {
    if (request.headers['x-telegram-bot-api-secret-token'] !== telegramWebhookSecret()) {
      return reply.code(401).send({ status: 'ignored' });
    }
    const update = parseInput(TelegramUpdate, request.body);

    // An approver pressed "Luluskan"/"Tolak" on a sign-in request.
    if (update.callback_query?.data?.startsWith('login:')) {
      const [, rawDecision, requestId] = update.callback_query.data.split(':');
      if ((rawDecision !== 'APPROVE' && rawDecision !== 'REJECT') || !requestId)
        return { status: 'ignored' };
      const approverId = String(update.callback_query.from.id);

      let result;
      try {
        result = await decideTelegramLogin(requestId, approverId, rawDecision);
      } catch (error) {
        // A refused decision is not a server fault, and Telegram retries every
        // non-2xx: answering 200 with a message ends the retries and tells the
        // person why. CONFLICT is "you are not an approver", NOT_FOUND is "this
        // number has no employee record" — both need a reply, not a retry loop.
        if (
          error instanceof AppError &&
          (error.code === 'CONFLICT' || error.code === 'NOT_FOUND')
        ) {
          request.log.warn(
            { telegramUserId: approverId, code: error.code },
            'login approval could not be applied',
          );
          await sendReply(
            request,
            approverId,
            error.code === 'CONFLICT'
              ? 'Anda bukan admin yang dibenarkan untuk meluluskan permintaan ini. Beritahu HR untuk menambah ID Telegram anda.'
              : error.message,
          );
          return {
            status: error.code === 'CONFLICT' ? 'not_an_approver' : 'request_not_actionable',
          };
        }
        throw error;
      }

      if (result.status === 'already_decided') {
        await sendReply(request, approverId, 'Permintaan ini sudah diputuskan.');
        return { status: 'already_decided' };
      }
      if (result.status === 'rejected') {
        await sendReply(request, approverId, 'Permintaan masuk telah ditolak.');
        return { status: 'login_rejected' };
      }
      await sendReply(
        request,
        approverId,
        result.codeSent
          ? 'Diluluskan. Kod OTP sudah dihantar kepada pemohon.'
          : 'Diluluskan, tetapi kod OTP gagal dihantar kepada pemohon.',
      );
      return { status: 'login_approved' };
    }

    if (update.callback_query?.data?.startsWith('leave:')) {
      const [, rawDecision, requestId] = update.callback_query.data.split(':');
      if ((rawDecision !== 'APPROVE' && rawDecision !== 'REJECT') || !requestId)
        return { status: 'ignored' };
      await decideTelegramLeave(String(update.callback_query.from.id), requestId, rawDecision);
      await sendReply(
        request,
        String(update.callback_query.from.id),
        `Permohonan telah ${rawDecision === 'APPROVE' ? 'diluluskan' : 'ditolak'}.`,
      );
      return { status: 'decided' };
    }
    const text = update.message?.text ?? '';
    if (update.message?.contact && update.message) {
      const fromId = String(update.message.from.id);
      const contact = update.message.contact;

      // Only the account's own number is proof of control. A forwarded contact
      // has user_id pointing at somebody else, which is exactly the attack this
      // check exists to stop.
      if (String(contact.user_id ?? '') !== fromId) {
        await sendReply(
          request,
          fromId,
          'Sila kongsi nombor anda sendiri menggunakan butang di bawah, bukan contact yang diforward.',
        );
        return { status: 'contact_not_own' };
      }

      const phone = normalizeMalaysianPhone(contact.phone_number);
      const employee = await findEmployeeNameByPhone(phone);
      const loginRequest = await requestTelegramLogin(phone, fromId);
      const { approvers, delivered } = await notifyLoginApprovers(loginRequest.id, phone, employee);

      // Three different outcomes look the same to the user otherwise, and only one
      // of them means "wait a moment".
      const message =
        approvers === 0
          ? 'Nombor diterima, tetapi tiada admin HR yang dipautkan ke Telegram. Sila hubungi HR.'
          : delivered === 0
            ? 'Nombor diterima, tetapi notifikasi kepada admin HR gagal dihantar. Sila hubungi HR.'
            : 'Nombor diterima. Permintaan sedang menunggu kelulusan HR. Kod OTP akan dihantar di sini selepas diluluskan.';

      await sendReply(request, fromId, message);
      return {
        status:
          approvers === 0
            ? 'login_no_approver'
            : delivered === 0
              ? 'login_approver_unreachable'
              : 'login_pending_approval',
      };
    }
    if (text.startsWith('/start ')) {
      const token = text.slice('/start '.length).trim();
      if (!token || !update.message) return { status: 'ignored' };
      const fromId = String(update.message.from.id);
      const { otpSent } = await consumeTelegramLink(token, fromId);
      if (!otpSent) {
        request.log.warn(
          { telegramUserId: fromId },
          'Telegram link saved but the OTP message could not be delivered',
        );
      }
      await sendReply(
        request,
        fromId,
        otpSent
          ? 'Telegram berjaya dipautkan. Kod OTP sudah dihantar di sini.'
          : 'Telegram berjaya dipautkan, tetapi kod OTP gagal dihantar. Tekan /start semula untuk minta kod baharu.',
      );
      return { status: otpSent ? 'linked' : 'linked_without_code' };
    }
    if (text === '/start') {
      // Logged because the caller has no profile yet: for an administrator this id
      // is exactly what TELEGRAM_APPROVER_IDS needs, and there is nowhere else to
      // read it from.
      request.log.info(
        { telegramUserId: String(update.message?.from.id) },
        'telegram /start received',
      );
      await sendReply(
        request,
        String(update.message?.from.id),
        'Selamat datang ke Mr. Absorber HR.\n\nTekan butang di bawah untuk kongsi nombor telefon anda sendiri. Permintaan akan dihantar kepada admin HR untuk kelulusan, kemudian kod masuk dihantar di sini.',
        {
          keyboard: [[{ text: 'Kongsi nombor telefon', request_contact: true }]],
          one_time_keyboard: true,
          resize_keyboard: true,
        },
      );
      return { status: 'help' };
    }
    return { status: 'ignored' };
  });
};
