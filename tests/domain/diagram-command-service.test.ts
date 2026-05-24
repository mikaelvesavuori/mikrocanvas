import { Board, DiagramCommandService } from "../../src/domain/index.js";
import type { DiagramElement } from "../../src/interfaces/index.js";
import { shapeDefinitions, shapeTools } from "../../src/shared/index.js";

describe("DiagramCommandService", () => {
  let service: DiagramCommandService;

  beforeEach(() => {
    service = new DiagramCommandService();
  });

  it("creates FigJam-style elements with stable defaults", () => {
    const sticky = service.createElement(
      "sticky",
      { x: 10.4, y: 20.8 },
      { id: "sticky_1", now: "2026-01-01T00:00:00.000Z" },
    );
    const rectangle = service.createElement("rectangle", { x: 30, y: 40 }, { id: "shape_1" });
    const arrow = service.createElement("arrow", { x: 0, y: 0 }, { id: "arrow_1" });

    expect(sticky).toMatchObject({
      id: "sticky_1",
      type: "sticky",
      x: 10,
      y: 21,
      width: 180,
      height: 150,
      text: "New thought",
    });
    expect(rectangle).toMatchObject({
      id: "shape_1",
      type: "shape",
      shape: "rectangle",
      width: 180,
      height: 110,
    });
    expect(arrow).toMatchObject({
      id: "arrow_1",
      type: "arrow",
      arrowHead: "end",
    });
  });

  it("creates extended diagram shape variants", () => {
    for (const shape of shapeTools) {
      const element = service.createElement(shape, { x: 10, y: 20 });
      expect(element).toMatchObject({
        type: "shape",
        shape,
        ...shapeDefinitions[shape].defaultSize,
      });
    }
  });

  it("persists grid visibility through viewport changes and normalization", () => {
    const board = service.updateBoardGridVisibility(Board.create("Grid"), false);
    const moved = service.updateBoardViewport(board, 12.4, 32.7, 1.4);
    const normalized = service.normalizeBoard({
      ...moved,
      viewport: { x: 0, y: 0, zoom: 1 },
    });

    expect(board.viewport.gridVisible).toBe(false);
    expect(moved.viewport).toMatchObject({
      x: 12,
      y: 33,
      zoom: 1.4,
      gridVisible: false,
    });
    expect(normalized.viewport.gridVisible).toBe(true);
  });

  it("moves arrow endpoints and freehand points with the element", () => {
    let board = Board.create("Flow");
    const arrow = service.createElement("arrow", { x: 0, y: 0 }, { id: "arrow_1" });
    const draw = service.createDrawElement(
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      { id: "draw_1" },
    );
    board = service.addElement(service.addElement(board, arrow), draw);

    const moved = service.moveElements(board, ["arrow_1", "draw_1"], {
      x: 12,
      y: -4,
    });
    const movedArrow = moved.elements.find((element) => element.id === "arrow_1");
    const movedDraw = moved.elements.find((element) => element.id === "draw_1");

    expect(movedArrow).toMatchObject({
      type: "arrow",
      start: { x: 12, y: -4 },
      end: { x: 192, y: 86 },
    });
    expect(movedDraw).toMatchObject({
      type: "draw",
      points: [
        { x: 12, y: -4 },
        { x: 22, y: 6 },
      ],
    });
  });

  it("duplicates selected elements with fresh ids and a visible offset", () => {
    let board = Board.create("Sketch");
    const note = service.createElement("sticky", { x: 5, y: 6 }, { id: "note_1" });
    board = service.addElement(board, note);

    const result = service.duplicateElements(board, ["note_1"], "2026-01-01T00:00:00.000Z");
    const duplicate = result.board.elements.find((element) => element.id === result.ids[0]);

    expect(result.ids).toHaveLength(1);
    expect(result.ids[0]).not.toBe("note_1");
    expect(duplicate).toMatchObject({
      type: "sticky",
      x: 29,
      y: 30,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("keeps locked elements immutable until they are unlocked", () => {
    let board = Board.create("Locked");
    const note = {
      ...service.createElement("sticky", { x: 5, y: 6 }, { id: "note_1" }),
      locked: true,
    };
    board = service.addElement(board, note);

    expect(service.moveElements(board, ["note_1"], { x: 20, y: 20 })).toEqual(board);
    expect(service.resizeElement(board, "note_1", { x: 0, y: 0, width: 300, height: 300 })).toEqual(
      board,
    );
    expect(
      service.updateElement(board, "note_1", {
        text: "Changed",
      } as Partial<DiagramElement>),
    ).toEqual(board);
    expect(service.removeElements(board, ["note_1"])).toEqual(board);
    expect(service.duplicateElements(board, ["note_1"]).ids).toEqual([]);

    const unlocked = service.updateElement(board, "note_1", {
      locked: false,
    } as Partial<DiagramElement>);

    expect(unlocked.elements[0]).toMatchObject({ id: "note_1", locked: false });
  });

  it("keeps bound arrow endpoints attached when connected elements move", () => {
    let board = Board.create("Connected");
    const shape = service.createElement("rectangle", { x: 100, y: 100 }, { id: "shape_1" });
    const arrow = service.createElement("arrow", { x: 0, y: 120 }, { id: "arrow_1" });
    if (arrow.type !== "arrow") {
      throw new Error("Expected arrow");
    }
    arrow.endBinding = { elementId: "shape_1", anchor: "left" };
    arrow.end = service.getConnectionPoint(shape, "left") ?? arrow.end;
    board = service.addElement(service.addElement(board, shape), arrow);

    const moved = service.moveElements(board, ["shape_1"], { x: 50, y: 20 });
    const movedArrow = moved.elements.find((element) => element.id === "arrow_1");

    expect(movedArrow).toMatchObject({
      type: "arrow",
      end: { x: 150, y: 175 },
      endBinding: { elementId: "shape_1", anchor: "left" },
    });
  });

  it("keeps arrow bindings when changing arrowhead style", () => {
    let board = Board.create("Arrowheads");
    const shape = service.createElement("rectangle", { x: 100, y: 100 }, { id: "shape_1" });
    const arrow = service.createElement("arrow", { x: 0, y: 120 }, { id: "arrow_1" });
    if (arrow.type !== "arrow") {
      throw new Error("Expected arrow");
    }
    arrow.endBinding = { elementId: "shape_1", anchor: "left" };
    arrow.end = service.getConnectionPoint(shape, "left") ?? arrow.end;
    board = service.addElement(service.addElement(board, shape), arrow);

    const withoutHead = service.updateElements(board, [
      {
        id: "arrow_1",
        patch: { arrowHead: "none" },
      },
    ]);
    const moved = service.moveElements(withoutHead, ["shape_1"], {
      x: 50,
      y: 20,
    });
    const movedArrow = moved.elements.find((element) => element.id === "arrow_1");

    expect(movedArrow).toMatchObject({
      type: "arrow",
      arrowHead: "none",
      end: { x: 150, y: 175 },
      endBinding: { elementId: "shape_1", anchor: "left" },
    });
  });

  it("pastes copied elements with new ids and preserved internal bindings", () => {
    let board = Board.create("Paste");
    const shape = service.createElement("rectangle", { x: 100, y: 100 }, { id: "shape_1" });
    const arrow = service.createElement("arrow", { x: 0, y: 120 }, { id: "arrow_1" });
    if (arrow.type !== "arrow") {
      throw new Error("Expected arrow");
    }
    arrow.endBinding = { elementId: "shape_1", anchor: "left" };
    board = service.addElement(service.addElement(board, shape), arrow);

    const result = service.pasteElements(board, [shape, arrow], {
      x: 30,
      y: 30,
    });
    const pastedArrow = result.board.elements.find(
      (element) => result.ids.includes(element.id) && element.type === "arrow",
    );
    const pastedShape = result.board.elements.find(
      (element) => result.ids.includes(element.id) && element.type === "shape",
    );

    expect(result.ids).toHaveLength(2);
    expect(pastedArrow).toMatchObject({
      type: "arrow",
      endBinding: { elementId: pastedShape?.id, anchor: "left" },
    });
  });
});
