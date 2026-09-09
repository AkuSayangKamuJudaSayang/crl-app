import AppLoadingScreen from "../components/AppLoadingScreen";

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
      {children}
    </>
  );
}
