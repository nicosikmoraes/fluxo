<script setup>
import { computed, onUnmounted, ref, watch } from "vue";
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, Clock3, Info, LoaderCircle, RefreshCw, Sparkles } from "@lucide/vue";
import { notify } from "../../../state/workspace";
import { defaultWorkSettings, payrollCycle, workDateInTimezone } from "../workHours";
import HistorySummary from "./components/HistorySummary.vue";
import HistoryChart from "./components/HistoryChart.vue";
import HistoryAverages from "./components/HistoryAverages.vue";
import HistoryTable from "./components/HistoryTable.vue";
import HistoryDayDetails from "./components/HistoryDayDetails.vue";
import { dateLabel, duration } from "./history";
import { useWorkHistory } from "./useWorkHistory";
import { auth } from "../../auth/auth";
import { currentLocale, t } from "../../../state/locale";
import { isValidDate } from "../../../shared/validation";

const props = defineProps({ workHours: { type: Object, required: true } });
const emit = defineEmits(["register", "saving-change"]);
const canCalculatePay = computed(() => !!auth.user?.billing?.entitlements?.pay_calculation);
const englishMode = computed(() => currentLocale.value === "en-US");
const period = ref(englishMode.value ? "month" : "cycle");
watch(englishMode, (hourly) => { if (hourly && period.value === "cycle") period.value = "month"; });
const monthOffset = ref(0);
const selectedDate = ref(null);
const receiptError = ref("");
const profileSettings = computed(() => props.workHours.state.data?.settings || { ...defaultWorkSettings, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" });
const today = computed(() => workDateInTimezone(props.workHours.now.value, profileSettings.value.timezone));
const customStart = ref(`${today.value.slice(0, 7)}-01`);
const customEnd = ref(today.value);

const range = computed(() => {
  if (period.value === "cycle") return payrollCycle(today.value, profileSettings.value.cycleClosingDay || 31, monthOffset.value);
  if (period.value === "custom") return { start: customStart.value, end: customEnd.value };
  const date = new Date(`${today.value}T12:00:00Z`);
  if (period.value === "week") {
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    const start = date.toISOString().slice(0, 10);
    date.setUTCDate(date.getUTCDate() + 6);
    return { start, end: date.toISOString().slice(0, 10) };
  }
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset.value, 1, 12));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset.value + 1, 0, 12));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
});
const invalidRange = computed(() => !isValidDate(range.value.start) || !isValidDate(range.value.end) || range.value.start > range.value.end || (Date.parse(range.value.end) - Date.parse(range.value.start)) / 86400000 > 365);
const history = useWorkHistory(range, invalidRange);
const { records, summary } = history;
const settings = computed(() => history.state.data?.settings || profileSettings.value);
const selected = computed(() => records.value.find((record) => record.date === selectedDate.value));
const monthTitle = computed(() => new Intl.DateTimeFormat(currentLocale.value, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${range.value.start || today.value}T12:00:00Z`)));
const rangeLabel = computed(() => invalidRange.value ? t("Selecione um período válido de até 366 dias") : t("{start} a {end}", { start: dateLabel(range.value.start), end: dateLabel(range.value.end, { year: "numeric" }) }));
const balanceLabel = computed(() => `${summary.value.balance < 0 ? '−' : '+'}${duration(Math.abs(summary.value.balance))}`);

watch(() => history.state.saving, (value) => emit("saving-change", value), { flush: "sync" });
watch(() => props.workHours.state.data?.active_day.version, () => history.read());
onUnmounted(() => emit("saving-change", false));

function openDay(date) {
  receiptError.value = "";
  selectedDate.value = date;
}

async function receive(payload) {
  if (history.state.saving) return;
  receiptError.value = "";
  try {
    const result = await history.saveReceipt(payload);
    if (!result) return;
    selectedDate.value = null;
    notify(payload.receivedOn ? t("Recebimento salvo na sua conta.") : t("Recebimento limpo."));
  } catch (failure) {
    receiptError.value = failure.message;
  }
}

function refreshSelected() {
  selectedDate.value = null;
  receiptError.value = "";
  history.read();
}
</script>

<template>
  <div class="work-history-screen">
    <section class="history-heading"><div><span class="history-eyebrow"><span></span> {{ t("SUA JORNADA, COM MAIS CLAREZA") }}</span><h1>{{ t("Seu tempo conta uma história.") }}</h1><p>{{ t("Entenda seu ritmo, acompanhe suas horas e veja o valor do seu trabalho.") }}</p></div><div class="history-heading-art" aria-hidden="true"><Clock3 :size="46" /><span></span><i></i><b></b></div></section>
    <div class="history-section-tabs"><span><BarChart3 :size="15" /> {{ t("Histórico e estatísticas") }}</span><button :disabled="history.state.saving" @click="emit('register')">{{ t("Registrar meus horários") }} </button></div>
    <section class="history-period" :aria-label="t('Filtrar período')">
      <div class="history-period-heading"><span class="history-calendar-icon"><CalendarDays :size="20" /></span><div><span class="history-period-caption">{{ t("PERÍODO SELECIONADO") }}</span><strong>{{ period === 'cycle' ? t('Ciclo da empresa') : period === 'month' ? monthTitle : period === 'week' ? t('Esta semana') : t('Período personalizado') }}</strong><small>{{ rangeLabel }}</small></div><div v-if="['month', 'cycle'].includes(period)" class="history-month-arrows"><button :disabled="history.state.saving" :aria-label="t('Período anterior')" @click="monthOffset--"><ChevronLeft :size="16" /></button><button :disabled="history.state.saving" :aria-label="t('Próximo período')" @click="monthOffset++"><ChevronRight :size="16" /></button></div></div>
      <div class="history-period-controls"><label for="history-period">{{ t("Visualizar") }}<select id="history-period" v-model="period" :disabled="history.state.saving"><option v-if="!englishMode" value="cycle">{{ t("Ciclo da empresa") }}</option><option value="month">{{ t("Por mês") }}</option><option value="week">{{ t("Esta semana") }}</option><option value="custom">{{ t("Personalizado") }}</option></select></label><span v-if="!englishMode" class="history-regime"><Clock3 :size="13" />{{ settings.weeklyHours }}{{ t("h / semana") }} <span>·</span> {{ settings.daysPerWeek }} {{ t("dias") }}</span><button class="history-refresh" :disabled="history.state.loading || history.state.saving" :aria-label="t('Atualizar histórico')" @click="history.read"><RefreshCw :size="15" :class="{ spin: history.state.loading }" /></button></div>
      <div v-if="period === 'custom'" class="history-custom-dates"><label>{{ t("De") }}<input v-model="customStart" :disabled="history.state.saving" type="date"></label><label>{{ t("Até") }}<input v-model="customEnd" :disabled="history.state.saving" type="date"></label><p v-if="invalidRange" role="alert">{{ t("Escolha um intervalo de até 366 dias, com a data final igual ou posterior à inicial.") }}</p></div>
    </section>

    <div v-if="history.state.error" class="history-error" role="alert"><p>{{ history.state.error }}</p><button class="text-btn" :disabled="history.state.saving" @click="history.read"><RefreshCw :size="14" /> {{ t("Tentar novamente") }}</button></div>
    <div v-if="history.state.loading && !history.state.data" class="history-loading"><LoaderCircle :size="25" class="spin" /><p>{{ t("Reunindo os registros da sua jornada...") }}</p></div>
    <template v-else-if="history.state.data">
      <HistorySummary :can-calculate-pay="canCalculatePay" :summary="summary" :english-mode="currentLocale === 'en-US'" />
      <p v-if="!englishMode && canCalculatePay" class="history-money-note"><Info :size="13" /><span>{{ t("O valor estimado não confirma pagamento. “Recebido” soma os valores registrados para os dias selecionados, mesmo que o pagamento tenha ocorrido em outra data.") }}</span></p>
      <div v-if="!records.length" class="history-first-record"><Clock3 :size="22" /><div><strong>{{ t("Este período ainda não tem registros.") }}</strong><p>{{ t("Registre seus horários ou escolha outro período para acompanhar sua jornada.") }}</p></div><button class="btn primary" @click="emit('register')">{{ t("Registrar horários") }} </button></div>
      <div class="history-analysis-grid"><HistoryChart :records="records" @select="openDay" /><HistoryAverages :summary="summary" /></div>
      <section v-if="summary.days && !englishMode" class="history-insight"><span class="history-insight-icon"><Sparkles :size="19" /></span><div><strong>{{ summary.extraDays }} {{ summary.extraDays === 1 ? t('dia com tempo extra') : t('dias com tempo extra') }} {{ t("no período.") }}</strong><p>{{ t("Saldo das jornadas completas:") }} <b>{{ balanceLabel }}</b> {{ t("em relação às metas de cada dia.") }}{{ summary.pending ? ' ' + t('Há {count} registro(s) incompleto(s) para revisar.', { count: summary.pending }) : t(' Continue acompanhando seu ritmo.') }}</p></div><button v-if="summary.pending" @click="openDay(records.find((record) => record.status === 'pending').date)">{{ t("Revisar registro") }} </button></section>
      <HistoryTable :can-calculate-pay="canCalculatePay" :records="records" @select="openDay" />
      <footer class="history-page-footer"><span><Clock3 :size="12" /> {{ t("Horários em") }} {{ settings.timezone.replaceAll('_', ' ') }} {{ t("· cada jornada preserva seu próprio fuso") }}</span><span>{{ t("Seus registros ficam salvos na sua conta") }}</span></footer>
    </template>

    <HistoryDayDetails :can-calculate-pay="canCalculatePay" v-if="selected" :key="selected.date" :record="selected" :today="today" :english-mode="currentLocale === 'en-US'" :busy="history.state.saving" :error="receiptError" @close="selectedDate = null" @receive="receive" @refresh="refreshSelected" @edit="emit('register', $event)" />
  </div>
</template>

<style scoped>
.work-history-screen {
  max-width: 1420px;
  margin: 0 auto;
  padding-bottom: 35px;
}
.history-heading {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1px 0 29px;
  gap: 20px;
}
.history-eyebrow {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--theme-text-muted, #9aaccb);
  font-size: 8px;
  letter-spacing: 1.3px;
}
.history-eyebrow > span {
  height: 5px;
  width: 5px;
  background: var(--theme-accent, #a8bde7);
  border-radius: 50%;
}
h1 {
  font-size: 29px;
  font-weight: 500;
  letter-spacing: -.9px;
  color: var(--theme-text-secondary, #778fb5);
  margin: 13px 0 10px;
}
.history-heading p {
  color: var(--theme-text-muted, #a0afc7);
  font-size: 11px;
  line-height: 1.9;
}
.history-heading-art {
  width: 125px;
  height: 83px;
  position: relative;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--theme-text-muted, #bdcdec);
  transform: rotate(-12deg);
  margin-right: 15px;
}
.history-heading-art > svg {
  stroke-width: 1.1;
}
.history-heading-art > span {
  position: absolute;
  inset: 2px 6px;
  border: 1px dashed var(--theme-line, #d7e2f6);
  border-radius: 50%;
}
.history-heading-art > i,
.history-heading-art > b {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--theme-accent-soft, #d1def4);
  position: absolute;
  top: 8px;
  right: 24px;
}
.history-heading-art > b {
  width: 5px;
  height: 5px;
  top: auto;
  right: auto;
  left: 10px;
  bottom: 7px;
  background: var(--theme-success-soft, #d4e9df);
}
.history-section-tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--theme-line, #e5ebf6);
  margin-bottom: 23px;
}
.history-section-tabs > span {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 2px solid var(--theme-line-strong, #8fa9df);
  padding-bottom: 15px;
  margin-bottom: -1px;
  font-size: 10px;
  color: var(--theme-text-muted, #849dd0);
}
.history-section-tabs > button {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--theme-text-muted, #96abd0);
  font-size: 9px;
  padding-bottom: 15px;
}
.history-period {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  background: var(--theme-panel, #fff);
  border: 1px solid var(--theme-line, #e6ecf6);
  border-radius: 12px;
  padding: 18px 22px;
  margin-bottom: 20px;
}
.history-period-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}
.history-calendar-icon {
  width: 39px;
  height: 39px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  background: var(--theme-surface-muted, #f0f4ff);
  color: var(--theme-text-muted, #95acdb);
}
.history-period-caption {
  display: block;
  font-size: 7px;
  letter-spacing: 1px;
  color: var(--theme-text-muted, #a7b5cd);
}
.history-period-heading strong {
  display: block;
  text-transform: capitalize;
  color: var(--theme-text-secondary, #7e95ba);
  font-size: 15px;
  font-weight: 500;
  margin: 6px 0;
}
.history-period-heading small {
  color: var(--theme-text-muted, #a4b3ca);
  font-size: 9px;
}
.history-month-arrows {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 16px;
}
.history-month-arrows button {
  display: grid;
  place-items: center;
  color: var(--theme-text-muted, #a4b5d1);
  border: 1px solid var(--theme-line, #e9eef8);
  border-radius: 7px;
  height: 29px;
  width: 29px;
}
.history-month-arrows button:hover {
  background: var(--theme-surface-muted, #f1f5ff);
  color: var(--theme-text-muted, #839fd4);
}
.history-period-controls {
  display: flex;
  align-items: center;
  gap: 18px;
}
.history-period-controls > label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 9px;
  color: var(--theme-text-muted, #a3b2c9);
}
.history-period-controls select {
  height: 35px;
  border: 1px solid var(--theme-line, #e4ebf7);
  border-radius: 7px;
  padding: 0 12px;
  background: var(--theme-panel, #fcfdff);
  color: var(--theme-text-muted, #879fc5);
  font-size: 10px;
}
.history-regime {
  font-size: 8px;
  color: var(--theme-text-muted, #a2b3ce);
  display: flex;
  align-items: center;
  gap: 6px;
  border-left: 1px solid var(--theme-line, #e8eef8);
  padding-left: 18px;
}
.history-regime > span {
  margin: 0 2px;
}
.history-custom-dates {
  width: 100%;
  display: flex;
  align-items: end;
  gap: 16px;
  border-top: 1px solid var(--theme-line, #edf1f8);
  padding-top: 15px;
}
.history-custom-dates label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 9px;
  color: var(--theme-text-muted, #9cacc7);
}
.history-custom-dates input {
  border: 1px solid var(--theme-line, #e3eaf6);
  background: var(--theme-panel, #fcfdff);
  border-radius: 7px;
  padding: 9px;
  color: var(--theme-text-secondary, #819ac1);
  font-size: 11px;
}
.history-custom-dates p {
  color: var(--theme-danger, #b77b89);
  font-size: 10px;
  padding-bottom: 9px;
}
.history-money-note {
  display: flex;
  align-items: start;
  gap: 7px;
  color: var(--theme-text-muted, #a7b5cb);
  font-size: 9px;
  line-height: 1.9;
  padding: 13px 2px 22px;
}
.history-money-note svg {
  flex-shrink: 0;
  margin-top: 2px;
}
.history-analysis-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 310px;
  gap: 20px;
  align-items: stretch;
}
.history-insight {
  display: flex;
  align-items: center;
  gap: 13px;
  margin: 20px 0;
  padding: 18px 22px;
  border: 1px solid var(--theme-line, #e1eaf9);
  border-radius: 11px;
  background:
    linear-gradient(
      110deg,
      var(--theme-surface-muted, #f0f5ff),
      var(--theme-panel, #fafcff));
}
.history-insight-icon {
  color: var(--theme-text-muted, #a0b6df);
  flex-shrink: 0;
}
.history-insight strong {
  color: var(--theme-text-muted, #8ba2c9);
  font-size: 11px;
  font-weight: 500;
}
.history-insight p {
  font-size: 9px;
  line-height: 1.9;
  color: var(--theme-text-muted, #a0b0cb);
  margin-top: 5px;
}
.history-insight b {
  color: var(--theme-text-muted, #8ca4ce);
  font-weight: 500;
}
.history-insight button {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--theme-text-muted, #8da7d5);
  font-size: 9px;
  white-space: nowrap;
}
.history-analysis-grid + .history-table-card {
  margin-top: 20px;
}
.history-page-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding-top: 24px;
  font-size: 8px;
  color: var(--theme-text-muted, #acbad0);
}
.history-page-footer > span:first-child {
  display: flex;
  align-items: center;
  gap: 5px;
}
.history-refresh {
  display: grid;
  place-items: center;
  width: 31px;
  height: 31px;
  border: 1px solid var(--theme-line, #e5ecf8);
  border-radius: 8px;
  color: var(--theme-text-muted, #a0b4d6);
}
.history-error {
  padding: 17px;
  margin-bottom: 20px;
  border: 1px solid var(--theme-line, #f1dfe5);
  border-radius: 10px;
  background: var(--theme-danger-soft, #fff5f6);
  color: var(--theme-text-secondary, #ad7183);
  font-size: 11px;
  line-height: 1.8;
}
.history-error button {
  margin-top: 9px;
  font-size: 10px;
}
.history-loading {
  display: grid;
  justify-items: center;
  gap: 14px;
  min-height: 240px;
  align-content: center;
  color: var(--theme-text-muted, #9cafce);
  font-size: 11px;
}
.history-first-record {
  display: flex;
  gap: 13px;
  align-items: center;
  flex-wrap: wrap;
  padding: 20px;
  border: 1px solid var(--theme-line, #e3ebf9);
  border-radius: 11px;
  background: var(--theme-surface-muted, #f2f6ff);
  color: var(--theme-text-muted, #96add3);
  margin-bottom: 20px;
}
.history-first-record strong {
  font-size: 12px;
  font-weight: 500;
}
.history-first-record p {
  font-size: 10px;
  line-height: 1.8;
  margin-top: 5px;
  color: var(--theme-text-muted, #a3b3cc);
}
.history-first-record .btn {
  margin-left: auto;
}
@media (max-width: 1200px) {
  .history-analysis-grid {
    grid-template-columns: minmax(0, 1fr) 280px;
    gap: 16px;
  }
  .history-regime {
    display: none;
  }
}
@media (max-width: 1000px) {
  .history-analysis-grid {
    grid-template-columns: 1fr;
  }
  .history-heading-art {
    display: none;
  }
  .history-insight {
    flex-wrap: wrap;
  }
  .history-insight button {
    margin-left: 32px;
  }
}
@media (max-width: 680px) {
  .history-heading h1 {
    font-size: 25px;
    line-height: 1.4;
  }
  .history-heading p {
    font-size: 10px;
  }
  .history-section-tabs > button {
    font-size: 8px;
    gap: 3px;
  }
  .history-section-tabs > span {
    font-size: 9px;
    gap: 5px;
  }
  .history-period {
    padding: 17px;
    gap: 18px;
  }
  .history-period-controls {
    margin-left: 51px;
  }
  .history-custom-dates {
    flex-wrap: wrap;
    gap: 12px;
  }
  .history-custom-dates input {
    max-width: 142px;
  }
  .history-month-arrows {
    margin-left: 8px;
  }
  .history-insight {
    padding: 17px;
  }
}
</style>
