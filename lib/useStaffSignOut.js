'use client';

import { useEffect } from 'react';

const storageKey = role => `crl:staff-signout:${role}`;
function signOutStamp(role) {
  try { return localStorage.getItem(storageKey(role)); } catch { return null; }
}

export function leaveStaffDashboard(role, loginPath) {
  try { localStorage.setItem(storageKey(role), String(Date.now())); } catch {}
  window.location.replace(loginPath);
}

export function useStaffSignOut(role, loginPath) {
  useEffect(() => {
    const initialStamp = signOutStamp(role);
    const onStorage = event => {
      if (event.key === storageKey(role) && event.newValue) window.location.replace(loginPath);
    };
    const onPageShow = event => {
      if (event.persisted && signOutStamp(role) !== initialStamp) window.location.replace(loginPath);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [role, loginPath]);
}
