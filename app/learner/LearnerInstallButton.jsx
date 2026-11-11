"use client";
import {createPortal} from 'react-dom';
import {useEffect,useState} from 'react';
import AppInstallButton from '../../components/AppInstallButton';
import { isStandalonePwa } from '../../lib/pwaInstall';

export default function LearnerInstallButton(){
 const [mount,setMount]=useState(null);
 const [installed,setInstalled]=useState(false);
 useEffect(()=>{
  let created;
  const sync=()=>{
   // Huawei Browser may launch an installed shortcut without exposing display-mode:standalone.
   const huawei=/HarmonyOS|OpenHarmony|HMOS|HuaweiBrowser|HUAWEI|HONOR/i.test(navigator.userAgent || '');
   setInstalled(isStandalonePwa() || huawei);
   const card=Array.from(document.querySelectorAll('.card')).find(node=>node.querySelector('.title')?.textContent?.trim()==='Join Assessment'&&node.querySelector('button.primary'));
   if(!card){setMount(null);return;}
   let node=card.nextElementSibling;
   if(!node?.classList.contains('learner-install-mount')){node=document.createElement('div');node.className='learner-install-mount';card.insertAdjacentElement('afterend',node);created=node;}
   setMount(node);
  };
  sync();const observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  const refresh=()=>sync();
  window.addEventListener('pageshow',refresh);window.addEventListener('appinstalled',refresh);
  return()=>{observer.disconnect();window.removeEventListener('pageshow',refresh);window.removeEventListener('appinstalled',refresh);created?.remove();};
 },[]);
 return mount&&!installed?createPortal(<div style={{display:'flex',justifyContent:'center',padding:'14px 0'}}><AppInstallButton app="learner"/></div>,mount):null;
}
