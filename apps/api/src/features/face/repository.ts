import { prisma } from '../../db.js';

export const faceRepository = {
  find(employeeId: string) {
    return prisma.faceEnrollment.findUnique({ where: { employeeId } });
  },

  /** Enrolment is replaceable: a re-enrol overwrites the previous reference. */
  upsert(employeeId: string, referenceEnc: string, descriptorEnc: string) {
    return prisma.faceEnrollment.upsert({
      where: { employeeId },
      update: { referenceEnc, descriptorEnc },
      create: { employeeId, referenceEnc, descriptorEnc },
    });
  },

  remove(employeeId: string) {
    return prisma.faceEnrollment.deleteMany({ where: { employeeId } });
  },
};
