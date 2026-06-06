import { boardIdToShareId, shareIdToBoardId } from "../../src/presentation/boardShareLinks.js";

describe("board share links", () => {
  it("uses compact share IDs in URLs", () => {
    expect(boardIdToShareId("board_8613842dbe3e405ab1")).toBe("8613842dbe3e405ab1");
  });

  it("maps compact share IDs back to storage board IDs", () => {
    expect(shareIdToBoardId("8613842dbe3e405ab1")).toBe("board_8613842dbe3e405ab1");
  });

  it("ignores blank share IDs", () => {
    expect(shareIdToBoardId("   ")).toBe("");
  });
});
