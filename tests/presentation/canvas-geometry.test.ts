import { Board, DiagramCommandService } from "../../src/domain/index.js";
import type { ArrowElement, DiagramBoard } from "../../src/interfaces/index.js";
import {
  arrowPathPoints,
  endpointForArrowOnBoard,
  type GeometryContext,
  getNearestConnectionTarget,
  labelPlacementOnPolyline,
  pointAtPolylinePosition,
} from "../../src/presentation/canvasGeometry.js";

const commandService = new DiagramCommandService();
const geometry: GeometryContext = {
  getElementBounds: (element) => commandService.getElementBounds(element),
  getConnectionPoint: (element, anchor) => commandService.getConnectionPoint(element, anchor),
};

function boardWith(...elements: DiagramBoard["elements"]): DiagramBoard {
  return {
    ...Board.create("Geometry test", "2026-01-01T00:00:00.000Z"),
    elements,
  };
}

describe("canvas geometry", () => {
  it("builds straight and elbow arrow path points", () => {
    const start = { x: 10, y: 20 };
    const end = { x: 110, y: 80 };

    expect(arrowPathPoints(start, end, "straight")).toEqual([start, end]);
    expect(arrowPathPoints(start, end, "elbow")).toEqual([
      start,
      { x: 60, y: 20 },
      { x: 60, y: 80 },
      end,
    ]);
  });

  it("routes anchored elbow arrows away from box edges before turning", () => {
    const points = arrowPathPoints({ x: 140, y: 100 }, { x: 260, y: 190 }, "elbow", {
      endAnchor: "left",
      startAnchor: "bottom",
    });

    expect(points[1]).toMatchObject({ x: 140 });
    expect(points[1]?.y).toBeGreaterThan(100);
    expect(points.at(-2)).toMatchObject({ y: 190 });
    expect(points.at(-2)?.x).toBeLessThan(260);
  });

  it("routes adjusted elbow arrows through the dragged bend without doubling back", () => {
    expect(
      arrowPathPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, "elbow", {
        bend: { x: 50, y: 50 },
      }),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 50 },
      { x: 100, y: 0 },
    ]);
  });

  it("projects arrow labels onto the nearest point along the route", () => {
    const route = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];

    expect(labelPlacementOnPolyline(route, { x: 75, y: 24 }).position).toBeCloseTo(0.375);
    expect(pointAtPolylinePosition(route, 0.75)).toEqual({ x: 100, y: 50 });
  });

  it("resolves connected arrow endpoints against their bound elements", () => {
    const source = commandService.createElement(
      "rectangle",
      { x: 0, y: 0 },
      {
        id: "source",
        size: { width: 100, height: 80 },
      },
    );
    const target = commandService.createElement(
      "ellipse",
      { x: 220, y: 20 },
      {
        id: "target",
        size: { width: 120, height: 90 },
      },
    );
    const arrow = {
      ...commandService.createElement(
        "arrow",
        { x: 100, y: 40 },
        {
          id: "arrow",
        },
      ),
      startBinding: { elementId: "source", anchor: "right" },
      endBinding: { elementId: "target", anchor: "left" },
    } as ArrowElement;
    const board = boardWith(source, target, arrow);

    expect(endpointForArrowOnBoard(board, arrow, "start", geometry)).toEqual({
      x: 100,
      y: 40,
    });
    expect(endpointForArrowOnBoard(board, arrow, "end", geometry)).toEqual({
      x: 220,
      y: 65,
    });
  });

  it("finds the nearest eligible connection target", () => {
    const target = commandService.createElement(
      "rectangle",
      { x: 40, y: 30 },
      {
        id: "target",
        size: { width: 120, height: 80 },
      },
    );
    const board = boardWith(target);

    const connection = getNearestConnectionTarget(board, { x: 164, y: 72 }, geometry);

    expect(connection).toMatchObject({
      elementId: "target",
      anchor: "right",
      point: { x: 160, y: 70 },
    });
  });
});
