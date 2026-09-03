import { NextResponse } from "next/server";

export const dynamic = "force-static";

const manifest = {
  name: "CRL-App Learner",
  short_name: "CRL-App Learner",
  description:
    "Learner interface for Comprehensive Rapid Literacy Assessment.",
  id: "/learner",
  start_url: "/learner",
  scope: "/learner",
  display: "standalone",
  display_override: ["standalone"],
  orientation: "portrait-primary",
  background_color: "#f8fbff",
  theme_color: "#1559a6",
  lang: "en-PH",
  dir: "ltr",
  categories: ["education"],
  prefer_related_applications: false,
  icons: [
    {
      src: "/icons/icon-192.png",
      sizes: "192x192",
      type: "image/png",
    },
    {
      src: "/icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
    },
    {
      src: "/icons/maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};

export async function GET() {
  return new NextResponse(JSON.stringify(manifest), {
    status: 200,
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
