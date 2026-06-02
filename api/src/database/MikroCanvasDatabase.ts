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
        revision INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_boards_updated_at ON boards(updated_at);
    `);
  }

  getBoard(id: string): BoardSnapshot | null {
    const row = this.database
      .prepare("SELECT id, title, json, created_at, updated_at, revision FROM boards WHERE id = ?")
      .get(id) as BoardRow | undefined;

    return row ? rowToSnapshot(row, this.commandService) : null;
  }

  saveBoard(board: DiagramBoard): BoardSnapshot {
    const normalized = this.commandService.normalizeBoard(board);
    const current = this.getRevision(normalized.id);
    const revision = (current ?? 0) + 1;

    this.database
      .prepare(
        `
          INSERT INTO boards (id, title, json, created_at, updated_at, revision)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            json = excluded.json,
            updated_at = excluded.updated_at,
            revision = excluded.revision
        `,
      )
      .run(
        normalized.id,
        normalized.title,
        JSON.stringify(normalized),
        normalized.createdAt,
        normalized.updatedAt,
        revision,
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

  private getRevision(id: string): number | null {
    const row = this.database.prepare("SELECT revision FROM boards WHERE id = ?").get(id) as
      | Pick<BoardRow, "revision">
      | undefined;

    return typeof row?.revision === "number" ? row.revision : null;
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
