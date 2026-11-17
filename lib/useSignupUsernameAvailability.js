'use client';
import {useEffect, useState} from 'react';
import {isValidRegistrationUsername, normalizeRegistrationUsername} from './registrationValidation.mjs';

// Advisory feedback only; the server transaction and unique index always decide.
export function useSignupUsernameAvailability(rawUsername, enabled) {
  const username=normalizeRegistrationUsername(rawUsername);
  const [check,setCheck]=useState({username:'',status:'idle'});
  useEffect(()=>{
    if(!enabled||!isValidRegistrationUsername(username)){
      setCheck({username,status:'idle'});
      return;
    }
    const controller=new AbortController();
    let current=true;
    setCheck({username,status:'checking'});
    const timeout=setTimeout(async()=>{
      try {
        const response=await fetch('/api/access?action=username_available&username='+encodeURIComponent(username),{
          cache:'no-store',signal:controller.signal,credentials:'omit'
        });
        if(!response.ok)throw Error('Availability check failed');
        const data=await response.json();
        if(typeof data.available!=='boolean')throw Error('Invalid availability response');
        if(current)setCheck({username,status:data.available?'available':'taken'});
      }catch(error){
        if(current&&error?.name!=='AbortError')setCheck({username,status:'error'});
      }
    },450);
    return()=>{current=false;clearTimeout(timeout);controller.abort();};
  },[enabled,username]);
  const status=!enabled||!username?'idle'
    :!isValidRegistrationUsername(username)?'invalid'
    :check.username===username?check.status:'checking';
  const messages={
    idle:'',
    invalid:'Use 3–50 letters, numbers, periods, underscores, or hyphens.',
    checking:'Checking username availability…',
    available:'Username is available.',
    taken:'This username is already registered. Choose another username.',
    error:'Unable to check availability. Registration will verify this username when submitted.'
  };
  return {status,message:messages[status],unavailable:status==='taken'};
}
