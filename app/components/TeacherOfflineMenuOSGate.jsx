"use client";
import TeacherOfflineMenuV2 from './TeacherOfflineMenuV2';
// Browser capability and platform instructions decide installation. Never hide
// retry/help because of an appinstalled event or block unrecognized device UAs.
export default function TeacherOfflineMenuOSGate(){return <TeacherOfflineMenuV2/>;}
