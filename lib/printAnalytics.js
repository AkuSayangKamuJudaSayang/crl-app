import {printAssessmentElement} from "./printRecords";

// Reuse the on-screen distribution, with one aligned, print-safe table.
// Text nodes prevent learner or school metadata from being interpreted as HTML.
export function printReadingProfileAnalytics({title,periods}) {
  if(typeof document==="undefined")return;
  const report=document.createElement("section");
  const heading=document.createElement("h2");heading.textContent="Reading Profile Progress";report.appendChild(heading);
  const table=document.createElement("table"),head=document.createElement("thead"),row=document.createElement("tr");
  ["Reading profile",...(periods||[]).map(p=>p.period)].forEach(value=>{
    const th=document.createElement("th");th.textContent=String(value);row.appendChild(th);
  });
  head.appendChild(row);table.appendChild(head);
  const tbody=document.createElement("tbody");
  const addRow=(name,values)=>{
    const tr=document.createElement("tr");
    [name,...values].forEach((value,i)=>{
      const cell=document.createElement(i?"td":"th");cell.textContent=String(value);tr.appendChild(cell);
    });
    tbody.appendChild(tr);
  };
  addRow("Learners assessed",(periods||[]).map(p=>Number(p.total||0)));
  const labels=[...new Set((periods||[]).flatMap(p=>(p.profiles||[]).map(x=>x.label)))];
  labels.forEach(label=>addRow(label,(periods||[]).map(p=>{
    const found=(p.profiles||[]).find(x=>x.label===label);
    const count=Number(found?.count||0);
    return `${count} (${Number(p.total)>0?Math.round(count/Number(p.total)*100):0}%)`;
  })));
  table.appendChild(tbody);report.appendChild(table);
  const note=document.createElement("p");
  note.textContent="Percentages use only completed assessments in each timeline.";
  report.appendChild(note);
  printAssessmentElement(report,title||"CRL-App Reading Profile Analytics");
}
