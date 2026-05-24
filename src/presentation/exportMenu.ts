import { clamp } from "../shared/index.js";
import { elements } from "./dom.js";

export function toggleExportMenu(event: MouseEvent) {
  event.stopPropagation();
  if (elements.exportMenu.hidden) {
    openExportMenu();
    return;
  }

  closeExportMenu();
}

export function openExportMenu() {
  elements.exportMenu.hidden = false;
  elements.exportImageButton.setAttribute("aria-expanded", "true");
  positionExportMenu();
  window.requestAnimationFrame(positionExportMenu);
}

export function closeExportMenu() {
  if (elements.exportMenu.hidden) {
    return;
  }

  elements.exportMenu.hidden = true;
  elements.exportImageButton.setAttribute("aria-expanded", "false");
}

function positionExportMenu() {
  if (elements.exportMenu.hidden) {
    return;
  }

  const trigger = elements.exportImageButton.getBoundingClientRect();
  const menu = elements.exportMenu.getBoundingClientRect();
  const left = clamp(trigger.left, 8, window.innerWidth - menu.width - 8);
  const openBelow = trigger.bottom + menu.height + 8 <= window.innerHeight;
  const top = openBelow ? trigger.bottom + 8 : trigger.top - menu.height - 8;
  elements.exportMenu.style.left = `${Math.round(left)}px`;
  elements.exportMenu.style.top = `${Math.round(Math.max(8, top))}px`;
}
