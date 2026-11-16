import JSZip from 'jszip';
const unescape=s=>String(s??'').replace(/&#x([\da-f]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v,16))).replace(/&#(\d+);/g,(_,v)=>String.fromCodePoint(Number(v))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
const attr=(s,name,fallback='')=>unescape(s.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]??fallback);
const contents=(s,tag)=>s.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1]||'';
const tags=(s,tag)=>[...s.matchAll(new RegExp(`<${tag}\\b[^>]*?(?:\\/>|>[\\s\\S]*?<\\/${tag}>)`,'g'))].map(m=>m[0]);
const text=s=>[...s.matchAll(/<(?:a:|c:)?(?:t|v)\b[^>]*>([\s\S]*?)<\/(?:a:|c:)?(?:t|v)>/g)].map(m=>unescape(m[1])).join('');
const colNumber=s=>[...s].reduce((v,c)=>v*26+c.charCodeAt(0)-64,0);
const address=s=>({col:colNumber(s.replace(/[^A-Z]/g,'')),row:Number(s.replace(/\D/g,''))});
const color=(xml,fallback='#111')=>{const rgb=attr(xml,'rgb')||attr(xml,'val');return /^[\da-f]{6,8}$/i.test(rgb)?'#'+rgb.slice(-6):fallback;};
const safeTarget=(base,target)=>{if(!target||/^(?:[a-z]+:|\/)/i.test(target))return null;const parts=base.split('/').slice(0,-1);for(const part of target.split('/')){if(part==='..')parts.pop();else if(part&&part!=='.')parts.push(part);}const path=parts.join('/');return path.startsWith('xl/')?path:null;};
const relationships=(xml,base)=>Object.fromEntries(tags(xml,'Relationship').map(t=>[attr(t,'Id'),safeTarget(base,attr(t,'Target'))]));
const sum=(values,start=0,end=values.length)=>values.slice(start,end).reduce((a,b)=>a+b,0);
const percent=v=>`${Math.round((Number(v)||0)*100)}%`;

const chartPaint=(xml,theme,fallback='#4472c4')=>{const solid=contents(xml,'a:solidFill'),rgb=solid.match(/<a:srgbClr[^>]*\/>/)?.[0],scheme=attr(solid.match(/<a:schemeClr[^>]*\/>/)?.[0]||'','val');return rgb?color(rgb,fallback):theme[scheme]||fallback;};
export function parseWorkbookChart(xml,theme={}){
 const series=tags(xml,'c:ser').map(s=>{
  const label=text(contents(s,'c:tx')),values=tags(contents(s,'c:val'),'c:pt').map(p=>Number(text(p))||0),cat=contents(s,'c:cat');
  const pointColors=Object.fromEntries(tags(s,'c:dPt').map(point=>[Number(attr(point.match(/<c:idx[^>]*\/>/)?.[0]||'','val')),chartPaint(contents(point,'c:spPr'),theme)]));
  return {label,pointColors,color:chartPaint(contents(s,'c:spPr'),theme),values,categories:tags(contents(cat,'c:strCache'),'c:pt').map(text)};
 });return {title:[...contents(xml,'c:title').matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)].map(m=>unescape(m[1])).join(''),pie:xml.includes('<c:pieChart'),series};
}

// Read the exact completed XLSX that Excel export produces. The print model
// retains template cells, merges, row/column geometry, styles and drawings.
export async function readWorkbookPrintModel(data,views=['scoresheet']){
 const zip=await JSZip.loadAsync(data),get=async p=>zip.file(p)?zip.file(p).async('string'):'';
 const [shared,styles,workbook,rels]=await Promise.all(['xl/sharedStrings.xml','xl/styles.xml','xl/workbook.xml','xl/_rels/workbook.xml.rels'].map(get));
 const strings=tags(shared,'si').map(s=>[...s.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m=>unescape(m[1])).join(''));
 const fonts=tags(contents(styles,'fonts'),'font'),fills=tags(contents(styles,'fills'),'fill'),borders=tags(contents(styles,'borders'),'border'),xfs=tags(contents(styles,'cellXfs'),'xf');
 const fmts=Object.fromEntries(tags(contents(styles,'numFmts'),'numFmt').map(t=>[attr(t,'numFmtId'),attr(t,'formatCode')]));
 const dxfs=tags(contents(styles,'dxfs'),'dxf'),conditionalStyles=new Map();
 const themeXml=await get('xl/theme/theme1.xml'),theme=Object.fromEntries(['dk1','lt1','dk2','lt2','accent1','accent2','accent3','accent4','accent5','accent6'].map(key=>[key,color(contents(themeXml,'a:'+key).match(/<a:srgbClr[^>]*\/>/)?.[0]||'','#4472c4')]));
 const {SSF}=await import('xlsx'),styleModels=xfs.map(x=>{
  const font=fonts[Number(attr(x,'fontId','0'))]||'',fill=fills[Number(attr(x,'fillId','0'))]||'',border=borders[Number(attr(x,'borderId','0'))]||'',align=x.match(/<alignment[^>]*\/>/)?.[0]||'';
  const edges=Object.fromEntries(['left','right','top','bottom'].map(side=>[side,attr(border.match(new RegExp(`<${side}[^>]*(?:\\/>|>[\\s\\S]*?<\\/${side}>)`))?.[0]||'','style')]));
  return {font:attr(font.match(/<name[^>]*\/>/)?.[0]||'','val','Calibri'),size:Number(attr(font.match(/<sz[^>]*\/>/)?.[0]||'','val','11')),bold:/<b(?:\s|\/|>)/.test(font),color:color(font.match(/<color[^>]*\/>/)?.[0]||'','#111'),fill:color(fill.match(/<fgColor[^>]*\/>/)?.[0]||'','transparent'),align:attr(align,'horizontal','left'),wrap:attr(align,'wrapText')==='1',format:fmts[attr(x,'numFmtId')]||SSF._table[Number(attr(x,'numFmtId','0'))]||'General',edges};
 });
 const mapping=relationships(rels,'xl/workbook.xml'),specs={scoresheet:['G3 ENG Reading Scoresheet',21,10], 'class-record':['Class Record',17,7],summary:['Class Summary',19,0]},sheets=[];
 for(const view of views){
  const spec=specs[view];if(!spec)throw Error('Unknown report view.');
  const sheetTag=tags(contents(workbook,'sheets'),'sheet').find(s=>attr(s,'name')===spec[0]),path=mapping[attr(sheetTag||'','r:id')];if(!path)throw Error('The report worksheet is unavailable.');
  const xml=await get(path),area=tags(contents(workbook,'definedNames'),'definedName').find(t=>attr(t,'name')==='_xlnm.Print_Area'&&unescape(t).includes(`'${spec[0]}'!`)),endRow=Number(area?.match(/:\$[A-Z]+\$(\d+)/)?.[1]|| (view==='summary'?95:110));
  const cols=Array.from({length:spec[1]},(_,i)=>{const c=tags(contents(xml,'cols'),'col').find(t=>i+1>=Number(attr(t,'min'))&&i+1<=Number(attr(t,'max')));return Math.floor(Number(attr(c||'','width','10'))*7+5);});
  const rows=Array(endRow).fill(19),cells=new Map();
  for(const r of tags(contents(xml,'sheetData'),'row')){
   const number=Number(attr(r,'r'));if(number>endRow)continue;rows[number-1]=Number(attr(r,'ht','14.25'))*4/3;
   for(const c of tags(r,'c')){const pos=address(attr(c,'r'));if(pos.col>spec[1])continue;const raw=contents(c,'v'),type=attr(c,'t'),style=Number(attr(c,'s','0')),fmt=styleModels[style]?.format||'General';let value=type==='s'?strings[Number(raw)]||'':type==='inlineStr'?text(c):unescape(raw);
    if(type!=='s'&&type!=='inlineStr'&&raw!==''&&!Number.isNaN(Number(raw))){try{value=SSF.format(fmt,Number(raw));}catch{value=raw;}}
    cells.set(`${pos.row}:${pos.col}`,{...pos,value,style});
   }
  }
  const merges=tags(contents(xml,'mergeCells'),'mergeCell').map(t=>attr(t,'ref').split(':').map(address)).filter(([a,b])=>b&&a.col<=spec[1]&&a.row<=endRow);
  // Apply the template's text/stop-rule highlights from its own differential
  // styles. Unsupported formulas are ignored, never evaluated as JavaScript.
  for(const formatting of tags(xml,'conditionalFormatting'))for(const range of attr(formatting,'sqref').split(' ')){
   const [first,last=first]=range.split(':').map(address),rules=tags(formatting,'cfRule').sort((a,b)=>Number(attr(b,'priority'))-Number(attr(a,'priority')));
   for(const rule of rules)for(let r=first.row;r<=Math.min(endRow,last.row);r++)for(let c=first.col;c<=Math.min(spec[1],last.col);c++){
    const cell=cells.get(`${r}:${c}`);if(!cell)continue;const type=attr(rule,'type'),formula=unescape(contents(rule,'formula')),literal=formula.match(/^(\$?)([A-Z]+)(\$?)(\d+)\s*=\s*(?:"([^"]*)"|(\d+))$/),ref=formula.match(/^\$?([A-Z]+)\$?(\d+)$/);let matches=false;
    if(type==='containsText')matches=String(cell.value).toLowerCase().includes(attr(rule,'text').toLowerCase());
    else if(type==='expression'&&literal){const other=cells.get(`${literal[3]?Number(literal[4]):Number(literal[4])+r-first.row}:${colNumber(literal[2])+(literal[1]?0:c-first.col)}`);matches=String(other?.value??'')===String(literal[5]??literal[6]);}
    else if(type==='cellIs'&&ref){const other=cells.get(`${ref[2]}:${colNumber(ref[1])}`),op=attr(rule,'operator');matches=op==='notEqual'?cell.value!==other?.value:op==='lessThan'?Number(cell.value)<Number(other?.value):false;}
    if(!matches)continue;const id=attr(rule,'dxfId'),dxf=dxfs[Number(id)];if(!dxf)continue;const key=`${cell.style}:${id}`;if(!conditionalStyles.has(key)){const base=styleModels[cell.style],font=contents(dxf,'font'),fill=contents(dxf,'fill');conditionalStyles.set(key,styleModels.length);styleModels.push({...base,color:color(font.match(/<color[^>]*\/>/)?.[0]||'',base.color),fill:color(fill.match(/<fgColor[^>]*\/>/)?.[0]||'',base.fill),bold:font.includes('<b/>')||base.bold});}cell.style=conditionalStyles.get(key);
   }
  }
  const sheetRels=relationships(await get(path.replace(/\/([^/]+)$/,'/_rels/$1.rels')),path),drawingPath=sheetRels[attr(xml.match(/<drawing[^>]*\/>/)?.[0]||'','r:id')],drawings=[];
  if(drawingPath){const drawing=await get(drawingPath),drawingRels=relationships(await get(drawingPath.replace(/\/([^/]+)$/,'/_rels/$1.rels')),drawingPath);
   for(const anchor of tags(drawing,'xdr:oneCellAnchor')){
    const from=contents(anchor,'xdr:from'),col=Number(contents(from,'xdr:col')),row=Number(contents(from,'xdr:row'));if(col>=spec[1]||row>=endRow)continue;
    const ext=anchor.match(/<xdr:ext[^>]*\/>/)?.[0]||'',item={col,row,x:sum(cols,0,col)+Number(contents(from,'xdr:colOff'))/9525,y:sum(rows,0,row)+Number(contents(from,'xdr:rowOff'))/9525,width:Number(attr(ext,'cx'))/9525,height:Number(attr(ext,'cy'))/9525};
    const chart=anchor.match(/<c:chart[^>]*\/>/)?.[0],image=anchor.match(/<a:blip[^>]*\/>/)?.[0];
    if(chart){const target=drawingRels[attr(chart,'r:id')];if(target)item.chart=parseWorkbookChart(await get(target),theme);}
    else if(image){const target=drawingRels[attr(image,'r:embed')];if(target&&/\.(png|jpe?g)$/i.test(target)&&zip.file(target))item.image=`data:image/${target.toLowerCase().endsWith('.png')?'png':'jpeg'};base64,${await zip.file(target).async('base64')}`;}
    else{const t=[...anchor.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)].map(m=>unescape(m[1])).join(' ');if(t){item.text=t;item.heading=/GRADE 3/i.test(t);}}
    if(item.image||item.chart||item.text)drawings.push(item);
   }
  }
  sheets.push({view,name:spec[0],cols,rows,cells,merges,drawings,headerRows:spec[2],endRow});
 }
 return {sheets,styles:styleModels};
}

function chartSvg(doc,chart,width,height){
 const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('width',width);svg.setAttribute('height',height);
 const add=(tag,attrs,value)=>{const n=doc.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(value!==undefined)n.textContent=value;svg.appendChild(n);return n;};
 add('rect',{x:0,y:0,width,height,fill:'#fff',stroke:'#aaa'});
 const title=chart.title.match(/.{1,65}(?:\s|$)/g)||[chart.title];title.filter(Boolean).forEach((t,i)=>add('text',{x:width/2,y:20+i*17,'text-anchor':'middle','font-size':14,fill:'#555'},t.trim()));
 if(chart.pie){const values=chart.series[0]?.values||[],labels=chart.series[0]?.categories||['Male','Female'],total=values.reduce((a,b)=>a+b,0),cx=width*.35,cy=height*.52,r=Math.min(width*.3,height*.46),colors=chart.series[0]?.pointColors||{};let angle=-Math.PI/2;
  if(!total)add('circle',{cx,cy,r,fill:'#eee',stroke:'#ccc'});
  values.forEach((v,i)=>{if(v<=0)return;const next=angle+v/total*Math.PI*2,large=next-angle>Math.PI?1:0,fill=colors[i]||(i?'#FF0000':'#0070C0');if(v===total)add('circle',{cx,cy,r,fill,stroke:'#fff','stroke-width':2});else add('path',{d:`M ${cx} ${cy} L ${cx+r*Math.cos(angle)} ${cy+r*Math.sin(angle)} A ${r} ${r} 0 ${large} 1 ${cx+r*Math.cos(next)} ${cy+r*Math.sin(next)} Z`,fill,stroke:'#fff','stroke-width':2});const middle=(angle+next)/2;add('text',{x:cx+r*.6*Math.cos(middle),y:cy+r*.6*Math.sin(middle)+5,'text-anchor':'middle','font-size':14,'font-weight':'bold',fill:'#fff'},percent(v/total));angle=next;});
  labels.forEach((label,i)=>{const y=height*.44+i*26;add('rect',{x:width*.68,y:y-10,width:10,height:10,fill:colors[i]||(i?'#FF0000':'#0070C0')});add('text',{x:width*.68+17,y,'font-size':13,fill:'#555'},label);});return svg;
 }

 const series=chart.series,categories=series[0]?.categories||[],left=50,right=width-15,top=70,bottom=height-48,legendY=title.length>1?55:40;
 series.forEach((s,i)=>{const span=(width-30)/Math.max(1,series.length),x=15+i*span;add('rect',{x,y:legendY-9,width:9,height:9,fill:s.color});const words=s.label.match(/.{1,22}(?:\s|$)/g)||[s.label];words.slice(0,2).forEach((word,j)=>add('text',{x:x+13,y:legendY+j*12,'font-size':10},word.trim()));});
 for(let i=0;i<=4;i++){const y=bottom-(bottom-top)*i/4;add('line',{x1:left,x2:right,y1:y,y2:y,stroke:'#ddd'});add('text',{x:left-6,y:y+4,'text-anchor':'end','font-size':10},`${i*25}%`);}
 const group=(right-left)/Math.max(categories.length,1),bw=Math.min(22,group/(series.length+1));categories.forEach((category,i)=>{const center=left+group*(i+.5);series.forEach((s,j)=>{const value=s.values[i]||0,h=Math.max(0,Math.min(1,value))*(bottom-top),x=center+(j-(series.length-1)/2)*bw-bw*.4;add('rect',{x,y:bottom-h,width:bw*.8,height:h,fill:s.color});add('text',{x:x+bw*.4,y:bottom-h-4,'text-anchor':'middle','font-size':9},percent(value));});category.split('\n').forEach((v,j)=>add('text',{x:center,y:bottom+16+j*12,'text-anchor':'middle','font-size':10},v));});return svg;
}

// SVG keeps table geometry in one scalable coordinate system. Unlike an
// absolutely positioned HTML canvas, it cannot enlarge the browser print area
// or be cropped at a native Letter/A4 or margin override boundary.
export function wrapPrintText(value,width,size,measure){
 const result=[];
 const fits=text=>(measure?measure(text,size):[...text].reduce((n,c)=>n+(/[ilI1.,' :;]/.test(c)?.32:/[MW@%]/.test(c)?.9:.61)*size,0))<=width;
 for(const paragraph of String(value??'').split(/\r?\n/)){
  let line='';for(const word of paragraph.split(/\s+/).filter(Boolean)){
   if(fits(line?line+' '+word:word)){line=line?line+' '+word:word;continue;}
   if(line){result.push(line);line='';}
   for(const char of word){if(line&&!fits(line+char)){result.push(line);line='';}line+=char;}
  }result.push(line);
 }
 return result;
}
export function createWorkbookPrintPages(doc,model){
 const root=doc.createElement('div'),css=`@page{size:A4 landscape;margin:0}html,body{margin:0!important;padding:0!important;width:auto!important;max-width:none!important;background:#fff;color:#111}.xlPaper{box-sizing:border-box;width:100%;margin:0;padding:0;break-after:page;break-inside:avoid;page-break-inside:avoid}.xlPaper:last-child{break-after:auto}.xlSheet{display:block;width:100%;height:auto;max-width:100%;print-color-adjust:exact!important;-webkit-print-color-adjust:exact!important}`;
 let context=null;try{context=doc.createElement('canvas').getContext?.('2d')||null;}catch{}
 const measure=context?(text,size)=>{context.font=`${size}px Arial`;return context.measureText(text).width;}:null;
 const add=(parent,tag,attrs,value)=>{const node=doc.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))node.setAttribute(k,String(v));if(value!==undefined)node.textContent=value;parent.appendChild(node);return node;};
 for(const original of model.sheets){
  const sheet={...original,rows:[...original.rows]},width=sum(sheet.cols),rawPageHeight=width*210/297,padding=width*7/297,availableWidth=width-2*padding,scale=availableWidth/width,maxRawHeight=(rawPageHeight-2*padding)/scale;
  const covered=new Set(),mergeMap=new Map(),lines=new Map();
  for(const [a,b]of sheet.merges){mergeMap.set(`${a.row}:${a.col}`,[a,b]);for(let r=a.row;r<=b.row;r++)for(let c=a.col;c<=b.col;c++)if(r!==a.row||c!==a.col)covered.add(`${r}:${c}`);}
  // Every printed remark wraps in full. Excel's single-line on-screen styling
  // is intentionally irrelevant to printable row height. Grow before pagination.
  for(const [key,cell]of sheet.cells){if(covered.has(key))continue;const style=model.styles[cell.style],merge=mergeMap.get(key),w=merge?sum(sheet.cols,cell.col-1,merge[1].col):sheet.cols[cell.col-1],size=(style?.size||11)*4/3,wrapped=wrapPrintText(cell.value,Math.max(1,w-8),size,measure);lines.set(key,wrapped);
   if(cell.value&&!merge&&cell.row>sheet.headerRows)sheet.rows[cell.row-1]=Math.max(sheet.rows[cell.row-1],wrapped.length*size*1.18+6);
  }
  const headerHeight=sum(sheet.rows,0,sheet.headerRows),ranges=[];
  if(sheet.view==='summary')ranges.push([1,47],[48,sheet.endRow]);
  else{let start=sheet.headerRows+1;while(start<=sheet.endRow){let end=start,h=headerHeight;while(end<=sheet.endRow&&(h+sheet.rows[end-1]<=maxRawHeight||end===start)){h+=sheet.rows[end-1];end++;}ranges.push([start,end-1]);start=end;}}
  for(const [first,last]of ranges){
   const rowNumbers=sheet.view==='summary'?Array.from({length:last-first+1},(_,i)=>first+i):[...Array.from({length:sheet.headerRows},(_,i)=>i+1),...Array.from({length:last-first+1},(_,i)=>first+i)];
   const paper=doc.createElement('section');paper.className='xlPaper';paper.setAttribute('data-workbook-sheet',sheet.name);
   const svg=add(paper,'svg',{class:'xlSheet',viewBox:`0 0 ${width} ${rawPageHeight}`,width:1122.52,height:793.7,role:'table','aria-label':sheet.name});
   const canvas=add(svg,'g',{transform:`translate(${padding} ${padding}) scale(${scale})`});
   const pageRows=[...sheet.rows],used=rowNumbers.reduce((h,r)=>h+pageRows[r-1],0),extra=maxRawHeight-used;
   // Fill normal class pages to the available paper height, without stretching
   // a short/empty roster into an unreadable oversized table.
   if(sheet.view!=='summary'&&last-first+1>=20&&extra>0&&extra<used*.5){const growth=extra/(last-first+1);for(let r=first;r<=last;r++)pageRows[r-1]+=growth;}
   let y=0;for(const r of rowNumbers){let x=0;for(let c=1;c<=sheet.cols.length;c++){const key=`${r}:${c}`,merge=mergeMap.get(key),w=merge?sum(sheet.cols,c-1,merge[1].col):sheet.cols[c-1],h=merge?sum(pageRows,merge[0].row-1,merge[1].row):pageRows[r-1];if(!covered.has(key)){
     const cell=sheet.cells.get(key),style=model.styles[cell?.style||0],box=add(canvas,'g',{role:'cell','data-row':r,'data-column':c});
     if(style.fill&&style.fill!=='transparent')add(box,'rect',{x,y,width:w,height:h,fill:style.fill});
     const edges={left:[x,y,x,y+h],right:[x+w,y,x+w,y+h],top:[x,y,x+w,y],bottom:[x,y+h,x+w,y+h]};for(const [side,draw]of Object.entries(style.edges||{}))if(draw){const [x1,y1,x2,y2]=edges[side];add(box,'line',{x1,y1,x2,y2,stroke:'#777','stroke-width':.8});}
     if(cell?.value){const size=style.size*4/3,wrapped=lines.get(key)||[''],lineHeight=size*1.18,anchor=style.align==='center'?'middle':style.align==='right'?'end':'start',tx=style.align==='center'?x+w/2:style.align==='right'?x+w-4:x+4,ty=y+Math.max(3,(h-wrapped.length*lineHeight)/2)+size*.85;
      const text=add(box,'text',{fill:style.color||'#111','font-family':'Arial,sans-serif','font-size':size,'font-weight':style.bold?'bold':'normal','text-anchor':anchor});wrapped.forEach((line,i)=>add(text,'tspan',{x:tx,y:ty+i*lineHeight},line));
     }
    }x+=sheet.cols[c-1];}y+=pageRows[r-1];}
   const baseY=sheet.view==='summary'?sum(sheet.rows,0,first-1):0;let contentHeight=y;
   for(const d of sheet.drawings){if(sheet.view==='summary'?(d.row<first-1||d.row>=last):d.row>=sheet.headerRows)continue;const dy=d.y-sum(original.rows,0,d.row)+sum(sheet.rows,0,d.row)-baseY;contentHeight=Math.max(contentHeight,dy+d.height);
    if(d.image)add(canvas,'image',{x:d.x,y:dy,width:d.width,height:d.height,href:d.image,preserveAspectRatio:'none'});
    else if(d.chart){const chart=chartSvg(doc,d.chart,d.width,d.height);chart.setAttribute('x',d.x);chart.setAttribute('y',dy);canvas.appendChild(chart);}
    else{if(d.heading)add(canvas,'rect',{x:d.x,y:dy,width:d.width,height:d.height,fill:'#7f7f7f'});const size=d.heading?18:14;wrapPrintText(d.text,d.width-6,size,measure).forEach((line,i)=>add(canvas,'text',{x:d.x+d.width/2,y:dy+d.height/2+size*.35+i*size*1.15,'text-anchor':'middle','font-family':'Arial,sans-serif','font-size':size,'font-weight':d.heading?'bold':'normal',fill:d.heading?'#fff':'#111'},line));}
   }
   const finalScale=Math.min(scale,(rawPageHeight-2*padding)/contentHeight);
   canvas.setAttribute('transform',`translate(${(width-width*finalScale)/2} ${padding}) scale(${finalScale})`);
   root.appendChild(paper);
  }
 }
 return {element:root,css};
}
