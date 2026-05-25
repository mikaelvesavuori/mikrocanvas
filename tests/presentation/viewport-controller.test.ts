import { Board, DiagramCommandService } from "../../src/domain/index.js";
import type { BoardService } from "../../src/application/index.js";
import type { DiagramBoard } from "../../src/interfaces/index.js";
import type { GeometryContext } from "../../src/presentation/canvasGeometry.js";
import { ViewportController } from "../../src/presentation/viewportController.js";

class TestBoardService {
  options: Array<{ history?: boolean; persist?: boolean }> = [];

  constructor(public board: DiagramBoard) {}

  async replaceActiveBoard(
    board: DiagramBoard,
    options: { history?: boolean; persist?: boolean } = {},
  ) {
    this.board = Board.clone(board);
    this.options.push(options);
  }
}

const commandService = new DiagramCommandService();
const geometry: GeometryContext = {
  getElementBounds: (element) => commandService.getElementBounds(element),
  getConnectionPoint: (element, anchor) => commandService.getConnectionPoint(element, anchor),
};

function touchEvent(id: number, point: { x: number; y: number }): PointerEvent {
  return {
    clientX: point.x,
    clientY: point.y,
    pointerId: id,
    pointerType: "touch",
    preventDefault: vi.fn(),
  } as unknown as PointerEvent;
}

describe("viewport controller", () => {
  it("ignores single-touch pointers so canvas interactions can handle them", async () => {
    const board = {
      ...Board.create("Single touch viewport", "2026-01-01T00:00:00.000Z"),
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    const boardService = new TestBoardService(board);
    const controller = new ViewportController({
      stage: {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }),
        setPointerCapture: vi.fn(),
      } as unknown as HTMLElement,
      boardService: boardService as unknown as BoardService,
      commandService,
      geometry,
      getBoard: () => boardService.board,
    });

    expect(controller.handlePointerDown(touchEvent(1, { x: 100, y: 100 }))).toBe(false);
    expect(controller.handlePointerMove(touchEvent(1, { x: 120, y: 120 }))).toBe(false);
    expect(controller.handlePointerUp(touchEvent(1, { x: 120, y: 120 }))).toBe(false);
    await Promise.resolve();

    expect(boardService.options).toEqual([]);
  });

  it("pinches and pans the viewport with two touch pointers", async () => {
    const board = {
      ...Board.create("Touch viewport", "2026-01-01T00:00:00.000Z"),
      viewport: { x: 0, y: 0, zoom: 1 },
    };
    const boardService = new TestBoardService(board);
    const stage = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }),
      setPointerCapture: vi.fn(),
    };
    const controller = new ViewportController({
      stage: stage as unknown as HTMLElement,
      boardService: boardService as unknown as BoardService,
      commandService,
      geometry,
      getBoard: () => boardService.board,
    });

    expect(controller.handlePointerDown(touchEvent(1, { x: 100, y: 100 }))).toBe(false);
    expect(controller.handlePointerDown(touchEvent(2, { x: 200, y: 100 }))).toBe(true);

    const move = touchEvent(2, { x: 250, y: 100 });
    expect(controller.handlePointerMove(move)).toBe(true);
    await Promise.resolve();

    expect(move.preventDefault).toHaveBeenCalled();
    expect(boardService.board.viewport).toMatchObject({
      x: -50,
      y: -50,
      zoom: 1.5,
    });
    expect(boardService.options.at(-1)).toMatchObject({ history: false, persist: false });

    expect(controller.handlePointerUp(touchEvent(1, { x: 100, y: 100 }))).toBe(true);
    expect(controller.handlePointerUp(touchEvent(2, { x: 250, y: 100 }))).toBe(true);
    await Promise.resolve();

    expect(boardService.options.at(-1)).toMatchObject({ history: false, persist: true });
  });
});
