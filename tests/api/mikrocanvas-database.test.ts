import { Board } from "../../src/domain/index.js";
import { MikroCanvasDatabase } from "../../api/src/database/MikroCanvasDatabase.js";

describe("MikroCanvasDatabase", () => {
  let database: MikroCanvasDatabase;

  beforeEach(() => {
    database = new MikroCanvasDatabase(":memory:");
    database.migrate();
  });

  afterEach(() => {
    database.close();
  });

  it("saves, loads, revises, and deletes boards", () => {
    const board = Board.create("Published snapshot", "2026-01-01T00:00:00.000Z");

    const first = database.saveBoard(board, { deleteTokenHash: "hashed-token" });
    expect(first.revision).toBe(1);
    expect(database.getBoard(board.id)?.board).toEqual(board);
    expect(database.getDeleteTokenHash(board.id)).toBe("hashed-token");

    const updated = {
      ...board,
      title: "Updated snapshot",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const second = database.saveBoard(updated);

    expect(second.revision).toBe(2);
    expect(database.getDeleteTokenHash(board.id)).toBe("hashed-token");
    expect(database.getBoard(board.id)).toMatchObject({
      board: {
        title: "Updated snapshot",
      },
      revision: 2,
    });

    expect(database.deleteBoard(board.id)).toBe(true);
    expect(database.getBoard(board.id)).toBeNull();
  });
});
