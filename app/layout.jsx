import { Outfit } from "next/font/google";
import PwaRegister from "./components/PwaRegister";
import DataEpochBoundary from "../components/DataEpochBoundary";
import PolicyConsentGate from "./components/PolicyConsentGate";

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-outfit",
  preload: true,
});

export const metadata = {
  title: "CRL-App",
  description: "Comprehensive Rapid Literacy Assessment",
  applicationName: "CRL-App Teacher",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "CRL-App Teacher",
    statusBarStyle: "default",
  },
  icons: {icon: [{url:"/icons/icon-192.png",sizes:"192x192",type:"image/png"}],apple:[{url:"/icons/icon-192.png",sizes:"192x192",type:"image/png"}]},
  generator: "Next.js",
  keywords: [
    "CRL-App",
    "CRLA",
    "Grade 3",
    "reading assessment",
    "literacy assessment",
  ],
  authors: [{ name: "CRL-App" }],
  formatDetection: { telephone: false },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1559a6",
  colorScheme: "light",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={outfit.variable}
      suppressHydrationWarning
    >
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#f8fbff",
          overscrollBehaviorY: "none",
        }}
      >
        <PwaRegister />
        <DataEpochBoundary><PolicyConsentGate>{children}</PolicyConsentGate></DataEpochBoundary>
      </body>
    </html>
  );
}
