const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
(async()=>{
 const ctx=vm.createContext({React,...React,styles:new Proxy({},{get:(_,key)=>String(key)}),crypto:require('crypto'),document:{},createPortal:child=>child});
 for(const name of ['ClassDialog','ArchiveImport','LearnerArchiveRestore','ClassWorkspace']){
 let source=fs.readFileSync(`components/${name}.jsx`,'utf8').replace(/^import[^;]+;\s*/gm,'').replace('export default function','function');
 const {code}=await require('next/dist/build/swc').transform(source,{filename:name+'.jsx',jsc:{parser:{syntax:'ecmascript',jsx:true},transform:{react:{runtime:'classic'}}}});vm.runInContext(code,ctx);
 }
 Object.assign(ctx,await import('../lib/classWorkspace.mjs'));
 const catalog={schoolYears:[{id:'y',label:'2026-2027',startYear:2026}],sections:[{id:'s',schoolYearId:'y',name:'Mars'}],archives:[]};
 const base={catalog,loaded:true,choosing:true,mode:'records',api:async()=>{},onCatalog(){},onReload(){},onChoose(){},onYearChoose(){}};
 let html=renderToStaticMarkup(React.createElement(ctx.ClassWorkspace,base));assert.ok(html.includes('Import school year'));assert.ok(!html.includes('Import section'));
 html=renderToStaticMarkup(React.createElement(ctx.ClassWorkspace,{...base,selectedYearId:'y'}));assert.ok(html.includes('Import section'));assert.ok(!html.includes('Import school year'));
 for(const kind of ['school_year','section']){html=renderToStaticMarkup(React.createElement(ctx.ArchiveImport,{kind,catalog,onBusy(){}}));assert.ok(html.includes('multiple=""'));assert.ok(html.includes('browse files on your device'));assert.ok(html.includes('dropZone'));}
 html=renderToStaticMarkup(React.createElement(ctx.LearnerArchiveRestore,{catalog,items:[{id:'a',learnerName:'SYNTHETIC',sourceSectionId:'gone',schoolYearLabel:'2001-2002',sectionName:'Deleted'}]}));assert.ok(html.includes('Select all available learners'));assert.ok(html.includes('Choose School Year'));assert.ok(html.includes('Choose Section'));assert.ok(html.includes('Restore selected (1)'));
 const css=fs.readFileSync('components/ClassWorkspace.module.css','utf8');assert.ok(css.includes('@media(max-width:600px)'));assert.ok(css.includes('width:100%'));assert.ok(css.includes('overflow-wrap:anywhere'));assert.ok(css.includes('html[data-crl-theme=dark]'));
 console.log('PASS actual archive components render distinct chooser imports, multi-file drop/browse, group/individual selection, destination year/section and responsive/dark-theme rules');
})().catch(e=>{console.error(e);process.exitCode=1});
