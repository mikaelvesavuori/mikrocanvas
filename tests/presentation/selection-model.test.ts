import { DiagramCommandService } from "../../src/domain/index.js";
import type { DiagramBoard } from "../../src/interfaces/index.js";
import {
  cloneSelectedElements,
  parseClipboardSelection,
  retainExistingSelection,
  selectedElements,
  serializeClipboardSelection,
  stylePatchesForSelection,
  toggleSelection,
} from "../../src/presentation/selectionModel.js";

const commandService = new DiagramCommandService();

function boardWith(...elements: DiagramBoard["elements"]): DiagramBoard {
  return {
    id: "board",
    title: "Selection test",
    elements,
    viewport: { x: 0, y: 0, zoom: 1 },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("selection model", () => {
  it("retains only selected ids that still exist on the board", () => {
    const board = boardWith(commandService.createElement("rectangle", { x: 0, y: 0 }, { id: "a" }));

    expect([...retainExistingSelection(new Set(["a", "b"]), board)]).toEqual(["a"]);
    expect([...retainExistingSelection(new Set(["a"]), null)]).toEqual([]);
  });

  it("toggles ids without mutating the source selection", () => {
    const source = new Set(["a"]);
    const withoutA = toggleSelection(source, "a");
    const withB = toggleSelection(source, "b");

    expect([...source]).toEqual(["a"]);
    expect([...withoutA]).toEqual([]);
    expect([...withB]).toEqual(["a", "b"]);
  });

  it("selects, clones, and styles board elements by selected ids", () => {
    const rectangle = commandService.createElement(
      "rectangle",
      { x: 0, y: 0 },
      { id: "rectangle" },
    );
    const sticky = commandService.createElement("sticky", { x: 120, y: 0 }, { id: "sticky" });
    const board = boardWith(rectangle, sticky);
    const selectedIds = new Set(["sticky"]);

    expect(selectedElements(board, selectedIds)).toEqual([sticky]);
    expect(cloneSelectedElements(board, selectedIds)).toEqual([sticky]);
    expect(cloneSelectedElements(board, selectedIds)).not.toBe(
      selectedElements(board, selectedIds),
    );
    expect(stylePatchesForSelection(board, selectedIds, { fill: "transparent" })).toEqual([
      {
        id: "sticky",
        patch: {
          style: {
            ...sticky.style,
            fill: "transparent",
          },
        },
      },
    ]);
  });

  it("omits locked elements from style patches", () => {
    const locked = {
      ...commandService.createElement("sticky", { x: 0, y: 0 }, { id: "locked" }),
      locked: true,
    };
    const unlocked = commandService.createElement("sticky", { x: 120, y: 0 }, { id: "unlocked" });
    const board = boardWith(locked, unlocked);

    expect(
      stylePatchesForSelection(board, new Set(["locked", "unlocked"]), {
        fill: "transparent",
      }).map((entry) => entry.id),
    ).toEqual(["unlocked"]);
  });

  it("serializes and parses clipboard selections", () => {
    const element = commandService.createElement(
      "text",
      { x: 0, y: 0 },
      {
        id: "text",
      },
    );
    const serialized = serializeClipboardSelection([element]);

    expect(JSON.parse(serialized)).toMatchObject({
      format: "mikrocanvas.selection",
      version: 1,
    });
    expect(parseClipboardSelection(serialized)).toEqual([element]);
    expect(parseClipboardSelection('{"items":[]}')).toBeNull();
  });
});
