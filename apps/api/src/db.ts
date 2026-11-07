import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

/**
 * One client for the process. Queries never leave the repository layer, so this
 * module is imported only from repositories and health checks.
 */
export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});
