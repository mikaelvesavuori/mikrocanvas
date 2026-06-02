import { getConfig, validateConfig } from "../../api/src/config.js";

describe("MikroCanvas API config", () => {
  it("reads CLI overrides", () => {
    const config = getConfig([
      "node",
      "server",
      "--config",
      "missing-config.json",
      "--host",
      "0.0.0.0",
      "--port",
      "0",
      "--app-url",
      "http://127.0.0.1:4173",
      "--database-path",
      ":memory:",
    ]);

    expect(config).toMatchObject({
      appUrl: "http://127.0.0.1:4173",
      databasePath: ":memory:",
      host: "0.0.0.0",
      port: 0,
    });
  });

  it("validates required network settings", () => {
    const result = validateConfig({
      appUrl: "not-a-url",
      databasePath: "",
      host: "",
      port: 70_000,
    });

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "appUrl must be a valid URL.",
        "databasePath is required.",
        "host is required.",
        "port must be an integer between 0 and 65535.",
      ]),
    );
  });
});
