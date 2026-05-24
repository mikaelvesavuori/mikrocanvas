import {
  pathCommandsToSvg,
  shapeDecorationPathCommands,
  shapePathCommands,
} from "../../src/presentation/shapeGeometry.js";
import { shapeTools } from "../../src/shared/index.js";

const rect = { x: 12, y: 24, width: 160, height: 96 };

describe("shape geometry", () => {
  it("provides renderable paths for every registered shape", () => {
    for (const shape of shapeTools) {
      const commands = shapePathCommands(shape, rect);

      expect(commands.at(0)?.kind).toBe("move");
      expect(commands.at(-1)?.kind).toBe("close");
      expect(pathCommandsToSvg(commands)).toContain("M");
    }
  });

  it("keeps database decoration geometry separate from the main shape", () => {
    expect(shapeDecorationPathCommands("rectangle", rect)).toBeNull();
    expect(shapeDecorationPathCommands("database", rect)?.at(0)?.kind).toBe("move");
  });
});
