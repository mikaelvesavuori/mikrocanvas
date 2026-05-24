import { Board, DiagramCommandService } from "../../src/domain/index.js";
import type { BoardService } from "../../src/application/index.js";
import type {
  ArrowElement,
  ArrowRoute,
  DiagramBoard,
  DiagramTool,
} from "../../src/interfaces/index.js";
import {
  endpointForArrowOnBoard,
  type GeometryContext,
} from "../../src/presentation/canvasGeometry.js";
import { CanvasPointerController } from "../../src/presentation/canvasPointerController.js";

class FakeNode {
  contains() {
    return false;
  }
}

class FakeElement extends FakeNode {
  dataset: Record<string, string>;

  constructor(dataset: Record<string, string> = {}) {
    super();
    this.dataset = dataset;
  }

  getAttribute(name: string) {
    if (name === "data-element-id") {
      return this.dataset.elementId ?? null;
    }

    return null;
  }

  closest(selector: string) {
    if (selector === "[data-arrow-handle]" && this.dataset.arrowHandle) {
      return this;
    }

    if (selector === "[data-arrow-label-id]" && this.dataset.arrowLabelId) {
      return this;
    }

    if (selector === "[data-element-id]" && this.dataset.elementId) {
      return this;
    }

    return null;
  }
}

class TestBoardService {
  committedFrom: DiagramBoard | null = null;

  constructor(public board: DiagramBoard) {}

  getActiveBoardSnapshot() {
    return Board.clone(this.board);
  }

  async replaceActiveBoard(board: DiagramBoard) {
    this.board = Board.clone(board);
  }

  async commitCurrentFrom(previous: DiagramBoard | null) {
    this.committedFrom = previous ? Board.clone(previous) : null;
  }
}

const commandService = new DiagramCommandService();
const geometry: GeometryContext = {
  getElementBounds: (element) => commandService.getElementBounds(element),
  getConnectionPoint: (element, anchor) => commandService.getConnectionPoint(element, anchor),
};

function installDomFakes() {
  Object.assign(globalThis, {
    Node: FakeNode,
    Element: FakeElement,
    SVGElement: FakeElement,
  });
}

function createPointerController({
  board,
  arrowRoute = "straight",
  tool = "select",
}: {
  board: DiagramBoard;
  arrowRoute?: ArrowRoute;
  tool?: DiagramTool;
}) {
  const boardService = new TestBoardService(board);
  let selectedIds = new Set<string>();
  let activeTool = tool;
  const stage = {
    classList: { add: vi.fn(), remove: vi.fn() },
    dataset: {},
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  };
  const svg = {
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  };
  const inlineEditor = new FakeNode();
  const openInlineEditor = vi.fn();
  const controller = new CanvasPointerController({
    stage: stage as unknown as HTMLElement,
    svg: svg as unknown as SVGSVGElement,
    inlineEditor: inlineEditor as unknown as HTMLTextAreaElement,
    boardService: boardService as unknown as BoardService,
    commandService,
    geometry,
    getActiveTool: () => activeTool,
    getArrowRoute: () => arrowRoute,
    getBoard: () => boardService.board,
    getSelectedIds: () => selectedIds,
    setSelectedIds: (ids) => {
      selectedIds = ids;
    },
    selectTextTarget: vi.fn(),
    isSpacePressed: () => false,
    setTool: (nextTool) => {
      activeTool = nextTool;
    },
    openInlineEditor,
    closeInlineEditor: vi.fn(),
    render: vi.fn(),
  });

  return { boardService, controller, getSelectedIds: () => selectedIds, openInlineEditor };
}

function pointerEvent(
  point: { x: number; y: number },
  target = new FakeElement(),
  options: Partial<PointerEvent> = {},
): PointerEvent {
  return {
    altKey: false,
    button: 0,
    clientX: point.x,
    clientY: point.y,
    detail: 1,
    pointerId: 1,
    preventDefault: vi.fn(),
    shiftKey: false,
    target,
    composedPath: () => [target],
    ...options,
  } as unknown as PointerEvent;
}

function boardWithBoundArrow() {
  const source = commandService.createElement("rectangle", { x: 0, y: 0 }, { id: "source" });
  const target = commandService.createElement("rectangle", { x: 260, y: 0 }, { id: "target" });
  const arrow = commandService.createElement("arrow", { x: 180, y: 55 }, { id: "arrow" });
  if (arrow.type !== "arrow") {
    throw new Error("Expected arrow");
  }

  const boundArrow = {
    ...arrow,
    start: commandService.getConnectionPoint(source, "right") ?? arrow.start,
    end: commandService.getConnectionPoint(target, "left") ?? arrow.end,
    startBinding: { elementId: source.id, anchor: "right" },
    endBinding: { elementId: target.id, anchor: "left" },
  } satisfies ArrowElement;

  return {
    ...Board.create("Pointer test", "2026-01-01T00:00:00.000Z"),
    elements: [source, boundArrow, target],
  };
}

describe("canvas pointer controller", () => {
  beforeEach(() => {
    installDomFakes();
  });

  it("centers newly created shapes on the pointer location", async () => {
    const board = Board.create("Creation test", "2026-01-01T00:00:00.000Z");
    const { boardService, controller, getSelectedIds } = createPointerController({
      board,
      tool: "rectangle",
    });

    controller.handlePointerDown(pointerEvent({ x: 200, y: 160 }));
    await Promise.resolve();

    const shape = boardService.board.elements[0];
    expect(shape).toMatchObject({
      type: "shape",
      shape: "rectangle",
      x: 110,
      y: 105,
      width: 180,
      height: 110,
    });
    expect(getSelectedIds()).toEqual(new Set([shape?.id]));
  });

  it("uses the remembered arrow route when creating new arrows", async () => {
    const board = Board.create("Arrow route test", "2026-01-01T00:00:00.000Z");
    const { boardService, controller, getSelectedIds } = createPointerController({
      arrowRoute: "elbow",
      board,
      tool: "arrow",
    });

    controller.handlePointerDown(pointerEvent({ x: 100, y: 120 }));
    controller.handlePointerMove(pointerEvent({ x: 260, y: 220 }));
    controller.handlePointerUp(pointerEvent({ x: 260, y: 220 }));
    await Promise.resolve();

    const arrow = boardService.board.elements[0];
    expect(arrow).toMatchObject({
      type: "arrow",
      route: "elbow",
      start: { x: 100, y: 120 },
      end: { x: 260, y: 220 },
    });
    expect(getSelectedIds()).toEqual(new Set([arrow?.id]));
  });

  it("selects locked elements without moving them", async () => {
    const locked = {
      ...commandService.createElement("rectangle", { x: 40, y: 40 }, { id: "locked" }),
      locked: true,
    };
    const board = {
      ...Board.create("Locked drag test", "2026-01-01T00:00:00.000Z"),
      elements: [locked],
    };
    const target = new FakeElement({ elementId: "locked" });
    const { boardService, controller, getSelectedIds } = createPointerController({ board });

    controller.handlePointerDown(pointerEvent({ x: 60, y: 60 }, target));
    controller.handlePointerMove(pointerEvent({ x: 120, y: 120 }, target));
    controller.handlePointerUp(pointerEvent({ x: 120, y: 120 }, target));
    await Promise.resolve();

    expect(boardService.board.elements[0]).toMatchObject({
      id: "locked",
      locked: true,
      x: 40,
      y: 40,
    });
    expect(getSelectedIds()).toEqual(new Set(["locked"]));
  });

  it("snaps dragged elements to the grid while shift is held", async () => {
    const shape = commandService.createElement("rectangle", { x: 13, y: 17 }, { id: "shape" });
    const board = {
      ...Board.create("Snap drag test", "2026-01-01T00:00:00.000Z"),
      elements: [shape],
    };
    const target = new FakeElement({ elementId: "shape" });
    const { boardService, controller } = createPointerController({ board });

    controller.handlePointerDown(pointerEvent({ x: 30, y: 30 }, target));
    controller.handlePointerMove(pointerEvent({ x: 43, y: 58 }, target, { shiftKey: true }));
    controller.handlePointerUp(pointerEvent({ x: 43, y: 58 }, target));
    await Promise.resolve();

    expect(boardService.board.elements[0]).toMatchObject({
      id: "shape",
      x: 24,
      y: 48,
    });
  });

  it("keeps dragged elements free while shift is not held", async () => {
    const shape = commandService.createElement("rectangle", { x: 13, y: 17 }, { id: "shape" });
    const board = {
      ...Board.create("Free drag test", "2026-01-01T00:00:00.000Z"),
      elements: [shape],
    };
    const target = new FakeElement({ elementId: "shape" });
    const { boardService, controller } = createPointerController({ board });

    controller.handlePointerDown(pointerEvent({ x: 30, y: 30 }, target));
    controller.handlePointerMove(pointerEvent({ x: 43, y: 58 }, target));
    controller.handlePointerUp(pointerEvent({ x: 43, y: 58 }, target));
    await Promise.resolve();

    expect(boardService.board.elements[0]).toMatchObject({
      id: "shape",
      x: 26,
      y: 45,
    });
  });

  it("deselects an arrow when clicking empty canvas inside its route bounds", async () => {
    const baseArrow = commandService.createElement("arrow", { x: 0, y: 0 }, { id: "arrow" });
    if (baseArrow.type !== "arrow") {
      throw new Error("Expected arrow");
    }
    const arrow = {
      ...baseArrow,
      end: { x: 100, y: 100 },
      route: "elbow",
    } satisfies ArrowElement;
    const board = {
      ...Board.create("Arrow click test", "2026-01-01T00:00:00.000Z"),
      elements: [arrow],
    };
    const { controller, getSelectedIds } = createPointerController({ board });

    controller.handlePointerDown(pointerEvent({ x: 50, y: 0 }));
    controller.handlePointerUp(pointerEvent({ x: 50, y: 0 }));
    await Promise.resolve();
    expect(getSelectedIds()).toEqual(new Set(["arrow"]));

    controller.handlePointerDown(pointerEvent({ x: 75, y: 50 }));
    controller.handlePointerUp(pointerEvent({ x: 75, y: 50 }));
    await Promise.resolve();

    expect(getSelectedIds()).toEqual(new Set());
  });

  it("opens text editing when double-clicking a text-capable shape", () => {
    const shape = commandService.createElement("rectangle", { x: 0, y: 0 }, { id: "shape" });
    const board = {
      ...Board.create("Shape text double-click test", "2026-01-01T00:00:00.000Z"),
      elements: [shape],
    };
    const target = new FakeElement({ elementId: "shape" });
    const { controller, openInlineEditor } = createPointerController({ board });
    const event = pointerEvent({ x: 20, y: 20 }, target, { detail: 2 });

    controller.handlePointerDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(openInlineEditor).toHaveBeenCalledWith("shape");
  });

  it("double-clicks an arrow line back to the tight route for its angle type", async () => {
    const baseArrow = commandService.createElement("arrow", { x: 0, y: 0 }, { id: "arrow" });
    if (baseArrow.type !== "arrow") {
      throw new Error("Expected arrow");
    }
    const arrow = {
      ...baseArrow,
      bend: { x: 60, y: 80 },
      end: { x: 120, y: 0 },
      route: "elbow",
    } satisfies ArrowElement;
    const board = {
      ...Board.create("Arrow double-click test", "2026-01-01T00:00:00.000Z"),
      elements: [arrow],
    };
    const target = new FakeElement({ elementId: "arrow" });
    const { boardService, controller, getSelectedIds, openInlineEditor } = createPointerController({
      board,
    });
    const event = pointerEvent({ x: 60, y: 0 }, target, { detail: 2 });

    controller.handlePointerDown(event);
    await Promise.resolve();

    const tightenedArrow = boardService.board.elements.find(
      (element): element is ArrowElement => element.id === "arrow" && element.type === "arrow",
    );
    expect(event.preventDefault).toHaveBeenCalled();
    expect(tightenedArrow?.route).toBe("elbow");
    expect(tightenedArrow?.bend).toBeUndefined();
    expect(openInlineEditor).not.toHaveBeenCalled();
    expect(getSelectedIds()).toEqual(new Set(["arrow"]));
  });

  it("opens text editing when double-clicking an already-tight arrow", () => {
    const baseArrow = commandService.createElement("arrow", { x: 0, y: 0 }, { id: "arrow" });
    if (baseArrow.type !== "arrow") {
      throw new Error("Expected arrow");
    }
    const arrow = {
      ...baseArrow,
      end: { x: 120, y: 0 },
      route: "straight",
    } satisfies ArrowElement;
    const board = {
      ...Board.create("Optimized arrow text test", "2026-01-01T00:00:00.000Z"),
      elements: [arrow],
    };
    const target = new FakeElement({ elementId: "arrow" });
    const { controller, openInlineEditor } = createPointerController({ board });
    const event = pointerEvent({ x: 60, y: 0 }, target, { detail: 2 });

    controller.handlePointerDown(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(openInlineEditor).toHaveBeenCalledWith("arrow");
  });

  it("moves dragged elbow segments parallel to themselves", async () => {
    const baseArrow = commandService.createElement("arrow", { x: 0, y: 0 }, { id: "arrow" });
    if (baseArrow.type !== "arrow") {
      throw new Error("Expected arrow");
    }
    const arrow = {
      ...baseArrow,
      bend: { x: 50, y: 80 },
      end: { x: 120, y: 0 },
      route: "elbow",
    } satisfies ArrowElement;
    const board = {
      ...Board.create("Arrow segment drag test", "2026-01-01T00:00:00.000Z"),
      elements: [arrow],
    };
    const target = new FakeElement({ elementId: "arrow" });
    const { boardService, controller } = createPointerController({ board });

    controller.handlePointerDown(pointerEvent({ x: 50, y: 40 }, target));
    controller.handlePointerMove(pointerEvent({ x: 80, y: 70 }, target));
    controller.handlePointerUp(pointerEvent({ x: 80, y: 70 }, target));
    await Promise.resolve();

    const movedArrow = boardService.board.elements.find(
      (element): element is ArrowElement => element.id === "arrow" && element.type === "arrow",
    );
    expect(movedArrow?.bend).toEqual({ x: 80, y: 80 });
  });

  it("reanchors connected arrows to the tightest sensible sides when tightening", async () => {
    const source = commandService.createElement("rectangle", { x: 0, y: 0 }, { id: "source" });
    const target = commandService.createElement("rectangle", { x: 0, y: 360 }, { id: "target" });
    const baseArrow = commandService.createElement("arrow", { x: 0, y: 0 }, { id: "arrow" });
    if (baseArrow.type !== "arrow") {
      throw new Error("Expected arrow");
    }
    const arrow = {
      ...baseArrow,
      bend: { x: 260, y: 210 },
      end: commandService.getConnectionPoint(target, "right") ?? baseArrow.end,
      endBinding: { elementId: "target", anchor: "right" },
      route: "elbow",
      start: commandService.getConnectionPoint(source, "right") ?? baseArrow.start,
      startBinding: { elementId: "source", anchor: "right" },
    } satisfies ArrowElement;
    const board = {
      ...Board.create("Arrow reanchor test", "2026-01-01T00:00:00.000Z"),
      elements: [source, arrow, target],
    };
    const targetElement = new FakeElement({ elementId: "arrow" });
    const { boardService, controller } = createPointerController({ board });

    controller.handlePointerDown(pointerEvent({ x: 260, y: 210 }, targetElement, { detail: 2 }));
    await Promise.resolve();

    const tightenedArrow = boardService.board.elements.find(
      (element): element is ArrowElement => element.id === "arrow" && element.type === "arrow",
    );
    expect(tightenedArrow?.bend).toBeUndefined();
    expect(tightenedArrow).toMatchObject({
      end: { x: 90, y: 360 },
      endBinding: { elementId: "target", anchor: "top" },
      start: { x: 90, y: 110 },
      startBinding: { elementId: "source", anchor: "bottom" },
    });
  });

  it("keeps straight arrows straight when tightening them", async () => {
    const baseArrow = commandService.createElement("arrow", { x: 0, y: 0 }, { id: "arrow" });
    if (baseArrow.type !== "arrow") {
      throw new Error("Expected arrow");
    }
    const arrow = {
      ...baseArrow,
      bend: { x: 60, y: 80 },
      end: { x: 120, y: 30 },
      route: "straight",
    } satisfies ArrowElement;
    const board = {
      ...Board.create("Straight arrow double-click test", "2026-01-01T00:00:00.000Z"),
      elements: [arrow],
    };
    const target = new FakeElement({ elementId: "arrow" });
    const { boardService, controller } = createPointerController({ board });

    controller.handlePointerDown(pointerEvent({ x: 60, y: 15 }, target, { detail: 2 }));
    await Promise.resolve();

    const tightenedArrow = boardService.board.elements.find(
      (element): element is ArrowElement => element.id === "arrow" && element.type === "arrow",
    );
    expect(tightenedArrow?.route).toBe("straight");
    expect(tightenedArrow?.bend).toBeUndefined();
  });

  it("keeps arrow label double-clicks focused on text editing", async () => {
    const baseArrow = commandService.createElement("arrow", { x: 0, y: 0 }, { id: "arrow" });
    if (baseArrow.type !== "arrow") {
      throw new Error("Expected arrow");
    }
    const arrow = {
      ...baseArrow,
      bend: { x: 60, y: 80 },
      route: "elbow",
      text: "Label",
    } satisfies ArrowElement;
    const board = {
      ...Board.create("Arrow label double-click test", "2026-01-01T00:00:00.000Z"),
      elements: [arrow],
    };
    const target = new FakeElement({ arrowLabelId: "arrow", elementId: "arrow" });
    const { boardService, controller, openInlineEditor } = createPointerController({ board });

    controller.handlePointerDown(pointerEvent({ x: 40, y: 40 }, target, { detail: 2 }));
    await Promise.resolve();

    const editedArrow = boardService.board.elements.find(
      (element): element is ArrowElement => element.id === "arrow" && element.type === "arrow",
    );
    expect(openInlineEditor).toHaveBeenCalledWith("arrow");
    expect(editedArrow?.bend).toEqual({ x: 60, y: 80 });
  });

  it("drags a bound arrow target instead of detaching the connected endpoint", async () => {
    const board = boardWithBoundArrow();
    const { boardService, controller } = createPointerController({ board });
    const handle = new FakeElement({ arrowHandle: "end", arrowId: "arrow" });

    controller.handlePointerDown(pointerEvent({ x: 260, y: 55 }, handle));
    controller.handlePointerMove(pointerEvent({ x: 300, y: 75 }, handle));
    controller.handlePointerUp(pointerEvent({ x: 300, y: 75 }, handle));
    await Promise.resolve();

    const target = boardService.board.elements.find((element) => element.id === "target");
    const arrow = boardService.board.elements.find(
      (element): element is ArrowElement => element.id === "arrow" && element.type === "arrow",
    );

    expect(target).toMatchObject({ x: 300, y: 20 });
    expect(arrow?.endBinding).toEqual({ elementId: "target", anchor: "left" });
    expect(
      arrow ? endpointForArrowOnBoard(boardService.board, arrow, "end", geometry) : null,
    ).toEqual({
      x: 300,
      y: 75,
    });
  });

  it("adjusts a bound arrow route without detaching its endpoints", async () => {
    const board = boardWithBoundArrow();
    const { boardService, controller } = createPointerController({ board });

    controller.handlePointerDown(pointerEvent({ x: 220, y: 55 }));
    controller.handlePointerMove(pointerEvent({ x: 220, y: 140 }));
    controller.handlePointerUp(pointerEvent({ x: 220, y: 140 }));
    await Promise.resolve();

    const arrow = boardService.board.elements.find(
      (element): element is ArrowElement => element.id === "arrow" && element.type === "arrow",
    );

    expect(arrow).toMatchObject({
      bend: { x: 260, y: 140 },
      endBinding: { elementId: "target", anchor: "left" },
      route: "elbow",
      startBinding: { elementId: "source", anchor: "right" },
    });
  });

  it("binds an arrow handle to the nearest target and keeps it attached after movement", async () => {
    const source = commandService.createElement("rectangle", { x: 0, y: 0 }, { id: "source" });
    const target = commandService.createElement("rectangle", { x: 260, y: 0 }, { id: "target" });
    const arrow = commandService.createElement("arrow", { x: 180, y: 55 }, { id: "arrow" });
    if (arrow.type !== "arrow") {
      throw new Error("Expected arrow");
    }
    const board = {
      ...Board.create("Binding test", "2026-01-01T00:00:00.000Z"),
      elements: [source, arrow, target],
    };
    const { boardService, controller } = createPointerController({ board });
    const handle = new FakeElement({ arrowHandle: "end", arrowId: "arrow" });

    controller.handlePointerDown(pointerEvent(arrow.end, handle));
    controller.handlePointerMove(pointerEvent({ x: 260, y: 55 }, handle));
    controller.handlePointerUp(pointerEvent({ x: 260, y: 55 }, handle));
    await Promise.resolve();
    const attachedArrow = boardService.board.elements.find(
      (element): element is ArrowElement => element.id === "arrow" && element.type === "arrow",
    );

    expect(attachedArrow?.endBinding).toEqual({ elementId: "target", anchor: "left" });

    boardService.board = commandService.moveElements(boardService.board, ["target"], {
      x: 20,
      y: 30,
    });
    const movedArrow = boardService.board.elements.find(
      (element): element is ArrowElement => element.id === "arrow" && element.type === "arrow",
    );

    expect(movedArrow?.endBinding).toEqual({ elementId: "target", anchor: "left" });
    expect(
      movedArrow ? endpointForArrowOnBoard(boardService.board, movedArrow, "end", geometry) : null,
    ).toEqual({
      x: 280,
      y: 85,
    });
  });
});
