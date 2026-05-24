import { indexedDB } from "fake-indexeddb";
import { Board } from "../../src/domain/index.js";
import { IndexedDbBoardRepository } from "../../src/infrastructure/index.js";

describe("IndexedDbBoardRepository", () => {
  beforeEach(async () => {
    Object.defineProperty(globalThis, "indexedDB", {
      value: indexedDB,
      configurable: true,
    });
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("mikrocanvas");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
      request.onblocked = () => resolve();
    });
  });

  it("saves, lists, reads, and deletes boards", async () => {
    const repository = new IndexedDbBoardRepository();
    const board = Board.create("Local map", "2026-01-01T00:00:00.000Z");

    await repository.save(board);
    expect(await repository.list()).toEqual([
      expect.objectContaining({
        id: board.id,
        title: "Local map",
        elementCount: 0,
      }),
    ]);
    expect(await repository.get(board.id)).toEqual(board);

    await repository.delete(board.id);
    expect(await repository.get(board.id)).toBeNull();
    expect(await repository.list()).toEqual([]);
  });
});
