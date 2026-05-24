import { renderBoardListItems } from "../../src/presentation/boardListView.js";

describe("board list view", () => {
  it("renders active board rows and escapes board titles", () => {
    const markup = renderBoardListItems(
      [
        {
          id: "safe",
          title: "Product sketch",
          elementCount: 3,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "unsafe",
          title: "<script>alert(1)</script>",
          elementCount: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      "safe",
    );

    expect(markup).toContain('data-active="true"');
    expect(markup).toContain("Product sketch");
    expect(markup).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(markup).not.toContain("<script>");
  });
});
