import { createHash } from 'node:crypto';
import { prisma } from './prisma';

const DAY = 86400000;
const sessionKey = (token, claims) => claims.sid || createHash('sha256').update(token).digest('hex');

export async function isStaffSessionRevoked(token, claims) {
  const row = await prisma.revokedStaffSession.findUnique({
    where: { sessionKey: sessionKey(token, claims) },
    select: { expiresAt: true },
  });
  return Boolean(row && row.expiresAt > new Date());
}

export async function revokeStaffSession(token, claims) {
  // Older teacher cookies and offline grants shared only an account version.
  if (claims.role === 'teacher' && !claims.sid) {
    await prisma.user.updateMany({
      where: { id: Number(claims.id), role: 'teacher', adminSessionVersion: claims.session_version },
      data: { adminSessionVersion: { increment: 1 } },
    });
    return;
  }

  const key = sessionKey(token, claims);
  // An offline grant may outlive the teacher's browser cookie.
  const expiresAt = new Date(Date.now() + (claims.role === 'teacher' ? 31 : 1) * DAY);
  await prisma.$transaction(async tx => {
    await tx.revokedStaffSession.upsert({ where: { sessionKey: key }, create: { sessionKey: key, expiresAt }, update: {} });
    await tx.revokedStaffSession.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  });
}
