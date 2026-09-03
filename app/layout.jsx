import { Outfit } from "next/font/google";
import PwaRegister from "./components/PwaRegister";

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-outfit",
  preload: true,
});

export const metadata = {
  title: "CRL-App",
  description:
    "Comprehensive Rapid Literacy Assessment",
  applicationName: "CRL-App",
  generator: "Next.js",
  keywords: [
    "CRL-App",
    "CRLA",
    "Grade 3",
    "reading assessment",
    "literacy assessment",
  ],
  authors: [
    {
      name: "CRL-App",
    },
  ],
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1559a6",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}) {
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
        {children}
      </body>
    </html>
  );
}
