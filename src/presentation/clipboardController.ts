import type { DiagramCommandService } from "../domain/index.js";
import type { DiagramBoard, DiagramElement } from "../interfaces/index.js";
import {
  cloneSelectedElements,
  parseClipboardSelection,
  serializeClipboardSelection,
} from "./selectionModel.js";

export type ClipboardPasteOutcome =
  | {
      kind: "empty";
    }
  | {
      kind: "failed";
    }
  | {
      kind: "pasted";
      board: DiagramBoard;
      ids: string[];
    };

export class ClipboardController {
  private elements: DiagramElement[] = [];
  private pasteCount = 0;

  constructor(private readonly commandService: DiagramCommandService) {}

  copy(board: DiagramBoard, selectedIds: ReadonlySet<string>) {
    this.elements = cloneSelectedElements(board, selectedIds);
    this.pasteCount = 0;
    void this.writeSystemClipboard();
    return this.elements.length;
  }

  async paste(board: DiagramBoard): Promise<ClipboardPasteOutcome> {
    if (this.elements.length === 0) {
      const read = await this.readSystemClipboard();
      if (read === "failed") {
        return { kind: "failed" };
      }

      if (!read) {
        return { kind: "empty" };
      }
    }

    this.pasteCount += 1;
    const offset = 24 * this.pasteCount;
    const result = this.commandService.pasteElements(board, this.elements, {
      x: offset,
      y: offset,
    });
    return {
      kind: "pasted",
      board: result.board,
      ids: result.ids,
    };
  }

  private async readSystemClipboard() {
    try {
      const text = await navigator.clipboard?.readText();
      if (!text) {
        return null;
      }

      const elements = parseClipboardSelection(text);
      if (!elements) {
        return null;
      }

      this.elements = elements;
      return elements;
    } catch {
      return "failed" as const;
    }
  }

  private async writeSystemClipboard() {
    try {
      await navigator.clipboard?.writeText(serializeClipboardSelection(this.elements));
    } catch {
      // In-app clipboard still works when the browser blocks system clipboard writes.
    }
  }
}
