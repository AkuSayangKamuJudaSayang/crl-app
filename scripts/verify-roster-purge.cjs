const assert = require('node:assert/strict');
const {
  historyCodec,
  applyAuthorizedRosterPurges
} = require('./apply-authorized-roster-purges.cjs');
(async () => {
  const codec = historyCodec('synthetic-only-private-history-key');
  const original = {
    kind: 'backup',
    version: 1,
    learners: [{
      id: 101,
      teacherId: 901,
      lrn: '000000000001'
    }, {
      id: 102,
      teacherId: 902,
      lrn: '000000000002'
    }],
    content: [{
      teacherId: 902,
      content: 'Keep other teacher materials'
    }]
  };
  const sealed = codec.seal(original);
  assert.deepEqual(codec.open(sealed), original);
  assert.ok(!sealed.includes(original.learners[0].lrn));
  let state = {
    user: {
      id: 901,
      role: 'teacher',
      learnerPurgePending: true,
      learnerDataVersion: 0
    },
    learners: [...original.learners],
    hosts: [{
      teacherId: 901
    }, {
      teacherId: 902
    }],
    archives: [{
      teacherId: 901
    }, {
      teacherId: 902
    }],
    copies: [{
      id: 'shared',
      kind: 'backup',
      teacherId: null,
      encryptedSnapshot: sealed
    }, {
      id: 'own-deletion',
      kind: 'learners',
      teacherId: 901,
      encryptedSnapshot: codec.seal({
        kind: 'learners',
        learners: [original.learners[0]]
      })
    }],
    audit: [{
      teacherId: 901,
      event: 'learner.created'
    }, {
      teacherId: 902,
      event: 'learner.created'
    }, {
      teacherId: 901,
      event: 'login'
    }]
  };
  const copy = () => structuredClone(state);
  const db = {
    user: {
      findMany: async () => state.user.learnerPurgePending ? [{
        id: 901
      }] : [],
      findUnique: async () => state.user,
      update: async ({
        data
      }) => {
        state.user = {
          ...state.user,
          ...data,
          learnerDataVersion: state.user.learnerDataVersion + data.learnerDataVersion.increment
        };
      }
    },
    $queryRaw: async () => [],
    adminRecoveryItem: {
      findMany: async () => state.copies,
      delete: async ({
        where
      }) => {
        state.copies = state.copies.filter(x => x.id !== where.id);
      },
      update: async ({
        where,
        data
      }) => {
        Object.assign(state.copies.find(x => x.id === where.id), data);
      }
    },
    classArchive: {
      deleteMany: async () => {
        state.archives = state.archives.filter(x => x.teacherId !== 901);
      }
    },
    adminAuditEvent: {
      deleteMany: async () => {
        state.audit = state.audit.filter(x => x.teacherId !== 901 || !/^learners?\./.test(x.event));
      }
    },
    hostSession: {
      deleteMany: async () => {
        state.hosts = state.hosts.filter(x => x.teacherId !== 901);
      }
    },
    learner: {
      deleteMany: async () => {
        const count = state.learners.filter(x => x.teacherId === 901).length;
        state.learners = state.learners.filter(x => x.teacherId !== 901);
        return {
          count
        };
      }
    },
    $transaction: async fn => {
      const before = copy();
      try {
        return await fn(db);
      } catch (e) {
        state = before;
        throw e;
      }
    }
  };
  const before = copy();
  await assert.rejects(() => applyAuthorizedRosterPurges(db, {
    open() {
      throw Error('Cannot decrypt');
    },
    seal: codec.seal
  }), /decrypt/);
  assert.deepEqual(state, before, 'A failed backup redaction must roll back all removal');
  const result = await applyAuthorizedRosterPurges(db, codec);
  assert.deepEqual(result, {
    accounts: 1,
    learners: 1
  });
  assert.deepEqual(state.learners, [original.learners[1]]);
  assert.deepEqual(codec.open(state.copies[0].encryptedSnapshot), {
    ...original,
    learners: [original.learners[1]]
  });
  assert.equal(state.copies.length, 1);
  assert.equal(state.archives.length, 1);
  assert.equal(state.hosts.length, 1);
  assert.equal(state.audit.length, 2);
  assert.equal(state.user.learnerPurgePending, false);
  assert.equal(state.user.learnerDataVersion, 1);
  assert.deepEqual(await applyAuthorizedRosterPurges(db, codec), {
    accounts: 0,
    learners: 0
  });
  console.log('PASS authorized permanent roster purge removes only its teacher records and historical learner copies, preserves other accounts/materials, rolls back on unreadable history and runs exactly once');
})().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
