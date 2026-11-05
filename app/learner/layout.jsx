import LearnerPwaShell from "./LearnerPwaShell";

export const metadata = {
  title: "CRL-App Learner",
  applicationName: "CRL-App Learner",
  description: "CRL-App Learner classroom assessment app.",
  manifest: "/learner-manifest.webmanifest",
  icons:{apple:[{url:"/icons/learner-180.png",sizes:"180x180",type:"image/png"}]},
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
