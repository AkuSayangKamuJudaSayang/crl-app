import AppLoadingScreen from "../components/AppLoadingScreen";
import TeacherOfflineMenu from "../components/TeacherOfflineMenu";

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
      <TeacherOfflineMenu />
      {children}
    </>
  );
}
