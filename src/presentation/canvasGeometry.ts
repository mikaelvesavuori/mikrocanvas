import type {
  ArrowAnchor,
  ArrowBinding,
  ArrowElement,
  ArrowRoute,
  DiagramBoard,
  DiagramElement,
  Point,
  Rect,
} from "../interfaces/index.js";
import { clamp, distance } from "../shared/index.js";
import type { ConnectionTarget } from "./interaction.js";

export type GeometryContext = {
  getElementBounds: (element: DiagramElement) => Rect;
  getConnectionPoint: (element: DiagramElement, anchor: ArrowAnchor) => Point | null;
};

export type ArrowPathOptions = {
  bend?: Point;
  endAnchor?: ArrowAnchor;
  startAnchor?: ArrowAnchor;
};

export function endpointForArrowOnBoard(
  board: DiagramBoard,
  arrow: ArrowElement,
  endpoint: "start" | "end",
  context: GeometryContext,
): Point {
  const binding = endpoint === "start" ? arrow.startBinding : arrow.endBinding;
  const target = binding
    ? board.elements.find((element) => element.id === binding.elementId)
    : null;
  const point = target ? context.getConnectionPoint(target, binding?.anchor ?? "right") : null;

  return point ?? fallbackArrowPoint(arrow, endpoint);
}

export function fallbackArrowPoint(arrow: ArrowElement, endpoint: "start" | "end"): Point {
  return endpoint === "start" ? arrow.start : arrow.end;
}

export function elementIdAtWorldPoint(board: DiagramBoard, point: Point, context: GeometryContext) {
  for (const element of [...board.elements].reverse()) {
    if (elementContainsPoint(board, element, point, context)) {
      return element.id;
    }
  }

  return null;
}

export function elementContainsPoint(
  board: DiagramBoard,
  element: DiagramElement,
  point: Point,
  context: GeometryContext,
) {
  const hitRadius = 10 / board.viewport.zoom;
  if (element.type === "arrow") {
    return (
      distanceToPolyline(
        point,
        arrowPathPoints(
          endpointForArrowOnBoard(board, element, "start", context),
          endpointForArrowOnBoard(board, element, "end", context),
          element.route,
          arrowPathOptions(element),
        ),
      ) <= hitRadius
    );
  }

  if (element.type === "draw") {
    return distanceToPolyline(point, element.points) <= hitRadius;
  }

  return pointInRect(point, context.getElementBounds(element));
}

export function getNearestConnectionTarget(
  board: DiagramBoard,
  point: Point,
  context: GeometryContext,
  ignoredIds = new Set<string>(),
): ConnectionTarget | null {
  const snapRadius = 42 / board.viewport.zoom;
  const candidates = board.elements
    .filter(
      (element) =>
        !ignoredIds.has(element.id) && element.type !== "arrow" && element.type !== "draw",
    )
    .map((element) => {
      const bounds = context.getElementBounds(element);
      if (!pointNearRect(point, bounds, snapRadius)) {
        return null;
      }

      const anchor = anchorForPoint(bounds, point);
      const connectionPoint = context.getConnectionPoint(element, anchor);
      if (!connectionPoint) {
        return null;
      }

      return {
        elementId: element.id,
        anchor,
        point: connectionPoint,
        bounds,
        distance: distance(point, connectionPoint),
      };
    })
    .filter((candidate): candidate is ConnectionTarget => candidate !== null)
    .sort((a, b) => a.distance - b.distance);

  return candidates[0] ?? null;
}

export function bindingFromTarget(target: ConnectionTarget): ArrowBinding {
  return {
    elementId: target.elementId,
    anchor: target.anchor,
  };
}

export function arrowPath(
  start: Point,
  end: Point,
  route: ArrowRoute | undefined,
  options: ArrowPathOptions = {},
) {
  const points = arrowPathPoints(start, end, route, options);
  if (route === "elbow") {
    return roundedPolylineSvgPath(points, 16);
  }

  return straightPolylineSvgPath(points);
}

export function arrowPathOptions(arrow: ArrowElement): ArrowPathOptions {
  return {
    bend: arrow.bend,
    endAnchor: arrow.endBinding?.anchor,
    startAnchor: arrow.startBinding?.anchor,
  };
}

export function arrowPathPoints(
  start: Point,
  end: Point,
  route: ArrowRoute | undefined,
  options: ArrowPathOptions = {},
) {
  if (route !== "elbow") {
    return [start, end];
  }

  if (!options.bend && !options.startAnchor && !options.endAnchor) {
    const midX = start.x + (end.x - start.x) / 2;
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }

  return anchoredElbowPathPoints(start, end, options);
}

function anchoredElbowPathPoints(start: Point, end: Point, options: ArrowPathOptions) {
  const startDirection = options.startAnchor ? directionForAnchor(options.startAnchor) : null;
  const endDirection = options.endAnchor ? directionForAnchor(options.endAnchor) : null;
  const stubLength = elbowStubLength(start, end);
  const startStub = startDirection ? offsetPoint(start, startDirection, stubLength) : start;
  const endStub = endDirection ? offsetPoint(end, endDirection, stubLength) : end;
  const points = [start];

  appendPoint(points, startStub);
  for (const point of options.bend
    ? routeViaBend(startStub, options.bend, endStub)
    : connectorPoints(startStub, endStub, startDirection, endDirection)) {
    appendPoint(points, point);
  }
  appendPoint(points, endStub);
  appendPoint(points, end);

  return points;
}

function connectorPoints(
  start: Point,
  end: Point,
  startDirection: Point | null,
  endDirection: Point | null,
) {
  const startHorizontal = startDirection ? Math.abs(startDirection.x) > 0 : false;
  const endHorizontal = endDirection ? Math.abs(endDirection.x) > 0 : false;

  if (startDirection && endDirection && startHorizontal === endHorizontal) {
    if (startHorizontal) {
      const midX = start.x + (end.x - start.x) / 2;
      return [
        { x: midX, y: start.y },
        { x: midX, y: end.y },
      ];
    }

    const midY = start.y + (end.y - start.y) / 2;
    return [
      { x: start.x, y: midY },
      { x: end.x, y: midY },
    ];
  }

  if (startDirection) {
    return startHorizontal ? [{ x: end.x, y: start.y }] : [{ x: start.x, y: end.y }];
  }

  if (endDirection) {
    return endHorizontal ? [{ x: start.x, y: end.y }] : [{ x: end.x, y: start.y }];
  }

  const midX = start.x + (end.x - start.x) / 2;
  return [
    { x: midX, y: start.y },
    { x: midX, y: end.y },
  ];
}

function routeViaBend(start: Point, bend: Point, end: Point) {
  return [{ x: bend.x, y: start.y }, bend, { x: end.x, y: bend.y }];
}

function directionForAnchor(anchor: ArrowAnchor): Point {
  if (anchor === "top") {
    return { x: 0, y: -1 };
  }

  if (anchor === "right") {
    return { x: 1, y: 0 };
  }

  if (anchor === "bottom") {
    return { x: 0, y: 1 };
  }

  return { x: -1, y: 0 };
}

function elbowStubLength(start: Point, end: Point) {
  return Math.min(48, Math.max(20, distance(start, end) * 0.18));
}

function offsetPoint(point: Point, direction: Point, amount: number): Point {
  return {
    x: point.x + direction.x * amount,
    y: point.y + direction.y * amount,
  };
}

function appendPoint(points: Point[], point: Point) {
  const last = points.at(-1);
  if (!last || distance(last, point) > 0.5) {
    points.push(point);
  }
}

export function arrowLabelRect(arrow: ArrowElement, start: Point, end: Point): Rect {
  const center = arrowLabelCenter(arrow, start, end);
  return {
    x: center.x - 80,
    y: center.y - 22,
    width: 160,
    height: 44,
  };
}

export function arrowLabelCenter(arrow: ArrowElement, start: Point, end: Point): Point {
  return pointAtPolylinePosition(
    arrowPathPoints(start, end, arrow.route, arrowPathOptions(arrow)),
    arrow.labelPosition ?? 0.5,
  );
}

export function arrowLabelPlacementForPoint(
  board: DiagramBoard,
  arrow: ArrowElement,
  point: Point,
  context: GeometryContext,
) {
  const start = endpointForArrowOnBoard(board, arrow, "start", context);
  const end = endpointForArrowOnBoard(board, arrow, "end", context);
  return labelPlacementOnPolyline(
    arrowPathPoints(start, end, arrow.route, arrowPathOptions(arrow)),
    point,
  );
}

export function labelPlacementOnPolyline(points: Point[], point: Point) {
  const total = polylineLength(points);
  if (points.length === 0 || total === 0) {
    return {
      position: 0.5,
    };
  }

  let traversed = 0;
  let best = {
    distance: Number.POSITIVE_INFINITY,
    position: 0.5,
  };
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1] ?? point;
    const end = points[index] ?? start;
    const length = distance(start, end);
    const projection = projectPointToSegment(point, start, end);
    const projectionDistance = distance(point, projection.point);
    if (projectionDistance < best.distance) {
      best = {
        distance: projectionDistance,
        position: clamp((traversed + length * projection.t) / total, 0, 1),
      };
    }
    traversed += length;
  }

  return {
    position: best.position,
  };
}

export function pointAtPolylinePosition(points: Point[], position: number): Point {
  const first = points[0] ?? { x: 0, y: 0 };
  const total = polylineLength(points);
  if (points.length < 2 || total === 0) {
    return first;
  }

  let remaining = total * clamp(position, 0, 1);
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1] ?? first;
    const end = points[index] ?? start;
    const length = distance(start, end);
    if (remaining <= length) {
      const ratio = length === 0 ? 0 : remaining / length;
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
    }
    remaining -= length;
  }

  return points.at(-1) ?? first;
}

export function polylineLength(points: Point[]) {
  return points
    .slice(1)
    .reduce((total, point, index) => total + distance(points[index] ?? point, point), 0);
}

export function projectPointToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return {
    t,
    point: {
      x: start.x + dx * t,
      y: start.y + dy * t,
    },
  };
}

export function rectForPoints(points: Point[]): Rect {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function boardBounds(
  board: DiagramBoard,
  context: Pick<GeometryContext, "getElementBounds">,
): Rect {
  const bounds = board.elements.map((element) => context.getElementBounds(element));
  const minX = Math.min(...bounds.map((rect) => rect.x));
  const minY = Math.min(...bounds.map((rect) => rect.y));
  const maxX = Math.max(...bounds.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...bounds.map((rect) => rect.y + rect.height));
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function pointToward(from: Point, to: Point, amount: number): Point {
  const segmentLength = distance(from, to);
  if (segmentLength === 0) {
    return from;
  }

  const ratio = amount / segmentLength;
  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
  };
}

function straightPolylineSvgPath(points: Point[]) {
  const [first, ...rest] = points;
  if (!first) {
    return "";
  }

  return [`M ${first.x} ${first.y}`, ...rest.map((point) => `L ${point.x} ${point.y}`)].join(" ");
}

function roundedPolylineSvgPath(points: Point[], radius: number) {
  const [first] = points;
  if (!first) {
    return "";
  }

  if (points.length < 3) {
    return straightPolylineSvgPath(points);
  }

  const commands = [`M ${first.x} ${first.y}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? first;
    const corner = points[index] ?? previous;
    const next = points[index + 1] ?? corner;
    const cornerRadius = Math.min(
      radius,
      distance(previous, corner) / 2,
      distance(corner, next) / 2,
    );
    const before = pointToward(corner, previous, cornerRadius);
    const after = pointToward(corner, next, cornerRadius);
    commands.push(`L ${before.x} ${before.y}`, `Q ${corner.x} ${corner.y} ${after.x} ${after.y}`);
  }

  const last = points.at(-1) ?? first;
  commands.push(`L ${last.x} ${last.y}`);
  return commands.join(" ");
}

function distanceToPolyline(point: Point, points: Point[]) {
  if (points.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  if (points.length === 1) {
    return distance(point, points[0] ?? point);
  }

  return Math.min(
    ...points
      .slice(1)
      .map((segmentEnd, index) =>
        distanceToSegment(point, points[index] ?? segmentEnd, segmentEnd),
      ),
  );
}

function distanceToSegment(point: Point, start: Point, end: Point) {
  const projection = projectPointToSegment(point, start, end);
  return distance(point, projection.point);
}

function pointInRect(point: Point, rect: Rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function pointNearRect(point: Point, rect: Rect, radius: number) {
  return (
    point.x >= rect.x - radius &&
    point.x <= rect.x + rect.width + radius &&
    point.y >= rect.y - radius &&
    point.y <= rect.y + rect.height + radius
  );
}

function anchorForPoint(rect: Rect, point: Point): ArrowAnchor {
  const center = {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const horizontal = Math.abs(dx) / Math.max(1, rect.width);
  const vertical = Math.abs(dy) / Math.max(1, rect.height);

  if (horizontal > vertical) {
    return dx >= 0 ? "right" : "left";
  }

  return dy >= 0 ? "bottom" : "top";
}
