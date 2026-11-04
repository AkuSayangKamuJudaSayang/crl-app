"use client";
import AppInstallButton from '../../components/AppInstallButton';
export default function TeacherDownloadButton({className}) {
  return <AppInstallButton app="teacher" className={className} label="Download teacher app">Download</AppInstallButton>;
}
