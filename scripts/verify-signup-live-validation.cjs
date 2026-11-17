const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {pathToFileURL} = require('node:url');
const path = require('node:path');

(async () => {
  const rules=await import(pathToFileURL(path.resolve('lib/registrationValidation.mjs')).href);
  for (const good of ['reader_3','Teacher.Name','a-b','a.b'])
    assert.equal(rules.isValidRegistrationUsername(good),true,good);
  for (const bad of ['','ab','wrong name','name@other','x'.repeat(51)])
    assert.equal(rules.isValidRegistrationUsername(bad),false,bad);
  assert.equal(rules.normalizeRegistrationUsername('  TeaCher.ONE  '),'teacher.one');
  for (const good of ['reader@example.com','first.last+tag@sub.school.edu.ph'])
    assert.equal(rules.isValidRegistrationEmail(good),true,good);
  for (const bad of ['','bad','bad@','bad@example','bad@site..com','bad @example.com','bad@.com'])
    assert.equal(rules.isValidRegistrationEmail(bad),false,bad);

  const source=fs.readFileSync('app/api/access/route.js','utf8');
  const start=source.indexOf('async function readAccess(');
  const end=source.indexOf('async function writeAccess(',start);
  assert(start>=0&&end>start);
  let lookupCount=0,limiterCount=0,limited=false;
  const existing=[{id:10,username:'Teacher.Demo',role:'teacher',approvalStatus:'pending'},
                  {id:11,username:'Existing.Admin',role:'admin',approvalStatus:'approved'}];
  const context=vm.createContext({
    URL,Date,String,Boolean,Object,Error,
    json:(body,status=200)=>({body,status}),
    normalizeRegistrationUsername:rules.normalizeRegistrationUsername,
    isValidRegistrationUsername:rules.isValidRegistrationUsername,
    enforceSensitiveRate:async(_,action,body)=>{
      assert.equal(action,'username_available');
      assert.equal(body.username,body.username.toLowerCase());
      limiterCount++;
      return limited?{status:429,body:{error:'Too many attempts.'}}:null;
    },
    prisma:{user:{findFirst:async({where,select})=>{
      lookupCount++;
      assert.equal(where.username.mode,'insensitive');
      assert.deepEqual(Object.keys(select),['id']);
      return existing.find(x=>x.username.toLowerCase()===where.username.equals)||null;
    }}},
  });
  vm.runInContext(source.slice(start,end)+'\nthis.readAccess=readAccess;',context);
  const read=username=>context.readAccess({url:'https://crl.test/api/access?action=username_available&username='+encodeURIComponent(username)});
  assert.equal((await read('TEACHER.DEMO')).body.available,false,'Pending teachers reserve usernames');
  assert.equal((await read('existing.admin')).body.available,false,'All account roles share usernames');
  assert.equal((await read('new.teacher')).body.available,true);
  const afterValid=lookupCount;
  assert.equal((await read('a!')).status,400);
  assert.equal(lookupCount,afterValid,'Invalid usernames do not hit the database');
  limited=true;
  assert.equal((await read('new.teacher')).status,429,'Rate limit must stop anonymous enumeration');
  assert.equal(lookupCount,afterValid,'Rate-limited lookups do not hit the database');
  assert.equal(limiterCount,4);
  assert(source.includes("['directory','epoch','username_available']"),'Allow public lookup without portal session');
  const security=fs.readFileSync('lib/security.js','utf8');
  assert(security.includes('"username_available"'),'Use central request throttling');
  const registration=fs.readFileSync('lib/registerAccount.js','utf8');
  assert(registration.includes('isValidRegistrationEmail(email)')&&registration.includes('isValidRegistrationUsername(username)'));
  assert(registration.includes("approvalStatus: 'pending'")&&registration.includes('isActive: false'),'Never auto-approve');
  const hook=fs.readFileSync('lib/useSignupUsernameAvailability.js','utf8');
  assert(hook.includes('setTimeout(async()=>')&&hook.includes('clearTimeout(timeout)')&&hook.includes('controller.abort()'),'Debounce and cancel stale checks');
  const teacher=fs.readFileSync('app/login/page.jsx','utf8');
  const portal=fs.readFileSync('components/PortalAccess.jsx','utf8');
  assert(teacher.includes('"Request Approval"')&&teacher.includes('"Submitting Request..."'));
  assert(portal.includes("signup?'Request approval':'Sign In'"));
  assert(teacher.includes('<option value="" hidden disabled>Choose your registered school</option>'));
  assert(portal.includes('<option hidden disabled value="">'));
  assert(teacher.includes('usernameAvailability.message')&&portal.includes('usernameAvailability.message'));
  assert(teacher.includes('emailInvalid')&&portal.includes('emailInvalid'));
  console.log('PASS live signup validation: pending usernames, limiter, emails, approval and hidden school placeholders');
})().catch(error=>{console.error(error);process.exitCode=1;});
