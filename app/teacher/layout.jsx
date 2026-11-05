import TeacherAssessmentRecovery from "../../components/TeacherAssessmentRecovery";
import TeacherOfflineMenuOSGate from "../components/TeacherOfflineMenuOSGate";
import TeacherOfflinePreload from "../components/TeacherOfflinePreload";
import OfflineReportRuntime from "../components/OfflineReportRuntime";
import PwaBackGuard from "../components/PwaBackGuard";
import OfflineSyncPrompt from "../components/OfflineSyncPrompt";
import AppTextSelectionGuard from "../../components/AppTextSelectionGuard";

export const metadata = {
  title: "CRL-App Teacher",
  applicationName: "CRL-App Teacher",
  description: "CRL-App teacher assessment workspace.",
  manifest: "/teacher-manifest.webmanifest",
  appleWebApp:{capable:true,title:"CRL-App Teacher",statusBarStyle:"default"},
  icons:{apple:[{url:"/icons/teacher-180.png",sizes:"180x180",type:"image/png"}]},
};

export default function TeacherLayout({
  children,
}) {
  return (
    <>
      <AppTextSelectionGuard />
      <TeacherOfflinePreload />
      <TeacherOfflineMenuOSGate />
      <OfflineReportRuntime />
      <PwaBackGuard />
      <OfflineSyncPrompt />
      <TeacherAssessmentRecovery>{children}</TeacherAssessmentRecovery>
    </>
  );
}
