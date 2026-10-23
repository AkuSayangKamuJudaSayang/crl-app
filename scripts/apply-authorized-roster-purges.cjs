/* One-time maintenance requested through the private database, never a public
 * API. No archive or export is created. All changes commit together. */
const crypto = require('node:crypto');
function historyCodec(secret) {
  if (!secret) throw new Error('Private history encryption is unavailable.');
  const key = crypto.createHash('sha256').update(`crl-admin-history-v1:${secret}`).digest();
  return {
    open(value) {
      const [version, iv, tag, raw, extra] = String(value).split('.');
      if (version !== 'v1' || !iv || !tag || !raw || extra) throw Error('Invalid private history.');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      decipher.setAAD(Buffer.from('crl-admin-history-v1'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(raw, 'base64url')), decipher.final()]).toString());
    },
    seal(value) {
      const iv = crypto.randomBytes(12),
        cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from('crl-admin-history-v1'));
      const data = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value))), cipher.final()]);
      return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
    }
  };
}
async function applyAuthorizedRosterPurges(db, codec) {
  const pending = await db.user.findMany({
    where: {
      learnerPurgePending: true,
      role: 'teacher'
    },
    select: {
      id: true
    }
  });
  let accounts = 0,
    learners = 0;
  for (const owner of pending) {
    const result = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM public.users WHERE id=${owner.id} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: {
          id: owner.id
        }
      });
      if (!user?.learnerPurgePending || user.role !== 'teacher') return 0;
      const copies = await tx.adminRecoveryItem.findMany({
        where: {
          OR: [{
            teacherId: owner.id
          }, {
            kind: 'backup'
          }]
        }
      });
      for (const item of copies) {
        if (item.kind === 'learners' && item.teacherId === owner.id) {
          await tx.adminRecoveryItem.delete({
            where: {
              id: item.id
            }
          });
          continue;
        }
        if (item.kind !== 'backup') continue;
        const snapshot = codec.open(item.encryptedSnapshot);
        if (!Array.isArray(snapshot.learners)) throw Error('Unrecognized backup structure; purge stopped.');
        const remaining = snapshot.learners.filter(row => Number(row.teacherId) !== owner.id);
        if (remaining.length !== snapshot.learners.length) await tx.adminRecoveryItem.update({
          where: {
            id: item.id
          },
          data: {
            encryptedSnapshot: codec.seal({
              ...snapshot,
              learners: remaining
            }),
            entityCount: remaining.length
          }
        });
      }
      await tx.classArchive.deleteMany({
        where: {
          teacherId: owner.id
        }
      });
      await tx.adminAuditEvent.deleteMany({
        where: {
          teacherId: owner.id,
          OR: [{
            event: {
              startsWith: 'learner.'
            }
          }, {
            event: {
              startsWith: 'learners.'
            }
          }, {
            event: {
              in: ['class.archived', 'class.imported']
            }
          }]
        }
      });
      await tx.hostSession.deleteMany({
        where: {
          teacherId: owner.id
        }
      });
      const deleted = await tx.learner.deleteMany({
        where: {
          teacherId: owner.id
        }
      });
      await tx.user.update({
        where: {
          id: owner.id
        },
        data: {
          learnerPurgePending: false,
          lastLearnerPurgeAt: new Date(),
          learnerDataVersion: {
            increment: 1
          }
        }
      });
      return deleted.count;
    }, {
      timeout: 60000,
      isolationLevel: 'Serializable'
    });
    accounts++;
    learners += result;
  }
  return {
    accounts,
    learners
  };
}
module.exports = {
  historyCodec,
  applyAuthorizedRosterPurges
};
if (require.main === module) {
  if (process.env.VERCEL_ENV !== 'production') {
    console.log('Authorized roster maintenance: production deployment only.');
  } else {
    const {
      PrismaClient
    } = require('@prisma/client');
    const db = new PrismaClient();
    Promise.resolve().then(() => historyCodec(process.env.ADMIN_DATA_ENCRYPTION_KEY || process.env.JWT_SECRET || process.env.AUTH_SECRET)).then(codec => applyAuthorizedRosterPurges(db, codec)).then(result => console.log(`Authorized roster maintenance complete: ${result.accounts} account(s), ${result.learners} learner(s) removed; no backup created.`)).catch(() => {
      console.error('Authorized roster maintenance failed; transaction rolled back.');
      process.exitCode = 1;
    }).finally(() => db.$disconnect());
  }
}
