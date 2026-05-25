import { Board, DiagramCommandService } from "../../src/domain/index.js";
import type { ArrowElement, ArrowHead, DiagramBoard } from "../../src/interfaces/index.js";
import type { GeometryContext } from "../../src/presentation/canvasGeometry.js";
import { renderElement, renderOverlayLayer } from "../../src/presentation/svgRenderer.js";

const commandService = new DiagramCommandService();
const geometry: GeometryContext = {
  getElementBounds: (element) => commandService.getElementBounds(element),
  getConnectionPoint: (element, anchor) => commandService.getConnectionPoint(element, anchor),
};

function boardWith(arrow: ArrowElement): DiagramBoard {
  return {
    ...Board.create("Render test", "2026-01-01T00:00:00.000Z"),
    elements: [arrow],
  };
}

function arrowWithHead(arrowHead?: ArrowHead): ArrowElement {
  const arrow = commandService.createElement(
    "arrow",
    { x: 0, y: 0 },
    {
      id: `arrow_${arrowHead ?? "default"}`,
      style: { stroke: "#334155" },
    },
  );
  if (arrow.type !== "arrow") {
    throw new Error("Expected arrow");
  }

  return {
    ...arrow,
    ...(arrowHead ? { arrowHead } : {}),
  };
}

function renderedHeadCount(markup: string) {
  return markup.match(/fill="#334155"/g)?.length ?? 0;
}

describe("svg renderer", () => {
  it("marks only transparent free text as bare text for dark canvas contrast", () => {
    const board = Board.create("Text render", "2026-01-01T00:00:00.000Z");
    const bareText = commandService.createElement("text", { x: 0, y: 0 }, { id: "bare" });
    const backedText = commandService.createElement(
      "text",
      { x: 0, y: 80 },
      {
        id: "backed",
        style: { fill: "#ffffff" },
      },
    );

    expect(renderElement(board, bareText, geometry)).toContain("is-free-text is-bare-text");
    expect(renderElement(board, backedText, geometry)).toContain("is-free-text");
    expect(renderElement(board, backedText, geometry)).not.toContain("is-bare-text");
  });

  it("suppresses rendered element text while inline editing", () => {
    const board = Board.create("Text edit render", "2026-01-01T00:00:00.000Z");
    const text = commandService.createElement(
      "text",
      { x: 0, y: 0 },
      {
        id: "text",
        style: { fill: "#ffffff" },
        text: "Previous value",
      },
    );
    const markup = renderElement(board, text, {
      ...geometry,
      editingElementId: "text",
    });

    expect(markup).toContain('data-element-id="text"');
    expect(markup).toContain('fill="#ffffff"');
    expect(markup).not.toContain("<foreignObject");
    expect(markup).not.toContain("Previous value");
  });

  it("clamps rendered text to the element height", () => {
    const board = Board.create("Text clamp render", "2026-01-01T00:00:00.000Z");
    const text = commandService.createElement(
      "text",
      { x: 0, y: 0 },
      {
        id: "text",
        size: { height: 68 },
        text: "A long block of text that should stay bounded by the element",
      },
    );
    const markup = renderElement(board, text, geometry);

    expect(markup).toContain('class="element-text-content"');
    expect(markup).toContain("--element-line-clamp: 2");
  });

  it("renders extended shape variants", () => {
    const board = Board.create("Shape render", "2026-01-01T00:00:00.000Z");
    const documentShape = commandService.createElement("document", { x: 0, y: 0 });
    const databaseShape = commandService.createElement("database", { x: 220, y: 0 });
    const octagonShape = commandService.createElement("octagon", { x: 440, y: 0 });

    expect(renderElement(board, documentShape, geometry)).toContain("<path");
    expect(renderElement(board, databaseShape, geometry)).toContain('fill="none"');
    expect(renderElement(board, octagonShape, geometry)).toContain("<path");
  });

  it("renders configurable arrowheads", () => {
    const defaultArrow = arrowWithHead();
    const noHeadArrow = arrowWithHead("none");
    const startHeadArrow = arrowWithHead("start");
    const doubleHeadArrow = arrowWithHead("both");

    expect(renderedHeadCount(renderElement(boardWith(defaultArrow), defaultArrow, geometry))).toBe(
      1,
    );
    expect(renderedHeadCount(renderElement(boardWith(noHeadArrow), noHeadArrow, geometry))).toBe(0);
    expect(
      renderedHeadCount(renderElement(boardWith(startHeadArrow), startHeadArrow, geometry)),
    ).toBe(1);
    expect(
      renderedHeadCount(renderElement(boardWith(doubleHeadArrow), doubleHeadArrow, geometry)),
    ).toBe(2);
  });

  it("uses a line-shaped hit target for arrows instead of a bounding box", () => {
    const arrow = arrowWithHead("end");
    const markup = renderElement(boardWith(arrow), arrow, geometry);

    expect(markup).toContain('class="arrow-hit-path"');
    expect(markup).toContain('pointer-events="stroke"');
    expect(markup).not.toContain('fill="transparent"');
  });

  it("renders arrow labels as selectable text targets with text styling", () => {
    const baseArrow = arrowWithHead("end");
    const arrow = {
      ...baseArrow,
      text: "Styled label",
      style: {
        ...baseArrow.style,
        fill: "#ffffff",
        fontWeight: "bold",
        fontStyle: "italic",
      },
    } satisfies ArrowElement;
    const markup = renderElement(boardWith(arrow), arrow, {
      ...geometry,
      textTargetId: arrow.id,
    });

    expect(markup).toContain("is-selected-arrow-label");
    expect(markup).toContain("--element-font-weight: 800");
    expect(markup).toContain("--element-font-style: italic");
    expect(markup).toContain("arrow-label-text-backdrop");
    expect(markup).toContain("element-text-content");
    expect(markup).toContain("--arrow-label-backdrop: #ffffff");
  });

  it("gives arrow labels an automatic translucent backdrop without an explicit fill", () => {
    const baseArrow = arrowWithHead("end");
    const arrow = {
      ...baseArrow,
      text: "Readable label",
      style: {
        ...baseArrow.style,
        fill: "transparent",
      },
    } satisfies ArrowElement;
    const markup = renderElement(boardWith(arrow), arrow, geometry);

    expect(markup).toContain("arrow-label-text-backdrop");
    expect(markup).toContain("--arrow-label-backdrop: rgba(255,255,255,0.88)");
    expect(markup).not.toContain('class="arrow-label-backdrop"');
  });

  it("keeps arrow label hitboxes but hides label text while inline editing", () => {
    const baseArrow = arrowWithHead("end");
    const arrow = {
      ...baseArrow,
      text: "Editable label",
    } satisfies ArrowElement;
    const markup = renderElement(boardWith(arrow), arrow, {
      ...geometry,
      editingElementId: arrow.id,
    });

    expect(markup).toContain('class="arrow-label-hitbox"');
    expect(markup).not.toContain("Editable label");
    expect(markup).not.toContain("arrow-label-text-backdrop");
  });

  it("shows a lock badge instead of resize handles for locked selections", () => {
    const locked = {
      ...commandService.createElement("rectangle", { x: 0, y: 0 }, { id: "locked" }),
      locked: true,
    };
    const board = {
      ...Board.create("Locked render", "2026-01-01T00:00:00.000Z"),
      elements: [locked],
    };
    const markup = renderOverlayLayer(board, null, {
      ...geometry,
      selectedIds: new Set(["locked"]),
    });

    expect(markup).toContain("lock-badge");
    expect(markup).not.toContain("data-resize-id");
  });
});
