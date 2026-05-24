import type { DiagramBoard, DiagramElement } from "../interfaces/index.js";
import { clone } from "../shared/index.js";

export type ClipboardSelectionPayload = {
  format: "mikrocanvas.selection";
  version: 1;
  elements: DiagramElement[];
};

export function retainExistingSelection(
  selectedIds: ReadonlySet<string>,
  board: DiagramBoard | null,
) {
  return new Set(
    [...selectedIds].filter((id) => board?.elements.some((element) => element.id === id)),
  );
}

export function toggleSelection(selection: ReadonlySet<string>, id: string) {
  const next = new Set(selection);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

export function selectedElements(board: DiagramBoard, selectedIds: ReadonlySet<string>) {
  return board.elements.filter((element) => selectedIds.has(element.id));
}

export function mutableSelectedElements(board: DiagramBoard, selectedIds: ReadonlySet<string>) {
  return selectedElements(board, selectedIds).filter((element) => !isElementLocked(element));
}

export function isElementLocked(element: DiagramElement) {
  return element.locked === true;
}

export function cloneSelectedElements(board: DiagramBoard, selectedIds: ReadonlySet<string>) {
  return clone(selectedElements(board, selectedIds));
}

export function stylePatchesForSelection(
  board: DiagramBoard,
  selectedIds: ReadonlySet<string>,
  patch: Partial<DiagramElement["style"]>,
) {
  return mutableSelectedElements(board, selectedIds).map((element) => ({
    id: element.id,
    patch: {
      style: {
        ...element.style,
        ...patch,
      },
    } as Partial<DiagramElement>,
  }));
}

export function serializeClipboardSelection(elements: DiagramElement[]): string {
  return JSON.stringify({
    format: "mikrocanvas.selection",
    version: 1,
    elements,
  } satisfies ClipboardSelectionPayload);
}

export function parseClipboardSelection(text: string) {
  const parsed = JSON.parse(text) as { elements?: DiagramElement[] };
  return Array.isArray(parsed.elements) ? parsed.elements : null;
}
