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
    const board = Board.create("Online board", "2026-01-01T00:00:00.000Z");

    const first = database.saveBoard(board);
    expect(first.revision).toBe(1);
    expect(database.getBoard(board.id)?.board).toEqual(board);

    const updated = {
      ...board,
      title: "Updated online board",
      updatedAt: "2026-01-01T00:05:00.000Z",
    };
    const second = database.saveBoard(updated);

    expect(second.revision).toBe(2);
    expect(database.getBoard(board.id)).toMatchObject({
      board: {
        title: "Updated online board",
      },
      revision: 2,
    });

    expect(database.deleteBoard(board.id)).toBe(true);
    expect(database.getBoard(board.id)).toBeNull();
  });
});
