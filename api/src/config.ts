import { existsSync, readFileSync } from "node:fs";

const defaultConfigPath = "mikrocanvas.config.json";
const defaultDatabasePath = "data/mikrocanvas.sqlite";

export interface MikroCanvasConfig {
  adminToken: string;
  appUrl: string;
  databasePath: string;
  host: string;
  port: number;
}

export interface ConfigValidationResult {
  errors: string[];
  success: boolean;
}

export function getConfig(args = process.argv): MikroCanvasConfig {
  return normalizeConfig({
    ...defaultConfig(),
    ...readConfigFile(resolveConfigPath(args)),
    ...readEnvOverrides(),
    ...readArgumentOverrides(args),
  });
}

export function validateConfig(config: MikroCanvasConfig): ConfigValidationResult {
  const errors: string[] = [];

  requireText(errors, "appUrl", config.appUrl);
  requireText(errors, "databasePath", config.databasePath);
  requireText(errors, "host", config.host);

  if (config.adminToken && config.adminToken.length < 24) {
    errors.push("adminToken must contain at least 24 characters when set.");
  }

  if (config.appUrl && !isValidUrl(config.appUrl)) {
    errors.push("appUrl must be a valid URL.");
  }

  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) {
    errors.push("port must be an integer between 0 and 65535.");
  }

  return {
    errors,
    success: errors.length === 0,
  };
}

function defaultConfig(): MikroCanvasConfig {
  return {
    adminToken: "",
    appUrl: "http://127.0.0.1:3000",
    databasePath: defaultDatabasePath,
    host: "127.0.0.1",
    port: 3000,
  };
}

function readConfigFile(path: string): Partial<MikroCanvasConfig> {
  if (!existsSync(path)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as Partial<MikroCanvasConfig>;
  } catch {
    return {};
  }
}

function readEnvOverrides(): Partial<MikroCanvasConfig> {
  return compact({
    adminToken: readEnv(["MIKROCANVAS_ADMIN_TOKEN", "ADMIN_TOKEN"]),
    appUrl: readEnv(["MIKROCANVAS_APP_URL", "APP_URL"]),
    databasePath: readEnv(["MIKROCANVAS_DB_PATH", "DATABASE_PATH"]),
    host: readEnv(["MIKROCANVAS_HOST", "HOST"]),
    port: readEnvNumber(["MIKROCANVAS_PORT", "PORT"]),
  });
}

function readArgumentOverrides(args: string[]): Partial<MikroCanvasConfig> {
  return compact({
    adminToken: readArgument(args, ["--admin-token", "--adminToken"]),
    appUrl: readArgument(args, ["--app-url", "--appUrl"]),
    databasePath: readArgument(args, ["--database-path", "--databasePath"]),
    host: readArgument(args, ["--host"]),
    port: numberFromString(readArgument(args, ["--port"])),
  });
}

function normalizeConfig(config: Partial<MikroCanvasConfig>): MikroCanvasConfig {
  const defaults = defaultConfig();

  return {
    adminToken: typeof config.adminToken === "string" ? config.adminToken.trim() : "",
    appUrl: textOrDefault(config.appUrl, defaults.appUrl),
    databasePath: textOrDefault(config.databasePath, defaults.databasePath),
    host: textOrDefault(config.host, defaults.host),
    port: Number.isInteger(config.port) ? Number(config.port) : defaults.port,
  };
}

function resolveConfigPath(args: string[]): string {
  return readArgument(args, ["--config", "--config-path", "--configPath"]) ?? defaultConfigPath;
}

function readEnv(names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) {
      return value;
    }
  }

  return undefined;
}

function readEnvNumber(names: string[]): number | undefined {
  return numberFromString(readEnv(names));
}

function readArgument(args: string[], names: string[]): string | undefined {
  for (const name of names) {
    const index = args.indexOf(name);
    if (index >= 0) {
      return args[index + 1];
    }
  }

  return undefined;
}

function numberFromString(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const number = Number(value);
  return Number.isInteger(number) ? number : undefined;
}

function compact<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && value !== ""),
  ) as Partial<T>;
}

function textOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function requireText(errors: string[], name: string, value: string): void {
  if (!value.trim()) {
    errors.push(`${name} is required.`);
  }
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
