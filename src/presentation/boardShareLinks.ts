const boardIdPrefix = "board_";

export function boardIdToShareId(boardId: string): string {
  const clean = boardId.trim();
  return clean.startsWith(boardIdPrefix) ? clean.slice(boardIdPrefix.length) : clean;
}

export function shareIdToBoardId(shareId: string): string {
  const clean = shareId.trim();
  return clean ? `${boardIdPrefix}${clean}` : "";
}
