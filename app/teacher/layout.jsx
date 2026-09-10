import AppLoadingScreen from "../components/AppLoadingScreen";
import TeacherOfflineMenuOSGate from "../components/TeacherOfflineMenuOSGate";
import TeacherOfflinePreload from "../components/TeacherOfflinePreload";
import OfflineReportRuntime from "../components/OfflineReportRuntime";

export const metadata = {
  title: "CRL-App Teacher",
  applicationName: "CRL-App Teacher",
  description: "CRL-App teacher assessment workspace.",
};

export default function TeacherLayout({
  children,
}) {
  return (
    <>
      <AppLoadingScreen />
      <TeacherOfflinePreload />
      <TeacherOfflineMenuOSGate />
      <OfflineReportRuntime />
      {children}
    </>
  );
}
