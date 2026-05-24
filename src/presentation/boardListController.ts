type BoardListControllerOptions = {
  clearSelection: () => void;
  loadBoard: (id: string) => Promise<void>;
  duplicateBoard: (id: string) => Promise<void>;
  deleteBoard: (id: string) => Promise<void>;
  confirmDeleteBoard: (id: string) => boolean;
  closeLibrary: () => void;
};

export function createBoardListClickHandler(options: BoardListControllerOptions) {
  return (event: MouseEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const openId = target?.closest<HTMLElement>("[data-board-open]")?.dataset.boardOpen;
    const duplicateId =
      target?.closest<HTMLElement>("[data-board-duplicate]")?.dataset.boardDuplicate;
    const deleteId = target?.closest<HTMLElement>("[data-board-delete]")?.dataset.boardDelete;

    if (openId) {
      options.clearSelection();
      void options.loadBoard(openId);
      options.closeLibrary();
      return;
    }

    if (duplicateId) {
      void options.duplicateBoard(duplicateId);
      return;
    }

    if (deleteId) {
      if (!options.confirmDeleteBoard(deleteId)) {
        return;
      }

      options.clearSelection();
      void options.deleteBoard(deleteId);
    }
  };
}
