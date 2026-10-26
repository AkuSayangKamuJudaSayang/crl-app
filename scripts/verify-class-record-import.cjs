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
    return {id: section, name: 'Synthetic'};
  };
  const prisma = {
    user: {findUnique: async () => ({id: 901})},
    learner: {
      findMany: async ({where}) => rows.filter(row => row.teacherId === where.teacherId && (!where.classSectionId || row.classSectionId === where.classSectionId) && (!where.lrn || where.lrn.in.includes(row.lrn))),
      createManyAndReturn: async ({data}) => {
        const created = data.filter(row => !rows.some(existing => existing.classSectionId === row.classSectionId && existing.lrn === row.lrn));
        rows.push(...created); return created;
      }
    }
  };
  prisma.$transaction = async fn => fn(prisma);
  const ctx = vm.createContext({process: {env: {JWT_SECRET: 'synthetic-fixture'}}, TextEncoder, Buffer, XLSX, JSZip, Readable, NextResponse,
    ...identity, prisma, jwtVerify: async () => ({payload: {id: 901, role: 'teacher'}}), requireClass,
    lockClass: requireClass, assertRosterVersion: async () => {}, writeAudit: async () => {}, logSecureError() {}});
  vm.runInContext(fs.readFileSync('app/api/teacher/import-learners/route.js', 'utf8').replace(/^import .*;\s*/gm, '').replace(/^export /gm, ''), ctx);
  const offline = vm.createContext({...identity,loadXlsx: async () => XLSX});
  vm.runInContext(fs.readFileSync('lib/offlineClassRecordImport.js', 'utf8').replace(/^import .*;\s*/gm, '').replace(/^export /gm, '').replace('await import("xlsx")', 'await loadXlsx()'), offline);
  const workbooks = [
    [['LRN', 'LAST NAME', 'FIRST NAME', 'MIDDLE NAME', 'SEX'], ['990000000091', 'Sample', 'Learner', 'Middle', 'Female']],
    [['LRN', 'NAME (LAST NAME, FIRST NAME, MIDDLE NAME)', 'SEX'], ['990000000091', 'Sample, Learner, Middle', 'Female']]
  ];
  for (const data of workbooks) for (const bookType of ['csv', 'xlsx', 'xls']) {
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), 'Class');
    const bytes = XLSX.write(wb, {type: 'buffer', bookType});
    const file = {name: `synthetic.${bookType}`, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)};
    const request = {cookies: {get: () => ({value: 'synthetic'})}, headers: new Headers(), formData: async () => new Map([['file', file], ['class_section_id', section], ['roster_version', '0']])};
    rows = [];
    const response = await ctx.POST(request); assert.equal(response.status, 200); assert.equal((await response.json()).importedCount, 1);
    assert.equal(rows[0].firstName, 'LEARNER'); assert.equal(rows[0].lastName, 'SAMPLE'); assert.equal(rows[0].middleName, 'MIDDLE'); assert.equal(rows[0].classSectionId, section);
    const local = await offline.extractLearners(file); assert.equal(local.learners[0].firstName, 'Learner'); assert.equal(local.learners[0].lastName, 'Sample'); assert.equal(local.learners[0].middleName, 'Middle');
    assert.equal((await (await ctx.POST(request)).json()).importedCount, 0);
    rows[0].classSectionId='another-school-year-section';
    assert.equal((await (await ctx.POST(request)).json()).importedCount,0,'LRNs are unique across all classes');
    const oldLrn=rows[0].lrn;rows[0].lrn='990000000099';
    assert.equal((await (await ctx.POST(request)).json()).importedCount,0,'A matching full name with a new LRN is still a duplicate');
    rows[0].lrn=oldLrn;rows[0].classSectionId=section;
    readOnly = true; assert.equal((await ctx.POST(request)).status, 409); readOnly = false;
    owned = false; assert.equal((await ctx.POST(request)).status, 404); owned = true;
    assert.equal(rows.length, 1);
  }
  console.log('PASS actual online/offline class-record parsers: CSV/XLSX/XLS, separate and combined names, middle names, class ownership, read-only rejection and duplicate-safe import');
})().catch(error => {console.error(error); process.exitCode = 1;});
