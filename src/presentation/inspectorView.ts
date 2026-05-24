import type { ArrowElement, DiagramBoard, DiagramElement } from "../interfaces/index.js";
import { elements } from "./dom.js";
import { colorInputValue, hasText, shouldPaint } from "./format.js";
import { inspectorControlState, selectedArrowElements } from "./inspectorControls.js";

export function renderInspector(
  board: DiagramBoard | null,
  selectedIds: ReadonlySet<string>,
  textTargetId: string | null = null,
) {
  const selected = board?.elements.filter((element) => selectedIds.has(element.id)) ?? [];
  elements.inspector.hidden = selected.length === 0;
  if (selected.length === 0) {
    return;
  }

  const first = selected[0];
  if (!first) {
    return;
  }

  const controls = inspectorControlState(selected, { textTargetId });
  const selectedArrows = selectedArrowElements(selected);
  const selectedLines = selected.filter(
    (element) => element.type === "arrow" || element.type === "draw",
  );
  elements.editTextButton.hidden = !controls.editText;
  elements.selectionChip.hidden = !controls.editText;
  elements.primaryContextSeparator.hidden = !controls.primarySeparator;
  elements.fillControl.hidden = !controls.fill;
  const fillLabel = controls.textTarget ? "Text background color" : "Fill color";
  elements.fillControlTrigger.title = fillLabel;
  elements.fillControlTrigger.setAttribute("aria-label", fillLabel);
  elements.strokeControl.hidden = !controls.stroke;
  elements.textStyleControl.hidden = !controls.textStyle;
  elements.lineStyleControl.hidden = !controls.lineStyle;
  elements.routeArrowButton.hidden = !controls.arrowRoute;
  elements.arrowHeadControl.hidden = !controls.arrowHead;
  elements.arrangeContextSeparator.hidden = !controls.arrangeSeparator;
  elements.lockSelectionButton.hidden = !controls.lock;
  elements.lockSelectionButton.classList.toggle("is-active", controls.locked);
  elements.lockSelectionButton.title = controls.locked ? "Unlock selection" : "Lock selection";
  elements.lockSelectionButton.setAttribute(
    "aria-label",
    controls.locked ? "Unlock selection" : "Lock selection",
  );
  elements.lockSelectionButton.setAttribute("aria-pressed", String(controls.locked));
  elements.lockSelectionIcon.setAttribute("href", controls.locked ? "#icon-unlock" : "#icon-lock");
  elements.arrangeControl.hidden = !controls.canMutate;
  elements.duplicateButton.hidden = !controls.canMutate;
  elements.deleteSelectionButton.hidden = !controls.canMutate;
  elements.routeArrowButton.classList.toggle("is-active", selectedArrows[0]?.route === "elbow");
  elements.textValueInput.disabled = !controls.editText;
  elements.textValueInput.value = controls.editText && hasText(first) ? first.text : "";
  elements.fillColorInput.value = colorInputValue(first.style.fill);
  elements.strokeColorInput.value = colorInputValue(first.style.stroke);
  elements.textColorInput.value = colorInputValue(first.style.text);
  elements.fontSizeInput.value = String(first.style.fontSize);
  elements.currentFontSize.textContent = String(first.style.fontSize);
  elements.boldTextButton.classList.toggle("is-active", first.style.fontWeight === "bold");
  elements.boldTextButton.setAttribute("aria-pressed", String(first.style.fontWeight === "bold"));
  elements.italicTextButton.classList.toggle("is-active", first.style.fontStyle === "italic");
  elements.italicTextButton.setAttribute(
    "aria-pressed",
    String(first.style.fontStyle === "italic"),
  );
  renderActiveStyleControls(first, selectedLines[0], selectedArrows[0]);
}

function renderActiveStyleControls(
  element: DiagramElement,
  lineElement: DiagramElement | undefined,
  arrowElement: ArrowElement | undefined,
) {
  for (const swatch of document.querySelectorAll<HTMLButtonElement>("[data-style-kind]")) {
    const kind = swatch.dataset.styleKind;
    const color = swatch.dataset.color;
    const active =
      (kind === "fill" && color === element.style.fill) ||
      (kind === "stroke" && color === element.style.stroke) ||
      (kind === "text" && color === element.style.text);
    swatch.classList.toggle("is-active", active);
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-line-style]")) {
    button.classList.toggle(
      "is-active",
      button.dataset.lineStyle === (lineElement?.style.strokeStyle ?? "solid"),
    );
  }

  const arrowHead = arrowElement?.arrowHead ?? "end";
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-arrow-head]")) {
    button.classList.toggle("is-active", button.dataset.arrowHead === arrowHead);
  }

  setCurrentArrowHead();
  paintCurrentSwatch(elements.currentFillSwatch, element.style.fill);
  paintCurrentSwatch(elements.currentStrokeSwatch, element.style.stroke);
  paintCurrentSwatch(elements.currentLineStyle, element.style.stroke);
  elements.currentLineStyle.style.borderTopStyle =
    lineElement?.style.strokeStyle === "dashed" ? "dashed" : "solid";
  elements.currentLineStyle.classList.toggle(
    "is-active",
    lineElement?.style.strokeStyle === "dashed",
  );
}

function paintCurrentSwatch(target: HTMLElement, color: string) {
  target.style.setProperty("--swatch", color);
  target.classList.toggle("is-transparent", !shouldPaint(color));
}

function setCurrentArrowHead() {
  elements.currentArrowHead.setAttribute("href", "#icon-arrow-style");
}
