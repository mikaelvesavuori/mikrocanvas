import type { ArrowElement, DiagramElement } from "../interfaces/index.js";
import { hasText } from "./format.js";
import { isElementLocked } from "./selectionModel.js";

export type InspectorControlState = {
  canMutate: boolean;
  editText: boolean;
  textTarget: boolean;
  fill: boolean;
  stroke: boolean;
  textStyle: boolean;
  lineStyle: boolean;
  arrowRoute: boolean;
  arrowHead: boolean;
  lock: boolean;
  locked: boolean;
  primarySeparator: boolean;
  arrangeSeparator: boolean;
};

export type InspectorControlOptions = {
  textTargetId?: string | null;
};

export function inspectorControlState(
  selected: DiagramElement[],
  options: InspectorControlOptions = {},
): InspectorControlState {
  const selectedArrows = selected.filter(
    (element): element is ArrowElement => element.type === "arrow",
  );
  const selectedLines = selected.filter(isLineElement);
  const hasLockedSelection = selected.some(isElementLocked);
  const canMutate = selected.length > 0 && !hasLockedSelection;
  const first = selected[0];
  const hasTextTarget =
    canMutate &&
    selected.length === 1 &&
    first !== undefined &&
    first.id === options.textTargetId &&
    hasText(first);
  const editText = canMutate && selected.length === 1 && first ? hasTextEditControl(first) : false;
  const hasStyleControls = canMutate && selected.length > 0;
  const hasPreArrangeControls =
    hasStyleControls || hasTextTarget || selectedLines.length > 0 || selectedArrows.length > 0;

  return {
    canMutate,
    editText,
    textTarget: hasTextTarget,
    fill: canMutate && (hasTextTarget || selected.some((element) => !isLineElement(element))),
    stroke: !hasTextTarget && hasStyleControls,
    textStyle: canMutate && (hasTextTarget || selected.some(hasTextStyleControl)),
    lineStyle: canMutate && !hasTextTarget && selectedLines.length > 0,
    arrowRoute: canMutate && !hasTextTarget && selectedArrows.length > 0,
    arrowHead: canMutate && !hasTextTarget && selectedArrows.length > 0,
    lock: selected.length > 0,
    locked: selected.length > 0 && selected.every(isElementLocked),
    primarySeparator: editText,
    arrangeSeparator: canMutate && hasPreArrangeControls,
  };
}

export function selectedArrowElements(selected: DiagramElement[]) {
  return selected.filter((element): element is ArrowElement => element.type === "arrow");
}

function isLineElement(element: DiagramElement) {
  return element.type === "arrow" || element.type === "draw";
}

function hasTextStyleControl(element: DiagramElement) {
  if (isLineElement(element)) {
    return false;
  }

  return hasTextEditControl(element);
}

function hasTextEditControl(element: DiagramElement) {
  if (element.type === "draw") {
    return false;
  }

  return hasText(element);
}
