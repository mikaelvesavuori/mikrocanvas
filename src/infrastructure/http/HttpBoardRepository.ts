import type { BoardRepository } from "../../application/index.js";
import { Board } from "../../domain/index.js";
import type { DiagramBoard, DiagramBoardSummary } from "../../interfaces/index.js";
import { clone } from "../../shared/index.js";

const knownBoardsKey = "mikrocanvas_online_board_ids";

export interface BoardIdStorage {
  read(): string[];
  write(ids: string[]): void;
}

export class HttpBoardRepository implements BoardRepository {
  private readonly boardIds: BoardIdStorage;

  constructor(
    private readonly apiBaseUrl: string,
    boardIds: BoardIdStorage = createBoardIdStorage(),
  ) {
    this.boardIds = boardIds;
  }

  async list(): Promise<DiagramBoardSummary[]> {
    const boards: DiagramBoard[] = [];
    const missingIds: string[] = [];

    for (const id of this.boardIds.read()) {
      const board = await this.get(id, { remember: false });
      if (board) {
        boards.push(board);
      } else {
        missingIds.push(id);
      }
    }

    if (missingIds.length > 0) {
      this.forgetMany(missingIds);
    }

    return boards
      .map((board) => Board.toSummary(board))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string, options: { remember?: boolean } = {}): Promise<DiagramBoard | null> {
    const response = await fetch(this.url(`/api/boards/${encodeURIComponent(id)}`), {
      cache: "no-store",
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to load board ${id}.`);
    }

    const board = (await response.json()) as DiagramBoard;
    if (options.remember !== false) {
      this.remember(board.id);
    }
    return clone(board);
  }

  async save(board: DiagramBoard): Promise<void> {
    const response = await fetch(this.url(`/api/boards/${encodeURIComponent(board.id)}`), {
      body: JSON.stringify(board),
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      method: "PUT",
    });

    if (!response.ok) {
      throw new Error(`Failed to save board ${board.id}.`);
    }

    this.remember(board.id);
  }

  async delete(id: string): Promise<void> {
    const response = await fetch(this.url(`/api/boards/${encodeURIComponent(id)}`), {
      cache: "no-store",
      method: "DELETE",
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete board ${id}.`);
    }

    this.forget(id);
  }

  private url(pathname: string): string {
    return new URL(pathname.replace(/^\//, ""), withTrailingSlash(this.apiBaseUrl)).toString();
  }

  private remember(id: string): void {
    const ids = this.boardIds.read().filter((entry) => entry !== id);
    this.boardIds.write([id, ...ids]);
  }

  private forget(id: string): void {
    this.boardIds.write(this.boardIds.read().filter((entry) => entry !== id));
  }

  private forgetMany(ids: string[]): void {
    const missing = new Set(ids);
    this.boardIds.write(this.boardIds.read().filter((entry) => !missing.has(entry)));
  }
}

export function createBoardIdStorage(): BoardIdStorage {
  const fallback: string[] = [];

  if (typeof localStorage === "undefined") {
    return memoryBoardIdStorage(fallback);
  }

  try {
    localStorage.getItem(knownBoardsKey);
    return {
      read: () => parseBoardIds(localStorage.getItem(knownBoardsKey)),
      write: (ids) => {
        localStorage.setItem(knownBoardsKey, JSON.stringify(uniqueIds(ids)));
      },
    };
  } catch {
    return memoryBoardIdStorage(fallback);
  }
}

function memoryBoardIdStorage(ids: string[]): BoardIdStorage {
  return {
    read: () => [...ids],
    write: (nextIds) => {
      ids.splice(0, ids.length, ...uniqueIds(nextIds));
    },
  };
}

function parseBoardIds(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? uniqueIds(parsed.filter((entry) => typeof entry === "string"))
      : [];
  } catch {
    return [];
  }
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
