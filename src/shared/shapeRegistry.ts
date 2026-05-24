export const shapeDefinitions = {
  rectangle: {
    label: "Rectangle",
    icon: "#icon-rectangle",
    shortcut: "R",
    defaultSize: { width: 180, height: 110 },
    palette: "blue",
  },
  ellipse: {
    label: "Ellipse",
    icon: "#icon-ellipse",
    shortcut: "O",
    defaultSize: { width: 180, height: 110 },
    palette: "mint",
  },
  diamond: {
    label: "Diamond",
    icon: "#icon-diamond",
    shortcut: "D",
    defaultSize: { width: 160, height: 130 },
    palette: "rose",
  },
  triangle: {
    label: "Triangle",
    icon: "#icon-triangle",
    defaultSize: { width: 160, height: 130 },
    palette: "rose",
  },
  capsule: {
    label: "Capsule",
    icon: "#icon-capsule",
    defaultSize: { width: 180, height: 92 },
    palette: "blue",
  },
  document: {
    label: "Document",
    icon: "#icon-document-shape",
    defaultSize: { width: 170, height: 120 },
    palette: "blue",
  },
  database: {
    label: "Database",
    icon: "#icon-database-shape",
    defaultSize: { width: 160, height: 120 },
    palette: "mint",
  },
  parallelogram: {
    label: "Parallelogram",
    icon: "#icon-parallelogram",
    defaultSize: { width: 180, height: 110 },
    palette: "blue",
  },
  trapezoid: {
    label: "Trapezoid",
    icon: "#icon-trapezoid",
    defaultSize: { width: 180, height: 110 },
    palette: "blue",
  },
  hexagon: {
    label: "Hexagon",
    icon: "#icon-hexagon",
    defaultSize: { width: 170, height: 120 },
    palette: "rose",
  },
  octagon: {
    label: "Octagon",
    icon: "#icon-octagon",
    defaultSize: { width: 160, height: 120 },
    palette: "rose",
  },
  chevron: {
    label: "Chevron",
    icon: "#icon-chevron-shape",
    defaultSize: { width: 180, height: 110 },
    palette: "blue",
  },
} as const;

export type ShapeTool = keyof typeof shapeDefinitions;

export const shapeTools = Object.keys(shapeDefinitions) as ShapeTool[];

export function isShapeTool(tool: string | undefined): tool is ShapeTool {
  return shapeTools.includes(tool as ShapeTool);
}

export function shapeShortcut(shape: ShapeTool): string | undefined {
  const definition = shapeDefinitions[shape];
  return "shortcut" in definition ? definition.shortcut : undefined;
}

export function shapeTitle(shape: ShapeTool): string {
  const definition = shapeDefinitions[shape];
  const shortcut = shapeShortcut(shape);
  return shortcut ? `${definition.label} (${shortcut})` : definition.label;
}
