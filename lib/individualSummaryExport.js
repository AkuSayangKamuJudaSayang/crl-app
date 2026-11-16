'use client';
import {buildIndividualLearnerReport} from './individualLearnerReport.mjs';
// Export the same validated saved result used for printing, never live drafts.
export async function buildIndividualSummaryWorkbook(context){
 const report=buildIndividualLearnerReport(context),XLSX=await import('xlsx');
 const specs=[],workbook=XLSX.utils.book_new(),sheet=(name,rows,widths)=>{
  const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=widths.map(wch=>({wch}));ws['!rows']=rows.map((row,i)=>({hpt:i===0?32:Math.max(24,...row.map((value,col)=>String(value??'').split('\n').reduce((lines,line)=>lines+Math.max(1,Math.ceil(line.length/(widths[col]||20))),0)*14+8))}));
  if(rows[0].length===1)ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:widths.length-1}}];
  specs.push({name,rows});XLSX.utils.book_append_sheet(workbook,ws,name);
 };
 sheet('Individual Summary',[[report.title],[report.school,'School ID: '+report.schoolId],['Assigned teacher',report.teacherName],[],...report.identity,[],['Assessment component','Recorded result'],...report.summary,[],['Final reading profile',report.profile],['Teacher remarks',report.remarks]],[42,90]);
 const n=Math.max(report.letters.length,report.words.length);
 sheet('Assessment Evidence',[['Assessment evidence'],['Learner',report.learnerName,'Period',report.reference],['No.','Letter sound','Result','No.','Word','Result'],...Array.from({length:n},(_,i)=>[...(report.letters[i]||['','','']),...(report.words[i]||['','',''])])],[8,28,20,8,28,20]);
 if(report.part2){sheet('Passage Reading',[['Passage Reading'],['Story',report.part2.title],['Passage','# of words','# of miscues','Questions','Answers','Result'],...report.part2.rows.map(row=>[row.words.map(w=>w.word).join(' '),row.count,row.words.filter(w=>w.annotation).length,row.questions.map(q=>q.text).join('\n'),row.questions.map(q=>q.answer).join('\n'),row.questions.map(q=>q.result).join('\n')]),['TOTAL',report.part2.wordCount,report.part2.recordedMiscueCount]],[70,12,12,55,60,12]);
  sheet('Miscue Evidence',[['Word position','Passage word','Miscue','Spoken word'],...report.miscues],[16,30,28,40]);
 }
 sheet('Observations',[['Learner observations',report.learnerName],['Assigned teacher',report.teacherName],['Period',report.reference],['Learner experience',report.part2?.experience??'Not administered'],['Observation level',report.part2?.observation?`Level ${report.part2.observation}`:'Not administered'],['Remarks',report.remarks]],[34,90]);
 workbook.Props={Title:report.title,Subject:`${report.reference} individual learner record`,Author:report.teacherName};
 const {default:JSZip}=await import('jszip'),zip=await JSZip.loadAsync(XLSX.write(workbook,{bookType:'xlsx',type:'array',compression:true}));
 // A compact, self-contained style table preserves text as text, wraps saved
 // evidence and avoids sending a wide unformatted passage line to Excel.
 zip.file('xl/styles.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF7451AD"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2678B9"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left style="thin"><color rgb="FFD9E1EA"/></left><right style="thin"><color rgb="FFD9E1EA"/></right><top style="thin"><color rgb="FFD9E1EA"/></top><bottom style="thin"><color rgb="FFD9E1EA"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3">${[0,1,2].map(i=>`<xf numFmtId="0" fontId="${i}" fillId="${i?i+1:0}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
 for(const [i,spec]of specs.entries()){
  const path=`xl/worksheets/sheet${i+1}.xml`,xml=await zip.file(path).async('string');
  zip.file(path,xml.replace(/<c\b([^>]*\br="[A-Z]+(\d+)"[^>]*)>/g,(_,attrs,row)=>{const cells=spec.rows[Number(row)-1]||[],header=/^(Assessment component|No\.|Passage|Word position)$/.test(String(cells[0]));return `<c${attrs.replace(/\ss="\d+"/,'').replace(/\/$/,'')} s="${header?2:Number(row)===1?1:0}"${attrs.endsWith('/')?'/':''}>`;}));
 }
 return {blob:new Blob([await zip.generateAsync({type:'uint8array',compression:'DEFLATE'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),filename:`CRLA_${report.reference}_${report.learnerName.replace(/[^\p{L}\p{N} _-]/gu,'').replace(/\s+/g,'_')}_Individual_Summary.xlsx`};
}
