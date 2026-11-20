const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const XLSX = require('xlsx');
const JSZip = require('jszip');
const { Readable } = require('node:stream');
const { NextResponse } = require('next/server');

(async () => {
  const identity=await import("../lib/classWorkspace.mjs");
  const section = '11111111-1111-4111-8111-111111111111';
  let rows = [], readOnly = false, owned = true;
  const requireClass = async (_, teacherId, classId) => {
    if (!owned || teacherId !== 901 || classId !== section) throw Object.assign(Error('Unavailable class'), {status: 404});
    if (readOnly) throw Object.assign(Error('Archived class'), {status: 409});
    return {id: section, name: 'Synthetic', schoolYearId: 'year-one'};
  };
  const prisma = {
    user: {findUnique: async () => ({id: 901}),findFirst:async()=>({id:901})},
    learner: {
      findMany: async ({where}) => rows.filter(row => row.teacherId === where.teacherId && (!where.classSectionId || row.classSectionId === where.classSectionId) && (!where.classSection?.schoolYearId || (row.classSectionId === 'another-school-year-section' ? 'year-two' : 'year-one') === where.classSection.schoolYearId) && (!where.lrn || where.lrn.in.includes(row.lrn))),
      createManyAndReturn: async ({data}) => {
        assert.ok(data.length, 'Do not issue a write for an all-duplicate workbook');
        const created = data.filter(row => !rows.some(existing => existing.classSectionId === row.classSectionId && existing.lrn === row.lrn));
        rows.push(...created); return created;
      }
    }
  };
  prisma.$transaction = async fn => fn(prisma);
  const ctx = vm.createContext({withSchoolScope:async(_,work)=>work(),process: {env: {JWT_SECRET: 'synthetic-fixture'}}, TextEncoder, Buffer, XLSX, JSZip, Readable, NextResponse,
    ...identity, prisma, getAuthenticatedUser:async()=>({id:901,role:"teacher"}), jwtVerify: async () => ({payload: {id: 901, role: 'teacher'}}), requireClass,
    lockClass: requireClass, assertRosterVersion: async () => {}, writeAudit: async () => {}, logSecureError() {}});
  vm.runInContext(fs.readFileSync('app/api/teacher/import-learners/route.js', 'utf8').replace(/^import .*;\s*/gm, '').replace(/^export /gm, ''), ctx);
  const offline = vm.createContext({...identity,crypto:require('node:crypto').webcrypto,loadXlsx: async () => XLSX});
  vm.runInContext(fs.readFileSync('lib/offlineClassRecordImport.js', 'utf8').replace(/^import .*;\s*/gm, '').replace(/^export /gm, '').replace('await import("xlsx")', 'await loadXlsx()'), offline);
  const workbooks = [
    [["LRN","LAST NAME","FIRST NAME","MIDDLE INITIAL","SUFFIX","SEX"],["990000000091","Sample","Learner","M.","Jr.","Female"]],
    [['LRN', 'LAST NAME', 'FIRST NAME', 'MIDDLE INITIAL', 'SEX'], ['990000000091', 'Sample', 'Learner', 'M.', 'Female']],
    [['LRN', 'LAST NAME', 'FIRST NAME', 'SEX'], ['990000000091', 'Sample', 'Learner', 'Female']],
    [['LRN', 'LAST NAME', 'FIRST NAME', 'MIDDLE NAME', 'SEX'], ['990000000091', 'Sample', 'Learner', 'Middle', 'Female']],
    [['LRN', 'NAME (LAST NAME, FIRST NAME, MIDDLE NAME)', 'SEX'], ['990000000091', 'Sample, Learner, Middle', 'Female']]
  ];
  for (const data of workbooks) for (const bookType of ['csv', 'xlsx', 'xls']) {
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Class');
    const bytes = XLSX.write(wb, {type: 'buffer', bookType});
    const file = {name: `synthetic.${bookType}`, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)};
    const request = {cookies: {get: () => ({value: 'synthetic'})}, headers: new Headers(), formData: async () => new Map([['file', file], ['teacher_id','901'], ['class_section_id', section], ['roster_version', '0']])};
    rows = [];
    const response = await ctx.POST(request); assert.equal(response.status, 200); assert.equal((await response.json()).importedCount, 1);
    assert.equal(rows[0].firstName, 'LEARNER'); assert.equal(rows[0].lastName, 'SAMPLE'); assert.equal(rows[0].middleName, data[0].includes('MIDDLE INITIAL') ? 'M.' : data[0].length===4 ? null : 'MIDDLE'); assert.equal(rows[0].classSectionId, section);assert.equal(rows[0].suffix,data[0].includes('SUFFIX')?'JR.':null);
    const local = await offline.extractLearners(file); assert.equal(local.learners[0].firstName, 'Learner'); assert.equal(local.learners[0].lastName, 'Sample'); assert.equal(local.learners[0].middleName, data[0].includes('MIDDLE INITIAL') ? 'M.' : data[0].length===4 ? '' : 'Middle');
    assert.equal(local.learners[0].suffix,data[0].includes("SUFFIX")?"Jr.":"");
    assert.equal((await (await ctx.POST(request)).json()).importedCount, 0);
    rows[0].classSectionId='another-school-year-section';
    assert.equal((await (await ctx.POST(request)).json()).importedCount,1,'The same learner can be enrolled in another school year');
    const oldLrn=rows[0].lrn;rows[0].lrn='990000000099';
    assert.equal((await (await ctx.POST(request)).json()).importedCount,0,'A matching full name with a new LRN is still a duplicate');
    rows[0].lrn=oldLrn;rows=rows.filter(r=>r.classSectionId===section);
    readOnly = true; assert.equal((await ctx.POST(request)).status, 409); readOnly = false;
    owned = false; assert.equal((await ctx.POST(request)).status, 404); owned = true;
    assert.equal(rows.length, 1);
  }
  vm.runInContext(fs.readFileSync('lib/coordinatorSections.js','utf8').replace(/^import .*;\s*/gm,'').replace(/^export /gm,''),ctx);
  const year='22222222-2222-4222-8222-222222222222',newId='33333333-3333-4333-8333-333333333333';let classes=[],failInsert=false;
  prisma.$queryRaw=async()=>[];prisma.schoolYear={findFirst:async({where})=>where.id===year&&where.teacherId===901?{id:year}:null};prisma.classSection={findUnique:async({where})=>classes.find(c=>c.id===where.id),findFirst:async({where})=>classes.find(c=>c.teacherId===where.teacherId&&c.schoolYearId===where.schoolYearId&&c.nameKey===where.nameKey),create:async({data})=>{classes.push(data);return data;}};
  const insert=prisma.learner.createManyAndReturn;prisma.learner.createManyAndReturn=async q=>{if(failInsert)throw Error('Synthetic failed insert');return insert(q);};prisma.$transaction=async fn=>{const oldRows=structuredClone(rows),oldClasses=structuredClone(classes);try{return await fn(prisma);}catch(e){rows=oldRows;classes=oldClasses;throw e;}};
  const csv=Buffer.from('LRN,LAST NAME,FIRST NAME,SEX\n990000000081,New,Sample,Female');const upload={name:'class.csv',size:csv.length,arrayBuffer:async()=>csv.buffer.slice(csv.byteOffset,csv.byteOffset+csv.byteLength)};
  const request={formData:async()=>new Map([['file',upload],['teacher_id','901'],['create_section_id',newId],['school_year_id',year],['section_name','New section'],['roster_version','0']])};rows=[];let response=await ctx.POST(request);assert.equal(response.status,403);assert.equal(classes.length,0);assert.equal(rows.length,0);
  const assigned={formData:async()=>new Map([['file',upload],['class_section_id',section],['roster_version','0']])};failInsert=true;response=await ctx.POST(assigned);assert.equal(response.status,500);assert.equal(rows.length,0);failInsert=false;response=await ctx.POST(assigned);assert.equal(response.status,200);assert.equal(rows.length,1);assert.equal((await (await ctx.POST(assigned)).json()).importedCount,0);

  const siblingSection = 'same-school-year-section';
  const differentYearSection = 'another-school-year-section';
  const saved = [
    {classSectionId: siblingSection, teacherId: 901, lrn: '990000000081', firstName: 'Sample', lastName: 'New'},
    {classSectionId: differentYearSection, teacherId: 901, lrn: '990000000082', firstName: 'Another', lastName: 'New'},
  ];
  const mixedBytes = Buffer.from([
    'LRN,LAST NAME,FIRST NAME,SEX',
    '990000000081,NEW,SAMPLE,Female',
    '990000000082,New,Another,Female',
    '990000000082,New,Another,Female',
    '990000000083,NEW,  another,Female',
  ].join('\n'));
  const mixed = {name:'mixed.csv',size:mixedBytes.length,arrayBuffer:async()=>mixedBytes};
  rows = structuredClone(saved);
  const onlineResult = await (await ctx.POST({formData: async () => new Map([
    ['file', mixed], ['class_section_id', section],
  ])})).json();
  assert.equal(onlineResult.importedCount, 1);
  assert.equal(onlineResult.duplicateCount, 3);
  assert.equal(onlineResult.skippedCount, 3);
  assert.deepEqual(rows.slice(0, 2), saved);
  assert.equal(rows[2].lrn, '990000000082');
  const writes = [];
  offline.fetch = async (url, options) => {
    if (url.endsWith('get_classes')) return Response.json({
      schoolYears: [{id:'year-one'}, {id:'year-two'}],
      sections: [
        {id:section,schoolYearId:'year-one'}, {id:siblingSection,schoolYearId:'year-one'},
        {id:differentYearSection,schoolYearId:'year-two'},
      ],
      roster_version: 3,
    });
    if (url.endsWith('get_learners')) return Response.json({learners:saved, roster_version:3});
    assert.ok(url.endsWith('add_learner'));
    writes.push(JSON.parse(options.body));
    return Response.json({status:'ok'});
  };
  const localResult = await offline.importClassRecordOffline(mixed, section, 3);
  assert.equal(localResult.importedCount, 1);
  assert.equal(localResult.duplicateCount, 3);
  assert.equal(localResult.skippedCount, 3);
  assert.deepEqual(writes.map(row => row.lrn), ['990000000082']);
  await assert.rejects(offline.importClassRecordOffline(mixed, section, 2), /Refresh the class roster/);
  assert.equal(writes.length, 1, 'A stale import must not enqueue enrollments');
  console.log('PASS online and offline import skip duplicates across the teacher’s school-year roster and retain distinct-year enrollment');
  console.log('PASS teacher import rejects section creation, rolls back a failed import and retries without duplicate learners');
  console.log('PASS actual online/offline class-record parsers: CSV/XLSX/XLS, separate and combined names, middle names, class ownership, read-only rejection and duplicate-safe import');
})().catch(error => {console.error(error); process.exitCode = 1;});
