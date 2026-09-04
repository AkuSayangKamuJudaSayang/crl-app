export const metadata = {
  title: "CRL-App Learner",
  applicationName: "CRL-App Learner",
  description: "Install CRL-App Learner.",
  manifest: "/learner/download/manifest.webmanifest?v=20260904-7",
  alternates: { canonical: "/learner/download" },
  appleWebApp: {
    capable: true,
    title: "CRL-App Learner",
    statusBarStyle: "default",
  },
};

export default function LearnerDownloadLayout({ children }) {
  return children;
}
