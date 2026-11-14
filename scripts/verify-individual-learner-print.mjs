import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildIndividualLearnerReport,canPrintIndividualResult,createIndividualLearnerReport,INDIVIDUAL_REPORT_PRINT_CSS} from '../lib/individualLearnerReport.mjs';

// Synthetic records only. A request finishing after switching learner, period or
// section must never print evidence under the wrong learner's signature sheet.
const learner={id:11,first_name:'Example',middle_name:'Middle',last_name:'Learner',suffix:'Jr.',lrn:'SYNTHETIC-001',sex:'Female',class_section_id:'section-a'};
const assessment={id:21,learner_id:11,assessment_period:'BoSY',is_completed:true,remarks:'Practice reading regularly.'};
const detail={...assessment,date_administered:'2026-11-12T18:00:00Z',task1_score:9,task2_score:8,timer_seconds:60,total_miscues:2,miscue_accuracy:98,words_read:98,passage_word_count:100,comprehension_score:5,overall_classification:'At Grade Level',story_title:'Synthetic Story',story_text:'One two three',story_questions:[{text:'What happened?',possibleAnswer:'Teacher-only answer guide'}],letter_results:[{letter:'a',is_correct:true},{letter:'b',is_correct:false}],word_results:[{word:'one',is_correct:true}],comprehension_results:[{question_index:0,is_correct:false}],passage_miscues:[{word_index:1,miscue_type:'Substitution',misread_word:'too'}]};
// A complete-sized appendix catches page-layout problems hidden by tiny samples.
detail.letter_results=Array.from({length:10},(_,index)=>({letter:'abcdefghij'[index],is_correct:index<9}));
detail.word_results=Array.from({length:10},(_,index)=>({word:`sample${index+1}`,is_correct:index<8}));
detail.story_text='One two three '+Array.from({length:97},(_,index)=>`word${index+4}`).join(' ');
detail.story_questions=Array.from({length:6},(_,index)=>({text:index?`Synthetic comprehension question ${index+1}?`:'What happened?',possibleAnswer:'Teacher-only answer guide'}));
detail.comprehension_results=Array.from({length:6},(_,index)=>({question_index:index,is_correct:index>0}));
detail.experience_rating=3;detail.observation_level=2;
const context={learner,assessment,detail,section:{id:'section-a',name:'Example',schoolYearId:'year-a',teacherId:7},year:{id:'year-a',label:'2026-2027'},teacher:{id:7,full_name:'Example Assigned Teacher',school_name:'Example School',school_id:'EXAMPLE'},period:'BoSY'};
assert(canPrintIndividualResult(context));
for(const change of [
  {loading:true},{error:'Failed request'},{detail:null},{period:'MoSY'},
  {detail:{...detail,id:99}},{detail:{...detail,learner_id:99}},
  {detail:{...detail,assessment_period:'MoSY'}},{detail:{...detail,is_completed:false}},
  {assessment:{...assessment,learner_id:99}},{assessment:{...assessment,is_completed:false}},
  {learner:{...learner,class_section_id:'other'}},{year:{id:'other'}},{teacher:{id:99}},
]) {
  assert.equal(canPrintIndividualResult({...context,...change}),false);
  assert.throws(()=>buildIndividualLearnerReport({...context,...change}),/full saved result/);
}
const report=buildIndividualLearnerReport(context);
assert.equal(report.learnerName,'Learner, Example Middle Jr.');
assert.equal(report.teacherName,'Example Assigned Teacher');
assert.equal(report.identity.find(([key])=>key==='Date administered')[1],'November 13, 2026');
assert.equal(report.summary.find(([key])=>key.includes('Total recorded score'))[1],'17 / 20');
assert.equal(report.summary.find(([key])=>key.includes('Reading rate'))[1],'98.00 WPM');
assert.equal(report.profile,'At Grade Level');
assert.equal(report.letters.length,10);assert.equal(report.words.length,10);assert.equal(report.comprehension.length,6);
const cutoff=buildIndividualLearnerReport({...context,detail:{...detail,timer_seconds:120,words_read:75}});
assert.match(cutoff.cutoff,/#75 - word75/);
assert.equal(report.cutoff,'');
assert.equal(report.remarks,assessment.remarks);
assert.deepEqual(report.miscues[0],[2,'two','Substitution','too']);
assert.equal(report.comprehension[0][1],'What happened?');
assert(!JSON.stringify(report).includes('Teacher-only answer guide'));
const stopped=buildIndividualLearnerReport({...context,detail:{...detail,task1_score:0,task2_score:0,timer_seconds:null,words_read:0,word_results:[],comprehension_score:0,comprehension_results:[]}});
assert.equal(stopped.summary.find(([key])=>key==='Comprehension')[1],'Not administered (stop rule)');
assert.equal(stopped.summary.find(([key])=>key==='Part 1 - Word reading')[1],'Not administered (stop rule)');
assert.equal(stopped.passageText,'');
assert.equal(stopped.profile,'Low Emerging Reader');
const zero=buildIndividualLearnerReport({...context,detail:{...detail,comprehension_score:0}});
assert.equal(zero.summary.find(([key])=>key==='Comprehension')[1],'0 / 6');
const missing=buildIndividualLearnerReport({...context,detail:{...detail,words_read:null,total_miscues:null}});
assert.equal(missing.summary.find(([key])=>key==='Words read correctly')[1],'Not recorded');
assert.equal(missing.summary.find(([key])=>key==='Total recorded miscues')[1],'Not recorded');
// The renderer uses DOM textContent, including unsafe-looking imported data.
class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.className='';this.value='';}
  set textContent(value){this.value=String(value);this.children=[];}
  get textContent(){return this.value+this.children.map(child=>child.textContent).join(' ');}
  appendChild(child){this.children.push(child);return child;}
  append(...children){children.forEach(child=>this.appendChild(child));}
}
const malicious='<img src=x onerror="alert(1)">';
const root=createIndividualLearnerReport({createElement:tag=>new Element(tag)},{...report,school:malicious});
const flattened=[];const walk=node=>{flattened.push(node);node.children.forEach(walk);};walk(root);
assert(root.textContent.includes(malicious));
assert(!flattened.some(node=>['script','img','button','input'].includes(node.tagName)));
assert(flattened.some(node=>node.className==='individualWetSignature'));
assert(flattened.some(node=>node.className==='individualTeacherName'&&node.textContent===context.teacher.full_name));
assert(root.textContent.includes('Signature over printed name of assigned teacher'));
assert(root.textContent.includes('Assessment evidence'));
assert.match(INDIVIDUAL_REPORT_PRINT_CSS,/individualSignature\{[^}]*break-inside:avoid/);
const page=fs.readFileSync(new URL('../app/teacher/page.jsx',import.meta.url),'utf8')+fs.readFileSync(new URL('../components/SharedAssessmentResults.jsx',import.meta.url),'utf8');
const actions=page.slice(page.indexOf('<button type="button" className="smallButton learnerViewButton"'));
assert(actions.indexOf('>View</button>')<actions.indexOf('>Start</button>'));
assert(actions.indexOf('>Start</button>')<actions.indexOf('>Delete</button>'));
assert.match(page,/disabled=\{!printReady\} onClick=\{printIndividualResult\}/);
assert.match(page,/orientation:'portrait',css:INDIVIDUAL_REPORT_PRINT_CSS,showTitle:false/);
const printer=fs.readFileSync(new URL('../lib/printRecords.js',import.meta.url),'utf8');
assert.match(printer,/orientation='landscape'/); // Existing class reports keep landscape.
assert.match(printer,/A4 portrait/);
assert.match(printer,/doc.fonts\?\.ready/);
assert.match(printer,/afterprint/);
console.log('Individual learner print: scope, stale requests, saved scores, stop rules, privacy, signature and action order passed.');

// Reuse the tested renderer for optional local visual QA; never write real data.
if(process.argv.includes('--fixture')) {
  const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const serialize=node=>`<${node.tagName}${node.className?` class="${escape(node.className)}"`:''}>${escape(node.value)}${node.children.map(serialize).join('')}</${node.tagName}>`;
  const fixture=createIndividualLearnerReport({createElement:tag=>new Element(tag)},report);
  fs.writeFileSync('/tmp/crl-individual-print-qa.html',`<!doctype html><html><head><meta charset="UTF-8"><style>@page{size:A4 portrait;margin:12mm}${INDIVIDUAL_REPORT_PRINT_CSS}</style></head><body>${serialize(fixture)}</body></html>`);
}
