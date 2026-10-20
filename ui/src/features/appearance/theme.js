import { readonly, ref } from "vue";

export const THEME_STORAGE_KEY = "fluxo:theme";
const validTheme = (value) => value === "graphite" ? "graphite" : "light";

function savedTheme() {
  try {
    return validTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "light";
  }
}

const currentTheme = ref(savedTheme());
export const theme = readonly(currentTheme);

function applyTheme(value) {
  currentTheme.value = validTheme(value);
  document.documentElement.dataset.theme = currentTheme.value;
  document.documentElement.style.colorScheme = currentTheme.value === "graphite" ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", currentTheme.value === "graphite" ? "#151719" : "#f5f7fb");
}

export function setTheme(value) {
  applyTheme(value);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, currentTheme.value);
  } catch {
    // The selected appearance still works when browser storage is unavailable.
  }
}

export function toggleTheme() {
  setTheme(currentTheme.value === "graphite" ? "light" : "graphite");
}

export function initializeTheme() {
  applyTheme(savedTheme());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) applyTheme(savedTheme());
  });
}
