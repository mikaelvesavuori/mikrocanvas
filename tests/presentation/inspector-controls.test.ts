import { DiagramCommandService } from "../../src/domain/index.js";
import type { ArrowElement } from "../../src/interfaces/index.js";
import { inspectorControlState } from "../../src/presentation/inspectorControls.js";

describe("inspector controls", () => {
  const service = new DiagramCommandService();

  it("shows full style controls for rectangles", () => {
    const rectangle = service.createElement("rectangle", { x: 0, y: 0 });

    expect(inspectorControlState([rectangle])).toMatchObject({
      canMutate: true,
      editText: true,
      fill: true,
      stroke: true,
      textStyle: true,
      lineStyle: false,
      arrowRoute: false,
      arrowHead: false,
      lock: true,
      locked: false,
      primarySeparator: true,
    });
  });

  it("shows arrow controls with a text entry point for arrows without labels", () => {
    const arrow = service.createElement("arrow", { x: 0, y: 0 });

    expect(inspectorControlState([arrow])).toMatchObject({
      editText: true,
      fill: false,
      stroke: true,
      textStyle: false,
      lineStyle: true,
      arrowRoute: true,
      arrowHead: true,
      primarySeparator: true,
    });
  });

  it("keeps labeled arrows lean while still exposing text editing", () => {
    const arrow = {
      ...service.createElement("arrow", { x: 0, y: 0 }),
      text: "Label",
    } as ArrowElement;

    expect(inspectorControlState([arrow])).toMatchObject({
      editText: true,
      fill: false,
      textStyle: false,
      lineStyle: true,
      arrowHead: true,
      primarySeparator: true,
    });
  });

  it("shows text controls when an arrow label is selected directly", () => {
    const arrow = {
      ...service.createElement("arrow", { x: 0, y: 0 }, { id: "arrow" }),
      text: "Label",
    } as ArrowElement;

    expect(inspectorControlState([arrow], { textTargetId: "arrow" })).toMatchObject({
      editText: true,
      textTarget: true,
      fill: true,
      stroke: false,
      textStyle: true,
      lineStyle: false,
      arrowRoute: false,
      arrowHead: false,
      primarySeparator: true,
    });
  });

  it("shows the leanest controls for freehand lines", () => {
    const draw = service.createDrawElement([
      { x: 0, y: 0 },
      { x: 20, y: 20 },
    ]);

    expect(inspectorControlState([draw])).toMatchObject({
      editText: false,
      fill: false,
      stroke: true,
      textStyle: false,
      lineStyle: true,
      arrowRoute: false,
      arrowHead: false,
      primarySeparator: false,
    });
  });

  it("shows only lock state controls when the selection is locked", () => {
    const rectangle = {
      ...service.createElement("rectangle", { x: 0, y: 0 }),
      locked: true,
    };

    expect(inspectorControlState([rectangle])).toMatchObject({
      canMutate: false,
      editText: false,
      fill: false,
      stroke: false,
      textStyle: false,
      lineStyle: false,
      arrowRoute: false,
      arrowHead: false,
      lock: true,
      locked: true,
      primarySeparator: false,
      arrangeSeparator: false,
    });
  });
});
