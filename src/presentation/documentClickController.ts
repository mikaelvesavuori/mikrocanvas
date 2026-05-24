import type { ArrowHead, DiagramElement, DiagramTool } from "../interfaces/index.js";
import { isShapeTool } from "../shared/index.js";
import { queryElement } from "./dom.js";

type DocumentClickControllerOptions = {
  closeExportMenu: () => void;
  setTool: (tool: DiagramTool) => void;
  getShapeTool: () => DiagramTool;
  applyColorPatch: (kind: string, color: string) => void;
  applyLineStyle: (strokeStyle: DiagramElement["style"]["strokeStyle"]) => void;
  applyArrowHead: (arrowHead: ArrowHead) => void;
};

export function createDocumentClickHandler(options: DocumentClickControllerOptions) {
  return (event: MouseEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const activeInspectorMenu = target?.closest<HTMLElement>("[data-inspector-menu]");
    const activeShapeMenu = target?.closest<HTMLElement>("[data-shape-menu]");
    closeOtherInspectorMenus(activeInspectorMenu);
    closeOtherShapeMenus(activeShapeMenu);
    if (target && !activeShapeMenu) {
      closeShapeMenus();
    }
    if (target && !target.closest("#export-menu") && !target.closest("#export-image-btn")) {
      options.closeExportMenu();
    }

    const closeDialogId = target?.dataset.closeDialog;
    if (closeDialogId) {
      queryElement<HTMLDialogElement>(`#${closeDialogId}`).close();
      return;
    }

    const shapeToolButton = target?.closest<HTMLButtonElement>("[data-shape-tool]");
    if (isShapeTool(shapeToolButton?.dataset.shapeTool)) {
      options.setTool(shapeToolButton.dataset.shapeTool);
      closeShapeMenus();
      return;
    }

    const shapeTrigger = target?.closest<HTMLElement>("[data-shape-trigger]");
    if (shapeTrigger) {
      options.setTool(options.getShapeTool());
      return;
    }

    const toolButton = target?.closest<HTMLElement>("[data-tool]");
    if (toolButton?.dataset.tool) {
      options.setTool(toolButton.dataset.tool as DiagramTool);
      closeShapeMenus();
      return;
    }

    const swatch = target?.closest<HTMLButtonElement>("[data-style-kind]");
    if (swatch?.dataset.styleKind && swatch.dataset.color) {
      options.applyColorPatch(swatch.dataset.styleKind, swatch.dataset.color);
      closeInspectorMenus();
      return;
    }

    const lineStyleButton = target?.closest<HTMLButtonElement>("[data-line-style]");
    if (
      lineStyleButton?.dataset.lineStyle === "solid" ||
      lineStyleButton?.dataset.lineStyle === "dashed"
    ) {
      options.applyLineStyle(lineStyleButton.dataset.lineStyle);
      closeInspectorMenus();
      return;
    }

    const arrowHeadButton = target?.closest<HTMLButtonElement>("[data-arrow-head]");
    if (isArrowHead(arrowHeadButton?.dataset.arrowHead)) {
      options.applyArrowHead(arrowHeadButton.dataset.arrowHead);
      closeInspectorMenus();
      return;
    }

    if (
      target?.closest(
        "#bring-front-btn, #send-back-btn, #duplicate-btn, #delete-selection-btn, #route-arrow-btn, #lock-selection-btn",
      )
    ) {
      closeInspectorMenus();
    }
  };
}

function isArrowHead(value: string | undefined): value is ArrowHead {
  return value === "none" || value === "start" || value === "end" || value === "both";
}

function closeOtherInspectorMenus(activeMenu: HTMLElement | null | undefined) {
  for (const menu of document.querySelectorAll<HTMLDetailsElement>("[data-inspector-menu][open]")) {
    if (menu !== activeMenu) {
      menu.open = false;
    }
  }
}

function closeInspectorMenus() {
  for (const menu of document.querySelectorAll<HTMLDetailsElement>("[data-inspector-menu][open]")) {
    menu.open = false;
  }
}

function closeOtherShapeMenus(activeMenu: HTMLElement | null | undefined) {
  for (const menu of document.querySelectorAll<HTMLDetailsElement>("[data-shape-menu][open]")) {
    if (menu !== activeMenu) {
      menu.open = false;
    }
  }
}

function closeShapeMenus() {
  for (const menu of document.querySelectorAll<HTMLDetailsElement>("[data-shape-menu][open]")) {
    menu.open = false;
  }
}
