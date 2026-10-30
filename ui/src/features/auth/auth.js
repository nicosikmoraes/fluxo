import { reactive, watch } from "vue";
import { currentLocale, setLocale, t } from "../../state/locale";
export const auth = reactive({ user: null, site: null, csrfToken: "", loading: true, error: "", message: "" });
let restoring;
async function fetchFromServer(url, options) {
  try {
    return await fetch(url, options);
  } catch {
    throw new Error(window.__TAURI__ ? t("Não foi possível acessar seus dados locais. Feche o Fluxo Jornada pelo ícone perto do relógio e abra o aplicativo novamente.") : t("Não foi possível conectar ao servidor do Fluxo. Inicie o Fluxo pelo arquivo Iniciar-Fluxo.cmd e tente novamente."));
  }
}
export async function restoreSession() {
  if (restoring) return restoring;
  auth.error = "";
  restoring = (async () => {
    try {
      const response = await fetchFromServer("/api/auth/session", { headers: { Accept: "application/json", "Accept-Language": currentLocale.value }, credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error(t("Não foi possível conectar ao Fluxo. Tente novamente."));
      const data = await response.json();
      auth.user = data.user;
      auth.site = data.site || null;
      auth.csrfToken = data.csrf_token;
    } catch (error) {
      auth.error = error.message;
      throw error;
    } finally {
      auth.loading = false;
      restoring = null;
    }
  })();
  return restoring;
}
export async function apiRequest(url, method = "GET", data) {
  if (!auth.csrfToken) await restoreSession();
  const form = data instanceof FormData;
  const response = await fetchFromServer("/api" + url, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json", "Accept-Language": currentLocale.value, "X-CSRF-TOKEN": auth.csrfToken, ...data && !form ? { "Content-Type": "application/json" } : {} },
    body: data ? form ? data : JSON.stringify(data) : void 0
  });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 419) {
      if (response.status === 401) auth.user = null;
      await restoreSession().catch(() => {
      });
      auth.message = auth.user ? "" : t("Sua sessão expirou. Entre novamente para continuar.");
    }
    const message = response.status === 429 ? t("Muitas tentativas. Aguarde um pouco antes de tentar novamente.") : response.status === 419 ? t("Sua sessão foi atualizada. Tente novamente.") : body?.errors ? Object.values(body.errors).flat().join(" ") : body?.message || t("Não foi possível salvar. Tente novamente.");
    const error = new Error(message);
    error.status = response.status;
    error.errors = body?.errors || {};
    throw error;
  }
  if (body?.csrf_token) auth.csrfToken = body.csrf_token;
  if (body?.site) auth.site = body.site;
  return response.status === 204 ? true : body;
}
export async function signOut() {
  const data = await apiRequest("/auth/logout", "POST");
  auth.user = data.user;
      auth.site = data.site || null;
  auth.csrfToken = data.csrf_token;
  auth.message = "";
}

watch(() => auth.user, (user) => {
  if (user) setLocale(user.locale || "pt-BR");
}, { flush: "sync" });
