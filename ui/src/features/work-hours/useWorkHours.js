import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch
} from "vue";
import {
  apiRequest,
  auth
} from "../auth/auth";
import {
  notify
} from "../../state/workspace";
import {
  calculateRecordedWorkDay
} from "./workHours";
import { currentLocale, t } from "../../state/locale";

export function useWorkHours() {
  const owner = auth.user.id;
  const canTrack = computed(() => auth.user?.id === owner && !!auth.user?.billing?.entitlements?.work_tracking);
  const storageKey = `fluxo:work-widget:${owner}`;
  const state = reactive({
    data: null,
    loading: true,
    saving: false,
    error: ""
  });
  const now = ref(new Date());
  const expanded = ref(false);
  let alive = true;
  let sequence = 0;
  let clockOffset = 0;
  let interval;
  let lastRefresh = 0;
  let mounted = false;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const day = computed(() => canTrack.value
    ? calculateRecordedWorkDay({ ...state.data?.settings, overtimeEnabled: currentLocale.value !== "en-US" }, state.data?.active_day, now.value)
    : { valid: false, showWidget: false });

  try {
    expanded.value = localStorage.getItem(storageKey) === "expanded";
  } catch {
    expanded.value = false;
  }

  watch(expanded, (value) => {
    try {
      localStorage.setItem(storageKey, value ? "expanded" : "collapsed");
    } catch {
      // The widget remains usable when browser storage is unavailable.
    }
  });

  function isCurrent(ticket) {
    return alive && canTrack.value && ticket === sequence;
  }

  function handleDenied(error) {
    if (error.status === 403 && auth.user?.id === owner && auth.user.billing?.entitlements) {
      auth.user.billing.entitlements.work_tracking = false;
      auth.user.billing.entitlements.pay_calculation = false;
    }
  }

  function apply(data) {
    const newlyVisible = Boolean(state.data && !day.value.showWidget);
    state.data = data;
    state.error = "";
    state.loading = false;
    clockOffset = Date.parse(data.server_now) - Date.now();
    now.value = new Date(Date.now() + clockOffset);
    lastRefresh = Date.now();
    if (newlyVisible && day.value.showWidget) expanded.value = true;
  }

  async function read(date) {
    if (!canTrack.value || state.saving) return null;
    const ticket = ++sequence;
    lastRefresh = Date.now();
    const query = new URLSearchParams({
      timezone
    });
    if (date) query.set("date", date);
    state.loading = !state.data;
    try {
      const data = await apiRequest(`/profile/work-hours?${query}`);
      if (!isCurrent(ticket)) return null;
      apply(data);
      return data;
    } catch (error) {
      if (isCurrent(ticket)) handleDenied(error);
      if (isCurrent(ticket)) state.error = error.message;
      throw error;
    } finally {
      if (isCurrent(ticket)) state.loading = false;
    }
  }

  async function mutate(url, payload) {
    if (!canTrack.value || state.saving) return null;
    state.saving = true;
    const ticket = ++sequence;
    try {
      const data = await apiRequest(url, url.endsWith("/records") ? "POST" : "PUT", payload);
      if (!isCurrent(ticket)) return null;
      apply(data);
      return data;
    } catch (error) {
      if (isCurrent(ticket)) handleDenied(error);
      throw error;
    } finally {
      if (alive && auth.user?.id === owner && ticket === sequence) state.saving = false;
    }
  }

  function save(payload) {
    return mutate("/profile/work-hours", payload);
  }

  function record(step, entry = state.data?.active_day) {
    if (!entry) return null;
    return mutate("/profile/work-hours/records", {
      date: entry.date,
      entry_version: entry.version,
      step,
    });
  }

  async function act(action) {
    if (!canTrack.value || state.saving || day.value.finished || day.value.stale) return;
    const entry = state.data?.active_day;
    if (!entry) return;
    try {
      const result = await mutate("/profile/work-hours/records", {
        action,
        date: entry.date,
        entry_version: entry.version
      });
      if (result) notify({
        start: t("Entrada registrada."),
        pause: t("Pausa iniciada."),
        resume: t("Retorno registrado."),
        finish: t("Saída registrada. Jornada encerrada.")
      } [action]);
    } catch (error) {
      if (alive && auth.user?.id === owner) {
        notify(error.message, "error");
        if (error.status === 409) await read().catch(() => {});
      }
    }
  }

  const finish = () => act("finish");

  function refreshWhenVisible() {
    if (canTrack.value && !document.hidden && !state.saving) read().catch(() => {});
  }

  function synchronizeAccess() {
    clearInterval(interval);
    sequence++;
    if (!canTrack.value) {
      state.data = null;
      state.error = "";
      state.loading = false;
      state.saving = false;
      expanded.value = false;
      return;
    }
    state.loading = true;
    read().catch(() => {});
    interval = setInterval(() => {
      now.value = new Date(Date.now() + clockOffset);
      if (Date.now() - lastRefresh >= 60000) refreshWhenVisible();
    }, 1000);
  }

  watch(canTrack, () => { if (mounted) synchronizeAccess(); }, { flush: "sync" });
  onMounted(() => {
    mounted = true;
    synchronizeAccess();
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
  });

  onUnmounted(() => {
    alive = false;
    sequence++;
    clearInterval(interval);
    window.removeEventListener("focus", refreshWhenVisible);
    document.removeEventListener("visibilitychange", refreshWhenVisible);
  });

  return {
    canTrack,
    state,
    day,
    now,
    expanded,
    read,
    save,
    record,
    act,
    finish
  };
}
