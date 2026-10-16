import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { apiRequest, auth } from "../../auth/auth";
import { historyRecord, summarizeHistory } from "./history";

export function useWorkHistory(range, invalidRange) {
  const owner = auth.user.id;
  const state = reactive({ data: null, loading: false, saving: false, error: "" });
  const now = ref(new Date());
  const records = computed(() => (state.data?.records || []).map((record) => historyRecord(record, now.value)));
  const summary = computed(() => summarizeHistory(records.value));
  let alive = true;
  let sequence = 0;
  let clockOffset = 0;
  let interval;
  let lastAttempt = 0;
  let loadedRange = "";
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const isCurrent = (ticket) => alive && auth.user?.id === owner && ticket === sequence;

  function updateClock(serverNow) {
    clockOffset = Date.parse(serverNow) - Date.now();
    now.value = new Date(Date.now() + clockOffset);
  }

  async function read() {
    if (state.saving) return null;
    const ticket = ++sequence;
    if (invalidRange.value) {
      state.data = null;
      state.loading = false;
      state.error = "";
      return null;
    }
    const selectedRange = JSON.stringify(range.value);
    if (selectedRange !== loadedRange) state.data = null;
    loadedRange = selectedRange;
    state.loading = true;
    state.error = "";
    lastAttempt = Date.now();
    const query = new URLSearchParams({ ...range.value, timezone });
    try {
      const data = await apiRequest(`/profile/work-hours/history?${query}`);
      if (!isCurrent(ticket)) return null;
      state.data = data;
      updateClock(data.server_now);
      return data;
    } catch (error) {
      if (isCurrent(ticket)) state.error = error.message;
      return null;
    } finally {
      if (isCurrent(ticket)) state.loading = false;
    }
  }

  async function saveReceipt(payload) {
    if (state.saving) return null;
    state.saving = true;
    const ticket = ++sequence;
    state.loading = false;
    try {
      const data = await apiRequest("/profile/work-hours/receipts", "PUT", {
        date: payload.date,
        amount: payload.amount,
        received_on: payload.receivedOn,
        entry_version: payload.entry_version,
        receipt_version: payload.receipt_version,
      });
      if (!isCurrent(ticket)) return null;
      if (state.data) state.data.records = state.data.records.map((record) => record.date === data.record.date ? data.record : record);
      updateClock(data.server_now);
      return data;
    } finally {
      if (alive && auth.user?.id === owner) state.saving = false;
    }
  }

  function refreshWhenVisible() {
    if (!document.hidden && !state.saving) read();
  }

  watch(range, read, { immediate: true });
  onMounted(() => {
    interval = setInterval(() => {
      now.value = new Date(Date.now() + clockOffset);
      if (Date.now() - lastAttempt >= 60000) refreshWhenVisible();
    }, 1000);
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

  return { state, now, records, summary, read, saveReceipt };
}
