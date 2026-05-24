import type {
  ArrowElement,
  ArrowHead,
  DiagramBoard,
  DiagramElement,
  Point,
  Rect,
  ShapeElement,
} from "../interfaces/index.js";
import { distance } from "../shared/index.js";
import {
  arrowLabelRect,
  arrowPathOptions,
  arrowPathPoints,
  boardBounds,
  endpointForArrowOnBoard,
  type GeometryContext,
  pointToward,
} from "./canvasGeometry.js";
import { cssFontStyle, cssFontWeight, shouldPaint } from "./format.js";
import {
  shapeDecorationPathCommands,
  shapePathCommands,
  tracePathCommands,
} from "./shapeGeometry.js";

const automaticArrowLabelFill = "rgba(255,255,255,0.88)";

type CanvasTextOptions = {
  align?: CanvasTextAlign;
  padding?: number;
  vertical?: "center" | "top";
  weight?: number;
};

export async function renderBoardPng(board: DiagramBoard, context: GeometryContext) {
  const contentBounds =
    board.elements.length > 0
      ? boardBounds(board, context)
      : { x: -400, y: -300, width: 800, height: 600 };
  const padding = 80;
  const viewBox = {
    x: contentBounds.x - padding,
    y: contentBounds.y - padding,
    width: contentBounds.width + padding * 2,
    height: contentBounds.height + padding * 2,
  };
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewBox.width * scale));
  canvas.height = Math.max(1, Math.round(viewBox.height * scale));
  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) {
    throw new Error("Canvas export is unavailable.");
  }

  canvasContext.scale(scale, scale);
  canvasContext.fillStyle = "#f8fafc";
  canvasContext.fillRect(0, 0, viewBox.width, viewBox.height);
  canvasContext.translate(-viewBox.x, -viewBox.y);
  for (const element of board.elements) {
    drawElementToCanvas(canvasContext, board, element, context);
  }

  return canvasToBlob(canvas);
}

function drawElementToCanvas(
  context: CanvasRenderingContext2D,
  board: DiagramBoard,
  element: DiagramElement,
  geometry: GeometryContext,
) {
  if (element.type === "sticky") {
    drawStyledPath(
      context,
      () => roundedRectPath(context, element.x, element.y, element.width, element.height, 8),
      element.style,
      true,
    );
    context.save();
    context.beginPath();
    context.moveTo(element.x + element.width - 32, element.y + element.height);
    context.lineTo(element.x + element.width, element.y + element.height - 32);
    context.lineTo(element.x + element.width, element.y + element.height);
    context.closePath();
    context.fillStyle = "rgba(255,255,255,0.42)";
    context.fill();
    context.restore();
    drawCanvasText(context, element.text, element, element.style, {
      align: "center",
      padding: 12,
      vertical: "center",
      weight: 650,
    });
    return;
  }

  if (element.type === "text") {
    drawTextBackground(context, element, {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    });
    drawCanvasText(context, element.text, element, element.style, {
      align: "left",
      padding: 0,
      vertical: "top",
      weight: 650,
    });
    return;
  }

  if (element.type === "shape") {
    drawShapeToCanvas(context, element);
    drawCanvasText(context, element.text, element, element.style, {
      align: "center",
      padding: 12,
      vertical: "center",
      weight: 650,
    });
    return;
  }

  if (element.type === "arrow") {
    const start = endpointForArrowOnBoard(board, element, "start", geometry);
    const end = endpointForArrowOnBoard(board, element, "end", geometry);
    const points = arrowPathPoints(start, end, element.route, arrowPathOptions(element));
    strokePolyline(
      context,
      points,
      element.style,
      element.style.strokeWidth + 1,
      element.route === "elbow" ? 16 : 0,
    );
    const next = nextDistinctPoint(points, start);
    const previous = previousDistinctPoint(points, end);
    drawArrowHeads(context, element, next, start, previous, end);

    if (element.text) {
      const labelRect = arrowLabelRect(element, start, end);
      const labelTextRect = canvasTextContentRect(context, element.text, labelRect, element.style, {
        align: "center",
        padding: 4,
        vertical: "center",
        weight: 650,
      });
      drawTextBackground(context, element, labelTextRect, 6, 2, {
        fallbackFill: automaticArrowLabelFill,
      });
      drawCanvasText(context, element.text, labelRect, element.style, {
        align: "center",
        padding: 4,
        vertical: "center",
        weight: 650,
      });
    }
    return;
  }

  if (element.type === "draw") {
    strokePolyline(context, element.points, element.style, element.style.strokeWidth);
    return;
  }

  drawStyledPath(
    context,
    () => roundedRectPath(context, element.x, element.y, element.width, element.height, 8),
    element.style,
    true,
  );
  context.save();
  context.beginPath();
  context.arc(element.x + 16, element.y + 16, 7, 0, Math.PI * 2);
  context.fillStyle = element.style.stroke;
  context.fill();
  context.restore();
  drawCanvasText(
    context,
    element.text,
    {
      x: element.x + 34,
      y: element.y + 8,
      width: Math.max(42, element.width - 44),
      height: Math.max(32, element.height - 16),
    },
    element.style,
    { align: "left", padding: 0, vertical: "top", weight: 500 },
  );
}

function drawShapeToCanvas(context: CanvasRenderingContext2D, element: ShapeElement) {
  drawStyledPath(
    context,
    () => tracePathCommands(context, shapePathCommands(element.shape, element)),
    element.style,
    true,
  );

  const decoration = shapeDecorationPathCommands(element.shape, element);
  if (!decoration || !shouldPaint(element.style.stroke) || element.style.strokeWidth <= 0) {
    return;
  }

  context.save();
  context.beginPath();
  tracePathCommands(context, decoration);
  context.strokeStyle = element.style.stroke;
  context.lineWidth = element.style.strokeWidth;
  context.stroke();
  context.restore();
}

function drawStyledPath(
  context: CanvasRenderingContext2D,
  buildPath: () => void,
  style: DiagramElement["style"],
  shadow = false,
) {
  if (shouldPaint(style.fill)) {
    context.save();
    context.beginPath();
    buildPath();
    if (shadow) {
      context.shadowColor = "rgba(15,23,42,0.12)";
      context.shadowBlur = 16;
      context.shadowOffsetY = 8;
    }
    context.fillStyle = style.fill;
    context.fill();
    context.restore();
  }

  if (shouldPaint(style.stroke) && style.strokeWidth > 0) {
    context.save();
    context.beginPath();
    buildPath();
    context.strokeStyle = style.stroke;
    context.lineWidth = style.strokeWidth;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.setLineDash(lineDash(style, style.strokeWidth));
    context.stroke();
    context.restore();
  }
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeWidth = Math.max(0, width);
  const safeHeight = Math.max(0, height);
  const safeRadius = Math.min(radius, safeWidth / 2, safeHeight / 2);
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + safeWidth - safeRadius, y);
  context.quadraticCurveTo(x + safeWidth, y, x + safeWidth, y + safeRadius);
  context.lineTo(x + safeWidth, y + safeHeight - safeRadius);
  context.quadraticCurveTo(
    x + safeWidth,
    y + safeHeight,
    x + safeWidth - safeRadius,
    y + safeHeight,
  );
  context.lineTo(x + safeRadius, y + safeHeight);
  context.quadraticCurveTo(x, y + safeHeight, x, y + safeHeight - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function strokePolyline(
  context: CanvasRenderingContext2D,
  points: Point[],
  style: DiagramElement["style"],
  width: number,
  radius = 0,
) {
  if (points.length < 2 || !shouldPaint(style.stroke)) {
    return;
  }

  const first = points[0];
  if (!first) {
    return;
  }

  context.save();
  context.beginPath();
  tracePolylinePath(context, points, radius);
  context.strokeStyle = style.stroke;
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.setLineDash(lineDash(style, width));
  context.stroke();
  context.restore();
}

function lineDash(style: DiagramElement["style"], width: number) {
  return style.strokeStyle === "dashed" ? [Math.max(8, width * 4), Math.max(7, width * 3.2)] : [];
}

function tracePolylinePath(context: CanvasRenderingContext2D, points: Point[], radius: number) {
  const first = points[0];
  if (!first) {
    return;
  }

  context.moveTo(first.x, first.y);
  if (points.length < 3 || radius <= 0) {
    for (const point of points.slice(1)) {
      context.lineTo(point.x, point.y);
    }
    return;
  }

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
    context.lineTo(before.x, before.y);
    context.quadraticCurveTo(corner.x, corner.y, after.x, after.y);
  }

  const last = points.at(-1);
  if (last) {
    context.lineTo(last.x, last.y);
  }
}

function previousDistinctPoint(points: Point[], end: Point) {
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const point = points[index];
    if (point && distance(point, end) > 0.5) {
      return point;
    }
  }

  return null;
}

function nextDistinctPoint(points: Point[], start: Point) {
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (point && distance(point, start) > 0.5) {
      return point;
    }
  }

  return null;
}

function drawArrowHeads(
  context: CanvasRenderingContext2D,
  arrow: ArrowElement,
  next: Point | null,
  start: Point,
  previous: Point | null,
  end: Point,
) {
  if (!shouldPaint(arrow.style.stroke)) {
    return;
  }

  const arrowHead = arrow.arrowHead ?? "end";
  const size = Math.max(10, arrow.style.strokeWidth * 4.4);
  if (next && hasArrowHead(arrowHead, "start")) {
    drawArrowHead(context, next, start, arrow.style.stroke, size);
  }

  if (previous && hasArrowHead(arrowHead, "end")) {
    drawArrowHead(context, previous, end, arrow.style.stroke, size);
  }
}

function hasArrowHead(arrowHead: ArrowHead, endpoint: "start" | "end") {
  return arrowHead === "both" || arrowHead === endpoint;
}

function drawArrowHead(
  context: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  color: string,
  size: number,
) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const wing = 0.58;
  context.save();
  context.beginPath();
  context.moveTo(to.x, to.y);
  context.lineTo(to.x - Math.cos(angle - wing) * size, to.y - Math.sin(angle - wing) * size);
  context.lineTo(to.x - Math.cos(angle + wing) * size, to.y - Math.sin(angle + wing) * size);
  context.closePath();
  context.fillStyle = color;
  context.fill();
  context.restore();
}

function drawTextBackground(
  context: CanvasRenderingContext2D,
  element: Extract<DiagramElement, { text: string }>,
  rect: Rect,
  paddingX = 10,
  paddingY = 8,
  options: { fallbackFill?: string } = {},
) {
  const hasExplicitFill = shouldPaint(element.style.fill);
  const fill = hasExplicitFill ? element.style.fill : options.fallbackFill;
  if (!fill) {
    return;
  }

  const buildPath = () =>
    roundedRectPath(
      context,
      rect.x - paddingX,
      rect.y - paddingY,
      rect.width + paddingX * 2,
      rect.height + paddingY * 2,
      8,
    );
  if (hasExplicitFill) {
    drawStyledPath(context, buildPath, element.style, false);
    return;
  }

  context.save();
  context.beginPath();
  buildPath();
  context.fillStyle = fill;
  context.fill();
  context.restore();
}

function drawCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  rect: Rect,
  style: DiagramElement["style"],
  options: CanvasTextOptions = {},
) {
  if (!text.trim()) {
    return;
  }

  const padding = options.padding ?? 12;
  const inner = {
    x: rect.x + padding,
    y: rect.y + padding,
    width: Math.max(1, rect.width - padding * 2),
    height: Math.max(1, rect.height - padding * 2),
  };
  context.save();
  context.font = `${cssFontStyle(style)} ${cssFontWeight(style, options.weight ?? 650)} ${style.fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  context.fillStyle = shouldPaint(style.text) ? style.text : "#1f2937";
  context.textAlign = options.align ?? "center";
  context.textBaseline = "top";
  const lineHeight = style.fontSize * 1.22;
  const lines = wrapCanvasText(context, text, inner.width);
  const maxLines = Math.max(1, Math.floor(inner.height / lineHeight));
  const visibleLines = lines.slice(0, maxLines);
  if (visibleLines.length < lines.length) {
    const lastIndex = visibleLines.length - 1;
    visibleLines[lastIndex] = truncateCanvasText(
      context,
      visibleLines[lastIndex] ?? "",
      inner.width,
    );
  }

  const totalHeight = visibleLines.length * lineHeight;
  const startY =
    options.vertical === "center"
      ? inner.y + Math.max(0, (inner.height - totalHeight) / 2)
      : inner.y;
  const x =
    context.textAlign === "center"
      ? inner.x + inner.width / 2
      : context.textAlign === "right" || context.textAlign === "end"
        ? inner.x + inner.width
        : inner.x;

  visibleLines.forEach((line, index) => {
    context.fillText(line, x, startY + index * lineHeight);
  });
  context.restore();
}

function canvasTextContentRect(
  context: CanvasRenderingContext2D,
  text: string,
  rect: Rect,
  style: DiagramElement["style"],
  options: CanvasTextOptions = {},
): Rect {
  const padding = options.padding ?? 12;
  const inner = {
    x: rect.x + padding,
    y: rect.y + padding,
    width: Math.max(1, rect.width - padding * 2),
    height: Math.max(1, rect.height - padding * 2),
  };
  context.save();
  context.font = `${cssFontStyle(style)} ${cssFontWeight(style, options.weight ?? 650)} ${style.fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const lineHeight = style.fontSize * 1.22;
  const lines = wrapCanvasText(context, text, inner.width);
  const maxLines = Math.max(1, Math.floor(inner.height / lineHeight));
  const visibleLines = lines.slice(0, maxLines);
  const width = Math.max(
    1,
    Math.min(
      inner.width,
      ...visibleLines.map((line) => Math.ceil(context.measureText(line).width)),
    ),
  );
  context.restore();

  const height = Math.min(inner.height, visibleLines.length * lineHeight);
  const x =
    options.align === "left" || options.align === "start"
      ? inner.x
      : options.align === "right" || options.align === "end"
        ? inner.x + inner.width - width
        : inner.x + (inner.width - width) / 2;
  const y =
    options.vertical === "center" ? inner.y + Math.max(0, (inner.height - height) / 2) : inner.y;
  return { x, y, width, height };
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    let current = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current) {
        lines.push(current);
        current = "";
      }

      if (context.measureText(word).width <= maxWidth) {
        current = word;
        continue;
      }

      const parts = splitCanvasToken(context, word, maxWidth);
      lines.push(...parts.slice(0, -1));
      current = parts.at(-1) ?? "";
    }

    if (current) {
      lines.push(current);
    }
  }

  return lines.length > 0 ? lines : [""];
}

function splitCanvasToken(context: CanvasRenderingContext2D, token: string, maxWidth: number) {
  const parts: string[] = [];
  let current = "";
  for (const character of [...token]) {
    const next = `${current}${character}`;
    if (current && context.measureText(next).width > maxWidth) {
      parts.push(current);
      current = character;
    } else {
      current = next;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts.length > 0 ? parts : [token];
}

function truncateCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const suffix = "...";
  if (context.measureText(text).width <= maxWidth) {
    return text;
  }

  let value = text;
  while (value.length > 0 && context.measureText(`${value}${suffix}`).width > maxWidth) {
    value = value.slice(0, -1);
  }

  const suffixFits = context.measureText(suffix).width <= maxWidth;
  return value || suffixFits ? `${value}${suffix}` : "";
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Could not create PNG."));
      }
    }, "image/png");
  });
}
