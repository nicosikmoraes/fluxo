import { computed, ref } from "vue";
import { auth, apiRequest } from "../features/auth/auth";
import english from "./translations";

export const supportedLocales = ["pt-BR", "en-US"];
const storageKey = "fluxo:locale";

function storedLocale() {
  try {
    const stored = localStorage.getItem(storageKey);
    return supportedLocales.includes(stored) ? stored : "pt-BR";
  } catch {
    return "pt-BR";
  }
}

export const currentLocale = ref(storedLocale());

export function setLocale(locale) {
  if (!supportedLocales.includes(locale)) return;
  currentLocale.value = locale;
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  try {
    localStorage.setItem(storageKey, locale);
  } catch {
    // Language selection still works when browser storage is unavailable.
  }
}

export function t(source, parameters = {}) {
  const key = typeof source === "string" ? source.trim() : source;
  const translated = currentLocale.value === "en-US" && Object.hasOwn(english, key)
    ? source.replace(key, () => english[key]) : source;
  return typeof translated === "string" ? translated.replace(/\{(\w+)\}/g, (match, key) => parameters[key] ?? match) : translated;
}

export const currentCurrency = computed(() => currentLocale.value === "en-US" ? "USD" : "BRL");

export function formatCurrency(value) {
  return new Intl.NumberFormat(currentLocale.value, {
    style: "currency",
    currency: currentCurrency.value,
  }).format(value);
}

export function formatDate(value, options = {}) {
  return new Intl.DateTimeFormat(currentLocale.value, options).format(value);
}

export async function saveLocale(locale) {
  if (!supportedLocales.includes(locale)) throw new Error(t("Idioma inválido."));
  if (!auth.user) {
    setLocale(locale);
    return null;
  }
  const owner = auth.user.id;
  const result = await apiRequest("/profile/preferences", "PUT", { locale });
  if (auth.user?.id === owner) {
    auth.user = result.user;
    setLocale(result.user.locale);
  }
  return result.user;
}

setLocale(currentLocale.value);
