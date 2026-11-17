import JSZip from "jszip";

/*
 * Raw OOXML scoresheet editor.
 *
 * ExcelJS drops charts and re-anchors images when it round-trips a workbook,
 * which is why the exported scoresheet was missing its pie/bar charts and had
 * warped DepEd logos. This module instead edits the template's XML directly
 * with JSZip, so charts, drawings, media, styles and formulas stay byte-for-byte
 * intact and we only replace the cells that hold learner data.
 *
 * Sheet layout in CRLA3_Grade3Scoresheet_v3.xlsx:
 *   sheet1 = G3 FIL Reading Scoresheet   (left untouched)
 *   sheet2 = G3 ENG Reading Scoresheet   (filled)
 *   sheet3 = Class Record                (filled)
 *   sheet4 = Class Summary               (English rows filled)
 *   sheet5 = Scoring Reference           (left untouched)
 *   sheet6 = List                        (left untouched)
 */

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const PART = {
  "G3 FIL Reading Scoresheet": "xl/worksheets/sheet1.xml",
  "G3 ENG Reading Scoresheet": "xl/worksheets/sheet2.xml",
  "Class Record": "xl/worksheets/sheet3.xml",
  "Class Summary": "xl/worksheets/sheet4.xml",
};

const PART1_COLUMNS = ["H", "I", "J", "K"];
const PART1_DETAIL_COLUMNS = ["D", "E", "F", "G"];
const PROFILE_COLUMNS = ["O", "P", "Q", "R", "S"];
const PROFILE_DETAIL_COLUMNS = ["K", "L", "M", "N", "O"];

const SUMMARY_TOP_ROWS = { Male: 10, Female: 11, Total: 14 };
const SUMMARY_DETAIL_ROWS = { Male: 22, Female: 23, Total: 24 };

const SCORESHEET_COLUMNS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K",
  "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U",
];

const CLASS_RECORD_FIL_COLUMNS = ["E", "F", "G", "H", "I", "J"];

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXml(value) {
  return String(value)
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function formatNumber(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(parseFloat(value.toFixed(6)));
}

function dateToSerial(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  const utc = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
  return Math.round(utc / 86400000) + 25569;
}

/*
 * sharedStrings.xml editor. Existing entries keep their original rich markup;
 * new entries are appended as plain <t> runs.
 */
class SharedStrings {
  constructor(xml) {
    this.raw = [];
    this.texts = [];

    if (xml) {
      const re = /<si>([\s\S]*?)<\/si>/g;
      let match;
      while ((match = re.exec(xml))) {
        this.raw.push(match[1]);
        this.texts.push(this.extractText(match[1]));
      }
    }
  }

  extractText(inner) {
    const parts = [
      ...inner.matchAll(/<t(?:[^>]*)>([\s\S]*?)<\/t>/g),
    ].map((match) => match[1]);
    return parts.map((part) => decodeXml(part)).join("");
  }

  getOrAdd(text) {
    const value = String(text == null ? "" : text);
    const index = this.texts.indexOf(value);
    if (index >= 0) {
      return index;
    }

    const needsSpacePreserve = /^\s|\s$|[\n\r]/.test(value);
    this.raw.push(
      `<t${needsSpacePreserve ? ' xml:space="preserve"' : ""}>${escapeXml(value)}</t>`
    );
    this.texts.push(value);
    return this.raw.length - 1;
  }

  toXml() {
    const items = this.raw.map((inner) => `<si>${inner}</si>`).join("");
    return (
      `${XML_DECL}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
      `count="${this.raw.length}" uniqueCount="${this.raw.length}">${items}</sst>`
    );
  }
}

class SheetEditor {
  constructor(xml, sharedStrings) {
    this.xml = xml;
    this.sharedStrings = sharedStrings;
  }

  getStyle(address) {
    const match = this.xml.match(
      new RegExp(`<c\\s+r="${address}"([^>]*)`)
    );
    if (!match) {
      return null;
    }
    const style = match[1].match(/\bs="(\d+)"/);
    return style ? parseInt(style[1], 10) : null;
  }

  buildCell(address, value, style) {
    const styleAttribute = style != null ? ` s="${style}"` : "";
    const blank =
      value === null ||
      value === undefined ||
      value === "" ||
      (typeof value === "number" && !Number.isFinite(value));

    if (blank) {
      return `<c r="${address}"${styleAttribute}/>`;
    }

    if (typeof value === "number") {
      return `<c r="${address}"${styleAttribute}><v>${formatNumber(value)}</v></c>`;
    }

    if (typeof value === "boolean") {
      return `<c r="${address}"${styleAttribute} t="b"><v>${value ? 1 : 0}</v></c>`;
    }

    const index = this.sharedStrings.getOrAdd(value);
    return `<c r="${address}"${styleAttribute} t="s"><v>${index}</v></c>`;
  }

  setCell(address, value, options = {}) {
    const style =
      options.style != null ? options.style : this.getStyle(address);
    const replacement = this.buildCell(address, value, style);
    const re = new RegExp(
      `<c\\s+r="${address}"[^>]*/>|<c\\s+r="${address}"[^>]*>[\\s\\S]*?<\\/c>`,
      "s"
    );

    if (!re.test(this.xml)) {
      /*
       * Some template columns only materialise a cell where a value once
       * existed (e.g. Class Record column R only has R8). Callers that are
       * merely clearing stray content can opt out of the strict check.
       */
      if (options.optional) {
        return;
      }
      throw new Error(`Cell ${address} was not found in the worksheet`);
    }

    this.xml = this.xml.replace(re, replacement);
  }
}

function populateScoresheet(editor, teacher, rows, enrolled) {
  /*
   * Replace the template's sample identity values and the male/female
   * enrollment counts (the template's D6/E6 cells ship as a broken shared
   * "#REF!" formula).
   */
  if(teacher.assessmentPeriod)editor.setCell("C3",teacher.assessmentPeriod);
  editor.setCell("C4", teacher.schoolId || "");
  editor.setCell("C5", teacher.schoolName || "");
  editor.setCell("C6", teacher.fullName || "");
  editor.setCell("C8", [teacher.section, teacher.schoolYear ? `S.Y. ${teacher.schoolYear}` : ""].filter(Boolean).join(" | "));
  editor.setCell("D6", enrolled.Male);
  editor.setCell("E6", enrolled.Female);

  /*
   * The template's "Total Enrolment" (F4) and "Assessed" (H4) header cells
   * cache stale results (F4 was even cached as a #REF! error). Write the
   * values directly so the header is correct even before Excel recalculates.
   */
  editor.setCell("F4", enrolled.Total);
  editor.setCell("H4", rows.filter(row => row.assessed !== false).length);

  for (let index = 0; index < Math.max(100,rows.length); index += 1) {
    const row = rows[index] || null;
    const rowNumber = 11 + index;

    editor.setCell(`A${rowNumber}`, row ? row.sn : null);
    editor.setCell(`B${rowNumber}`, row ? row.lrn || "" : "");
    editor.setCell(`C${rowNumber}`, row ? row.name || "" : "");
    editor.setCell(`D${rowNumber}`, row ? row.sex || "" : "");
    editor.setCell(`E${rowNumber}`, row ? dateToSerial(row.date) : null);
    editor.setCell(`F${rowNumber}`, row ? row.task1 : null);
    editor.setCell(`G${rowNumber}`, row ? row.task2 : null);
    editor.setCell(`H${rowNumber}`, row ? row.total : null);
    editor.setCell(`I${rowNumber}`, row ? row.part1 || "" : "");
    editor.setCell(`J${rowNumber}`, row ? row.story : null);
    editor.setCell(`K${rowNumber}`, row ? row.miscues : null);
    editor.setCell(`L${rowNumber}`, row ? row.wordsRead : null);
    editor.setCell(`M${rowNumber}`, row ? row.minutes : null);
    editor.setCell(`N${rowNumber}`, row ? row.seconds : null);
    editor.setCell(`O${rowNumber}`, row ? row.wpm : null);
    editor.setCell(`P${rowNumber}`, row ? row.readingPctFraction : null);
    editor.setCell(`Q${rowNumber}`, row ? row.comprehensionScore : null);
    editor.setCell(`R${rowNumber}`, row ? row.experience : null);
    editor.setCell(`S${rowNumber}`, row ? row.observation || "" : "");
    editor.setCell(`T${rowNumber}`, row ? row.readingProfile || "" : "");
    editor.setCell(`U${rowNumber}`, row ? row.remarks || "" : "");
  }
}

function populateClassRecord(editor, teacher, rows) {
  editor.setCell("C4", teacher.schoolName || "");
  editor.setCell("C5", teacher.fullName || "");

  for (let index = 0; index < Math.max(100,rows.length); index += 1) {
    const row = rows[index] || null;
    const rowNumber = 8 + index;

    editor.setCell(`A${rowNumber}`, row ? row.sn : null);
    editor.setCell(`B${rowNumber}`, row ? row.lrn || "" : "");
    editor.setCell(`C${rowNumber}`, row ? row.name || "" : "");
    editor.setCell(`D${rowNumber}`, row ? row.sex || "" : "");

    // Filipino columns are not assessed by this app: leave them blank.
    CLASS_RECORD_FIL_COLUMNS.forEach((column) => {
      editor.setCell(`${column}${rowNumber}`, "");
    });

    editor.setCell(`K${rowNumber}`, row ? row.part1 || "" : "");
    editor.setCell(`L${rowNumber}`, row ? row.totalFraction : null);
    editor.setCell(`M${rowNumber}`, row ? row.readingPctFraction : null);
    editor.setCell(`N${rowNumber}`, row ? row.compFraction : null);
    editor.setCell(`O${rowNumber}`, row ? row.wpm : null);
    editor.setCell(`P${rowNumber}`, row ? row.readingProfile || "" : "");
    editor.setCell(`Q${rowNumber}`, row ? row.remarks || "" : "");
    editor.setCell(`R${rowNumber}`, "", { optional: true });
  }
}

function buildClassSummaryCells(teacher, summary, enrolled) {
  const cells = {
    C4: teacher.schoolId || "",
    C5: teacher.schoolName || "",
  };
  // Keep an explicit zero-valued Filipino scaffold. Blank numeric series are
  // discarded by spreadsheet importers; zero bars do not invent assessments.
  ['Male','Female','Total'].forEach((sex,index)=>{
    const row=19+index;cells[`A${row}`]='Filipino';cells[`B${row}`]=sex;
    for(const col of ['C','D','E','F','G','H','I','J','K','L','M','N','O'])cells[`${col}${row}`]=0;
    cells[`T${row}`]=`${sex}\nFilipino`;cells[`T${22+index}`]=`${sex}\nEnglish`;
  });

  ["Male", "Female", "Total"].forEach((sex) => {
    const stats = summary[sex];
    const enrolledCount = enrolled[sex] || 0;
    const topRow = SUMMARY_TOP_ROWS[sex];
    const detailRow = SUMMARY_DETAIL_ROWS[sex];
    // Shared roster metadata is valid for either language; Filipino remains
    // unassessed. Do not leave stale formula-cache names or assessment counts.
    const filipinoRow={Male:8,Female:9,Total:13}[sex];
    Object.assign(cells,{[`A${filipinoRow}`]:'Grade 3',[`B${filipinoRow}`]:teacher.section||'',[`C${filipinoRow}`]:teacher.fullName||'',[`D${filipinoRow}`]:'Filipino',[`E${filipinoRow}`]:sex,[`F${filipinoRow}`]:enrolledCount,[`G${filipinoRow}`]:0});
    for(const column of [...PART1_COLUMNS,...PROFILE_COLUMNS])cells[`${column}${filipinoRow}`]=0;
    for(const column of ['L','M','N'])cells[`${column}${filipinoRow}`]=null;

    // Upper block: enrolment, level counts and averages.
    cells[`A${topRow}`] = "Grade 3";
    cells[`B${topRow}`] = teacher.section || "";
    cells[`C${topRow}`] = teacher.fullName || "";
    cells[`D${topRow}`] = "English";
    cells[`E${topRow}`] = sex;
    cells[`F${topRow}`] = enrolledCount;
    cells[`G${topRow}`] = stats.count;

    PART1_COLUMNS.forEach((column, i) => {
      cells[`${column}${topRow}`] = stats.part1Counts[i];
    });

    cells[`L${topRow}`] =
      stats.avgFluency == null ? null : stats.avgFluency / 100;
    cells[`M${topRow}`] = stats.avgComp == null ? null : stats.avgComp / 6;
    cells[`N${topRow}`] = stats.avgWpm;

    PROFILE_COLUMNS.forEach((column, i) => {
      cells[`${column}${topRow}`] = stats.profileCounts[i];
    });

    // Lower block: percentages. The cells are formatted as 0%, so the values
    // stored must be fractions (this is what previously rendered as 10000%).
    cells[`A${detailRow}`] = "English";
    cells[`B${detailRow}`] = sex;
    cells[`C${detailRow}`] = enrolledCount
      ? Number((stats.count / enrolledCount).toFixed(6))
      : 0;

    PART1_DETAIL_COLUMNS.forEach((column, i) => {
      cells[`${column}${detailRow}`] = stats.count
        ? Number((stats.part1Counts[i] / stats.count).toFixed(6))
        : 0;
    });

    cells[`H${detailRow}`] =
      stats.avgFluency == null
        ? null
        : Number((stats.avgFluency / 100).toFixed(6));
    cells[`I${detailRow}`] =
      stats.avgComp == null ? null : Number((stats.avgComp / 6).toFixed(6));
    cells[`J${detailRow}`] = stats.avgWpm;

    PROFILE_DETAIL_COLUMNS.forEach((column, i) => {
      cells[`${column}${detailRow}`] = stats.count
        ? Number((stats.profileCounts[i] / stats.count).toFixed(6))
        : 0;
    });
  });

  return cells;
}

async function stabilizeSummaryCharts(zip,cells){
 for(const index of [1,3,4,5,6]){
  const path=`xl/charts/chart${index}.xml`;let xml=await zip.file(path).async('string');
  const start=index===4||index===5?22:19,end=index===6?24:start+2;
  const values=Array.from({length:end-start+1},(_,i)=>cells[`T${start+i}`]);
  const cat=`<c:cat><c:strRef><c:f>'Class Summary'!$T$${start}:$T$${end}</c:f><c:strCache><c:ptCount val="${values.length}"/>${values.map((v,i)=>`<c:pt idx="${i}"><c:v>${escapeXml(v)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>`;
  xml=xml.replace(/<c:cat>[\s\S]*?<\/c:cat>/g,cat).replace(/<c:valAx>([\s\S]*?)<\/c:valAx>/g,(_,inner)=>{
   inner=inner.replace(/<c:scaling>[\s\S]*?<\/c:scaling>/,'<c:scaling><c:orientation val="minMax"/><c:max val="1"/><c:min val="0"/></c:scaling>');
   return `<c:valAx>${inner}</c:valAx>`;
  }).replace(/<c:plotVisOnly\b[^>]*\/>/,'<c:plotVisOnly val="0"/>');zip.file(path,xml);
 }
}

function populateClassSummary(editor, cells) {
  Object.keys(cells).forEach((address) => {
    if(address.startsWith('T')){const row=Number(address.slice(1)),cell=editor.buildCell(address,cells[address],0);editor.xml=editor.xml.replace(new RegExp(`(<row\\b[^>]*\\br="${row}"[^>]*>)([\\s\\S]*?)(<\\/row>)`),(_,a,b,c)=>a+b+cell+c);return;}
    editor.setCell(address, cells[address]);
  });
}

function setHeight(editor,row,height){editor.xml=editor.xml.replace(new RegExp(`<row\\b([^>]*\\br="${row}"[^>]*)>`),(_,a)=>`<row${a.replace(/\s(?:ht|customHeight)="[^"]*"/g,'')} ht="${height}" customHeight="1">`);}
function setWidths(editor,overrides){
 const old=editor.xml.match(/<cols>([\s\S]*?)<\/cols>/)?.[1]||'',columns=[];
 for(let col=1;col<=26;col++){
  const previous=[...old.matchAll(/<col\b([^>]*?)\/>/g)].map(m=>m[1]).find(a=>col>=Number(a.match(/\bmin="(\d+)"/)?.[1])&&col<=Number(a.match(/\bmax="(\d+)"/)?.[1]));
  const width=overrides[col]??Number(previous?.match(/\bwidth="([\d.]+)"/)?.[1]||10);
  columns.push(`<col min="${col}" max="${col}" width="${width}" customWidth="1"${overrides.hidden===col?' hidden="1"':''}/>`);
 }editor.xml=editor.xml.replace(/<cols>[\s\S]*?<\/cols>/,`<cols>${columns.join('')}</cols>`);
}
function putCell(editor,address,value,style){
 const existing=editor.xml.includes(`r="${address}"`);
 if(existing){editor.setCell(address,value,{style});return;}
 const row=Number(address.replace(/\D/g,'')),cell=editor.buildCell(address,value,style??0);
 editor.xml=editor.xml.replace(new RegExp(`(<row\\b[^>]*\\br="${row}"[^>]*>)([\\s\\S]*?)(<\\/row>)`),(_,a,b,c)=>a+b+cell+c);
}
// The source template has 100 slots. Grow its styled data region before
// filling so a larger roster is never silently truncated by export or print.
async function growReportRows(zip,editor,lastRow,count,drawingPath){
 const extra=count-100;if(extra<=0)return;
 const template=editor.xml.match(new RegExp(`<row\\b[^>]*\\br="${lastRow}"[^>]*>[\\s\\S]*?<\\/row>`))?.[0];
 if(!template)throw Error('Report row template unavailable.');
 const moveRow=(xml,row)=>xml.replace(/\br="([A-Z]*)(\d+)"/g,(_,column)=>`r="${column}${row}"`);
 editor.xml=editor.xml.replace(/<row\b[^>]*\br="(\d+)"[^>]*>[\s\S]*?<\/row>/g,(xml,row)=>Number(row)>lastRow?moveRow(xml,Number(row)+extra):xml);
 const copies=Array.from({length:extra},(_,i)=>moveRow(template,lastRow+i+1)).join('');
 editor.xml=editor.xml.replace(template,template+copies).replace(/\b(ref|sqref)="([^"]+)"/g,(_,key,value)=>`${key}="${value.replace(/([A-Z]{1,3}\$?)(\d+)/g,(address,column,row)=>Number(row)>=lastRow?column+(Number(row)+extra):address)}"`);
 if(zip.file(drawingPath)){const xml=await zip.file(drawingPath).async('string');zip.file(drawingPath,xml.replace(/<xdr:row>(\d+)<\/xdr:row>/g,(whole,row)=>Number(row)>=lastRow?`<xdr:row>${Number(row)+extra}</xdr:row>`:whole));}
}
async function formatReportLayout(zip,scoresheet,classRecord,classSummary,rows){
 let styles=await zip.file('xl/styles.xml').async('string');const block=styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/),xfs=[...block[1].matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map(m=>m[0]),cache=new Map();
 const fontBlock=styles.match(/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/),fonts=[...fontBlock[1].matchAll(/<font>[\s\S]*?<\/font>/g)].map(m=>m[0]),fontCache=new Map();
 const fillBlock=styles.match(/<fills\b[^>]*>([\s\S]*?)<\/fills>/),fills=[...fillBlock[1].matchAll(/<fill>[\s\S]*?<\/fill>/g)].map(m=>m[0]);
 const palette=Object.fromEntries(Object.entries({white:'FFFFFF',stripe:'F2F2F2',filipino:'DDEBF7',english:'E2EFDA',profile:'E2EFD9'}).map(([key,rgb])=>{const id=fills.length;fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`);return [key,id];}));
 const style=(base,wrap,center,fill=null,size=null)=>{
  const key=`${base}:${wrap}:${center}:${fill}:${size}`;if(cache.has(key))return cache.get(key);
  let xf=xfs[base??0]||xfs[0];xf=xf.replace(/\sapplyAlignment="[^"]*"/g,'');
  if(xf.endsWith('/>'))xf=xf.slice(0,-2)+' applyAlignment="1"></xf>';else xf=xf.replace('>',' applyAlignment="1">');
  if(fill!==null)xf=xf.replace(/\bfillId="\d+"/,`fillId="${fill}"`).replace(/\sapplyFill="[^"]*"/,'').replace('>',' applyFill="1">');
  if(size!==null){const original=Number(xf.match(/\bfontId="(\d+)"/)?.[1]||0),key=`${original}:${size}`;if(!fontCache.has(key)){fontCache.set(key,fonts.length);fonts.push(fonts[original].replace(/<sz\b[^>]*\/>/,`<sz val="${size}"/>`));}xf=xf.replace(/\bfontId="\d+"/,`fontId="${fontCache.get(key)}"`).replace(/\sapplyFont="[^"]*"/,'').replace('>',' applyFont="1">');}
  xf=xf.replace(/<alignment\b[^>]*\/>/g,'').replace('</xf>',`<alignment horizontal="${center?'center':'left'}" vertical="center" wrapText="${wrap?1:0}" shrinkToFit="0"/></xf>`);
  const id=xfs.length;xfs.push(xf);cache.set(key,id);return id;
 };
 const setStyle=(editor,address,id)=>{editor.xml=editor.xml.replace(new RegExp(`(<c\\s+r="${address}")([^>]*)(>)`),(_,a,b,c)=>a+b.replace(/\ss="\d+"/,'').replace(/\/$/,'')+` s="${id}"`+(b.endsWith('/')?'/>':c));};
 setWidths(scoresheet,{1:5,2:18,3:29,4:10,5:16,6:11.7,7:11.4,8:10.7,9:22,10:11,11:13,12:11,13:8,14:8,15:11,16:11,17:13,18:16,19:18,20:27,21:38,22:1});
 setHeight(scoresheet,10,64);setHeight(scoresheet,7,34);setHeight(scoresheet,8,34);setHeight(scoresheet,9,34);
 scoresheet.xml=scoresheet.xml.replace('ref="M7:N9"','ref="M7:N8"').replace('ref="M10:N10"','ref="M9:N9"');
 putCell(scoresheet,'M7','Elapsed reading time\n(Max: 2 mins)',style(scoresheet.getStyle('M7'),true,true));
 putCell(scoresheet,'M9','Total',style(scoresheet.getStyle('M10'),true,true));putCell(scoresheet,'M10','Mins',style(scoresheet.getStyle('M10'),true,true));putCell(scoresheet,'N10','Secs',style(scoresheet.getStyle('M10'),true,true));
 for(const column of SCORESHEET_COLUMNS)setStyle(scoresheet,`${column}10`,style(scoresheet.getStyle(`${column}10`),true,true,null,13));
 setWidths(classRecord,{1:5.6,2:17,3:28,4:10.3,5:21,6:11,7:12,8:18,9:13,10:24,11:21,12:11,13:12,14:18,15:13,16:26,17:42,18:1});
 setHeight(classRecord,7,64);setHeight(classRecord,6,27);
 for(const column of 'ABCDEFGHIJKLMNOPQ')setStyle(classRecord,`${column}7`,style(classRecord.getStyle(`${column}7`),true,true,null,13));
 for(let index=0;index<Math.max(100,rows.length);index++){
  const sr=11+index,cr=8+index,rowHeight=Math.max(27,Math.ceil(String(rows[index]?.name||"").length/30)*13+2);setHeight(scoresheet,sr,rowHeight);setHeight(classRecord,cr,rowHeight);
  for(const column of SCORESHEET_COLUMNS)setStyle(scoresheet,`${column}${sr}`,style(scoresheet.getStyle(`${column}${sr}`),column==='C',column!=='C',index%2?palette.stripe:palette.white,column==='C'?12:13));
  for(const [i,column]of [...'ABCDEFGHIJKLMNOPQ'].entries())setStyle(classRecord,`${column}${cr}`,style(classRecord.getStyle(`${column}${cr}`),column==='C',column!=='C',i>=4&&i<=9?palette.filipino:i>=10&&i<=15?palette.english:index%2?palette.stripe:palette.white,column==='C'?12:13));
  setStyle(scoresheet,`U${sr}`,style(scoresheet.getStyle(`U${sr}`),false,false,null,12));setStyle(classRecord,`Q${cr}`,style(classRecord.getStyle(`Q${cr}`),false,false,null,12));
  // Non-empty invisible guard cells stop Excel/Sheets spilling text outside
  // the last visible remarks column. Full remarks remain in the source cell.
  putCell(scoresheet,`V${sr}`,'\u200B',0);putCell(classRecord,`R${cr}`,'\u200B',0);
 }
 // Match the original Class Summary layout: only the two reading-profile
 // blocks are green. Keep the other table cells white, and totals gray.
 // The Class Record language-band styling is deliberately unchanged.
 for(const row of [8,9,13,10,11,14,19,20,21,22,23,24])for(const column of (row<19?'ABCDEFGHIJKLMNOPQRS':'ABCDEFGHIJKLMNO')){
  const address=`${column}${row}`;
  const profileColumn=(row<19?PROFILE_COLUMNS:PROFILE_DETAIL_COLUMNS).includes(column);
  const totalRow=[13,14,21,24].includes(row);
  const fill=profileColumn?palette.profile:totalRow?palette.stripe:palette.white;
  setStyle(classSummary,address,style(classSummary.getStyle(address),true,![1,2,3,4,5].includes(column.charCodeAt(0)-64),fill));
 }
 setWidths(classSummary,{hidden:20});
 classSummary.xml=classSummary.xml.replace(/<dimension[^>]*\/>/,'<dimension ref="A1:T95"/>');
 // The pie sits entirely beside the A:O percentage table.
 const drawingPath='xl/drawings/drawing4.xml';
 if(zip.file(drawingPath)){
  const drawing=await zip.file(drawingPath).async('string');
  zip.file(drawingPath,drawing.replace(/<xdr:oneCellAnchor>[\s\S]*?<\/xdr:oneCellAnchor>/g,anchor=>anchor.includes('r:id="rId2"')?anchor.replace(/<xdr:col>\d+<\/xdr:col>/,'<xdr:col>15</xdr:col>').replace(/<xdr:colOff>\d+<\/xdr:colOff>/,'<xdr:colOff>28575</xdr:colOff>'):anchor));
 }
 styles=styles.replace(/<fonts\b[^>]*>[\s\S]*?<\/fonts>/,`<fonts count="${fonts.length}">${fonts.join('')}</fonts>`).replace(/<fills\b[^>]*>[\s\S]*?<\/fills>/,`<fills count="${fills.length}">${fills.join('')}</fills>`);
 styles=styles.replace(/<cellXfs\b[^>]*>[\s\S]*?<\/cellXfs>/,`<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>`);zip.file('xl/styles.xml',styles);
 const specs=[['G3 ENG Reading Scoresheet',1,scoresheet,`$A$1:$U$${Math.max(11,10+rows.length)}`],['Class Record',2,classRecord,`$A$1:$Q$${Math.max(8,7+rows.length)}`],['Class Summary',3,classSummary,'$A$1:$S$95']];
 let workbook=await zip.file('xl/workbook.xml').async('string');
 if(rows.length>100)workbook=workbook.replace(/(<definedName\b[^>]*name="_xlnm\._FilterDatabase"[^>]*>)([\s\S]*?)(<\/definedName>)/g,(_,open,range,close)=>open+(range.includes("'G3 ENG Reading Scoresheet'")?range.replace(/\$110\b/g,'$'+(10+rows.length)):range.includes("'Class Record'")?range.replace(/\$107\b/g,'$'+(7+rows.length)):range)+close);
 const names=[];for(const [name,index,editor,area]of specs){
  editor.xml=editor.xml.replace(/<pageSetup\b[^>]*\/>/,'<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>').replace(/<pageMargins\b[^>]*\/>/,'<pageMargins left="0.2756" right="0.2756" top="0.2756" bottom="0.2756" header="0" footer="0"/>');
  if(!editor.xml.includes('fitToPage="1"'))editor.xml=editor.xml.replace('</sheetPr>','<pageSetUpPr fitToPage="1"/></sheetPr>');
  if(index===3){
   const breaks='<rowBreaks count="1" manualBreakCount="1"><brk id="47" min="0" max="16383" man="1"/></rowBreaks>';
   editor.xml=editor.xml.replace(/<rowBreaks\b[^>]*>[\s\S]*?<\/rowBreaks>/,'');
   editor.xml=editor.xml.includes('</headerFooter>')?editor.xml.replace('</headerFooter>','</headerFooter>'+breaks):editor.xml.replace(/<pageSetup\b[^>]*\/>/,value=>value+breaks);
  }else names.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${index}">'${name}'!$1:$${index===1?10:7}</definedName>`);
  names.push(`<definedName name="_xlnm.Print_Area" localSheetId="${index}">'${name}'!${area}</definedName>`);
 }workbook=workbook.replace(/<definedName\b[^>]*name="_xlnm.Print_(?:Area|Titles)"[^>]*>[\s\S]*?<\/definedName>/g,'').replace('</definedNames>',names.join('')+'</definedNames>');zip.file('xl/workbook.xml',workbook);
}

/*
 * The v3 workbook's Class Summary charts were previously saved with helper
 * columns such as Sex included as numeric series, blank series names and a
 * compressed header row. Install the official v2 chart definitions on top of
 * the v3 Filipino/English layout before inserting live values. The compact
 * chart pack contains only OOXML chart/style/color parts, not learner data.
 */
async function applyOfficialClassSummaryCharts(zip, chartParts) {
  if (!chartParts || typeof chartParts !== "object") {
    throw new Error("The official Class Summary chart pack is unavailable.");
  }
  for (let index = 1; index <= 6; index += 1) {
    zip.file(`xl/charts/chart${index}.xml`, chartParts[`chart${index}`]);
    zip.file(`xl/charts/style${index}.xml`, chartParts[`style${index}`]);
    zip.file(`xl/charts/colors${index}.xml`, chartParts[`colors${index}`]);
    zip.file(
      `xl/charts/_rels/chart${index}.xml.rels`,
      `${XML_DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId2" Type="http://schemas.microsoft.com/office/2011/relationships/chartColorStyle" Target="colors${index}.xml"/>` +
        `<Relationship Id="rId1" Type="http://schemas.microsoft.com/office/2011/relationships/chartStyle" Target="style${index}.xml"/>` +
        "</Relationships>"
    );
  }

  const contentTypesPath = "[Content_Types].xml";
  let contentTypes = await zip.files[contentTypesPath].async("string");
  for (let index = 1; index <= 6; index += 1) {
    const parts = [
      [
        `/xl/charts/style${index}.xml`,
        "application/vnd.ms-office.chartstyle+xml",
      ],
      [
        `/xl/charts/colors${index}.xml`,
        "application/vnd.ms-office.chartcolorstyle+xml",
      ],
    ];
    parts.forEach(([partName, contentType]) => {
      if (!contentTypes.includes(`PartName="${partName}"`)) {
        contentTypes = contentTypes.replace(
          "</Types>",
          `<Override PartName="${partName}" ContentType="${contentType}"/></Types>`
        );
      }
    });
  }
  zip.file(contentTypesPath, contentTypes);
}

function resolveZipPath(baseFile, target) {
  const parts = `${baseFile.slice(0, baseFile.lastIndexOf("/") + 1)}${target}`
    .replace(/\\/g, "/")
    .split("/");
  const resolved = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }
  return resolved.join("/");
}

function normalizeClassSummaryLayout(xml) {
  /*
   * Header heights, matched to the reference scoresheet.
   *
   * The sheet carries two tables and each one has a group-header row followed
   * by a taller column-header row:
   *
   *   top table     rows 6-7    group 14.4 / columns 36
   *   percent table rows 16-18  title 15 / group 14.4 / columns 36
   *
   * Row 7 used to keep the template's 14.25, which clipped every wrapped
   * column header in the top table (it needs about two and a half lines).
   * Row 18 was already correct, which is why the percent table looked right
   * while the table above it did not.
   */
  const rowHeights = new Map([
    [6, 14.4],
    [7, 36],
    [16, 15],
    [17, 14.4],
    [18, 36],
  ]);

  let updated = xml;
  rowHeights.forEach((height, row) => {
    updated = updated.replace(
      new RegExp(`<row\\b([^>]*\\br="${row}"[^>]*)>`),
      (whole, attributes) => {
        const cleaned = attributes
          .replace(/\sht="[^"]*"/g, "")
          .replace(/\scustomHeight="[^"]*"/g, "");
        return `<row${cleaned} ht="${height}" customHeight="1">`;
      }
    );
  });

  return updated;
}

/*
 * The pie chart carries two sets of label settings: one inside its series and
 * one on the chart itself. Excel lets the series win, but other viewers resolve
 * the pair differently, so a chart-level "show values" could win and replace
 * the percentages with raw counts. Force percentages on both so the split
 * reads as a percentage everywhere.
 */
function forcePercentLabels(xml) {
  return xml.replace(/<c:dLbls>([\s\S]*?)<\/c:dLbls>/g, (whole, inner) => {
    let updated = inner;

    const setFlag = (name, value) => {
      const pattern = new RegExp(`<c:${name} val="[^"]*"/>`);
      const replacement = `<c:${name} val="${value}"/>`;
      if (pattern.test(updated)) {
        updated = updated.replace(pattern, replacement);
      } else if (!updated.includes(`<c:${name}`)) {
        /* Every label block in this chart already declares these flags. */
        updated += replacement;
      }
    };

    setFlag("showLegendKey", "0");
    setFlag("showVal", "0");
    setFlag("showCatName", "0");
    setFlag("showSerName", "0");
    setFlag("showPercent", "1");
    setFlag("showBubbleSize", "0");

    return `<c:dLbls>${updated}</c:dLbls>`;
  });
}

/*
 * Excel 2013+ stores the range a series came from twice: once as the plain
 * <c:f> reference and again inside a <c15:fullRef><c15:sqref> extension.
 * When the two disagree Excel follows the extension, so a <c:f> that has been
 * repointed while the extension still names the original cells silently reads
 * the wrong rows. The extension names the range including its header row, so
 * it starts one row above the data reference.
 */
function fullReferenceFor(reference) {
  const match = String(reference).match(
    /^(.*?!)(\$?[A-Z]{1,3}\$?)(\d+):(\$?[A-Z]{1,3}\$?)(\d+)$/
  );
  if (!match) {
    return null;
  }

  const [, sheet, startColumn, startRow, endColumn, endRow] = match;
  const firstDataRow = Number(startRow);
  if (!Number.isFinite(firstDataRow) || firstDataRow <= 1) {
    return null;
  }

  return `${sheet}${startColumn}${firstDataRow - 1}:${endColumn}${endRow}`;
}

function realignFullReference(xml) {
  return xml.replace(
    /<c:(strRef|numRef)>([\s\S]*?)<\/c:\1>/g,
    (whole, kind, inner) => {
      const formula = inner.match(/<c:f>([^<]*)<\/c:f>/);
      const sqref = inner.match(/<c15:sqref>([^<]*)<\/c15:sqref>/);
      if (!formula || !sqref) {
        return whole;
      }

      const aligned = fullReferenceFor(formula[1]);
      if (!aligned) {
        return whole;
      }

      return whole.replace(sqref[0], `<c15:sqref>${aligned}</c15:sqref>`);
    }
  );
}

/*
 * The template's male/female pie chart originally read the Filipino summary
 * rows, which this app leaves empty because it only assesses English. Point it
 * at the English rows so the pie shows this class's own split.
 */
async function repointPieChart(zip) {
  const chartPath = "xl/charts/chart2.xml";
  const entry = zip.files[chartPath];
  if (!entry) {
    return;
  }

  const xml = await entry.async("string");
  zip.file(
    chartPath,
    forcePercentLabels(
      realignFullReference(
        xml
          .replace(
            "'Class Summary'!$E$8:$E$9",
            "'Class Summary'!$E$10:$E$11"
          )
          .replace(
            "'Class Summary'!$G$8:$G$9",
            "'Class Summary'!$G$10:$G$11"
          )
      )
    )
  );
}

/*
 * Expand an A1-style reference such as "'Class Summary'!$K$19:$K$24" into the
 * list of addresses it covers.
 */
function expandRange(reference) {
  const match = String(reference).match(
    /!?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/
  );
  if (!match) {
    return null;
  }

  const startColumn = match[1];
  const startRow = Number(match[2]);
  const endColumn = match[3] || startColumn;
  const endRow = match[4] ? Number(match[4]) : startRow;

  if (startColumn !== endColumn) {
    return null;
  }

  const addresses = [];
  for (let row = startRow; row <= endRow; row += 1) {
    addresses.push(`${startColumn}${row}`);
  }
  return addresses;
}

/*
 * Every chart keeps a cached copy of its series values. Rebuild each cache
 * from the exact range length instead of only replacing existing points.
 * This matters for the Filipino-and-English profile chart: its source range
 * is shorter than the old three-language chart, and stale extra cache points
 * otherwise appear as phantom categories in non-recalculating viewers.
 */
async function refreshChartCaches(zip, cells) {
  const chartParts = Object.keys(zip.files).filter((name) =>
    /^xl\/charts\/chart\d+\.xml$/.test(name)
  );

  await Promise.all(
    chartParts.map(async (part) => {
      const xml = await zip.files[part].async("string");

      const updated = xml.replace(
        /<c:numRef>([\s\S]*?)<\/c:numRef>/g,
        (whole, inner) => {
          const reference = inner.match(/<c:f>([^<]*)<\/c:f>/);
          if (!reference) {
            return whole;
          }

          const addresses = expandRange(reference[1]);
          if (!addresses || !addresses.length) {
            return whole;
          }

          const formatCode =
            inner.match(
              /<c:numCache>[\s\S]*?<c:formatCode>([^<]*)<\/c:formatCode>/
            )?.[1] || "General";
          const withoutCache = inner.replace(
            /<c:numCache>[\s\S]*?<\/c:numCache>/,
            ""
          );
          const points = addresses
            .map((address, index) => {
              const value = cells[address];
              const numericValue =
                typeof value === "number" && Number.isFinite(value)
                  ? value
                  : 0;
              return `<c:pt idx="${index}"><c:v>${formatNumber(
                numericValue
              )}</c:v></c:pt>`;
            })
            .join("");
          const cache =
            `<c:numCache><c:formatCode>${escapeXml(formatCode)}</c:formatCode>` +
            `<c:ptCount val="${addresses.length}"/>${points}</c:numCache>`;

          return `<c:numRef>${withoutCache}${cache}</c:numRef>`;
        }
      );

      zip.file(part, updated);
    })
  );
}

/*
 * The template still carries formulas that Excel can only display as an error.
 *
 * Two kinds exist. `_xludf.` is the namespace Excel writes back for a function
 * it did not recognise, so the Filipino scoresheet's merged story legends and
 * its language helper all read "#NAME?" - and every words-read and percentage
 * cell on that sheet divides by them. A formula holding "#REF!" came from a
 * range that no longer exists and can never resolve.
 *
 * Both are repaired here, for every worksheet in the book, before the report
 * writes its own values. Anything the report writes afterwards replaces the
 * cell outright, so this only ever touches what would otherwise ship broken.
 */
const NATIVE_EXCEL_FUNCTIONS = new Set([
  "CONCAT",
  "IFNA",
  "IFS",
  "MAXIFS",
  "MINIFS",
  "SWITCH",
  "TEXTJOIN",
  "XLOOKUP",
]);

function repairSheetFormulas(xml) {
  return xml.replace(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g, (cell) => {
    const reference = /r="([A-Z]+\d+)"/.exec(cell);
    if (!reference) return cell;

    const style = / s="(\d+)"/.exec(cell);
    const blank = `<c r="${reference[1]}"${style ? ` s="${style[1]}"` : ""}/>`;
    const formula = /<f[^>]*>([\s\S]*?)<\/f>/.exec(cell);

    /* A cached error with no formula left can never recalculate itself. */
    if (!formula) {
      return /t="e"/.test(cell) ? blank : cell;
    }

    const repaired = cell.replace(
      /_xludf\.([A-Za-z][A-Za-z0-9._]*)\(/g,
      (match, name) =>
        NATIVE_EXCEL_FUNCTIONS.has(name.toUpperCase()) ? `${name}(` : match
    );

    /*
     * The cell also carried the "#NAME?" that the old name produced as its
     * cached result. Keeping it would show the error until the sheet is
     * recalculated, so the cache goes with the name.
     */
    const next =
      repaired === cell
        ? repaired
        : repaired
            .replace(/<c([^>]*?)\st="e"/, "<c$1")
            .replace(/<v>[\s\S]*?<\/v>/, "");

    /* A deleted range is not recoverable, so the cell ships empty instead. */
    const repairedFormula = /<f[^>]*>([\s\S]*?)<\/f>/.exec(next);
    return repairedFormula && /#REF!/.test(repairedFormula[1])
      ? blank
      : next;
  });
}

async function repairTemplateFormulas(zip) {
  const sheetPaths = Object.keys(zip.files).filter((name) =>
    /^xl\/worksheets\/sheet\d+\.xml$/.test(name)
  );

  await Promise.all(
    sheetPaths.map(async (path) => {
      const xml = await zip.file(path).async("string");
      const repaired = repairSheetFormulas(xml);
      if (repaired !== xml) zip.file(path, repaired);
    })
  );
}

/*
 * The Filipino scoresheet is the workbook's source sheet: the English
 * scoresheet and the Class Record read its school, teacher, section and
 * enrolment cells. The report fills the English sheet directly and left this
 * one holding the template's broken "#REF!" enrolment formula, so its header
 * read as an error and the cross-sheet references had nothing to copy.
 */
function populateSourceScoresheet(editor, teacher, enrolled) {
  if(teacher.assessmentPeriod)editor.setCell("C3",teacher.assessmentPeriod);
  editor.setCell("C4", teacher.schoolId || "");
  editor.setCell("C5", teacher.schoolName || "");
  editor.setCell("C6", teacher.fullName || "");
  editor.setCell("C8", [teacher.section, teacher.schoolYear ? `S.Y. ${teacher.schoolYear}` : ""].filter(Boolean).join(" | "));

  editor.setCell("D6", enrolled.Male);
  editor.setCell("E6", enrolled.Female);
  editor.setCell("F4", enrolled.Total);
}

/*
 * Remove the stale calcChain (we replace formulas with literal values) and
 * force a full recalculation on open so the summary charts pick up the new
 * numbers immediately.
 */
async function prepareWorkbookMeta(zip) {
  if (zip.files["xl/calcChain.xml"]) {
    zip.remove("xl/calcChain.xml");
  }

  const relsPath = "xl/_rels/workbook.xml.rels";
  if (zip.files[relsPath]) {
    let rels = await zip.files[relsPath].async("string");
    rels = rels.replace(
      /<Relationship[^>]*Target="calcChain\.xml"[^>]*\/>/,
      ""
    );
    zip.file(relsPath, rels);
  }

  const contentTypesPath = "[Content_Types].xml";
  if (zip.files[contentTypesPath]) {
    let contentTypes = await zip.files[contentTypesPath].async("string");
    contentTypes = contentTypes.replace(
      /<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/,
      ""
    );
    zip.file(contentTypesPath, contentTypes);
  }

  const workbookPath = "xl/workbook.xml";
  if (zip.files[workbookPath]) {
    let workbook = await zip.files[workbookPath].async("string");
    workbook = workbook.replace(
      /<calcPr[^>]*\/>/,
      '<calcPr calcId="191029" fullCalcOnLoad="1"/>'
    );
    zip.file(workbookPath, workbook);
  }
}

/*
 * How far to drop the pie chart, in EMU (12700 EMU = 1pt).
 *
 * The "% of Learners Assessed" caption is a text box on the sheet, not part of
 * the chart, and it sits just inside the chart's top edge. In the workbook this
 * layout came from, the pie frame is tall enough that the square plot area
 * centres well below the caption. This scoresheet's frame is shorter, so the
 * plot fills its whole box and the caption lands across the top of the circle.
 * Lowering the chart by 30pt puts the circle clear of the caption while keeping
 * the frame above the next heading and the chart beneath it.
 */
const PIE_CHART_DROP_EMU = 30 * 12700;

function readRowLayout(sheetXml) {
  const defaultRowHeight =
    Number(
      (sheetXml.match(/<sheetFormatPr[^>]*defaultRowHeight="([^"]*)"/) || [])[1]
    ) || 15;

  const heights = new Map();
  for (const match of sheetXml.matchAll(/<row\b[^>]*>/g)) {
    const row = Number((match[0].match(/\br="(\d+)"/) || [])[1]);
    const height = Number((match[0].match(/\bht="([^"]*)"/) || [])[1]);
    if (Number.isFinite(row) && row > 0 && Number.isFinite(height)) {
      heights.set(row, height);
    }
  }

  return { defaultRowHeight, heights };
}

/* Top edge of a 1-based row, in EMU. */
function rowTopEmu(rowNumber, layout) {
  let points = 0;
  for (let row = 1; row < rowNumber; row += 1) {
    points += layout.heights.get(row) ?? layout.defaultRowHeight;
  }
  return Math.round(points * 12700);
}

/* The row and in-row offset that a given absolute EMU position falls on. */
function locateEmu(targetEmu, layout) {
  let points = 0;
  for (let row = 1; row <= 1000; row += 1) {
    const height = layout.heights.get(row) ?? layout.defaultRowHeight;
    const nextPoints = points + height;
    if (targetEmu < Math.round(nextPoints * 12700)) {
      return { row: row - 1, rowOff: targetEmu - Math.round(points * 12700) };
    }
    points = nextPoints;
  }
  return null;
}

/*
 * Move the pie chart's anchor down, resolving the drawing through the sheet's
 * own relationships so this keeps working if the template is reordered.
 */
async function lowerPieChartAnchor(zip, classSummaryXml) {
  const drawingRelId = (
    classSummaryXml.match(/<drawing[^>]*r:id="([^"]+)"/) || []
  )[1];
  if (!drawingRelId) {
    return;
  }

  const sheetRelsPath = PART["Class Summary"].replace(
    /([^/]+)$/,
    "_rels/$1.rels"
  );
  const sheetRels = zip.files[sheetRelsPath]
    ? await zip.files[sheetRelsPath].async("string")
    : "";
  const drawingTarget = (
    sheetRels.match(
      new RegExp(`<Relationship[^>]*Id="${drawingRelId}"[^>]*Target="([^"]+)"`)
    ) || []
  )[1];
  if (!drawingTarget) {
    return;
  }

  const drawingPath = resolveZipPath(PART["Class Summary"], drawingTarget);
  if (!zip.files[drawingPath]) {
    return;
  }

  const drawingRelsPath = drawingPath.replace(/([^/]+)$/, "_rels/$1.rels");
  const drawingRels = zip.files[drawingRelsPath]
    ? await zip.files[drawingRelsPath].async("string")
    : "";
  const pieRelId = (
    drawingRels.match(
      /<Relationship[^>]*Id="([^"]+)"[^>]*Target="[^"]*charts\/chart2\.xml"/
    ) || []
  )[1];
  if (!pieRelId) {
    return;
  }

  const drawing = await zip.files[drawingPath].async("string");
  const anchorIndex = drawing.indexOf(`r:id="${pieRelId}"`);
  if (anchorIndex < 0) {
    return;
  }

  const fromStart = drawing.lastIndexOf("<xdr:from>", anchorIndex);
  const fromEnd = drawing.indexOf("</xdr:from>", fromStart);
  if (fromStart < 0 || fromEnd < 0) {
    return;
  }

  const fromBlock = drawing.slice(fromStart, fromEnd);
  const placement = fromBlock.match(
    /<xdr:row>(\d+)<\/xdr:row><xdr:rowOff>(\d+)<\/xdr:rowOff>/
  );
  if (!placement) {
    return;
  }

  const layout = readRowLayout(classSummaryXml);
  const currentTop = rowTopEmu(Number(placement[1]) + 1, layout) + Number(placement[2]);
  const target = locateEmu(currentTop + PIE_CHART_DROP_EMU, layout);
  if (!target) {
    return;
  }

  const replacement =
    `<xdr:row>${target.row}</xdr:row><xdr:rowOff>${target.rowOff}</xdr:rowOff>`;
  zip.file(
    drawingPath,
    drawing.slice(0, fromStart) +
      fromBlock.replace(placement[0], replacement) +
      drawing.slice(fromEnd)
  );
}

export async function buildScoresheetWorkbook({
  templateData,
  chartParts,
  teacher,
  rows,
  enrolled,
  summary,
  outputType = "uint8array",
}) {
  const zip = await JSZip.loadAsync(templateData);
  await applyOfficialClassSummaryCharts(zip, chartParts);
  await repairTemplateFormulas(zip);

  const sharedStringsXml = await zip.files["xl/sharedStrings.xml"].async(
    "string"
  );
  const sharedStrings = new SharedStrings(sharedStringsXml);

  const sourceScoresheet = new SheetEditor(
    await zip.files[PART["G3 FIL Reading Scoresheet"]].async("string"),
    sharedStrings
  );
  const scoresheet = new SheetEditor(
    await zip.files[PART["G3 ENG Reading Scoresheet"]].async("string"),
    sharedStrings
  );
  const classRecord = new SheetEditor(
    await zip.files[PART["Class Record"]].async("string"),
    sharedStrings
  );
  const classSummary = new SheetEditor(
    normalizeClassSummaryLayout(
      await zip.files[PART["Class Summary"]].async("string")
    ),
    sharedStrings
  );

  const drawing=await zip.file('xl/drawings/drawing2.xml').async('string');
  zip.file('xl/drawings/drawing2.xml',drawing.replace(/<xdr:oneCellAnchor>[\s\S]*?<\/xdr:oneCellAnchor>/g,anchor=>anchor.includes('<xdr:row>5</xdr:row>')&&anchor.includes('<xdr:pic>')?anchor.replace(/(<xdr:ext[^>]*\bcy=")\d+"/,'$1'+(145*9525)+'"'):anchor));
  await growReportRows(zip,scoresheet,110,rows.length,'xl/drawings/drawing2.xml');
  await growReportRows(zip,classRecord,107,rows.length,'xl/drawings/drawing3.xml');
  populateSourceScoresheet(sourceScoresheet, teacher, enrolled);
  populateScoresheet(scoresheet, teacher, rows, enrolled);
  populateClassRecord(classRecord, teacher, rows);

  const summaryCells = buildClassSummaryCells(teacher, summary, enrolled);
  populateClassSummary(classSummary, summaryCells);

  await repointPieChart(zip);
  await lowerPieChartAnchor(zip, classSummary.xml);
  await refreshChartCaches(zip, summaryCells);
  await stabilizeSummaryCharts(zip,summaryCells);
  await formatReportLayout(zip,scoresheet,classRecord,classSummary,rows);
  await prepareWorkbookMeta(zip);

  zip.file("xl/sharedStrings.xml", sharedStrings.toXml());
  zip.file(PART["G3 FIL Reading Scoresheet"], sourceScoresheet.xml);
  zip.file(PART["G3 ENG Reading Scoresheet"], scoresheet.xml);
  zip.file(PART["Class Record"], classRecord.xml);
  zip.file(PART["Class Summary"], classSummary.xml);

  for(const path of Object.keys(zip.files).filter(name=>/^xl\/worksheets\/sheet\d+\.xml$/.test(name))){
    let xml=await zip.file(path).async('string');
    xml=xml.replace(/<pane\b[^>]*?(?:\/>|>[\s\S]*?<\/pane>)/g,'').replace(/<selection\b[^>]*?(?:\/>|>[\s\S]*?<\/selection>)/g,'').replace(/<sheetView\b([^>]*?)\/>/g,'<sheetView$1></sheetView>').replace(/(<sheetView\b[^>]*?)\s+topLeftCell="[^"]*"/g,'$1').replace(/<\/sheetView>/g,'<selection activeCell="A1" sqref="A1"/></sheetView>');
    zip.file(path,xml);
  }
  const output = await zip.generateAsync({
    type: outputType,
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return output;
}
