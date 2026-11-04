"use client";
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import AppInstallButton from '../../components/AppInstallButton';
export default function TeacherOfflineMenuV2(){
 const [mount,setMount]=useState(null);
 useEffect(()=>{
  let created;
  const sync=()=>{const nav=document.querySelector('.nav');if(!nav)return;let node=nav.querySelector('.crl-download-nav-mount-v2');if(!node){node=document.createElement('div');node.className='crl-download-nav-mount-v2';nav.appendChild(node);created=node;}setMount(node);};
  sync();const observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true});
  return()=>{observer.disconnect();created?.remove();};
 },[]);
 return mount?createPortal(<AppInstallButton app="teacher" className="navButton crl-download-nav-button" label="Download CRL-App">Download CRL-App</AppInstallButton>,mount):null;
}
