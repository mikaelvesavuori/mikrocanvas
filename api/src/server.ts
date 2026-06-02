import { resolve } from "node:path";
import { getConfig, validateConfig } from "./config.js";
import { MikroCanvasDatabase } from "./database/MikroCanvasDatabase.js";
import { AppServer } from "./http/AppServer.js";

const config = getConfig();
const validation = validateConfig(config);

if (!validation.success) {
  console.error("Found configuration validation errors:");

  for (const error of validation.errors) {
    console.error(`- ${error}`);
  }

  process.exit(1);
}

const staticRoot = resolve(
  getArgumentValue("--static-root") ?? process.env.MIKROCANVAS_STATIC_ROOT ?? "dist",
);
const database = new MikroCanvasDatabase(config.databasePath);
database.migrate();

const server = new AppServer({
  config,
  database,
  staticRoot,
});

await server.start();
console.log(`MikroCanvas listening on ${server.getBaseUrl()}`);

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

async function shutdown() {
  await server.stop();
  database.close();
  process.exit(0);
}

function getArgumentValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}
