/**
 * Registers one employee so they can sign in through the Telegram bot.
 *
 * Why this exists: sign-in requires an Employee row for the phone number, and the
 * seed only creates demo staff. This adds a real account without touching the
 * others, using the same field encryption as the rest of the system.
 *
 * Usage (from apps/api):
 *   npx tsx prisma/register-employee.ts --phone +60123456789 --name "Nama Penuh" --role OWNER
 *
 * Placeholder identity and salary values are written because the schema requires
 * them; replace them in HR once the person can sign in.
 */
import { prisma } from '../src/db.js';
import { blindIndex, encryptField, encryptSen } from '../src/crypto/field.js';

const args = process.argv.slice(2);
const arg = (name: string, fallback?: string): string | undefined => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const ROLES = ['OWNER', 'ADMIN_HR', 'FOREMAN', 'STAFF'] as const;
const BRANCHES = ['MELAKA_UTAMA', 'AYER_KEROH'] as const;

const phone = arg('phone');
const fullName = arg('name');
const role = ROLES.find((value) => value === (arg('role', 'STAFF') ?? 'STAFF'));
const branchCode = BRANCHES.find(
  (value) => value === (arg('branch', 'MELAKA_UTAMA') ?? 'MELAKA_UTAMA'),
);

if (!phone || !fullName) {
  console.error('usage: --phone +60... --name "Nama Penuh" [--role OWNER] [--branch MELAKA_UTAMA]');
  process.exit(2);
}
if (!/^\+60\d{8,10}$/.test(phone)) {
  console.error(`phone must look like +60123456789 (got ${phone})`);
  process.exit(2);
}
if (!role) {
  console.error(`role must be one of ${ROLES.join(', ')}`);
  process.exit(2);
}
if (!branchCode) {
  console.error(`branch must be one of ${BRANCHES.join(', ')}`);
  process.exit(2);
}

const branch = await prisma.branch.findUnique({
  where: { code: branchCode },
  select: { id: true },
});
if (!branch) {
  console.error(`branch ${branchCode} does not exist`);
  process.exit(2);
}

const existing = await prisma.employee.findUnique({
  where: { phone },
  select: { id: true, fullName: true, role: true },
});
if (existing) {
  console.log(`sudah wujud: ${existing.fullName} (${existing.role}) — tiada perubahan`);
  await prisma.$disconnect();
  process.exit(0);
}

// A deterministic placeholder keeps identityCardIndex unique across repeated runs.
const placeholderIc = `000000-00-${phone.slice(-4)}`;
const clash = await prisma.employee.findFirst({
  where: { identityCardIndex: blindIndex(placeholderIc) },
  select: { id: true },
});
if (clash) {
  console.error('placeholder IC already used; pass a real IC by editing this script');
  await prisma.$disconnect();
  process.exit(2);
}

const created = await prisma.employee.create({
  data: {
    fullName,
    phone,
    role,
    status: 'ACTIVE',
    branchId: branch.id,
    joinedOn: new Date(),
    leaveEntitlementDays: 21,
    maritalStatus: 'Belum Dikemaskini',
    emergencyContactName: 'Belum Dikemaskini',
    identityCardEnc: encryptField(placeholderIc),
    identityCardIndex: blindIndex(placeholderIc),
    addressEnc: encryptField('Belum Dikemaskini'),
    emergencyContactPhoneEnc: encryptField(phone),
    baseSalaryEnc: encryptSen(0),
    hourlyRateEnc: encryptSen(0),
  },
  select: { id: true, fullName: true, phone: true, role: true },
});

console.log(`didaftarkan: ${created.fullName} | ${created.phone} | ${created.role}`);
console.log('Nota: IC, alamat dan gaji ialah placeholder — kemas kini melalui HR.');
await prisma.$disconnect();
