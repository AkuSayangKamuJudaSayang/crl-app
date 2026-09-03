export default function manifest() {
  return {
    name: "CRL-App",
    short_name: "CRL-App",
    description: "Comprehensive Rapid Literacy Assessment.",
    id: "/",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    display_override: ["standalone"],
    orientation: "portrait-primary",
    background_color: "#f8fbff",
    theme_color: "#1559a6",
    lang: "en-PH",
    dir: "ltr",
    categories: ["education", "productivity"],
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
}
