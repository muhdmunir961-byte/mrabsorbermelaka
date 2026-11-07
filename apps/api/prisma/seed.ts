import { prisma } from '../src/db.js';
import { hashPin } from '../src/auth/pin.js';

/** Every demo employee uses this PIN for the clock-in fallback. Never use in production. */
const DEMO_PIN = '123456';

/**
 * Demo data for local development. Safe to re-run: people, branches, services
 * and vehicles are upserted on natural keys; jobs and announcements, which have
 * no natural key, are rebuilt each run.
 */
const BRANCHES = [
  {
    code: 'MELAKA_UTAMA' as const,
    name: 'Melaka Utama',
    latitude: '2.189600',
    longitude: '102.250100',
    geofenceRadiusM: 150,
  },
  {
    code: 'AYER_KEROH' as const,
    name: 'Melaka Ayer Keroh',
    latitude: '2.275800',
    longitude: '102.293400',
    geofenceRadiusM: 150,
  },
];

interface PersonSeed {
  fullName: string;
  phone: string;
  identityCardNumber: string;
  role: 'OWNER' | 'ADMIN_HR' | 'FOREMAN' | 'STAFF';
  branch: 'MELAKA_UTAMA' | 'AYER_KEROH';
  baseSalarySen: number;
  hourlyRateSen: number;
  maritalStatus: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

const PEOPLE: PersonSeed[] = [
  {
    fullName: 'Haji Mahmud bin Osman',
    phone: '+60123456780',
    identityCardNumber: '650101-04-5501',
    role: 'OWNER',
    branch: 'MELAKA_UTAMA',
    baseSalarySen: 600000,
    hourlyRateSen: 4000,
    maritalStatus: 'Berkahwin (4 Anak)',
    address: 'No. 8, Jalan Merdeka, 75000 Melaka.',
    emergencyContactName: 'Hajah Rohani (Isteri)',
    emergencyContactPhone: '+60123456790',
  },
  {
    fullName: 'Farah Ann binti Yusof',
    phone: '+60123456781',
    identityCardNumber: '910220-04-5522',
    role: 'ADMIN_HR',
    branch: 'MELAKA_UTAMA',
    baseSalarySen: 280000,
    hourlyRateSen: 1800,
    maritalStatus: 'Berkahwin (1 Anak)',
    address: 'No. 12, Taman Bukit Baru, 75150 Melaka.',
    emergencyContactName: 'Yusof (Ayah)',
    emergencyContactPhone: '+60123456791',
  },
  {
    fullName: 'Zul Helmi bin Ahmad',
    phone: '+60123456782',
    identityCardNumber: '880530-04-5513',
    role: 'FOREMAN',
    branch: 'MELAKA_UTAMA',
    baseSalarySen: 320000,
    hourlyRateSen: 2000,
    maritalStatus: 'Bujang',
    address: 'No. 30, Jalan Kenanga 2, 75200 Melaka.',
    emergencyContactName: 'Aminah (Ibu)',
    emergencyContactPhone: '+60123456792',
  },
  {
    fullName: 'Ahmad Firdaus bin Ramli',
    phone: '+60123456789',
    identityCardNumber: '920412-04-5541',
    role: 'STAFF',
    branch: 'MELAKA_UTAMA',
    baseSalarySen: 250000,
    hourlyRateSen: 1500,
    maritalStatus: 'Berkahwin (2 Anak)',
    address: 'No. 24, Jalan Kenanga 3/12, Taman Kenanga, 75200 Melaka.',
    emergencyContactName: 'Siti Aminah (Isteri)',
    emergencyContactPhone: '+60198765432',
  },
  {
    fullName: 'Ravi Kumar a/l Suresh',
    phone: '+60123456783',
    identityCardNumber: '900718-04-5533',
    role: 'STAFF',
    branch: 'AYER_KEROH',
    baseSalarySen: 250000,
    hourlyRateSen: 1500,
    maritalStatus: 'Berkahwin (1 Anak)',
    address: 'No. 5, Taman Ayer Keroh Heights, 75450 Melaka.',
    emergencyContactName: 'Priya (Isteri)',
    emergencyContactPhone: '+60123456793',
  },
  {
    fullName: 'Lina Marlina binti Hassan',
    phone: '+60123456784',
    identityCardNumber: '950904-04-5544',
    role: 'STAFF',
    branch: 'MELAKA_UTAMA',
    baseSalarySen: 220000,
    hourlyRateSen: 1300,
    maritalStatus: 'Bujang',
    address: 'No. 18, Jalan Tun Perak, 75300 Melaka.',
    emergencyContactName: 'Hassan (Ayah)',
    emergencyContactPhone: '+60123456794',
  },
];

const SERVICES = [
  { name: 'Absorber Depan (L/R)', defaultMinutes: 45, defaultCommissionSen: 1500 },
  { name: 'Alignment & Balancing', defaultMinutes: 20, defaultCommissionSen: 800 },
  { name: 'Major Service (Full)', defaultMinutes: 90, defaultCommissionSen: 3500 },
  { name: 'Brakes', defaultMinutes: 40, defaultCommissionSen: 1800 },
  { name: 'Balancing', defaultMinutes: 15, defaultCommissionSen: 600 },
];

const VEHICLES = [
  { plateNumber: 'WBC 4452', model: 'Toyota Vios' },
  { plateNumber: 'MEL 1120', model: 'Honda City' },
  { plateNumber: 'VBG 221', model: 'Perodua Myvi' },
];

async function main(): Promise<void> {
  const branchIds = new Map<string, string>();
  for (const branch of BRANCHES) {
    const record = await prisma.branch.upsert({
      where: { code: branch.code },
      update: {},
      create: branch,
    });
    branchIds.set(branch.code, record.id);
  }

  const employeeIds = new Map<string, string>();
  const pinHash = hashPin(DEMO_PIN);
  for (const { branch, ...person } of PEOPLE) {
    const branchId = branchIds.get(branch) ?? '';
    const record = await prisma.employee.upsert({
      where: { phone: person.phone },
      update: { pinHash },
      create: {
        ...person,
        pinHash,
        branchId,
        joinedOn: new Date('2022-01-12T00:00:00.000Z'),
        leaveEntitlementDays: 21,
      },
    });
    employeeIds.set(person.fullName, record.id);
  }

  const serviceIds = new Map<string, string>();
  for (const service of SERVICES) {
    const record = await prisma.serviceType.upsert({
      where: { name: service.name },
      update: {},
      create: service,
    });
    serviceIds.set(service.name, record.id);
  }

  const customer =
    (await prisma.customer.findFirst({ where: { name: 'Walk-in Customer' } })) ??
    (await prisma.customer.create({ data: { name: 'Walk-in Customer' } }));

  const vehicleIds = new Map<string, string>();
  for (const vehicle of VEHICLES) {
    const record = await prisma.vehicle.upsert({
      where: { plateNumber: vehicle.plateNumber },
      update: {},
      create: { ...vehicle, customerId: customer.id },
    });
    vehicleIds.set(vehicle.plateNumber, record.id);
  }

  const utama = branchIds.get('MELAKA_UTAMA') ?? '';
  const ahmad = employeeIds.get('Ahmad Firdaus bin Ramli') ?? null;
  const ravi = employeeIds.get('Ravi Kumar a/l Suresh') ?? null;
  const farah = employeeIds.get('Farah Ann binti Yusof') ?? '';

  await prisma.job.deleteMany({});
  await prisma.job.createMany({
    data: [
      {
        branchId: utama,
        vehicleId: vehicleIds.get('VBG 221') ?? '',
        serviceTypeId: serviceIds.get('Absorber Depan (L/R)') ?? '',
        assigneeId: ravi,
        status: 'ASSIGNED',
        progressPct: 0,
        commissionSen: 1500,
        estimatedMinutes: 45,
      },
      {
        branchId: utama,
        vehicleId: vehicleIds.get('WBC 4452') ?? '',
        serviceTypeId: serviceIds.get('Major Service (Full)') ?? '',
        assigneeId: ahmad,
        status: 'IN_PROGRESS',
        progressPct: 65,
        commissionSen: 3500,
        estimatedMinutes: 90,
        startedAt: new Date(),
      },
      {
        branchId: utama,
        vehicleId: vehicleIds.get('MEL 1120') ?? '',
        serviceTypeId: serviceIds.get('Alignment & Balancing') ?? '',
        assigneeId: ahmad,
        status: 'COMPLETED',
        progressPct: 100,
        commissionSen: 1500,
        estimatedMinutes: 20,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    ],
  });

  await prisma.announcement.deleteMany({});
  await prisma.announcement.create({
    data: {
      branchId: utama,
      authorId: farah,
      title: 'Meeting Bulanan',
      body: 'Sila hadir ke bilik meeting pada pukul 5:30 PM untuk taklimat keselamatan.',
    },
  });

  const year = new Date().getFullYear();
  for (const employeeId of employeeIds.values()) {
    await prisma.leaveBalance.upsert({
      where: { employeeId_year: { employeeId, year } },
      update: {},
      create: { employeeId, year, entitlementDays: 21, usedDays: 9, pendingDays: 0 },
    });
  }

  const [employeeCount, jobCount] = await Promise.all([
    prisma.employee.count(),
    prisma.job.count(),
  ]);
  console.warn(`seeded: ${employeeCount} employees, ${jobCount} jobs, ${BRANCHES.length} branches`);
}

await main();
await prisma.$disconnect();
