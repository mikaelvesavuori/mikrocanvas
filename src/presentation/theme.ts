import { elements } from "./dom.js";

const themeStorageKey = "mikrocanvas_theme";

export function applyStoredTheme() {
  const theme = localStorage.getItem(themeStorageKey);
  if (theme === "dark") {
    elements.html.dataset.theme = "dark";
  }
  applyThemeButtonState();
}

export function toggleTheme() {
  const isDark = elements.html.dataset.theme === "dark";
  if (isDark) {
    delete elements.html.dataset.theme;
    localStorage.setItem(themeStorageKey, "light");
    applyThemeButtonState();
    return;
  }

  elements.html.dataset.theme = "dark";
  localStorage.setItem(themeStorageKey, "dark");
  applyThemeButtonState();
}

function applyThemeButtonState() {
  const isDark = elements.html.dataset.theme === "dark";
  const nextTheme = isDark ? "light" : "dark";
  elements.themeIcon.setAttribute("href", isDark ? "#icon-sun" : "#icon-moon");
  elements.themeButton.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
  elements.themeButton.title = `Switch to ${nextTheme} mode`;
}
