import type { DiagramBoardSummary } from "../interfaces/index.js";
import { escapeAttr, escapeHtml } from "./format.js";

export function renderBoardListItems(boards: DiagramBoardSummary[], activeId: string | undefined) {
  return boards
    .map(
      (board) => `<div class="board-row" data-active="${board.id === activeId}">
        <button class="board-open" type="button" data-board-open="${escapeAttr(board.id)}">
          <span class="board-name">${escapeHtml(board.title)}</span>
          <span class="board-meta">${board.elementCount} elements</span>
        </button>
        <div class="board-actions">
          <button class="button icon-button" type="button" data-board-duplicate="${escapeAttr(board.id)}" title="Duplicate" aria-label="Duplicate ${escapeAttr(board.title)}"><svg class="icon" aria-hidden="true"><use href="#icon-copy"></use></svg></button>
          <button class="button icon-button danger-button" type="button" data-board-delete="${escapeAttr(board.id)}" title="Delete" aria-label="Delete ${escapeAttr(board.title)}"><svg class="icon" aria-hidden="true"><use href="#icon-trash"></use></svg></button>
        </div>
      </div>`,
    )
    .join("");
}
