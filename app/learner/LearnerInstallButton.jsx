"use client";
import {createPortal} from 'react-dom';
import {useEffect,useState} from 'react';
import AppInstallButton from '../../components/AppInstallButton';

export default function LearnerInstallButton(){
 const [mount,setMount]=useState(null);
 useEffect(()=>{
  let created;
  const sync=()=>{
   const card=Array.from(document.querySelectorAll('.card')).find(node=>node.querySelector('.title')?.textContent?.trim()==='Join Assessment'&&node.querySelector('button.primary'));
   if(!card){setMount(null);return;}
   let node=card.nextElementSibling;
   if(!node?.classList.contains('learner-install-mount')){node=document.createElement('div');node.className='learner-install-mount';card.insertAdjacentElement('afterend',node);created=node;}
   setMount(node);
  };
  sync();const observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  return()=>{observer.disconnect();created?.remove();};
 },[]);
 return mount?createPortal(<div style={{display:'flex',justifyContent:'center',padding:'14px 0'}}><AppInstallButton app="learner"/></div>,mount):null;
}
