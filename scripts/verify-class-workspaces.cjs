const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {
  historyCodec
} = require('./apply-authorized-roster-purges.cjs');
(async () => {
  const shared = await import('../lib/classWorkspace.mjs');
  const {
    rosterRecords,
    blankExportRow
  } = await import('../lib/rosterRecords.mjs');
  const codec = historyCodec('synthetic-class-archive-key');
  const year = '11111111-1111-4111-8111-111111111111',
    section = '22222222-2222-4222-8222-222222222222',
    foreign = '33333333-3333-4333-8333-333333333333',
    archive = '44444444-4444-4444-8444-444444444444',
    year2 = '55555555-5555-4555-8555-555555555555',
    section2 = '66666666-6666-4666-8666-666666666666';
  let state = {
    years: [{
      id: year,
      teacherId: 901,
      startYear: 2026,
      label: '2026-2027'
    }],
    sections: [{
      id: section,
      teacherId: 901,
      schoolYearId: year,
      name: 'Mars'
    }, {
      id: foreign,
      teacherId: 902,
      schoolYearId: year,
      name: 'Foreign'
    }],
    learners: [{
      id: 10,
      teacherId: 901,
      classSectionId: section,
      lrn: '000000000001',
      firstName: 'SYNTHETIC',
      lastName: 'LEARNER',
      sex: 'Female',
      gradeLevel: 3,
      assessmentSessions: [{
        id: 20,
        teacherId: 901,
        learnerId: 10,
        assessmentPeriod: 'BoSY',
        dateAdministered: '2026-10-01T00:00:00.000Z',
        isCompleted: true,
        overallClassification: 'Low Emerging Reader',
        sessionMetrics: {
          task1Score: 0,
          task2Score: 0,
          remarks: 'Keep this evidence'
        },
        letterResults: [],
        wordResults: [],
        passageMiscues: [],
        comprehensionResults: []
      }]
    }],
    archives: [],
    sessions: [],
    hosts: [],
    audits: []
  };
  const clone = x => structuredClone(x);
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => ['teacherId_startYear', 'schoolYearId_nameKey'].includes(key) ? matches(row, value) : value===null ? row[key]==null : row[key] === value);
  let nextId = 100,
    live = 0,
    epoch = 0;
  const model = key => ({
    findUnique: async ({
      where
    }) => clone(state[key].find(x => matches(x, where)) || null),
    findFirst: async ({
      where
    }) => {
      const row = state[key].find(x => matches(x, where));
      return row ? clone({
        ...row,
        ...(key === 'sections' ? {
          schoolYear: state.years.find(y => y.id === row.schoolYearId)
        } : {})
      }) : null;
    },
    findMany: async ({
      where = {}
    } = {}) => clone(state[key].filter(x => matches(x, where))),
    count: async ({
      where = {}
    } = {}) => state[key].filter(x => matches(x, where)).length,
    create: async ({
      data
    }) => {
      const row = {
        id: nextId++,
        ...clone(data)
      };
      state[key].push(row);
      return clone(row);
    },
    update: async ({
      where,
      data
    }) => {
      const row = state[key].find(x => matches(x, where));
      if (!row) throw Error('Not found');
      Object.assign(row, clone(data));
      return clone(row);
    },
    updateMany: async ({
      where,
      data
    }) => {
      for (const row of state[key].filter(x => matches(x, where))) Object.assign(row, clone(data));
    },
    deleteMany: async ({where={}}={}) => { const removed=state[key].filter(x=>matches(x,where));state[key]=state[key].filter(x=>!matches(x,where));return {count:removed.length}; },
    upsert: async ({
      where,
      create,
      update
    }) => {
      const row = state[key].find(x => matches(x, where));
      if (row) {
        Object.assign(row, clone(update));
        return clone(row);
      }
      const added = clone(create);
      state[key].push(added);
      return added;
    }
  });
  const prisma = {
    schoolYear: model('years'),
    classSection: model('sections'),
    classArchive: model('archives'),
    learner: model('learners'),
    assessmentSession: model('sessions'),
    hostSession: {
      ...model('hosts'),
      count: async () => live
    },
    user: {
      findUnique: async () => ({
        learnerDataVersion: epoch
      })
    },
    $queryRaw: async () => []
  };
  prisma.$transaction = async callback => {
    const before = clone(state);
    try {
      return await callback(prisma);
    } catch (error) {
      state = before;
      throw error;
    }
  };
  const context = vm.createContext({
    ...shared,
    prisma,
    crypto,
    learnerHistoryInclude: {
      assessmentSessions: {
        include: {
          sessionMetrics: true
        }
      }
    },
    sealPrivateData: codec.seal,
    openPrivateData: codec.open,
    writeAudit: async (_, entry) => state.audits.push(clone(entry))
  });
  const source = fs.readFileSync('lib/classWorkspaces.js', 'utf8').replace(/^import .*;\s*/gm, '').replace(/^export /gm, '');
  vm.runInContext(source, context);
  await assert.rejects(() => context.requireClass(prisma, 901, foreign, true), /unavailable/);
  await assert.rejects(() => context.handleClassAction('save_class_section', 901, {
    id: section,
    school_year_id: year2,
    name: 'Moved'
  }), /unavailable/);
  await assert.rejects(() => context.handleClassAction('archive_class', 901, {
    id: archive,
    class_section_id: section,
    confirmation: 'WRONG',
    completed_ack: true
  }), /Confirm/);
  live = 1;
  await assert.rejects(() => context.handleClassAction('archive_class', 901, {
    id: archive,
    class_section_id: section,
    confirmation: 'ARCHIVE Mars',
    completed_ack: true
  }), /End all/);
  live = 0;
  await context.handleClassAction('archive_class', 901, {
    id: archive,
    class_section_id: section,
    confirmation: 'ARCHIVE Mars',
    completed_ack: true
  });
  assert.equal(state.archives.length, 1);
  await assert.rejects(() => context.requireClass(prisma, 901, section, true), /archived/);
  const download = await context.handleClassAction('download_class_archive', 901, {
    archive_id: archive
  });
  await assert.rejects(() => context.handleClassAction('download_class_archive', 902, {
    archive_id: archive
  }), /not found/);
  state.learners = [];
  assert.equal((await context.handleClassAction('download_class_archive', 901, {
    archive_id: archive
  })).backup.sealed, download.backup.sealed);
  await context.handleClassAction('save_school_year', 901, {
    id: year2,
    start_year: 2027
  });
  await context.handleClassAction('save_class_section', 901, {
    id: section2,
    school_year_id: year2,
    name: 'Mars'
  });
  await context.handleClassAction('import_class_archive', 901, {
    class_section_id: section2,
    backup: download.backup
  });
  assert.equal(state.learners.length, 1);
  assert.equal(state.learners[0].classSectionId, section2);
  assert.notEqual(state.learners[0].id, 10);
  assert.equal(state.sessions[0].sessionMetrics.create.remarks, 'Keep this evidence');
  await context.handleClassAction('import_class_archive', 901, {
    class_section_id: section2,
    backup: download.backup
  });
  assert.equal(state.learners.length, 1, 'A retried archive import cannot duplicate learners');
  await assert.rejects(() => context.handleClassAction('import_class_archive', 902, {
    class_section_id: foreign,
    backup: download.backup
  }), /own class archives/);
  await assert.rejects(() => context.handleClassAction('import_class_archive', 901, {
    class_section_id: section2,
    backup: {
      ...download.backup,
      sealed: download.backup.sealed.slice(0, -8) + 'tampered'
    }
  }), /damaged/);
  epoch = 1;
  await assert.rejects(() => context.handleClassAction('import_class_archive', 901, {
    class_section_id: section2,
    roster_version: 1,
    backup: download.backup
  }), /predates/);
  epoch = 0;
  const rows = rosterRecords([{
    id: 1
  }, {
    id: 2
  }], [{
    id: 3,
    learner_id: 1,
    assessment_period: 'BoSY',
    is_completed: true,
    task1_score: 0
  }], 'BoSY');
  assert.equal(rows.length, 2);
  assert.equal(rows[1].assessment.enrolled_only, true);
  assert.equal(rows[0].assessment.task1_score, 0);
  const blank = blankExportRow({
    lrn: '000000000002',
    sex: 'Male'
  }, 1, 'SYNTHETIC');
  assert.equal(blank.task1, null);
  assert.equal(blank.readingProfile, '');
  assert.equal(blank.assessed, false);
  assert.equal(shared.periodEligibility([{
    learner_id: 1,
    assessment_period: 'BoSY',
    is_completed: true
  }], 1, 'EoSY'), 'Complete MoSY before starting EoSY.');
  assert.throws(() => shared.validateRemarkRecords([{
    id: 3,
    remarks: 'x',
    task1_score: 10
  }]), /Only remarks/);
  const op='77777777-7777-4777-8777-777777777777';
  const alias=await context.handleClassAction('save_school_year',901,{id:op,start_year:2027});assert.equal(alias.year_alias.to,year2);
  await context.handleClassAction('edit_school_year',901,{id:year2,start_year:2028});assert.equal(state.years.find(x=>x.id===year2).label,'2028-2029');
  await assert.rejects(()=>context.handleClassAction('delete_class_section',901,{id:op,class_section_id:section2,confirmation:'DELETE SECTION Mars',completed_ack:true,deletion_reason:'x'}),/reason/);
  await context.handleClassAction('delete_class_section',901,{id:op,class_section_id:section2,confirmation:'DELETE SECTION Mars',completed_ack:true,deletion_reason:'Synthetic section cleanup'});
assert.ok(state.sections.find(x=>x.id===section2).deletedAt);
  assert.equal(state.learners.filter(x=>x.classSectionId===section2).length,0);
  const archivedCount=state.archives.length;
  await context.handleClassAction('delete_class_section',901,{id:op,class_section_id:section2,confirmation:'DELETE SECTION Mars',completed_ack:true,deletion_reason:'Synthetic section cleanup'});assert.equal(state.archives.length,archivedCount);
  await assert.rejects(()=>context.requireClass(prisma,901,section2,true),/unavailable/);
  const emptySection='88888888-8888-4888-8888-888888888888';
  await context.handleClassAction('save_class_section',901,{id:emptySection,school_year_id:year2,name:'Mars'});
  await context.handleClassAction('archive_school_year',901,{id:op,school_year_id:year2,confirmation:'ARCHIVE S.Y. 2028-2029',completed_ack:true});
  assert.ok(state.years.find(x=>x.id===year2).archivedAt);assert.ok(state.archives.some(x=>x.sourceSectionId===emptySection&&x.learnerCount===0));
  await assert.rejects(()=>context.handleClassAction('save_class_section',901,{id:'99999999-9999-4999-8999-999999999999',school_year_id:year2,name:'Forbidden'}),/active/);
  await context.handleClassAction('delete_school_year',901,{id:op,school_year_id:year2,confirmation:'DELETE S.Y. 2028-2029',completed_ack:true,deletion_reason:'Synthetic year cleanup'});
  const catalog=await context.handleClassAction('get_classes',901);assert.ok(catalog.deletedYearIds.includes(year2));assert.ok(catalog.deletedSectionIds.includes(emptySection));assert.ok(!catalog.schoolYears.some(x=>x.id===year2));
  assert.equal(shared.orderedSchoolYears([{id:'b',startYear:2027},{id:'a',startYear:2026}])[0].startYear,2026);
  console.log('PASS class lifecycle: duplicate-year alias, year editing, archive-before-delete, typed intent/reason, retry idempotency, empty-section archival, tombstones, name reuse and ascending years');
  console.log('PASS teacher/class ownership, year separation, confirmed archival, active-assessment protection, encrypted export after deletion, tamper/foreign rejection, empty-class restoration, retry idempotency, blank enrollments and remarks-only validation');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
