import AppLoadingScreen from "../components/AppLoadingScreen";
import TeacherOfflineMenu from "../components/TeacherOfflineMenu";
import TeacherOfflinePreload from "../components/TeacherOfflinePreload";

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
      <TeacherOfflineMenu />
      {children}
    </>
  );
}
