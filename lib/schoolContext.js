import {AsyncLocalStorage} from 'node:async_hooks';
// Request-local only. Never read a school identifier from submitted API bodies.
export const schoolContext=new AsyncLocalStorage();
export function schoolScope(){return schoolContext.getStore()?.schoolId||null;}
export function scopedClient(client,schoolId){
 const delegates=new Map();
 return new Proxy(client,{get(target,key){
  if(key==='$transaction')return async work=>typeof work==='function'?work(scopedClient(target,schoolId)):Promise.all(work);
  const value=target[key];
  if(typeof value==='function')return value.bind(target);
  if(!value||typeof value!=='object'||typeof key!=='string'||key.startsWith('$'))return value;
  if(!delegates.has(key))delegates.set(key,new Proxy(value,{get(model,method){const call=model[method];if(typeof call!=='function')return call;return args=>{
   const compound=key==='assessmentLibraryHead'?['period','schoolId_period']:key==='globalSchoolYear'?['startYear','schoolId_startYear']:null;
   let operation=method,options=args;
   if(compound&&args?.where&&Object.hasOwn(args.where,compound[0])){
    options={...args,where:{[compound[1]]:{schoolId,[compound[0]]:args.where[compound[0]]}}};
   }
   if(['create','upsert'].includes(method)&&['assessmentLibraryHead','assessmentLibraryRevision','globalSchoolYear','schoolYear','inviteCode'].includes(key)){
    const field=method==='upsert'?'create':'data';options={...options,[field]:{...options[field],schoolId}};
   }
   return model[operation](options);
  };}}));return delegates.get(key);
 }});
}
