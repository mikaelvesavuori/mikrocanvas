import type {
  ArrowElement,
  ArrowHead,
  DiagramBoard,
  DiagramElement,
  Point,
  Rect,
  ShapeElement,
} from "../interfaces/index.js";
import { distance, normalizeRect } from "../shared/index.js";
import {
  arrowLabelRect,
  arrowPath,
  arrowPathOptions,
  arrowPathPoints,
  boardBounds,
  endpointForArrowOnBoard,
  type GeometryContext,
  rectForPoints,
} from "./canvasGeometry.js";
import { cssFontStyle, cssFontWeight, escapeAttr, escapeHtml, shouldPaint } from "./format.js";
import type { Interaction } from "./interaction.js";
import {
  pathCommandsToSvg,
  shapeDecorationPathCommands,
  shapePathCommands,
} from "./shapeGeometry.js";

const svgNamespace = "http://www.w3.org/2000/svg";
const xhtmlNamespace = "http://www.w3.org/1999/xhtml";
const automaticArrowLabelFill = "rgba(255,255,255,0.88)";

export type SvgRenderContext = GeometryContext & {
  editingElementId?: string | null;
  selectedIds?: ReadonlySet<string>;
  textTargetId?: string | null;
};

export function renderWorldLayer(
  board: DiagramBoard,
  interaction: Interaction | null,
  context: SvgRenderContext,
) {
  return (
    board.elements.map((element) => renderElement(board, element, context)).join("") +
    renderDraftElement(board, interaction, context)
  );
}

export function renderOverlayLayer(
  board: DiagramBoard,
  interaction: Interaction | null,
  context: SvgRenderContext,
) {
  return (
    renderSelectionOverlay(board, context) +
    renderMarquee(interaction) +
    renderConnectionHint(interaction)
  );
}

export function renderElement(
  board: DiagramBoard,
  element: DiagramElement,
  context: SvgRenderContext,
) {
  const selectedClass = context.selectedIds?.has(element.id) ? " is-selected" : "";
  const isEditingText = context.editingElementId === element.id;
  if (element.type === "sticky") {
    return `<g class="diagram-element${selectedClass}" data-element-id="${escapeAttr(element.id)}">
      <rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="8" fill="${escapeAttr(element.style.fill)}" stroke="${escapeAttr(element.style.stroke)}" stroke-width="${element.style.strokeWidth}" filter="url(#soft-shadow)" />
      <path d="M ${element.x + element.width - 32} ${element.y + element.height} L ${element.x + element.width} ${element.y + element.height - 32} L ${element.x + element.width} ${element.y + element.height} Z" fill="rgba(255,255,255,0.42)" />
      ${isEditingText ? "" : renderForeignText(element, element.x, element.y, element.width, element.height)}
    </g>`;
  }

  if (element.type === "text") {
    const textClass = shouldPaint(element.style.fill)
      ? "is-free-text"
      : "is-free-text is-bare-text";
    const background = renderTextBackground(element, {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    });
    return `<g class="diagram-element${selectedClass}" data-element-id="${escapeAttr(element.id)}">
      ${background}
      <rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="6" fill="transparent" stroke="transparent" />
      ${isEditingText ? "" : renderForeignText(element, element.x, element.y, element.width, element.height, textClass)}
    </g>`;
  }

  if (element.type === "shape") {
    return `<g class="diagram-element${selectedClass}" data-element-id="${escapeAttr(element.id)}">
      ${renderShapeGraphic(element)}
      ${isEditingText ? "" : renderForeignText(element, element.x, element.y, element.width, element.height)}
    </g>`;
  }

  if (element.type === "arrow") {
    const start = endpointForArrowOnBoard(board, element, "start", context);
    const end = endpointForArrowOnBoard(board, element, "end", context);
    const label = arrowLabelRect(element, start, end);
    const routeOptions = arrowPathOptions(element);
    const path = arrowPath(start, end, element.route, routeOptions);
    const pathPoints = arrowPathPoints(start, end, element.route, routeOptions);
    const next = nextDistinctPoint(pathPoints, start);
    const previous = previousDistinctPoint(pathPoints, end);
    const selectedLabelClass =
      context.textTargetId === element.id ? " is-selected-arrow-label" : "";
    const labelBackdropFill = shouldPaint(element.style.fill)
      ? element.style.fill
      : automaticArrowLabelFill;
    const labelText = isEditingText
      ? ""
      : renderForeignText(element, label.x, label.y, label.width, label.height, "is-arrow-label", {
          textWrapperClassName: "arrow-label-text-backdrop",
          textWrapperStyle: `--arrow-label-backdrop: ${labelBackdropFill}`,
        });
    const labelHitbox = `<rect class="arrow-label-hitbox${selectedLabelClass}" data-arrow-label-id="${escapeAttr(element.id)}" x="${label.x}" y="${label.y}" width="${label.width}" height="${label.height}" rx="6" fill="transparent" />`;
    const labelMarkup = element.text ? `${labelText}${labelHitbox}` : "";
    return `<g class="diagram-element${selectedClass}" data-element-id="${escapeAttr(element.id)}">
      <path d="${path}" fill="none" stroke="${escapeAttr(element.style.stroke)}" stroke-width="${element.style.strokeWidth + 1}" stroke-linecap="round" stroke-linejoin="round"${strokeDashAttr(element.style)} />
      ${renderArrowHeads(element, next, start, previous, end)}
      <path class="arrow-hit-path" d="${path}" fill="none" stroke="transparent" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" pointer-events="stroke" vector-effect="non-scaling-stroke" />
      ${labelMarkup}
    </g>`;
  }

  if (element.type === "draw") {
    return `<g class="diagram-element${selectedClass}" data-element-id="${escapeAttr(element.id)}">
      <polyline points="${pointsToString(element.points)}" fill="none" stroke="${escapeAttr(element.style.stroke)}" stroke-width="${element.style.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${strokeDashAttr(element.style)} />
    </g>`;
  }

  return `<g class="diagram-element${selectedClass}" data-element-id="${escapeAttr(element.id)}">
    <rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="8" fill="${escapeAttr(element.style.fill)}" stroke="${escapeAttr(element.style.stroke)}" stroke-width="${element.style.strokeWidth}" filter="url(#soft-shadow)" />
    <circle cx="${element.x + 16}" cy="${element.y + 16}" r="7" fill="${escapeAttr(element.style.stroke)}" />
    ${isEditingText ? "" : renderForeignText(element, element.x + 34, element.y + 8, Math.max(42, element.width - 44), Math.max(32, element.height - 16), "is-comment")}
  </g>`;
}

function renderShapeGraphic(element: ShapeElement) {
  const fill = escapeAttr(element.style.fill);
  const stroke = escapeAttr(element.style.stroke);
  const strokeWidth = element.style.strokeWidth;
  const path = pathCommandsToSvg(shapePathCommands(element.shape, element));
  const decoration = shapeDecorationPathCommands(element.shape, element);
  const decorationMarkup = decoration
    ? `<path d="${pathCommandsToSvg(decoration)}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" />`
    : "";

  return `<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" filter="url(#soft-shadow)" />${decorationMarkup}`;
}

export function buildSvg(board: DiagramBoard, context: GeometryContext) {
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

  return `<svg xmlns="${svgNamespace}" width="${Math.round(viewBox.width)}" height="${Math.round(viewBox.height)}" viewBox="${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}">
    <defs>
      <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#0f172a" flood-opacity="0.12" />
      </filter>
      <style>
        .element-text{width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:12px;color:var(--element-text-color);font-size:var(--element-font-size);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-weight:var(--element-font-weight);font-style:var(--element-font-style);line-height:1.22;text-align:center;overflow:hidden;overflow-wrap:anywhere;box-sizing:border-box}
        .element-text-content{display:-webkit-box;max-width:100%;min-width:0;overflow:hidden;overflow-wrap:anywhere;white-space:pre-wrap;-webkit-box-orient:vertical;-webkit-line-clamp:var(--element-line-clamp);line-clamp:var(--element-line-clamp)}
        .is-free-text{justify-content:flex-start;align-items:flex-start;padding:0;text-align:left}
        .is-comment{justify-content:flex-start;align-items:flex-start;padding:0;text-align:left}
        .is-arrow-label{padding:4px;text-align:center}
        .arrow-label-text-backdrop{box-sizing:border-box;padding:2px 6px;border-radius:6px;background:var(--arrow-label-backdrop)}
      </style>
    </defs>
    <rect x="${viewBox.x}" y="${viewBox.y}" width="${viewBox.width}" height="${viewBox.height}" fill="#f8fafc" />
    ${board.elements.map((element) => renderElement(board, element, context)).join("")}
  </svg>`;
}

function renderForeignText(
  element: Extract<DiagramElement, { text: string }>,
  x: number,
  y: number,
  width: number,
  height: number,
  className = "",
  options: { textWrapperClassName?: string; textWrapperStyle?: string } = {},
) {
  const textWrapperClassName = options.textWrapperClassName
    ? `${options.textWrapperClassName} element-text-content`
    : "element-text-content";
  const text = options.textWrapperClassName
    ? `<span class="${escapeAttr(textWrapperClassName)}"${options.textWrapperStyle ? ` style="${escapeAttr(options.textWrapperStyle)}"` : ""}>${escapeHtml(element.text)}</span>`
    : `<span class="${textWrapperClassName}">${escapeHtml(element.text)}</span>`;
  const lineClamp = textLineClamp(
    height,
    element.style.fontSize,
    className,
    options.textWrapperClassName ? 2 : 0,
  );
  return `<foreignObject data-element-id="${escapeAttr(element.id)}" x="${x}" y="${y}" width="${width}" height="${height}">
    <div xmlns="${xhtmlNamespace}" data-element-id="${escapeAttr(element.id)}" class="element-text ${className}" style="--element-text-color: ${escapeAttr(element.style.text)}; --element-font-size: ${element.style.fontSize}px; --element-font-weight: ${cssFontWeight(element.style, className === "is-comment" ? 500 : 650)}; --element-font-style: ${cssFontStyle(element.style)}; --element-line-clamp: ${lineClamp};">${text}</div>
  </foreignObject>`;
}

function textLineClamp(height: number, fontSize: number, className: string, wrapperPaddingY = 0) {
  const lineHeight = fontSize * 1.22;
  const availableHeight = height - textPaddingY(className) * 2 - wrapperPaddingY * 2;
  return Math.max(1, Math.floor(availableHeight / lineHeight));
}

function textPaddingY(className: string) {
  if (className.includes("is-free-text") || className.includes("is-comment")) {
    return 0;
  }

  if (className.includes("is-arrow-label")) {
    return 4;
  }

  return 12;
}

function renderTextBackground(
  element: Extract<DiagramElement, { text: string }>,
  rect: Rect,
  paddingX = 10,
  paddingY = 8,
  options: { className?: string } = {},
) {
  if (!shouldPaint(element.style.fill)) {
    return "";
  }

  const className = options.className ? ` class="${escapeAttr(options.className)}"` : "";
  const stroke = shouldPaint(element.style.stroke)
    ? ` stroke="${escapeAttr(element.style.stroke)}" stroke-width="${element.style.strokeWidth}"`
    : "";
  return `<rect${className} x="${rect.x - paddingX}" y="${rect.y - paddingY}" width="${rect.width + paddingX * 2}" height="${rect.height + paddingY * 2}" rx="8" fill="${escapeAttr(element.style.fill)}"${stroke} />`;
}

function renderDraftElement(
  board: DiagramBoard,
  interaction: Interaction | null,
  context: SvgRenderContext,
) {
  if (interaction?.kind === "createArrow") {
    return renderElement(
      board,
      {
        ...interaction.draft,
        end: interaction.currentWorld,
      },
      context,
    );
  }

  if (interaction?.kind === "draw" && interaction.points.length > 1) {
    return `<g class="diagram-element"><polyline points="${pointsToString(interaction.points)}" fill="none" stroke="#334155" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></g>`;
  }

  return "";
}

function renderSelectionOverlay(board: DiagramBoard, context: SvgRenderContext) {
  const selected = board.elements.filter((element) => context.selectedIds?.has(element.id));
  return selected.map((element) => renderElementOverlay(board, element, context)).join("");
}

function renderElementOverlay(
  board: DiagramBoard,
  element: DiagramElement,
  context: GeometryContext,
) {
  if (element.type === "arrow") {
    const start = endpointForArrowOnBoard(board, element, "start", context);
    const end = endpointForArrowOnBoard(board, element, "end", context);
    const routeOptions = arrowPathOptions(element);
    const path = arrowPath(start, end, element.route, routeOptions);
    const bounds = rectForPoints(arrowPathPoints(start, end, element.route, routeOptions));
    return `<g>
      <path class="line-selection-path" d="${path}" />
      <path class="line-selection-core" d="${path}" />
      ${
        element.locked
          ? renderLockBadge(bounds)
          : `<circle class="arrow-handle" data-arrow-handle="start" data-arrow-id="${escapeAttr(element.id)}" cx="${start.x}" cy="${start.y}" r="6" />
      <circle class="arrow-handle" data-arrow-handle="end" data-arrow-id="${escapeAttr(element.id)}" cx="${end.x}" cy="${end.y}" r="6" />`
      }
    </g>`;
  }

  if (element.type === "draw") {
    const points = pointsToString(element.points);
    return `<g>
      <polyline class="line-selection-path" points="${points}" />
      <polyline class="line-selection-core" points="${points}" />
      ${element.locked ? renderLockBadge(context.getElementBounds(element)) : ""}
    </g>`;
  }

  const bounds = context.getElementBounds(element);
  return `<g>
    <rect class="element-outline" x="${bounds.x - 5}" y="${bounds.y - 5}" width="${bounds.width + 10}" height="${bounds.height + 10}" rx="8" style="display:block" />
    ${element.locked ? renderLockBadge(bounds) : `<rect class="resize-handle" data-resize-id="${escapeAttr(element.id)}" x="${bounds.x + bounds.width - 5}" y="${bounds.y + bounds.height - 5}" width="10" height="10" rx="3" />`}
  </g>`;
}

function renderLockBadge(bounds: Rect) {
  const x = bounds.x + bounds.width - 12;
  const y = bounds.y - 18;
  return `<g class="lock-badge" transform="translate(${x} ${y})">
    <rect x="0" y="0" width="24" height="24" rx="12" />
    <svg x="5" y="5" width="14" height="14" viewBox="0 0 24 24">
      <use href="#icon-lock"></use>
    </svg>
  </g>`;
}

function renderMarquee(interaction: Interaction | null) {
  if (interaction?.kind !== "marquee") {
    return "";
  }

  const rect = normalizeRect(interaction.startWorld, interaction.currentWorld);
  return `<rect class="selection-marquee" x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="6" />`;
}

function renderConnectionHint(interaction: Interaction | null) {
  const target =
    interaction?.kind === "createArrow" || interaction?.kind === "arrowHandle"
      ? interaction.snapTarget
      : null;
  if (!target) {
    return "";
  }

  return `<g>
    <rect class="connection-target" x="${target.bounds.x - 6}" y="${target.bounds.y - 6}" width="${target.bounds.width + 12}" height="${target.bounds.height + 12}" rx="10" />
    <circle class="connection-hint" cx="${target.point.x}" cy="${target.point.y}" r="8" />
  </g>`;
}

function strokeDashAttr(style: DiagramElement["style"]) {
  return style.strokeStyle === "dashed" ? ' stroke-dasharray="12 10"' : "";
}

function renderArrowHeads(
  arrow: ArrowElement,
  next: Point | null,
  start: Point,
  previous: Point | null,
  end: Point,
) {
  if (!shouldPaint(arrow.style.stroke)) {
    return "";
  }

  const arrowHead = arrow.arrowHead ?? "end";
  const size = Math.max(10, arrow.style.strokeWidth * 4.4);
  const startHead =
    next && hasArrowHead(arrowHead, "start")
      ? renderArrowHead(next, start, arrow.style.stroke, size)
      : "";
  const endHead =
    previous && hasArrowHead(arrowHead, "end")
      ? renderArrowHead(previous, end, arrow.style.stroke, size)
      : "";
  return `${startHead}${endHead}`;
}

function hasArrowHead(arrowHead: ArrowHead, endpoint: "start" | "end") {
  return arrowHead === "both" || arrowHead === endpoint;
}

function renderArrowHead(from: Point, to: Point, color: string, size: number) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const wing = 0.58;
  const left = {
    x: to.x - Math.cos(angle - wing) * size,
    y: to.y - Math.sin(angle - wing) * size,
  };
  const right = {
    x: to.x - Math.cos(angle + wing) * size,
    y: to.y - Math.sin(angle + wing) * size,
  };
  return `<path d="M ${to.x} ${to.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z" fill="${escapeAttr(color)}" />`;
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

function previousDistinctPoint(points: Point[], end: Point) {
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const point = points[index];
    if (point && distance(point, end) > 0.5) {
      return point;
    }
  }

  return null;
}

function pointsToString(points: Array<{ x: number; y: number }>) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}
