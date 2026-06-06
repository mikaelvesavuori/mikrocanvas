export type RuntimeMode = "api" | "local";

export interface RuntimeConfig {
  apiBaseUrl: string;
  boardSnapshots: {
    enabled: boolean;
  };
  mode: RuntimeMode;
}

export function createDefaultRuntimeConfig(): RuntimeConfig {
  return {
    apiBaseUrl: ".",
    boardSnapshots: {
      enabled: false,
    },
    mode: "local",
  };
}

export async function loadRuntimeConfig(fetcher: typeof fetch = fetch): Promise<RuntimeConfig> {
  const defaults = createDefaultRuntimeConfig();

  try {
    const response = await fetcher("./config.json", { cache: "no-store" });
    if (!response.ok) {
      return defaults;
    }

    return normalizeRuntimeConfig(await response.json(), defaults);
  } catch {
    return defaults;
  }
}

export function normalizeRuntimeConfig(
  input: unknown,
  defaults = createDefaultRuntimeConfig(),
): RuntimeConfig {
  if (!input || typeof input !== "object") {
    return defaults;
  }

  const source = input as Partial<RuntimeConfig>;
  const mode = source.mode === "api" ? "api" : "local";
  const apiBaseUrl =
    typeof source.apiBaseUrl === "string" && source.apiBaseUrl.trim()
      ? source.apiBaseUrl.trim()
      : defaults.apiBaseUrl;
  const boardSnapshots: Partial<RuntimeConfig["boardSnapshots"]> =
    source.boardSnapshots && typeof source.boardSnapshots === "object" ? source.boardSnapshots : {};

  return {
    apiBaseUrl,
    boardSnapshots: {
      enabled: mode === "api" && boardSnapshots.enabled !== false,
    },
    mode,
  };
}
