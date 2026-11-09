import { normalizeMalaysianPhone } from '@mr/shared';
import type { SessionUser } from '../../auth/session.js';
import { AppError, conflict, notFound, validationFailed } from '../../errors.js';
import { changeEmploymentStatus, renameEmployee } from '../employees/service.js';
import { employeeRepository as employees } from '../employees/repository.js';

/**
 * Admin commands an administrator can send the bot. They exist so HR can fix a
 * name or suspend someone from a phone, without opening the web app.
 *
 * Only a linked ADMIN_HR/OWNER account may run them: unlike the sign-in approval,
 * these edit records, so an allow-listed Telegram id with no employee row is not
 * enough — the audit trail needs a person behind it.
 */

export const ADMIN_COMMANDS = ['pekerja', 'nama', 'status', 'senarai', 'bantuan'] as const;
export type AdminCommand = (typeof ADMIN_COMMANDS)[number];

export interface ParsedCommand {
  command: AdminCommand;
  args: string[];
}

/** Pure so the parsing rules can be tested without Telegram or a database. */
export function parseCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;

  // "/nama@mrabsorbermelaka_bot" is how Telegram addresses a command in a group.
  const [head, ...rest] = trimmed.slice(1).split(/\s+/);
  const name = (head ?? '').split('@')[0]?.toLowerCase() ?? '';
  if (!(ADMIN_COMMANDS as readonly string[]).includes(name)) return null;
  return { command: name as AdminCommand, args: rest };
}

export const HELP_TEXT = [
  'Arahan admin (khas ADMIN_HR/OWNER):',
  '/pekerja <telefon> — lihat rekod pekerja',
  '/nama <telefon> <nama penuh> — betulkan nama',
  '/status <telefon> SUSPENDED|TERMINATED <sebab> — ubah status',
  '/senarai — senarai pekerja aktif (20 pertama)',
].join('\n');

async function resolveActor(telegramUserId: string): Promise<SessionUser> {
  const row = await employees.findByTelegramId(telegramUserId);
  if (!row) {
    throw conflict('Arahan ini hanya untuk admin HR yang telah memautkan Telegram.');
  }
  const actor: SessionUser = {
    employeeId: row.id,
    role: row.role,
    fullName: row.fullName,
    expiresAt: 0,
  };
  if (actor.role !== 'ADMIN_HR' && actor.role !== 'OWNER') {
    throw conflict('Arahan ini hanya untuk ADMIN_HR atau OWNER.');
  }
  return actor;
}

function requirePhone(raw: string | undefined): string {
  if (!raw) throw validationFailed([{ path: 'telefon', message: 'Sertakan nombor telefon' }]);
  const phone = normalizeMalaysianPhone(raw);
  if (!/^\+60\d{8,10}$/.test(phone)) {
    throw validationFailed([{ path: 'telefon', message: `Nombor tidak sah: ${raw}` }]);
  }
  return phone;
}

function label(status: string): string {
  return status === 'ACTIVE' ? 'Aktif' : status === 'SUSPENDED' ? 'Digantung' : 'Diberhentikan';
}

export async function runAdminCommand(
  telegramUserId: string,
  parsed: ParsedCommand,
): Promise<string> {
  if (parsed.command === 'bantuan') return HELP_TEXT;

  const actor = await resolveActor(telegramUserId);

  if (parsed.command === 'senarai') {
    const rows = await employees.listForAdmin(20);
    if (rows.length === 0) return 'Tiada pekerja dalam rekod.';
    return [
      'Pekerja (20 pertama):',
      ...rows.map((row) => `• ${row.fullName} — ${row.phone} — ${row.role} — ${label(row.status)}`),
    ].join('\n');
  }

  if (parsed.command === 'pekerja') {
    const phone = requirePhone(parsed.args[0]);
    const row = await employees.findByPhone(phone);
    if (!row) throw notFound(`Tiada pekerja dengan nombor ${phone}.`);
    return [
      `Nama: ${row.fullName}`,
      `Telefon: ${row.phone}`,
      `Peranan: ${row.role}`,
      `Status: ${label(row.status)}`,
      `Telegram: ${row.telegramUserId ? 'dipautkan' : 'belum dipautkan'}`,
    ].join('\n');
  }

  if (parsed.command === 'nama') {
    const phone = requirePhone(parsed.args[0]);
    const newName = parsed.args.slice(1).join(' ').trim();
    if (newName === '') {
      throw validationFailed([{ path: 'nama', message: 'Sertakan nama penuh yang baharu' }]);
    }
    const row = await employees.findByPhone(phone);
    if (!row) throw notFound(`Tiada pekerja dengan nombor ${phone}.`);
    const updated = await renameEmployee(actor, row.id, newName);
    return `Nama dikemas kini: ${updated.fullName} (${phone})`;
  }

  // /status <telefon> SUSPENDED|TERMINATED <sebab>
  const phone = requirePhone(parsed.args[0]);
  const status = (parsed.args[1] ?? '').toUpperCase();
  const reason = parsed.args.slice(2).join(' ').trim();
  if (status !== 'SUSPENDED' && status !== 'TERMINATED') {
    throw validationFailed([
      { path: 'status', message: 'Guna SUSPENDED atau TERMINATED (bukan ACTIVE)' },
    ]);
  }
  if (reason.length < 3) {
    throw validationFailed([
      { path: 'sebab', message: 'Nyatakan sebab, sekurang-kurangnya 3 aksara' },
    ]);
  }
  const row = await employees.findByPhone(phone);
  if (!row) throw notFound(`Tiada pekerja dengan nombor ${phone}.`);
  const changed = await changeEmploymentStatus(actor, row.id, {
    status,
    reason,
  });
  return `Status ${phone} kini ${label(changed.status)}. Sebab: ${reason}`;
}

/** Turns an expected failure into the sentence the admin should read. */
export function describeCommandError(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Arahan gagal dijalankan.';
}
