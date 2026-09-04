import { NextResponse } from "next/server";

export const dynamic = "force-static";

const manifest = {
  name: "CRL-App Learner",
  short_name: "CRL-App Learner",
  description: "CRL-App Learner assessment application.",
  id: "/learner-app",
  start_url: "/learner",
  scope: "/learner",
  display: "standalone",
  display_override: ["standalone", "minimal-ui"],
  orientation: "any",
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
      purpose: "any",
    },
    {
      src: "/icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
};

export function GET() {
  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=300, must-revalidate",
      "Content-Type": "application/manifest+json; charset=utf-8",
    },
  });
}
