import AppLoadingScreen from "../components/AppLoadingScreen";
import TeacherOfflineMenuV3 from "../components/TeacherOfflineMenuV3";
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
      <TeacherOfflineMenuV3 />
      <OfflineReportRuntime />
      {children}
    </>
  );
}
