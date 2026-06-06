import { MikroCanvasDatabase } from "../../api/src/database/MikroCanvasDatabase.js";
import { AppServer } from "../../api/src/http/AppServer.js";
import { Board } from "../../src/domain/index.js";
import { HttpBoardSnapshotRepository } from "../../src/infrastructure/http/index.js";

describe("HttpBoardSnapshotRepository", () => {
  let database: MikroCanvasDatabase;
  let server: AppServer;

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
  });

  afterEach(async () => {
    await server.stop();
    database.close();
  });

  it("publishes and loads board snapshots by ID", async () => {
    const repository = new HttpBoardSnapshotRepository(server.getBaseUrl());
    const board = Board.create("Published snapshot", "2026-01-01T00:00:00.000Z");

    await repository.save(board);

    expect(await repository.get(board.id)).toEqual(board);
  });

  it("returns null when a snapshot does not exist", async () => {
    const repository = new HttpBoardSnapshotRepository(server.getBaseUrl());

    expect(await repository.get("board_missing")).toBeNull();
  });
});
