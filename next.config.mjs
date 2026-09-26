/** @type {import("next").NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    "/api/reports/excel": [
      "./public/templates/CRLA3_Grade3Scoresheet_v3.class-summary-charts-v2.gz.b64",
    ],
  },
};

export default nextConfig;
