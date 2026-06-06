import { Board, DiagramCommandService } from "../../domain/index.js";
import type {
  ArrowElement,
  DiagramAppState,
  DiagramBoard,
  DiagramBoardSummary,
  DiagramPersistenceState,
  ExportedDiagramFile,
} from "../../interfaces/index.js";
import { clone, nowIso } from "../../shared/index.js";
import type { BoardRepository } from "../ports/index.js";

type Listener = (state: DiagramAppState) => void;

type ReplaceOptions = {
  history?: boolean;
  persist?: boolean;
};

export class BoardService {
  private readonly commandService = new DiagramCommandService();
  private boards: DiagramBoardSummary[] = [];
  private activeBoard: DiagramBoard | null = null;
  private listeners = new Set<Listener>();
  private past: DiagramBoard[] = [];
  private future: DiagramBoard[] = [];
  private storageAvailable = true;
  private persistence: DiagramPersistenceState = { status: "idle" };

  constructor(private readonly repository: BoardRepository) {}

  async boot() {
    try {
      this.boards = await this.repository.list();
      if (!this.activeBoard && this.boards.length > 0) {
        const board = await this.repository.get(this.boards[0]?.id ?? "");
        this.activeBoard = board ? this.commandService.normalizeBoard(board) : null;
      }

      if (!this.activeBoard) {
        const board = this.createStarterBoard();
        await this.repository.save(board);
        this.activeBoard = board;
        this.boards = await this.repository.list();
      }

      if (this.activeBoard && this.persistence.status === "idle") {
        this.persistence = {
          status: "saved",
          updatedAt: nowIso(),
        };
      }
    } catch {
      this.storageAvailable = false;
      this.persistence = {
        status: "error",
        message: "Local save failed. Export JSON before leaving.",
        updatedAt: nowIso(),
      };
      this.activeBoard = this.createStarterBoard();
      this.boards = [Board.toSummary(this.activeBoard)];
    }

    this.emit();
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  getState(): DiagramAppState {
    return {
      boards: [...this.boards],
      activeBoard: this.activeBoard ? Board.clone(this.activeBoard) : null,
      storageAvailable: this.storageAvailable,
      persistence: { ...this.persistence },
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
    };
  }

  getActiveBoardSnapshot(): DiagramBoard | null {
    return this.activeBoard ? Board.clone(this.activeBoard) : null;
  }

  async createBoard(title = "Untitled board") {
    const board = this.createStarterBoard(title);
    await this.persistBoard(board);
    this.activeBoard = board;
    this.past = [];
    this.future = [];
    await this.refreshBoardList();
    this.emit();
  }

  async loadBoard(id: string) {
    const board = await this.repository.get(id);
    if (!board) {
      return;
    }

    this.activeBoard = this.commandService.normalizeBoard(board);
    this.past = [];
    this.future = [];
    this.emit();
  }

  async loadBoardSnapshot(board: DiagramBoard) {
    this.activeBoard = this.commandService.normalizeBoard(clone(board));
    this.past = [];
    this.future = [];
    await this.persistActiveBoard();
  }

  async renameActiveBoard(title: string) {
    if (!this.activeBoard) {
      return;
    }

    const cleanTitle = title.trim() || "Untitled board";
    await this.replaceActiveBoard({
      ...this.activeBoard,
      title: cleanTitle,
      updatedAt: nowIso(),
    });
  }

  async duplicateBoard(id: string) {
    const source = await this.repository.get(id);
    if (!source) {
      return;
    }

    const now = nowIso();
    const board: DiagramBoard = {
      ...clone(source),
      id: Board.create().id,
      title: `${source.title} copy`,
      createdAt: now,
      updatedAt: now,
    };

    await this.persistBoard(board);
    this.activeBoard = board;
    this.past = [];
    this.future = [];
    await this.refreshBoardList();
    this.emit();
  }

  async deleteBoard(id: string) {
    if (this.boards.length <= 1) {
      const deleted = await this.deleteStoredBoard(id);
      if (!deleted) {
        return;
      }

      const replacement = this.createStarterBoard("Untitled board");
      await this.persistBoard(replacement);
      this.activeBoard = replacement;
      this.past = [];
      this.future = [];
      await this.refreshBoardList();
      this.emit();
      return;
    }

    const deleted = await this.deleteStoredBoard(id);
    if (!deleted) {
      return;
    }

    await this.refreshBoardList();
    if (this.activeBoard?.id === id) {
      const nextId = this.boards[0]?.id;
      this.activeBoard = nextId
        ? this.commandService.normalizeBoard(
            (await this.repository.get(nextId)) ?? this.createStarterBoard(),
          )
        : this.createStarterBoard();
      this.past = [];
      this.future = [];
    }
    this.emit();
  }

  async importBoardFile(file: ExportedDiagramFile) {
    if (file.format !== "mikrocanvas.board" || file.version !== 1) {
      throw new Error("Unsupported MikroCanvas file.");
    }

    const now = nowIso();
    const board = this.commandService.normalizeBoard({
      ...clone(file.board),
      id: Board.create().id,
      title: file.board.title || "Imported board",
      createdAt: now,
      updatedAt: now,
    });
    await this.persistBoard(board);
    this.activeBoard = board;
    this.past = [];
    this.future = [];
    await this.refreshBoardList();
    this.emit();
  }

  exportActiveBoard(): ExportedDiagramFile | null {
    if (!this.activeBoard) {
      return null;
    }

    return {
      format: "mikrocanvas.board",
      version: 1,
      exportedAt: nowIso(),
      board: Board.clone(this.activeBoard),
    };
  }

  async replaceActiveBoard(board: DiagramBoard, options: ReplaceOptions = {}) {
    const history = options.history ?? true;
    const persist = options.persist ?? true;
    const previous = this.activeBoard ? Board.clone(this.activeBoard) : null;
    this.activeBoard = this.commandService.normalizeBoard(Board.touch(board));

    if (history && previous && JSON.stringify(previous) !== JSON.stringify(this.activeBoard)) {
      this.past.push(previous);
      this.future = [];
    }

    if (persist) {
      await this.persistActiveBoard();
    } else {
      this.emit();
    }
  }

  async commitCurrentFrom(previous: DiagramBoard | null) {
    if (!previous || !this.activeBoard) {
      return;
    }

    if (JSON.stringify(previous) === JSON.stringify(this.activeBoard)) {
      return;
    }

    this.past.push(Board.clone(previous));
    this.future = [];
    await this.persistActiveBoard();
  }

  async undo() {
    if (!this.activeBoard || this.past.length === 0) {
      return;
    }

    const previous = this.past.pop();
    if (!previous) {
      return;
    }

    this.future.push(Board.clone(this.activeBoard));
    this.activeBoard = previous;
    await this.persistActiveBoard();
  }

  async redo() {
    if (!this.activeBoard || this.future.length === 0) {
      return;
    }

    const next = this.future.pop();
    if (!next) {
      return;
    }

    this.past.push(Board.clone(this.activeBoard));
    this.activeBoard = next;
    await this.persistActiveBoard();
  }

  private createStarterBoard(title = "First canvas") {
    const board = Board.create(title);
    const problem = this.commandService.createElement(
      "sticky",
      { x: -250, y: -120 },
      { text: "Start here" },
    );
    const idea = this.commandService.createElement(
      "rectangle",
      { x: 80, y: -100 },
      { text: "Shape an idea" },
    );
    const path = this.commandService.createElement("arrow", { x: -48, y: -44 }, { text: "" });
    if (path.type !== "arrow") {
      throw new Error("Expected starter path to be an arrow.");
    }
    const connectedPath = {
      ...path,
      start: this.commandService.getConnectionPoint(problem, "right") ?? path.start,
      end: this.commandService.getConnectionPoint(idea, "left") ?? path.end,
      startBinding: { elementId: problem.id, anchor: "right" },
      endBinding: { elementId: idea.id, anchor: "left" },
    } satisfies ArrowElement;
    const note = this.commandService.createElement(
      "comment",
      { x: 130, y: 90 },
      { text: "Add context" },
    );
    return {
      ...board,
      elements: [problem, connectedPath, idea, note],
    };
  }

  private async persistActiveBoard() {
    if (!this.activeBoard) {
      return;
    }

    await this.persistBoard(this.activeBoard);
    await this.refreshBoardList();
    this.emit();
  }

  private async persistBoard(board: DiagramBoard) {
    if (!this.storageAvailable) {
      return;
    }

    this.persistence = { status: "saving" };
    try {
      await this.repository.save(board);
      this.storageAvailable = true;
      this.persistence = {
        status: "saved",
        updatedAt: nowIso(),
      };
    } catch {
      this.persistence = {
        status: "error",
        message: "Local save failed. Export JSON before leaving.",
        updatedAt: nowIso(),
      };
    }
  }

  private async deleteStoredBoard(id: string): Promise<boolean> {
    try {
      await this.repository.delete(id);
      this.persistence = {
        status: "saved",
        updatedAt: nowIso(),
      };
      return true;
    } catch {
      this.persistence = {
        status: "error",
        message: "Board delete failed.",
        updatedAt: nowIso(),
      };
      this.emit();
      return false;
    }
  }

  private async refreshBoardList() {
    if (!this.storageAvailable) {
      this.boards = this.activeBoard ? [Board.toSummary(this.activeBoard)] : [];
      return;
    }

    try {
      this.boards = await this.repository.list();
    } catch {
      this.storageAvailable = false;
      this.boards = this.activeBoard ? [Board.toSummary(this.activeBoard)] : [];
    }
  }

  private emit() {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
