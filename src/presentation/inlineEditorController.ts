import type {
  ArrowElement,
  DiagramBoard,
  DiagramElement,
  Point,
  Rect,
} from "../interfaces/index.js";
import { clamp } from "../shared/index.js";
import { arrowLabelRect } from "./canvasGeometry.js";
import { elements } from "./dom.js";
import { cssFontStyle, cssFontWeight, hasText, shouldPaint } from "./format.js";

type InlineEditorControllerOptions = {
  getBoard: () => DiagramBoard | null;
  getElementBounds: (element: DiagramElement) => Rect;
  endpointForArrow: (board: DiagramBoard, arrow: ArrowElement, endpoint: "start" | "end") => Point;
  updateText: (board: DiagramBoard, id: string, text: string) => Promise<void>;
  selectOnly: (id: string) => void;
  render: () => void;
};

export class InlineEditorController {
  private editingElementId: string | null = null;
  private editorPlacement: "center" | "start" = "start";
  private editorHorizontalPadding = 10;
  private measurementElement: HTMLDivElement | null = null;

  constructor(private readonly options: InlineEditorControllerOptions) {}

  get activeElementId() {
    return this.editingElementId;
  }

  open(id: string) {
    const board = this.options.getBoard();
    const element = board?.elements.find((entry) => entry.id === id);
    if (!board || !element || !hasText(element) || element.locked) {
      return;
    }

    this.editingElementId = id;
    this.options.selectOnly(id);
    const box = this.editorBoxForElement(element, board);
    elements.inlineEditor.value = element.text;
    elements.inlineEditor.style.left = `${box.x}px`;
    elements.inlineEditor.style.top = `${box.y}px`;
    elements.inlineEditor.style.width = `${box.width}px`;
    elements.inlineEditor.style.height = `${box.height}px`;
    elements.inlineEditor.style.fontSize = `${clamp(element.style.fontSize * board.viewport.zoom, 13, 32)}px`;
    elements.inlineEditor.style.fontWeight = String(
      cssFontWeight(element.style, element.type === "comment" ? 500 : 650),
    );
    elements.inlineEditor.style.fontStyle = cssFontStyle(element.style);
    elements.inlineEditor.style.color = editorTextColor(element);
    this.applyTextPlacement(element);
    elements.inlineEditor.classList.add("is-open");
    this.centerEditorText();
    this.options.render();
    this.focus(id);
    window.requestAnimationFrame(() => {
      this.centerEditorText();
      this.focus(id);
    });
  }

  close(save: boolean) {
    if (!this.editingElementId) {
      return;
    }

    const board = this.options.getBoard();
    const id = this.editingElementId;
    this.editingElementId = null;
    elements.inlineEditor.classList.remove("is-open");
    if (save && board) {
      void this.options.updateText(board, id, elements.inlineEditor.value).finally(() => {
        this.options.render();
      });
      return;
    }

    this.options.render();
  }

  handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      this.close(false);
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      this.close(true);
    }
  }

  handleInput() {
    this.centerEditorText();
  }

  private focus(id: string) {
    if (this.editingElementId !== id) {
      return;
    }

    try {
      elements.inlineEditor.focus({ preventScroll: true });
    } catch {
      elements.inlineEditor.focus();
    }
    elements.inlineEditor.setSelectionRange(0, elements.inlineEditor.value.length);
    elements.inlineEditor.select();
  }

  private editorBoxForElement(element: DiagramElement, board: DiagramBoard): Rect {
    const viewport = board.viewport;
    const bounds = this.options.getElementBounds(element);
    const stageRect = elements.canvasStage.getBoundingClientRect();
    const isArrow = element.type === "arrow";
    const arrowLabel = isArrow
      ? arrowLabelRect(
          element as ArrowElement,
          this.options.endpointForArrow(board, element as ArrowElement, "start"),
          this.options.endpointForArrow(board, element as ArrowElement, "end"),
        )
      : null;
    const width = arrowLabel?.width ?? bounds.width;
    const height = arrowLabel?.height ?? bounds.height;
    const x = arrowLabel?.x ?? bounds.x;
    const y = arrowLabel?.y ?? bounds.y;

    return {
      x: stageRect.left + viewport.x + x * viewport.zoom,
      y: stageRect.top + viewport.y + y * viewport.zoom,
      width: clamp(width * viewport.zoom, 140, 520),
      height: clamp(height * viewport.zoom, 58, 360),
    };
  }

  private applyTextPlacement(element: DiagramElement) {
    this.editorPlacement = shouldCenterEditorText(element) ? "center" : "start";
    this.editorHorizontalPadding = element.type === "arrow" ? 4 : 10;
    elements.inlineEditor.style.textAlign = this.editorPlacement === "center" ? "center" : "left";
    elements.inlineEditor.style.padding = `10px ${this.editorHorizontalPadding}px`;
  }

  private centerEditorText() {
    if (this.editorPlacement !== "center" || !this.editingElementId) {
      return;
    }

    const editor = elements.inlineEditor;
    const textHeight = this.measureEditorTextHeight(editor);
    const verticalPadding = Math.max(4, (editor.clientHeight - textHeight) / 2);
    editor.style.padding = `${verticalPadding}px ${this.editorHorizontalPadding}px`;
  }

  private measureEditorTextHeight(editor: HTMLTextAreaElement) {
    const measurementElement = this.getMeasurementElement();
    const computed = window.getComputedStyle(editor);
    const width = Math.max(1, editor.clientWidth - this.editorHorizontalPadding * 2);
    measurementElement.style.width = `${width}px`;
    measurementElement.style.font = computed.font;
    measurementElement.style.fontStyle = computed.fontStyle;
    measurementElement.style.fontWeight = computed.fontWeight;
    measurementElement.style.fontSize = computed.fontSize;
    measurementElement.style.lineHeight = computed.lineHeight;
    measurementElement.textContent = editor.value || " ";

    const lineHeight =
      Number.parseFloat(computed.lineHeight) || Number.parseFloat(computed.fontSize) * 1.25;
    return Math.max(lineHeight, measurementElement.getBoundingClientRect().height);
  }

  private getMeasurementElement() {
    if (this.measurementElement?.isConnected) {
      return this.measurementElement;
    }

    this.measurementElement = document.createElement("div");
    this.measurementElement.style.position = "fixed";
    this.measurementElement.style.left = "-9999px";
    this.measurementElement.style.top = "-9999px";
    this.measurementElement.style.visibility = "hidden";
    this.measurementElement.style.whiteSpace = "pre-wrap";
    this.measurementElement.style.overflowWrap = "anywhere";
    this.measurementElement.style.pointerEvents = "none";
    document.body.append(this.measurementElement);
    return this.measurementElement;
  }
}

function shouldCenterEditorText(element: DiagramElement) {
  return element.type === "sticky" || element.type === "shape" || element.type === "arrow";
}

function editorTextColor(element: DiagramElement) {
  if (
    element.type === "text" &&
    !shouldPaint(element.style.fill) &&
    document.documentElement.dataset.theme === "dark"
  ) {
    return "#f8fafc";
  }

  return element.style.text;
}
