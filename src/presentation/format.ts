import type { DiagramElement, ElementStyle } from "../interfaces/index.js";

export function hasText(
  element: DiagramElement,
): element is Extract<DiagramElement, { text: string }> {
  return "text" in element;
}

export function colorInputValue(value: string) {
  return value.startsWith("#") ? value : "#ffffff";
}

export function shouldPaint(color: string) {
  const normalized = color.trim().toLowerCase();
  return normalized !== "transparent" && normalized !== "none";
}

export function cssFontWeight(style: ElementStyle, fallback = 650) {
  return style.fontWeight === "bold" ? 800 : fallback;
}

export function cssFontStyle(style: ElementStyle) {
  return style.fontStyle === "italic" ? "italic" : "normal";
}

export function filenameBase(title: string) {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "mikrocanvas"
  );
}

export function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function escapeAttr(value: string) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
