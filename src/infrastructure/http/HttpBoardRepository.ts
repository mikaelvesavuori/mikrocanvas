import type { BoardRepository } from "../../application/index.js";
import { Board } from "../../domain/index.js";
import type { DiagramBoard, DiagramBoardSummary } from "../../interfaces/index.js";
import { clone } from "../../shared/index.js";

const knownBoardsKey = "mikrocanvas_online_board_ids";

export interface BoardAccessRecord {
  deleteToken?: string;
  id: string;
}

export interface BoardAccessStorage {
  get(id: string): BoardAccessRecord | null;
  list(): BoardAccessRecord[];
  remember(record: BoardAccessRecord): void;
  forget(id: string): void;
}

export class HttpBoardRepository implements BoardRepository {
  private readonly boardAccess: BoardAccessStorage;

  constructor(
    private readonly apiBaseUrl: string,
    boardAccess: BoardAccessStorage = createBoardAccessStorage(),
  ) {
    this.boardAccess = boardAccess;
  }

  async list(): Promise<DiagramBoardSummary[]> {
    const boards: DiagramBoard[] = [];
    const missingIds: string[] = [];

    for (const { id } of this.boardAccess.list()) {
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
      this.remember({ id: board.id });
    }
    return clone(board);
  }

  async save(board: DiagramBoard): Promise<void> {
    const access = this.boardAccess.get(board.id);
    const deleteToken = access?.deleteToken ?? (access ? undefined : createDeleteToken());
    const response = await fetch(this.url(`/api/boards/${encodeURIComponent(board.id)}`), {
      body: JSON.stringify(board),
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(deleteToken ? { "X-MikroCanvas-Delete-Token": deleteToken } : {}),
      },
      method: "PUT",
    });

    if (!response.ok) {
      throw new Error(`Failed to save board ${board.id}.`);
    }

    this.remember({
      id: board.id,
      deleteToken,
    });
  }

  async delete(id: string): Promise<void> {
    const deleteToken = this.boardAccess.get(id)?.deleteToken;
    const response = await fetch(this.url(`/api/boards/${encodeURIComponent(id)}`), {
      cache: "no-store",
      headers: {
        ...(deleteToken ? { "X-MikroCanvas-Delete-Token": deleteToken } : {}),
      },
      method: "DELETE",
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete board ${id}.`);
    }

    this.boardAccess.forget(id);
  }

  private url(pathname: string): string {
    return new URL(pathname.replace(/^\//, ""), withTrailingSlash(this.apiBaseUrl)).toString();
  }

  private remember(record: BoardAccessRecord): void {
    this.boardAccess.remember(record);
  }

  private forgetMany(ids: string[]): void {
    const missing = new Set(ids);
    for (const id of missing) {
      this.boardAccess.forget(id);
    }
  }
}

export function createBoardAccessStorage(): BoardAccessStorage {
  const fallback: BoardAccessRecord[] = [];

  if (typeof localStorage === "undefined") {
    return memoryBoardAccessStorage(fallback);
  }

  try {
    localStorage.getItem(knownBoardsKey);
    return persistentBoardAccessStorage();
  } catch {
    return memoryBoardAccessStorage(fallback);
  }
}

function persistentBoardAccessStorage(): BoardAccessStorage {
  return {
    get: (id) =>
      parseBoardAccessRecords(localStorage.getItem(knownBoardsKey)).find(
        (record) => record.id === id,
      ) ?? null,
    list: () => parseBoardAccessRecords(localStorage.getItem(knownBoardsKey)),
    remember: (record) => {
      localStorage.setItem(
        knownBoardsKey,
        JSON.stringify(
          rememberRecord(parseBoardAccessRecords(localStorage.getItem(knownBoardsKey)), record),
        ),
      );
    },
    forget: (id) => {
      localStorage.setItem(
        knownBoardsKey,
        JSON.stringify(
          parseBoardAccessRecords(localStorage.getItem(knownBoardsKey)).filter(
            (record) => record.id !== id,
          ),
        ),
      );
    },
  };
}

function memoryBoardAccessStorage(records: BoardAccessRecord[]): BoardAccessStorage {
  return {
    get: (id) => records.find((record) => record.id === id) ?? null,
    list: () => records.map((record) => ({ ...record })),
    remember: (record) => {
      records.splice(0, records.length, ...rememberRecord(records, record));
    },
    forget: (id) => {
      records.splice(0, records.length, ...records.filter((record) => record.id !== id));
    },
  };
}

function parseBoardAccessRecords(value: string | null): BoardAccessRecord[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return uniqueRecords(
      parsed
        .map((entry) => {
          if (typeof entry === "string") {
            return { id: entry };
          }

          if (!entry || typeof entry !== "object") {
            return null;
          }

          const record = entry as Partial<BoardAccessRecord>;
          return typeof record.id === "string"
            ? {
                id: record.id,
                deleteToken:
                  typeof record.deleteToken === "string" ? record.deleteToken : undefined,
              }
            : null;
        })
        .filter((entry): entry is BoardAccessRecord => Boolean(entry)),
    );
  } catch {
    return [];
  }
}

function rememberRecord(
  records: BoardAccessRecord[],
  record: BoardAccessRecord,
): BoardAccessRecord[] {
  const clean = cleanRecord(record);
  if (!clean) {
    return uniqueRecords(records);
  }

  const existing = records.find((entry) => entry.id === clean.id);
  return uniqueRecords([
    {
      ...existing,
      ...clean,
      deleteToken: clean.deleteToken ?? existing?.deleteToken,
    },
    ...records.filter((entry) => entry.id !== clean.id),
  ]);
}

function uniqueRecords(records: BoardAccessRecord[]): BoardAccessRecord[] {
  const unique = new Map<string, BoardAccessRecord>();

  for (const record of records) {
    const clean = cleanRecord(record);
    if (clean && !unique.has(clean.id)) {
      unique.set(clean.id, clean);
    }
  }

  return [...unique.values()];
}

function cleanRecord(record: BoardAccessRecord): BoardAccessRecord | null {
  const id = record.id.trim();
  if (!id) {
    return null;
  }

  return {
    id,
    ...(record.deleteToken?.trim() ? { deleteToken: record.deleteToken.trim() } : {}),
  };
}

function createDeleteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
