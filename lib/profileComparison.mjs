import {READING_PROFILE_LABELS} from './recordViewModel.mjs';
export const COMPARISON_PERIODS=['BoSY','MoSY','EoSY'];
export const COMPARISON_OPTIONS=[{value:'all',label:'All 3'},{value:'BoSY-MoSY',label:'BoSY–MoSY'},{value:'MoSY-EoSY',label:'MoSY–EoSY'},{value:'BoSY-EoSY',label:'BoSY–EoSY'}];
export const PERIOD_COLORS={BoSY:'#426dab',MoSY:'#8e64b1',EoSY:'#388266'};
export function profileComparisonData(periods,selection='all'){
 const option=COMPARISON_OPTIONS.find(o=>o.value===selection)||COMPARISON_OPTIONS[0];
 const names=option.value==='all'?COMPARISON_PERIODS:option.value.split('-');
 const selected=names.map(name=>{const source=(Array.isArray(periods)?periods:[]).find(p=>p?.period===name);return {period:name,total:Math.max(0,Number(source?.total)||0),profiles:Array.isArray(source?.profiles)?source.profiles:[]};});
 const rows=READING_PROFILE_LABELS.map(label=>({label,values:selected.map(p=>{const raw=Number(p.profiles.find(v=>v.label===label)?.count??0);return {period:p.period,assessed:p.total>0,count:p.total>0?(Number.isSafeInteger(raw)&&raw>=0?raw:0):null};})}));
 const largest=Math.max(1,...rows.flatMap(r=>r.values.map(v=>v.count||0)));
 const rough=largest/4,magnitude=10**Math.floor(Math.log10(rough));
 const step=[1,2,2.5,5,10].map(n=>Math.max(1,Math.ceil(n*magnitude))).find(n=>n>=rough)||Math.ceil(rough);
 const max=Math.ceil(largest/step)*step,ticks=Array.from({length:Math.round(max/step)+1},(_,i)=>i*step);
 return {selected,rows,max,ticks,hasData:selected.some(p=>p.total>0)};
}
