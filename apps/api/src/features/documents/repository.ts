import { prisma } from '../../db.js';

export const documentRepository = {
  create(data: {
    employeeId: string;
    kind: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
  }) {
    return prisma.attachment.create({ data });
  },

  listForEmployee(employeeId: string) {
    return prisma.attachment.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },

  /** Scoped by owner: a document id alone is never enough to read a file. */
  findOwned(id: string, employeeId: string) {
    return prisma.attachment.findFirst({ where: { id, employeeId } });
  },

  findAny(id: string) {
    return prisma.attachment.findUnique({ where: { id } });
  },

  findAttachedRequest(documentId: string) {
    return prisma.leaveRequest.findFirst({ where: { documentId }, select: { id: true } });
  },

  remove(id: string) {
    return prisma.attachment.delete({ where: { id } });
  },
};
