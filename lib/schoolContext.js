import {AsyncLocalStorage} from 'node:async_hooks';
// Request-local only. Never read a school identifier from submitted API bodies.
export const schoolContext=new AsyncLocalStorage();
export function schoolScope(){return schoolContext.getStore()?.schoolId||null;}
let savepointSequence=0;
export function scopedClient(client,schoolId){
 const delegates=new Map();
 return new Proxy(client,{get(target,key){
  if(key==='$transaction')return async work=>{
   if(typeof work!=='function')return Promise.all(work);
   // Nested mutations share the restricted request connection, with a real
   // savepoint so a handled validation error cannot commit half a mutation.
   if(typeof target.$executeRawUnsafe!=='function')return work(scopedClient(target,schoolId));
   const point=`crl_scope_${++savepointSequence}`;await target.$executeRawUnsafe(`SAVEPOINT ${point}`);
   try{const result=await work(scopedClient(target,schoolId));await target.$executeRawUnsafe(`RELEASE SAVEPOINT ${point}`);return result;}catch(e){await target.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${point}`);await target.$executeRawUnsafe(`RELEASE SAVEPOINT ${point}`);throw e;}
  };
  const value=target[key];
  if(typeof value==='function')return value.bind(target);
  if(!value||typeof value!=='object'||typeof key!=='string'||key.startsWith('$'))return value;
  if(!delegates.has(key))delegates.set(key,new Proxy(value,{get(model,method){const call=model[method];if(typeof call!=='function')return call;return args=>{
   const compound=key==='assessmentLibraryHead'?['period','schoolId_period']:key==='globalSchoolYear'?['startYear','schoolId_startYear']:null;
   let operation=method,options=args;
   if(compound&&args?.where&&Object.hasOwn(args.where,compound[0])){
    options={...args,where:{[compound[1]]:{schoolId,[compound[0]]:args.where[compound[0]]}}};
   }
   if(['create','upsert'].includes(method)&&['assessmentLibraryHead','assessmentLibraryRevision','globalSchoolYear','schoolYear','inviteCode','schoolSection','schoolAssessment'].includes(key)){
    const field=method==='upsert'?'create':'data';options={...options,[field]:{...options[field],schoolId}};
   }
   return model[operation](options);
  };}}));return delegates.get(key);
 }});
}
