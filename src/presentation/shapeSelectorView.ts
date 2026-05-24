import type { DiagramTool } from "../interfaces/index.js";
import {
  isShapeTool,
  shapeDefinitions,
  shapeTitle,
  shapeTools,
  type ShapeTool,
} from "../shared/index.js";
import { elements } from "./dom.js";
import { escapeAttr } from "./format.js";

export function renderShapeSelector(activeShapeTool: ShapeTool, activeTool: DiagramTool) {
  const currentShape = shapeDefinitions[activeShapeTool];
  const title = shapeTitle(activeShapeTool);
  elements.currentShapeIcon.setAttribute("href", currentShape.icon);
  elements.shapeSelector.classList.toggle("is-active", isShapeTool(activeTool));
  elements.shapeSelectorTrigger.classList.toggle("is-active", isShapeTool(activeTool));
  elements.shapeSelectorTrigger.setAttribute("title", title);
  elements.shapeSelectorTrigger.setAttribute("aria-label", `Shape: ${currentShape.label}`);

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-shape-tool]")) {
    button.classList.toggle("is-active", button.dataset.shapeTool === activeShapeTool);
  }
}

export function renderShapeMenuOptions() {
  elements.shapeMenuOptions.innerHTML = shapeTools
    .map((shape) => {
      const definition = shapeDefinitions[shape];
      const title = shapeTitle(shape);
      return `<button class="shape-option" data-shape-tool="${shape}" type="button" title="${escapeAttr(title)}" aria-label="${escapeAttr(definition.label)}">
        <svg class="icon" aria-hidden="true"><use href="${definition.icon}"></use></svg>
      </button>`;
    })
    .join("");
}
