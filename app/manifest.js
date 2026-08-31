export default function manifest() {
  return {
    name: "CRL-App",
    short_name: "CRL-App",
    description:
      "Comprehensive Rapid Literacy Assessment for Grade 3 learners.",
    id: "/",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f8fbff",
    theme_color: "#1559a6",
    lang: "en-PH",
    dir: "ltr",
    categories: [
      "education",
      "productivity"
    ],
    prefer_related_applications: false
  };
}