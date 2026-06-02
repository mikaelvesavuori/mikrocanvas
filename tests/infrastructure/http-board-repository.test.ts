import { MikroCanvasDatabase } from "../../api/src/database/MikroCanvasDatabase.js";
import { AppServer } from "../../api/src/http/AppServer.js";
import { Board } from "../../src/domain/index.js";
import { type BoardIdStorage, HttpBoardRepository } from "../../src/infrastructure/http/index.js";

describe("HttpBoardRepository", () => {
  let database: MikroCanvasDatabase;
  let server: AppServer;
  let storageIds: string[];

  beforeEach(async () => {
    database = new MikroCanvasDatabase(":memory:");
    database.migrate();
    server = new AppServer({
      config: {
        appUrl: "http://127.0.0.1:0",
        databasePath: ":memory:",
        host: "127.0.0.1",
        port: 0,
      },
      database,
      staticRoot: ".",
    });
    await server.start();
    storageIds = [];
  });

  afterEach(async () => {
    await server.stop();
    database.close();
  });

  it("remembers boards that were opened or saved by ID", async () => {
    const repository = new HttpBoardRepository(server.getBaseUrl(), storage());
    const board = Board.create("Open if linked", "2026-01-01T00:00:00.000Z");

    await repository.save(board);

    expect(storageIds).toEqual([board.id]);
    expect(await repository.get(board.id)).toEqual(board);
    expect(await repository.list()).toEqual([
      expect.objectContaining({
        id: board.id,
        title: "Open if linked",
      }),
    ]);

    await repository.delete(board.id);

    expect(storageIds).toEqual([]);
    expect(await repository.get(board.id)).toBeNull();
  });

  function storage(): BoardIdStorage {
    return {
      read: () => [...storageIds],
      write: (ids) => {
        storageIds = [...ids];
      },
    };
  }
});
