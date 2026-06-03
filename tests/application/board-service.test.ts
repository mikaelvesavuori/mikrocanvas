import { type BoardRepository, BoardService } from "../../src/application/index.js";
import { Board, DiagramCommandService } from "../../src/domain/index.js";
import type { DiagramBoard, DiagramBoardSummary } from "../../src/interfaces/index.js";
import { clone } from "../../src/shared/index.js";

class MemoryBoardRepository implements BoardRepository {
  private boards = new Map<string, DiagramBoard>();
  failDelete = false;

  async list(): Promise<DiagramBoardSummary[]> {
    return [...this.boards.values()]
      .map((board) => Board.toSummary(board))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<DiagramBoard | null> {
    const board = this.boards.get(id);
    return board ? clone(board) : null;
  }

  async save(board: DiagramBoard): Promise<void> {
    this.boards.set(board.id, clone(board));
  }

  async delete(id: string): Promise<void> {
    if (this.failDelete) {
      throw new Error("Delete denied.");
    }

    this.boards.delete(id);
  }

  storedBoard(id: string) {
    const board = this.boards.get(id);
    return board ? clone(board) : null;
  }

  get size() {
    return this.boards.size;
  }
}

describe("BoardService", () => {
  const starterTexts = ["Start here", "Shape an idea", "Add context"];

  function boardText(element: DiagramBoard["elements"][number]) {
    return "text" in element ? element.text : "";
  }

  it("boots with a starter board when storage is empty", async () => {
    const service = new BoardService(new MemoryBoardRepository());

    await service.boot();
    const state = service.getState();

    expect(state.activeBoard?.title).toBe("First canvas");
    expect(state.activeBoard?.elements.length).toBeGreaterThan(0);
    expect(state.activeBoard?.elements.map(boardText)).toEqual(
      expect.arrayContaining(starterTexts),
    );
    const starterArrow = state.activeBoard?.elements.find((element) => element.type === "arrow");
    expect(starterArrow).toMatchObject({
      startBinding: { anchor: "right" },
      endBinding: { anchor: "left" },
      start: { x: -70, y: -45 },
      end: { x: 80, y: -45 },
    });
    expect(JSON.stringify(state.activeBoard)).not.toContain("sovereign");
    expect(state.boards).toHaveLength(1);
  });

  it("creates new boards with welcoming starter elements", async () => {
    const service = new BoardService(new MemoryBoardRepository());
    await service.boot();

    await service.createBoard("Untitled board");
    const state = service.getState();

    expect(state.activeBoard?.title).toBe("Untitled board");
    expect(state.activeBoard?.elements.map(boardText)).toEqual(
      expect.arrayContaining(starterTexts),
    );
  });

  it("boots directly into an initial board ID when one is provided", async () => {
    const repository = new MemoryBoardRepository();
    const first = Board.create("First stored board", "2026-01-01T00:00:00.000Z");
    const linked = Board.create("Linked online board", "2026-01-01T00:01:00.000Z");
    await repository.save(first);
    await repository.save(linked);

    const service = new BoardService(repository);
    await service.boot({ initialBoardId: linked.id });

    expect(service.getState().activeBoard?.id).toBe(linked.id);
    expect(service.getState().activeBoard?.title).toBe("Linked online board");
  });

  it("tracks undo and redo for committed board edits", async () => {
    const commandService = new DiagramCommandService();
    const service = new BoardService(new MemoryBoardRepository());
    await service.boot();
    const initial = service.getState().activeBoard;
    expect(initial).not.toBeNull();
    if (!initial) {
      return;
    }

    const element = commandService.createElement("sticky", { x: 10, y: 10 }, { id: "sticky_1" });
    await service.replaceActiveBoard(commandService.addElement(initial, element));
    expect(service.getState().activeBoard?.elements.some((entry) => entry.id === "sticky_1")).toBe(
      true,
    );

    await service.undo();
    expect(service.getState().activeBoard?.elements.some((entry) => entry.id === "sticky_1")).toBe(
      false,
    );

    await service.redo();
    expect(service.getState().activeBoard?.elements.some((entry) => entry.id === "sticky_1")).toBe(
      true,
    );
  });

  it("persists default board replacements before the next interaction", async () => {
    const commandService = new DiagramCommandService();
    const repository = new MemoryBoardRepository();
    const service = new BoardService(repository);
    await service.boot();
    const initial = service.getState().activeBoard;
    expect(initial).not.toBeNull();
    if (!initial) {
      return;
    }

    const element = commandService.createElement("rectangle", { x: 40, y: 50 }, { id: "shape_1" });
    await service.replaceActiveBoard(commandService.addElement(initial, element));

    expect(
      repository.storedBoard(initial.id)?.elements.some((entry) => entry.id === "shape_1"),
    ).toBe(true);
  });

  it("renames blank board titles to the fallback title", async () => {
    const service = new BoardService(new MemoryBoardRepository());
    await service.boot();

    await service.renameActiveBoard("   ");

    expect(service.getState().activeBoard?.title).toBe("Untitled board");
  });

  it("keeps one replacement board when deleting the last board", async () => {
    const repository = new MemoryBoardRepository();
    const service = new BoardService(repository);
    await service.boot();
    const initialId = service.getState().activeBoard?.id;
    expect(initialId).toBeTruthy();
    if (!initialId) {
      return;
    }

    await service.deleteBoard(initialId);
    const state = service.getState();

    expect(repository.size).toBe(1);
    expect(state.boards).toHaveLength(1);
    expect(state.activeBoard?.id).not.toBe(initialId);
    expect(state.activeBoard?.title).toBe("Untitled board");
    expect(state.activeBoard?.elements.map(boardText)).toEqual(
      expect.arrayContaining(starterTexts),
    );
  });

  it("keeps the current board and reports an error when deleting is denied", async () => {
    const repository = new MemoryBoardRepository();
    const service = new BoardService(repository);
    await service.boot();
    const initialId = service.getState().activeBoard?.id;
    expect(initialId).toBeTruthy();
    if (!initialId) {
      return;
    }

    repository.failDelete = true;
    await service.deleteBoard(initialId);
    const state = service.getState();

    expect(state.activeBoard?.id).toBe(initialId);
    expect(state.persistence).toMatchObject({
      status: "error",
      message: "This browser cannot delete that online board.",
    });
  });

  it("exports and imports board files as new local boards", async () => {
    const service = new BoardService(new MemoryBoardRepository());
    await service.boot();

    const exported = service.exportActiveBoard();
    expect(exported?.format).toBe("mikrocanvas.board");
    if (!exported) {
      return;
    }

    await service.importBoardFile(exported);
    const state = service.getState();

    expect(state.boards).toHaveLength(2);
    expect(state.activeBoard?.id).not.toBe(exported.board.id);
    expect(state.activeBoard?.title).toBe(exported.board.title);
  });
});
