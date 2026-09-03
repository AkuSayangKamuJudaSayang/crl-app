import LearnerPwaShell from "./LearnerPwaShell";

export const metadata = {
  title: "CRL-App Learner",
  applicationName: "CRL-App Learner",
  description: "CRL-App Learner.",
  manifest: "/learner/manifest.webmanifest",
  alternates: { canonical: "/learner" },
  appleWebApp: {
    capable: true,
    title: "CRL-App Learner",
    statusBarStyle: "default",
  },
};

export default function LearnerLayout({ children }) {
  return <LearnerPwaShell>{children}</LearnerPwaShell>;
}
