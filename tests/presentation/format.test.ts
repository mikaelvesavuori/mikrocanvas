import {
  colorInputValue,
  escapeAttr,
  escapeHtml,
  filenameBase,
  shouldPaint,
} from "../../src/presentation/format.js";

describe("presentation formatting", () => {
  it("creates stable local export filenames", () => {
    expect(filenameBase(" Product Sketch! ")).toBe("product-sketch");
    expect(filenameBase("")).toBe("mikrocanvas");
  });

  it("normalizes color values for controls and paint checks", () => {
    expect(colorInputValue("#fde68a")).toBe("#fde68a");
    expect(colorInputValue("transparent")).toBe("#ffffff");
    expect(shouldPaint("#fde68a")).toBe(true);
    expect(shouldPaint("transparent")).toBe(false);
    expect(shouldPaint("none")).toBe(false);
  });

  it("escapes HTML text and attributes", () => {
    expect(escapeHtml("<b>Tea & code</b>")).toBe("&lt;b&gt;Tea &amp; code&lt;/b&gt;");
    expect(escapeAttr('"quoted"')).toBe("&quot;quoted&quot;");
  });
});
