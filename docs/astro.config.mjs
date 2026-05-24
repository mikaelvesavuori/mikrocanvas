// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://mikrosuite.com",
  base: "/canvas/docs",
  integrations: [
    starlight({
      title: "MikroCanvas Docs",
      description: "Documentation for the local-first MikroCanvas visual canvas.",
      favicon: "/favicon.svg",
      customCss: ["./src/styles/custom.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/mikaelvesavuori/mikrocanvas",
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "What is MikroCanvas?", slug: "getting-started/intro" },
            { label: "Installation", slug: "getting-started/installation" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Configuration", slug: "guides/configuration" },
            { label: "Authentication", slug: "guides/authentication" },
            { label: "Working on the Canvas", slug: "guides/canvas-basics" },
            { label: "Import and Export", slug: "guides/import-export" },
            { label: "Local Data and Backups", slug: "guides/local-data" },
            { label: "Deployment", slug: "guides/deployment" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Comparison", slug: "reference/comparison" },
            {
              label: "Privacy and Security",
              slug: "reference/privacy-security",
            },
            { label: "Architecture", slug: "reference/architecture" },
          ],
        },
      ],
    }),
  ],
});
