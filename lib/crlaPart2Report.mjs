import {CRLA_FORM_BRANDING,CRLA_EXPERIENCE_SCALE} from './crlaReportAssets.mjs';
export const OBSERVATION_LEVELS=['Reads word by word or lower','Reads words in chunks','Reads fluently but not observing punctuation marks','Reads fluently with proper expression'];
const OFFICIAL_LAYOUTS={
 'para the parrot':{counts:[10,11,9,4,16,4,11,10,4,8,5,8],questions:[1,3,6,7,8,10]},
 'a day in the fields':{counts:[4,6,5,11,12,7,4,11,12,7,7,6,8],questions:[0,3,7,8,10,12]}
};
const TYPES=['Substitution','Insertion','Omission','Repetition','Reversion','SelfCorrection'];
const integer=value=>(typeof value==='number'||typeof value==='string'&&/^-?\d+$/.test(value.trim()))&&Number.isSafeInteger(Number(value))?Number(value):null;
export function buildPart2Record({title,text,storyNumber,questions=[],responses=[],miscues=[],cutoffIndex=null,experience,observation,recordedMiscues}){
 const passage=String(text||'').trim(),words=passage?passage.split(/\s+/):[],byIndex=new Map(),unplaced=[];
 for(const m of miscues){const index=integer(m.word_index??m.wordIndex??m.index),rawType=String(m.miscue_type??m.miscueType??m.type??''),type=TYPES.find(t=>t.toLowerCase()===rawType.toLowerCase().replace(/[\s-]/g,''))||rawType;const annotation={index,type,readAs:String(m.misread_word??m.misreadWord??''),relatedIndex:integer(m.relatedWordIndex??m.related_word_index)};
  if(index===null||index<0||index>=words.length||!TYPES.includes(type)||byIndex.has(index)){unplaced.push(annotation);continue;}byIndex.set(index,annotation);
 }
 const key=String(title||'').trim().toLowerCase(),official=OFFICIAL_LAYOUTS[key];let counts;
 if(official&&words.length===100)counts=official.counts;
 else{
  const sentences=passage.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g)||[];
  const parts=sentences.map(s=>s.trim().split(/\s+/).filter(Boolean).length).filter(Boolean);
  counts=parts.reduce((a,b)=>a+b,0)===words.length&&parts.length>=6?parts:[];
  if(!counts.length){let remaining=words.length;while(remaining>0){const count=Math.min(10,remaining);counts.push(count);remaining-=count;}}
 }
 if(!words.length)counts=Array(6).fill(0);
 const placements=official&&words.length===100?official.questions:Array.from({length:6},(_,i)=>Math.max(0,Math.ceil((i+1)*counts.length/6)-1));
 const responseMap=new Map(responses.map((r,i)=>[integer(r.question_index??r.questionIndex??r.index)??i,r.is_correct??r.isCorrect??r.correct]));
 const prompts=Array.from({length:6},(_,i)=>{const q=questions[i];return {index:i,text:String(typeof q==='string'?q:q?.text||`Question ${i+1} (saved text unavailable)`),answer:String(q?.possibleAnswer||'Answer guide not recorded.'),result:responseMap.has(i)?responseMap.get(i)===true?'✓':responseMap.get(i)===false?'✗':'N/A':'N/A'};});
 let offset=0;const rows=counts.map((count,rowIndex)=>{const row={start:offset,count,words:words.slice(offset,offset+count).map((word,i)=>({word,index:offset+i,annotation:byIndex.get(offset+i)||null,lastRead:offset+i===cutoffIndex})),questions:prompts.filter(p=>placements[p.index]===rowIndex)};offset+=count;return row;});
 return {title:String(title||'Passage title not recorded'),storyNumber,wordCount:words.length,miscueCount:byIndex.size,recordedMiscueCount:integer(recordedMiscues)!==null&&integer(recordedMiscues)>=0?integer(recordedMiscues):byIndex.size,rows,unplaced,experience:integer(experience)>=1&&integer(experience)<=5?integer(experience):null,observation:integer(observation)>=1&&integer(observation)<=4?integer(observation):null};
}
// Only text nodes and fixed inline artwork are emitted; learner strings are never HTML.
export function createPart2RecordPages(document,report){
 const form=report.part2,node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e;},image=(src,alt,cls)=>{const e=node('img',undefined,cls);e.src=src;e.alt=alt;return e;};
 const header=()=>{const h=node('header',undefined,'crlaFormHeader');h.append(image(CRLA_FORM_BRANDING,'DepEd, USAID and RTI International','crlaFormBranding'),node('strong','ABC+: Advancing Basic Education in the Philippines'),node('p','MODIFIED COMPREHENSIVE RAPID LITERACY ASSESSMENT (CRLA-M) RECORD FORM'),node('p','PART 2'),node('p','English Reading Fluency and Comprehension - Grade 3'));return h;};
 const identity=()=>{const e=node('div',undefined,'crlaFormIdentity');for(const [label,value]of [["CHILD’S NAME",report.learnerName],["TEACHER’S NAME",report.teacherName],['SCHOOL',report.school]]){const block=node('span');block.append(node('b',label+': '),node('span',value||'Not recorded'));e.appendChild(block);}return e;};
 const page=node('section',undefined,'crlaPart2Page');page.append(header(),node('h2',`${form.storyNumber?`STORY ${form.storyNumber} - `:''}${form.title.toUpperCase()}`),identity());
 const table=node('table',undefined,'crlaPassageTable'),colgroup=node('colgroup');for(const name of ['passage','words','miscues','questions','answers','result']){const col=node('col',undefined,'crlaCol-'+name);colgroup.appendChild(col);}table.appendChild(colgroup);
 const head=node('thead'),headrow=node('tr');for(const t of ['PASSAGE','# of words','# of miscues','QUESTIONS','ANSWERS','✓ or ✗ or N/A'])headrow.appendChild(node('th',t));head.appendChild(headrow);table.appendChild(head);
 const body=node('tbody');
 for(const row of form.rows){const tr=node('tr'),passage=node('td',undefined,'crlaPassageCell');
  for(const token of row.words){const a=token.annotation,wrap=node('span',undefined,`crlaToken${a?' crlaMiscue-'+a.type:''}${token.lastRead?' crlaLastRead':''}`);
   if(a){let mark=a.type==='Insertion'?'⌃':a.type==='SelfCorrection'?'✓':a.type==='Reversion'?'↔':'';if(a.readAs&&['Substitution','Insertion'].includes(a.type))wrap.appendChild(node('span',a.readAs,'crlaReadAs'));
    if(mark)wrap.appendChild(node('span',mark,'crlaMark'));
   }wrap.appendChild(node('span',token.word,'crlaWord'));
   if(a)wrap.appendChild(node('span',`${a.type==='SelfCorrection'?'SC':a.type==='Reversion'?'RV':a.type.slice(0,1)}·${token.index+1}`,'crlaPosition'));
   passage.append(wrap,node('span',' '));
  }
  const qs=node('td'),answers=node('td'),results=node('td',undefined,'crlaResponseCell');for(const q of row.questions){qs.appendChild(node('p',q.text));answers.appendChild(node('p',q.answer));results.appendChild(node('p',q.result));}
  tr.append(passage,node('td',row.count||'N/A','crlaCountCell'),node('td',row.words.filter(t=>t.annotation).length,'crlaCountCell'),qs,answers,results);body.appendChild(tr);
 }
 const total=node('tr',undefined,'crlaTotalRow');total.append(node('th','TOTAL'),node('td',form.wordCount||'Not recorded'),node('td',form.recordedMiscueCount),node('td',''),node('td',''),node('td',''));body.appendChild(total);table.appendChild(body);page.appendChild(table);
 const legend=node('p',undefined,'crlaMarkingLegend');legend.append(node('strong','Miscue markings: '),node('span','S = substitution (single underline); I = insertion (caret); O = omission (strike-through); R = repetition (double underline); RV = reversion (out-of-order); SC = self-correction (check). Each label includes its word position. An oval marks the last word at the time limit.'));page.appendChild(legend);
 if(form.recordedMiscueCount!==form.miscueCount)page.appendChild(node('p',`Recorded total: ${form.recordedMiscueCount}; placed word annotations: ${form.miscueCount}. The saved total has not been recalculated.`,'crlaEvidenceWarning'));
 if(form.unplaced.length)page.appendChild(node('p',`${form.unplaced.length} saved miscue annotation(s) could not be placed because a position/type was missing or duplicated. The recorded total is retained in the summary.`,'crlaEvidenceWarning'));
 if(!form.wordCount)page.appendChild(node('p','Historical passage text unavailable; no word positions have been inferred.','crlaEvidenceWarning'));
 const observations=node('section',undefined,'crlaObservationPage');observations.append(header(),identity(),node('h2','OBSERVATIONS'));
 const obsTable=node('table',undefined,'crlaObservationTable'),obsRow=node('tr');OBSERVATION_LEVELS.forEach((label,i)=>{const td=node('td',undefined,form.observation===i+1?'crlaSelectedObservation':'');td.append(node('strong',`LEVEL ${i+1}${form.observation===i+1?' ✓':''}`),node('p',label));obsRow.appendChild(td);});const obsBody=node('tbody');obsBody.appendChild(obsRow);obsTable.appendChild(obsBody);observations.append(obsTable,node('p',`Recorded observation: ${form.observation?`Level ${form.observation}`:'Not recorded'}`),node('p',report.remarks,'crlaObservationNotes'),node('h2','LEARNER EXPERIENCE'),image(CRLA_EXPERIENCE_SCALE,'Learner experience scale from 1 to 5','crlaExperienceScale'),node('p',`Recorded learner experience: ${form.experience?`${form.experience} / 5`:'Not recorded'}`,'crlaExperienceValue'));
 return [page,observations];
}
export const PART2_RECORD_PRINT_CSS=`
 @page crlaPart2{size:A4 landscape;margin:0}
 .crlaPart2Page,.crlaObservationPage{page:crlaPart2;break-before:page;padding:6mm 12mm;box-sizing:border-box;font:9pt/1.16 Arial,sans-serif;color:#111}
 .crlaFormHeader{text-align:center;margin:0 0 2mm}.crlaFormHeader strong{font-size:9pt;display:block}.crlaFormHeader p{margin:.8mm 0;letter-spacing:.7pt;font-size:9pt}
 .crlaFormBranding{display:block;width:125mm;height:12mm;object-fit:contain;margin:0 auto 1mm}
 .crlaPart2Page h2,.crlaObservationPage h2{text-align:center;font-size:10pt;margin:1.5mm 0 2.5mm}
 .crlaFormIdentity{display:flex;justify-content:space-between;gap:6mm;margin:3mm 0;font-size:9pt}.crlaFormIdentity>span{min-width:0;flex:1}.crlaFormIdentity>span:last-child{flex:.8}.crlaFormIdentity span span{overflow-wrap:anywhere}.crlaFormIdentity b{font-weight:400}
 .crlaPassageTable{table-layout:fixed;border-collapse:collapse;width:100%;font:8pt/1.08 Arial,sans-serif}.crlaPassageTable th,.crlaPassageTable td{border:1px solid #666;padding:.6mm 1.2mm;vertical-align:top;overflow-wrap:anywhere}.crlaPassageTable tr{break-inside:avoid}.crlaPassageTable th{text-align:center;font-weight:700}.crlaPassageTable td p{margin:0}.crlaPassageTable .crlaCountCell,.crlaResponseCell{text-align:center}.crlaResponseCell{font-size:12pt;font-weight:bold}
 .crlaCol-passage{width:31%}.crlaCol-words{width:5.5%}.crlaCol-miscues{width:6.5%}.crlaCol-questions{width:25%}.crlaCol-answers{width:25%}.crlaCol-result{width:7%}
 .crlaToken{display:inline-block;position:relative!important;vertical-align:baseline;white-space:nowrap;line-height:1.08;margin-top:.4mm}.crlaWord{display:inline-block}
 .crlaReadAs{display:block;max-width:25mm;white-space:normal;overflow-wrap:anywhere;font-size:6.5pt;line-height:1.03;color:#a21520;text-align:center}.crlaMark{display:block;font-size:8pt;line-height:.85;color:#a21520;text-align:center;font-weight:bold}.crlaMiscue-Insertion{margin-left:1.5mm}.crlaMiscue-Insertion .crlaMark{position:absolute!important;left:-.7mm;bottom:5pt}
 .crlaPosition{display:block;text-align:center;color:#a21520;font-size:5.5pt;line-height:1.05}
 .crlaMiscue-Substitution .crlaWord{text-decoration:underline;text-decoration-color:#a21520;text-decoration-thickness:1px}
 .crlaMiscue-Omission .crlaWord{text-decoration:line-through;text-decoration-color:#a21520;text-decoration-thickness:1.2px}
 .crlaMiscue-Repetition .crlaWord{text-decoration:underline double #a21520;text-underline-offset:1px}
 .crlaLastRead .crlaWord{border:1.2px solid #a21520;border-radius:50%;padding:0 .7mm}
 .crlaTotalRow th,.crlaTotalRow td{font-weight:bold}.crlaMarkingLegend{font-size:7pt;margin:2.5mm 0;line-height:1.3}.crlaEvidenceWarning{font-size:8pt;border:1px solid #777;padding:2mm}
 .crlaObservationPage h2{margin-top:8mm}.crlaObservationTable{table-layout:fixed;width:100%;font-size:10pt}.crlaObservationTable td{width:25%;padding:2mm;vertical-align:top}.crlaObservationTable strong{display:block;text-align:center}.crlaObservationTable p{margin:1mm 0}.crlaSelectedObservation{outline:2px solid #222;outline-offset:-2px;background:#eee;print-color-adjust:exact}
 .crlaObservationNotes{white-space:pre-wrap;min-height:15mm;border-bottom:1px solid #777;padding:2mm 0;line-height:1.6}.crlaExperienceScale{display:block;width:65mm;height:18mm;object-fit:contain;margin:4mm auto}.crlaExperienceValue{text-align:center;font-size:11pt;font-weight:bold}
`;
