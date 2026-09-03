export const metadata = {
  title: "CRL-App Learner",
  applicationName: "CRL-App Learner",
  description:
    "Learner interface for Comprehensive Rapid Literacy Assessment.",
  manifest: "/learner/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "CRL-App Learner",
    statusBarStyle: "default",
  },
  other: {
    "mobile-web-app-capable": "yes",
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
  return children;
}
