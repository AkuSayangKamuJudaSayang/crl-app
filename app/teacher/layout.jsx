import AppLoadingScreen from "../components/AppLoadingScreen";
import TeacherOfflineMenuCompactV3 from "../components/TeacherOfflineMenuCompactV3";
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
      <TeacherOfflineMenuCompactV3 />
      <OfflineReportRuntime />
      {children}
    </>
  );
}
