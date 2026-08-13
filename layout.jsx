import { Outfit } from "next/font/google";

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-outfit",
});

export const metadata = {
  title: "CRL-App",
  description:
    "Comprehensive Rapid Literacy Assessment",
};

export default function RootLayout({
  children,
}) {
  return (
    <html
      lang="en"
      className={outfit.variable}
    >
      <body>{children}</body>
    </html>
  );
}
