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
    requireDeletionPassword: async(db,id,password)=>{if(password!=="synthetic-password")throw shared.workspaceError("Incorrect account password.",403);},
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
  }), /archive phrase/);
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
  await assert.rejects(()=>context.handleClassAction('delete_class_section',901,{id:op,class_section_id:section2,confirmation_password:'synthetic-password',completed_ack:true,deletion_reason:'x'}),/reason/);
  await context.handleClassAction('delete_class_section',901,{id:op,class_section_id:section2,confirmation_password:'synthetic-password',completed_ack:true,deletion_reason:'Synthetic section cleanup'});
assert.ok(state.sections.find(x=>x.id===section2).deletedAt);
  assert.equal(state.learners.filter(x=>x.classSectionId===section2).length,0);
  const archivedCount=state.archives.length;
  await context.handleClassAction('delete_class_section',901,{id:op,class_section_id:section2,confirmation_password:'synthetic-password',completed_ack:true,deletion_reason:'Synthetic section cleanup'});assert.equal(state.archives.length,archivedCount);
  await assert.rejects(()=>context.requireClass(prisma,901,section2,true),/unavailable/);
  const emptySection='88888888-8888-4888-8888-888888888888';
  await context.handleClassAction('save_class_section',901,{id:emptySection,school_year_id:year2,name:'Mars'});
  await context.handleClassAction('archive_school_year',901,{id:op,school_year_id:year2,confirmation:'ARCHIVE S.Y. 2028-2029',completed_ack:true});
  assert.ok(state.years.find(x=>x.id===year2).archivedAt);assert.ok(state.archives.some(x=>x.sourceSectionId===emptySection&&x.learnerCount===0));
  await assert.rejects(()=>context.handleClassAction('save_class_section',901,{id:'99999999-9999-4999-8999-999999999999',school_year_id:year2,name:'Forbidden'}),/active/);
  await context.handleClassAction('delete_school_year',901,{id:op,school_year_id:year2,confirmation_password:'synthetic-password',completed_ack:true,deletion_reason:'Synthetic year cleanup'});
  const catalog=await context.handleClassAction('get_classes',901);assert.ok(catalog.deletedYearIds.includes(year2));assert.ok(catalog.deletedSectionIds.includes(emptySection));assert.ok(!catalog.schoolYears.some(x=>x.id===year2));
  assert.equal(shared.orderedSchoolYears([{id:'b',startYear:2027},{id:'a',startYear:2026}])[0].startYear,2026);
  const emptyYear='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',emptyYear2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',emptyClass='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  await context.handleClassAction('save_school_year',901,{id:emptyYear,start_year:2070});
  await assert.rejects(()=>context.handleClassAction('delete_school_year',901,{id:op,school_year_id:emptyYear}),/password/);
  const archiveBefore=state.archives.length;
  await context.handleClassAction('delete_school_year',901,{id:op,school_year_id:emptyYear,empty_confirmation:true});
  assert.ok(state.years.find(x=>x.id===emptyYear).deletedAt);assert.equal(state.archives.length,archiveBefore);
  await context.handleClassAction('save_school_year',901,{id:emptyYear2,start_year:2071});
  await context.handleClassAction('save_class_section',901,{id:emptyClass,school_year_id:emptyYear2,name:'Empty'});
  await assert.rejects(()=>context.handleClassAction('delete_school_year',901,{id:op,school_year_id:emptyYear2,empty_confirmation:true}),/now has records/);
  state.learners.push({id:800,teacherId:901,classSectionId:emptyClass,firstName:'Test'});
  await assert.rejects(()=>context.handleClassAction('delete_class_section',901,{id:op,class_section_id:emptyClass,empty_confirmation:true}),/now has records/);
  assert.ok(state.learners.some(x=>x.id===800));
  state.learners=state.learners.filter(x=>x.id!==800);
  await context.handleClassAction('delete_class_section',901,{id:op,class_section_id:emptyClass,empty_confirmation:true});
  assert.ok(state.sections.find(x=>x.id===emptyClass).deletedAt);assert.equal(state.archives.length,archiveBefore);
  await context.handleClassAction('delete_class_section',901,{id:op,class_section_id:emptyClass,empty_confirmation:true});assert.equal(state.archives.length,archiveBefore);
  // Real encrypted bundle round trip, across distinct sections and an empty year.
  const sourceYear='dddddddd-dddd-4ddd-8ddd-dddddddddddd', targetYear='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const sectionA=crypto.randomUUID(), sectionB=crypto.randomUUID();
  await context.handleClassAction('save_school_year',901,{id:sourceYear,start_year:2080});
  await context.handleClassAction('save_school_year',901,{id:targetYear,start_year:2081});
  for (const [id,name] of [[sectionA,'Alpha'],[sectionB,'Beta']]) await context.handleClassAction('save_class_section',901,{id,school_year_id:sourceYear,name});
  state.learners.push({id:801,teacherId:901,classSectionId:sectionA,firstName:'SYNTHETIC A',lastName:'LEARNER',lrn:'000000000081',assessmentSessions:[{assessmentPeriod:'BoSY',isCompleted:true,sessionMetrics:{task1Score:7,remarks:'Evidence A'}}]}, {id:802,teacherId:901,classSectionId:sectionB,firstName:'SYNTHETIC B',lastName:'LEARNER',lrn:'000000000081',assessmentSessions:[]});
  const archiveYear=()=>context.handleClassAction('archive_school_year',901,{id:crypto.randomUUID(),school_year_id:sourceYear,confirmation:'ARCHIVE S.Y. 2080-2081',completed_ack:true});
  live=1;const beforeFailed=state.archives.length;await assert.rejects(archiveYear,/End all/);assert.equal(state.archives.length,beforeFailed);assert.ok(!state.years.find(x=>x.id===sourceYear).archivedAt);live=0;
  await archiveYear();const bundle=state.archives.find(x=>x.kind==='school_year'&&x.sourceSchoolYearId===sourceYear);assert.equal(bundle.sectionCount,2);assert.equal(bundle.learnerCount,2);assert.equal(bundle.sourceSectionId,null);
  const bundleCount=state.archives.length;await archiveYear();assert.equal(state.archives.length,bundleCount,'Repeated year archive is idempotent');
  const yearDownload=await context.handleClassAction('download_class_archive',901,{archive_id:bundle.id});assert.match(yearDownload.filename,/School_Year/);
  const importYear=(teacherId=901,schoolYearId=targetYear,backup=yearDownload.backup,roster_version=0)=>context.handleClassAction('import_class_archive',teacherId,{school_year_id:schoolYearId,backup,roster_version});
  await assert.rejects(()=>importYear(902),/own school-year/);
  await assert.rejects(()=>importYear(901,year),/empty school year/);
  await assert.rejects(()=>importYear(901,sourceYear),/active school year/);
  epoch=1;await assert.rejects(()=>importYear(901,targetYear,yearDownload.backup,1),/predates/);epoch=0;
  const decoded=codec.open(yearDownload.backup.sealed);decoded.sections[0].sealed+='damaged';await assert.rejects(()=>importYear(901,targetYear,{...yearDownload.backup,sealed:codec.seal(decoded)}),/damaged/);
  const sessionBefore=state.sessions.length;await importYear();const newClasses=state.sections.filter(x=>x.schoolYearId===targetYear);assert.equal(newClasses.length,2);assert.equal(state.learners.filter(x=>newClasses.some(c=>c.id===x.classSectionId)).length,2);assert.equal(state.sessions.length,sessionBefore+1);assert.equal(state.sessions.at(-1).sessionMetrics.create.remarks,'Evidence A');
  await importYear();assert.equal(state.sections.filter(x=>x.schoolYearId===targetYear).length,2,'Retried import cannot duplicate sections');
  await context.handleClassAction('delete_school_year',901,{id:crypto.randomUUID(),school_year_id:sourceYear,confirmation_password:'synthetic-password',completed_ack:true,deletion_reason:'Synthetic deletion after archive'});
  assert.equal((await context.handleClassAction('download_class_archive',901,{archive_id:bundle.id})).backup.sealed,yearDownload.backup.sealed,'Year backup survives source deletion');
  const emptyArchiveYear=crypto.randomUUID();await context.handleClassAction('save_school_year',901,{id:emptyArchiveYear,start_year:2082});await context.handleClassAction('archive_school_year',901,{id:crypto.randomUUID(),school_year_id:emptyArchiveYear,confirmation:'ARCHIVE S.Y. 2082-2083',completed_ack:true});assert.equal(state.archives.find(x=>x.sourceSchoolYearId===emptyArchiveYear).sectionCount,0);
  // Chooser-level imports route by sealed archive kind, preserving separate classes.
  await assert.rejects(()=>context.handleClassAction('import_class_archive',901,{backup:yearDownload.backup,expected_kind:'section',school_year_id:targetYear,roster_version:0}),/Choose a section backup/);
  const automatic=await context.handleClassAction('import_class_archive',901,{backup:yearDownload.backup,expected_kind:'school_year',class_section_id:null,roster_version:0});
  assert.equal(automatic.imported_count,2);
  const recreated=state.years.find(x=>x.startYear===2080&&!x.deletedAt);
  assert.ok(recreated&&recreated.id!==sourceYear);
  const beforeRetry=state.sections.length;
  await context.handleClassAction('import_class_archive',901,{backup:yearDownload.backup,expected_kind:'school_year',class_section_id:null,roster_version:0});
  assert.equal(state.sections.length,beforeRetry);
  const destinationYear=crypto.randomUUID();await context.handleClassAction('save_school_year',901,{id:destinationYear,start_year:2090});
  const sectionBackup=state.archives.find(x=>x.kind==='section'&&x.sourceSectionId===sectionA);
  await context.handleClassAction('import_class_archive',901,{backup:{format:'crl-class-archive',version:1,sealed:sectionBackup.encryptedSnapshot},expected_kind:'section',school_year_id:destinationYear,class_section_id:null,roster_version:0});
  const restoredSection=state.sections.find(x=>x.schoolYearId===destinationYear&&x.name==='Alpha');assert.ok(restoredSection);
  assert.equal(state.learners.filter(x=>x.classSectionId===restoredSection.id).length,1);
  const destination=crypto.randomUUID();await context.handleClassAction('save_class_section',901,{id:destination,school_year_id:destinationYear,name:'Destination'});
  state.learners.push({id:998,teacherId:901,classSectionId:destination,lrn:'000000099998',firstName:'ENROLLED',lastName:'LEARNER'});
  const group=crypto.randomUUID();
  const addArchive=(id,lrn,teacherId=901)=>{
    const archiveId=crypto.randomUUID();
    const snapshot={kind:'class_archive',archiveKind:'learner',version:1,archiveId,teacherId,rosterVersion:0,schoolYear:'2001-2002',section:'Deleted source',learners:[{id,lrn,firstName:'SYNTHETIC',lastName:String(id),assessmentSessions:[{assessmentPeriod:'BoSY',isCompleted:true,sessionMetrics:{task1Score:8,experienceRating:4,remarks:'Retain this evidence'}}]}]};
    state.archives.push({id:archiveId,teacherId,kind:'learner',deletionGroupId:group,sourceSectionId:crypto.randomUUID(),sourceLearnerId:id,learnerName:'SYNTHETIC '+id,schoolYearLabel:snapshot.schoolYear,sectionName:snapshot.section,learnerCount:1,encryptedSnapshot:codec.seal(snapshot)});return archiveId;
  };
  const first=addArchive(991,'000000099991'),second=addArchive(992,'000000099992');
  const restore=(ids,classId=destination,teacherId=901,roster_version=0)=>context.handleClassAction('restore_learner_archives',teacherId,{archive_ids:ids,class_section_id:classId,roster_version});
  assert.equal((await restore([first])).imported_count,1);assert.ok(!state.archives.find(x=>x.id===second).restoredAt);
  assert.equal((await restore([first])).already_restored_count,1);
  const groupResult=await restore([first,second]);assert.equal(groupResult.imported_count,1);assert.equal(groupResult.already_restored_count,1);
  assert.equal(state.learners.filter(x=>x.classSectionId===destination).length,3,'Selective and whole-group restores append without replacing enrolled learners');
  assert.equal(state.sessions.at(-1).sessionMetrics.create.remarks,'Retain this evidence');assert.equal(state.sessions.at(-1).sessionMetrics.create.experienceRating,4);
  await assert.rejects(()=>restore([first],foreign),/unavailable/);await assert.rejects(()=>restore([first],destination,902),/unavailable/);
  await assert.rejects(()=>restore([first],destination,901,1),/reset/);await assert.rejects(()=>restore([first,first]),/different/);
  const third=addArchive(993,'000000099993'),collision=addArchive(994,'000000099998');
  const beforeAtomic=clone(state);await assert.rejects(()=>restore([third,collision]),/already enrolled/);assert.deepEqual(state,beforeAtomic,'Collision rolls back every selected learner and receipt');
  const corrupt=addArchive(995,'000000099995');state.archives.find(x=>x.id===corrupt).encryptedSnapshot+='damaged';await assert.rejects(()=>restore([corrupt]),/damaged/);
  const old=addArchive(996,'000000099996');const oldEntry=state.archives.find(x=>x.id===old),oldSnapshot=codec.open(oldEntry.encryptedSnapshot);oldSnapshot.rosterVersion=-1;oldEntry.encryptedSnapshot=codec.seal(oldSnapshot);await assert.rejects(()=>restore([old]),/predates/);
  state.sections.find(x=>x.id===destination).archivedAt=new Date();await assert.rejects(()=>restore([third]),/archived/);
  console.log('PASS chooser-specific year/section imports, automatic target creation, separate sections, selective/grouped learner restoration into a new occupied class, receipts/retries, evidence, owner/reset/tamper/collision protection and all-or-nothing rollback');
  console.log('PASS encrypted school-year bundles: distinct class membership, evidence and unassessed learners, active-test rollback, ownership/reset/tamper/occupied-target rejection, one-time restoration and retention after source deletion');
  console.log('PASS authoritative empty-year/section confirmation, race-to-nonempty rejection, no empty deletion backups and retry safety');
  console.log('PASS class lifecycle: duplicate-year alias, year editing, archive-before-delete, password intent/reason, retry idempotency, empty-section archival, tombstones, name reuse and ascending years');
  console.log('PASS teacher/class ownership, year separation, confirmed archival, active-assessment protection, encrypted export after deletion, tamper/foreign rejection, empty-class restoration, retry idempotency, blank enrollments and remarks-only validation');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
