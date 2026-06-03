import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DiagramCommandService } from "../../../src/domain/index.js";
import type { DiagramBoard } from "../../../src/interfaces/index.js";

export interface BoardSnapshot {
  board: DiagramBoard;
  revision: number;
  updatedAt: string;
}

interface BoardRow {
  created_at: string;
  delete_token_hash: string | null;
  id: string;
  json: string;
  revision: number;
  title: string;
  updated_at: string;
}

export class MikroCanvasDatabase {
  private readonly commandService = new DiagramCommandService();
  private readonly database: DatabaseSync;

  constructor(filename: string) {
    if (filename !== ":memory:") {
      mkdirSync(dirname(filename), { recursive: true });
    }

    this.database = new DatabaseSync(filename);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA synchronous = NORMAL;
    `);
  }

  migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS boards (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0,
        delete_token_hash TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_boards_updated_at ON boards(updated_at);
    `);

    const columns = this.database.prepare("PRAGMA table_info(boards)").all() as {
      name: string;
    }[];

    if (!columns.some((column) => column.name === "delete_token_hash")) {
      this.database.exec("ALTER TABLE boards ADD COLUMN delete_token_hash TEXT;");
    }
  }

  getBoard(id: string): BoardSnapshot | null {
    const row = this.database
      .prepare(
        "SELECT id, title, json, created_at, updated_at, revision, delete_token_hash FROM boards WHERE id = ?",
      )
      .get(id) as BoardRow | undefined;

    return row ? rowToSnapshot(row, this.commandService) : null;
  }

  saveBoard(board: DiagramBoard, options: { deleteTokenHash?: string | null } = {}): BoardSnapshot {
    const normalized = this.commandService.normalizeBoard(board);
    const current = this.getBoardRow(normalized.id);
    const revision = (current?.revision ?? 0) + 1;
    const deleteTokenHash = current ? current.delete_token_hash : (options.deleteTokenHash ?? null);

    this.database
      .prepare(
        `
          INSERT INTO boards (id, title, json, created_at, updated_at, revision, delete_token_hash)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            json = excluded.json,
            updated_at = excluded.updated_at,
            revision = excluded.revision,
            delete_token_hash = boards.delete_token_hash
        `,
      )
      .run(
        normalized.id,
        normalized.title,
        JSON.stringify(normalized),
        normalized.createdAt,
        normalized.updatedAt,
        revision,
        deleteTokenHash,
      );

    return {
      board: normalized,
      revision,
      updatedAt: normalized.updatedAt,
    };
  }

  deleteBoard(id: string): boolean {
    const result = this.database.prepare("DELETE FROM boards WHERE id = ?").run(id);
    return result.changes > 0;
  }

  close(): void {
    this.database.close();
  }

  getDeleteTokenHash(id: string): string | null {
    return this.getBoardRow(id)?.delete_token_hash ?? null;
  }

  private getBoardRow(id: string): Pick<BoardRow, "delete_token_hash" | "revision"> | undefined {
    return this.database
      .prepare("SELECT revision, delete_token_hash FROM boards WHERE id = ?")
      .get(id) as Pick<BoardRow, "delete_token_hash" | "revision"> | undefined;
  }
}

function rowToSnapshot(row: BoardRow, commandService: DiagramCommandService): BoardSnapshot {
  const board = commandService.normalizeBoard(JSON.parse(row.json) as DiagramBoard);
  return {
    board,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}
