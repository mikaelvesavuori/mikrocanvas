import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MikroCanvasDatabase } from "../../api/src/database/MikroCanvasDatabase.js";
import { AppServer } from "../../api/src/http/AppServer.js";
import { Board } from "../../src/domain/index.js";

describe("AppServer", () => {
  let database: MikroCanvasDatabase;
  let server: AppServer;
  let staticRoot: string;

  beforeEach(async () => {
    staticRoot = mkdtempSync(join(tmpdir(), "mikrocanvas-static-"));
    writeFileSync(join(staticRoot, "index.html"), "<!doctype html><title>MikroCanvas</title>");
    writeFileSync(join(staticRoot, "main.js"), "console.log('mikrocanvas');");
    database = new MikroCanvasDatabase(":memory:");
    database.migrate();
    server = new AppServer({
      config: {
        adminToken: "test-admin-token-with-enough-length",
        appUrl: "http://127.0.0.1:0",
        databasePath: ":memory:",
        host: "127.0.0.1",
        port: 0,
      },
      database,
      staticRoot,
    });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    database.close();
    rmSync(staticRoot, { force: true, recursive: true });
  });

  it("serves runtime config and health checks", async () => {
    const configResponse = await fetch(`${server.getBaseUrl()}/config.json`);
    const healthResponse = await fetch(`${server.getBaseUrl()}/api/health`);

    expect(configResponse.status).toBe(200);
    expect(await configResponse.json()).toMatchObject({
      apiBaseUrl: server.getBaseUrl(),
      boardSnapshots: { enabled: true },
      mode: "api",
    });
    expect(await healthResponse.json()).toMatchObject({
      service: "mikrocanvas-api",
      status: "healthy",
    });
  });

  it("publishes and loads board snapshots by ID without exposing a board directory", async () => {
    const board = Board.create("Shared sketch", "2026-01-01T00:00:00.000Z");
    const boardUrl = `${server.getBaseUrl()}/api/boards/${encodeURIComponent(board.id)}`;

    const saveResponse = await fetch(boardUrl, {
      body: JSON.stringify(board),
      headers: {
        "Content-Type": "application/json",
        "X-MikroCanvas-Delete-Token": "creator-delete-token",
      },
      method: "PUT",
    });
    expect(saveResponse.status).toBe(200);
    expect(saveResponse.headers.get("x-board-revision")).toBe("1");

    const getResponse = await fetch(boardUrl);
    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toMatchObject({
      id: board.id,
      title: "Shared sketch",
    });

    expect((await fetch(`${server.getBaseUrl()}/api/boards`)).status).toBe(404);
  });

  it("requires creator delete token or admin token to delete boards", async () => {
    const board = Board.create("Delete guarded", "2026-01-01T00:00:00.000Z");
    const boardUrl = `${server.getBaseUrl()}/api/boards/${encodeURIComponent(board.id)}`;
    await fetch(boardUrl, {
      body: JSON.stringify(board),
      headers: {
        "Content-Type": "application/json",
        "X-MikroCanvas-Delete-Token": "creator-delete-token",
      },
      method: "PUT",
    });

    expect((await fetch(boardUrl, { method: "DELETE" })).status).toBe(403);
    expect(
      (
        await fetch(boardUrl, {
          headers: {
            "X-MikroCanvas-Delete-Token": "wrong-token",
          },
          method: "DELETE",
        })
      ).status,
    ).toBe(403);
    expect((await fetch(boardUrl)).status).toBe(200);

    const deleteResponse = await fetch(boardUrl, {
      headers: {
        "X-MikroCanvas-Delete-Token": "creator-delete-token",
      },
      method: "DELETE",
    });
    expect(deleteResponse.status).toBe(204);
    expect((await fetch(boardUrl)).status).toBe(404);
  });

  it("allows admin token deletion for recovery", async () => {
    const board = Board.create("Admin delete", "2026-01-01T00:00:00.000Z");
    const boardUrl = `${server.getBaseUrl()}/api/boards/${encodeURIComponent(board.id)}`;
    await fetch(boardUrl, {
      body: JSON.stringify(board),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    });

    const deleteResponse = await fetch(boardUrl, {
      headers: {
        Authorization: "Bearer test-admin-token-with-enough-length",
      },
      method: "DELETE",
    });

    expect(deleteResponse.status).toBe(204);
    expect((await fetch(boardUrl)).status).toBe(404);
  });

  it("serves the static app with SPA fallback", async () => {
    const response = await fetch(`${server.getBaseUrl()}/boards/some-id`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("MikroCanvas");
  });

  it("serves static app assets without browser cache stickiness", async () => {
    const response = await fetch(`${server.getBaseUrl()}/main.js`);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});
