import LearnerInstallRecovery from "./LearnerInstallRecovery";

export const metadata = {
  title: "CRL-App Learner",
  applicationName: "CRL-App Learner",
  description: "Install CRL-App Learner.",
  manifest: "/learner-manifest.webmanifest?v=20260912-1",
  alternates: { canonical: "/learner/download" },
  appleWebApp: {
    capable: true,
    title: "CRL-App Learner",
    statusBarStyle: "default",
  },
};

export default function LearnerDownloadLayout({ children }) {
  return (
    <>
      {children}
      <LearnerInstallRecovery />
    </>
  );
}
