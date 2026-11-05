'use client';
import {useEffect} from 'react';
import {registerLearnerServiceWorker,watchLearnerWorker} from '../lib/learnerWorker';
export default function InstallRuntime({app}){useEffect(()=>{if(app!=='learner')return;let cancelled=false,stop=()=>{};void registerLearnerServiceWorker().then(registration=>{if(!cancelled&&registration)stop=watchLearnerWorker(registration);});return()=>{cancelled=true;stop();};},[app]);return null;}
