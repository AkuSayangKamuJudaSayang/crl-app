// Run against isolated embedded PostgreSQL, never the school database:
// CRL_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node scripts/verify-presence-postgres.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { relayTeacherPresence, readTeacherPresence, acknowledgeTeacherPresence } from '../lib/assessmentPresenceServer.js';
const { PGlite } = await import(process.env.CRL_PGLITE_MODULE || '@electric-sql/pglite');
const pg = new PGlite();
await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE host_sessions (
 id integer PRIMARY KEY, code text UNIQUE, teacher_id integer, learner_id integer,
 assessment_session_id integer, ended boolean, linked_at timestamp, stage text, current_content text,
 updated_at timestamp DEFAULT now());
 INSERT INTO host_sessions VALUES (1,'TST234',901,406,77,false,NULL,'waiting','Waiting for learner',now());`);
await pg.exec(fs.readFileSync('supabase/migrations/20261025070254_assessment_presence_relay.sql','utf8'));
const db = { $queryRaw: async query => (await pg.query(query.text, query.values)).rows };
const write = (nonce, extra={}) => relayTeacherPresence(db,{code:'TST234',teacherId:901,nonce,status:'active',recovering:false,...extra});
assert.equal((await write('one',{teacherId:902})).length,0);
assert.equal((await write('one')).length,1);
assert.equal((await readTeacherPresence(db,'TST234')).length,0,'An unclaimed invitation is not learner connection proof');
await pg.exec("UPDATE host_sessions SET linked_at=now(),stage='letter',current_content='Z'");
const original = (await pg.query('SELECT * FROM host_sessions')).rows;
assert.equal((await readTeacherPresence(db,'TST234'))[0].nonce,'one');
assert.equal((await acknowledgeTeacherPresence(db,'OTHER1','one')).length,0);
assert.equal((await acknowledgeTeacherPresence(db,'TST234','wrong')).length,0);
assert.equal((await acknowledgeTeacherPresence(db,'TST234','one')).length,1);
assert.equal((await acknowledgeTeacherPresence(db,'TST234','one')).length,0,'An acknowledgement is consumed once');
assert.equal((await write('two'))[0].learner_nonce,'one');
await write('three');
assert.equal((await acknowledgeTeacherPresence(db,'TST234','two')).length,1,'A newer challenge must not displace an in-flight acknowledgement');
const concurrent=await Promise.all([acknowledgeTeacherPresence(db,'TST234','three'),acknowledgeTeacherPresence(db,'TST234','three')]);
assert.deepEqual(concurrent.map(x=>x.length).sort(),[0,1]);
assert.equal((await write('four',{recovering:true})).length,1);
assert.equal((await readTeacherPresence(db,'TST234'))[0].recovering,true);
await pg.exec("UPDATE assessment_presence SET teacher_seen_at=now()-interval '20 seconds',teacher_challenges=jsonb_build_array(jsonb_build_object('nonce','four','issued_at',now()-interval '20 seconds'))");
assert.equal((await readTeacherPresence(db,'TST234')).length,0);
assert.equal((await acknowledgeTeacherPresence(db,'TST234','four')).length,0,'Expired challenge cannot revive a crashed device');
assert.equal((await write('five',{status:'interrupted'})).length,1);
assert.equal((await readTeacherPresence(db,'TST234'))[0].status,'interrupted');
assert.equal((await readTeacherPresence(db,"' OR true --")).length,0);
assert.deepEqual((await pg.query('SELECT * FROM host_sessions')).rows,original,'Presence never edits progress, stage or its timestamp');
await pg.exec('UPDATE host_sessions SET ended=true');
assert.equal((await write('six')).length,0);
assert.equal((await readTeacherPresence(db,'TST234')).length,0);
assert.equal((await acknowledgeTeacherPresence(db,'TST234','five')).length,0);
assert.equal((await pg.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.assessment_presence'::regclass")).rows[0].relrowsecurity,true);
assert.equal((await pg.query("SELECT has_table_privilege('anon','public.assessment_presence','SELECT') AS access")).rows[0].access,false);
assert.equal((await pg.query("SELECT has_table_privilege('authenticated','public.assessment_presence','UPDATE') AS access")).rows[0].access,false);
await pg.exec('DELETE FROM host_sessions');
assert.equal((await pg.query('SELECT count(*)::int AS n FROM assessment_presence')).rows[0].n,0);
await pg.close();
console.log('PASS actual PostgreSQL migration and relay queries: owner isolation, claimed/live-only proof, overlapping challenges, one-use/concurrent ACK, expiry, interruption, parameterization, independent progress timestamps, RLS/revoked access and cascade cleanup');
