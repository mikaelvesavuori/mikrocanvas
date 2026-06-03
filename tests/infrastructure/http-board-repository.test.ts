import { MikroCanvasDatabase } from "../../api/src/database/MikroCanvasDatabase.js";
import { AppServer } from "../../api/src/http/AppServer.js";
import { Board } from "../../src/domain/index.js";
import {
  type BoardAccessRecord,
  type BoardAccessStorage,
  HttpBoardRepository,
} from "../../src/infrastructure/http/index.js";

describe("HttpBoardRepository", () => {
  let database: MikroCanvasDatabase;
  let server: AppServer;
  let records: BoardAccessRecord[];

  beforeEach(async () => {
    database = new MikroCanvasDatabase(":memory:");
    database.migrate();
    server = new AppServer({
      config: {
        adminToken: "",
        appUrl: "http://127.0.0.1:0",
        databasePath: ":memory:",
        host: "127.0.0.1",
        port: 0,
      },
      database,
      staticRoot: ".",
    });
    await server.start();
    records = [];
  });

  afterEach(async () => {
    await server.stop();
    database.close();
  });

  it("remembers delete access for boards created by this browser", async () => {
    const repository = new HttpBoardRepository(server.getBaseUrl(), storage());
    const board = Board.create("Open if linked", "2026-01-01T00:00:00.000Z");

    await repository.save(board);

    expect(records).toEqual([
      expect.objectContaining({
        id: board.id,
        deleteToken: expect.any(String),
      }),
    ]);
    expect(await repository.get(board.id)).toEqual(board);
    expect(await repository.list()).toEqual([
      expect.objectContaining({
        id: board.id,
        title: "Open if linked",
      }),
    ]);

    await repository.delete(board.id);

    expect(records).toEqual([]);
    expect(await repository.get(board.id)).toBeNull();
  });

  it("opens shared boards without gaining delete access", async () => {
    const creator = new HttpBoardRepository(server.getBaseUrl(), storage());
    const board = Board.create("Shared by link", "2026-01-01T00:00:00.000Z");
    await creator.save(board);

    records = [];
    const guest = new HttpBoardRepository(server.getBaseUrl(), storage());

    expect(await guest.get(board.id)).toEqual(board);
    expect(records).toEqual([{ id: board.id }]);
    await expect(guest.delete(board.id)).rejects.toThrow("Failed to delete");
    expect(await guest.get(board.id)).toEqual(board);
  });

  function storage(): BoardAccessStorage {
    return {
      forget: (id) => {
        records = records.filter((record) => record.id !== id);
      },
      get: (id) => records.find((record) => record.id === id) ?? null,
      list: () => records.map((record) => ({ ...record })),
      remember: (record) => {
        const existing = records.find((entry) => entry.id === record.id);
        records = [
          {
            ...existing,
            ...record,
            deleteToken: record.deleteToken ?? existing?.deleteToken,
          },
          ...records.filter((entry) => entry.id !== record.id),
        ];
      },
    };
  }
});
