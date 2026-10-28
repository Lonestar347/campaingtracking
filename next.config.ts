import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // KPI report uploads (max. 10 MB, see src/lib/kpi-import/parse-file.ts) go through server actions.
    serverActions: { bodySizeLimit: "11mb" },
  },
  // exceljs is a Node library; keep it out of the server bundle.
  serverExternalPackages: ["exceljs"],
};

export default nextConfig;
