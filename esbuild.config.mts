import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { build } from "esbuild";

const srcDir = "src";
const uiDir = join(srcDir, "ui");
const publicDir = join(srcDir, "public");
const distDir = "dist";
const assetsDir = join(distDir, "assets");
const packageVersion = JSON.parse(readFileSync("./package.json", "utf8")).version as string;
const skippedExtensions = new Set([".css", ".html", ".js", ".mjs", ".ts", ".mts"]);
const skippedNames = new Set([".DS_Store", "Thumbs.db"]);

async function buildApp() {
  await build({
    entryPoints: [{ in: "./src/presentation/main.ts", out: "main" }],
    outdir: assetsDir,
    bundle: true,
    format: "esm",
    minify: true,
    platform: "browser",
    sourcemap: false,
    target: ["chrome109", "safari16", "edge109", "firefox109"],
    treeShaking: true,
    banner: {
      js: `/* MikroCanvas v${packageVersion} | ${new Date().toISOString()} */`,
    },
  });
}

function copyFile(source: string, target: string) {
  mkdirSync(target.slice(0, target.lastIndexOf("/")), { recursive: true });
  cpSync(source, target);
}

function copyStatic(sourceDir: string, targetDir: string) {
  try {
    statSync(sourceDir);
  } catch {
    return;
  }

  for (const entry of readdirSync(sourceDir)) {
    if (skippedNames.has(entry) || entry.startsWith(".")) {
      continue;
    }

    const sourcePath = join(sourceDir, entry);
    const targetPath = join(targetDir, entry);
    const stats = statSync(sourcePath);
    if (stats.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      copyStatic(sourcePath, targetPath);
      continue;
    }

    if (!skippedExtensions.has(extname(entry))) {
      copyFile(sourcePath, targetPath);
    }
  }
}

async function main() {
  const startedAt = Date.now();
  rmSync(distDir, { force: true, recursive: true });
  mkdirSync(assetsDir, { recursive: true });

  await buildApp();
  copyFile(join(uiDir, "styles.css"), join(assetsDir, "styles.css"));
  copyFile(join(uiDir, "index.html"), join(distDir, "index.html"));
  copyStatic(uiDir, distDir);
  copyStatic(publicDir, distDir);

  const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(2);
  console.log(`Build completed in ${durationSeconds}s`);
  console.log("Output:");
  console.log(`  ${relative(process.cwd(), join(distDir, "index.html"))}`);
  console.log(`  ${relative(process.cwd(), join(assetsDir, "main.js"))}`);
}

main().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
