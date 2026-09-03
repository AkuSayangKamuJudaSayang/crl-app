import LearnerPwaGuard from "./LearnerPwaGuard";

export const metadata = {
  title: "CRL-App Learner",
  applicationName: "CRL-App Learner",
  description:
    "Learner interface for Comprehensive Rapid Literacy Assessment.",
  manifest: "/learner-manifest.webmanifest?v=20260903-2",
  appleWebApp: {
    capable: true,
    title: "CRL-App Learner",
    statusBarStyle: "default",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1559a6",
  colorScheme: "light",
};

export default function LearnerLayout({ children }) {
  return (
    <>
      <LearnerPwaGuard />
      {children}
    </>
  );
}
