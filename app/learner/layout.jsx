import LearnerPwaShell from "./LearnerPwaShell";

export const metadata = {
  title: "CRL-App Learner",
  applicationName: "CRL-App Learner",
  description: "CRL-App Learner classroom assessment app.",
  manifest: "/learner/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "CRL-App Learner",
    statusBarStyle: "default",
  },
};

export default function LearnerLayout({ children }) {
  return <LearnerPwaShell>{children}</LearnerPwaShell>;
}
