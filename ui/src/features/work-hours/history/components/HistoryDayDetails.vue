<script setup>
import { t } from "../../../../state/locale";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { X, Clock3, Check, Wallet, Info } from "@lucide/vue";
import { dateLabel, duration, money } from "../history";
const props = defineProps({
  canCalculatePay: { type: Boolean, default: true },
  record: { type: Object, required: true },
  today: { type: String, required: true },
  englishMode: { type: Boolean, default: false },
  preview: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  error: { type: String, default: "" },
});
const emit = defineEmits(["close", "receive", "refresh", "edit"]);
const dialog = ref(null);
const received = ref(props.record.receivedOn ? props.record.received : props.record.estimated ?? "");
const receivedOn = ref(props.record.receivedOn || props.today);
const entryVersion = props.record.version;
const receiptVersion = props.record.receiptVersion;
const steps = computed(() => props.englishMode
  ? [{ key: "startedAt", label: "Start" }, { key: "lunchOut", label: "Break started" }, { key: "lunchIn", label: "Break ended" }, { key: "finishedAt", label: "Finish" }]
  : [{ key: "startedAt", label: t("Entrada") }, { key: "lunchOut", label: t("Início da pausa") }, { key: "lunchIn", label: t("Retorno da pausa") }, { key: "finishedAt", label: t("Saída do trabalho") }]);
onMounted(() => dialog.value.showModal());
onBeforeUnmount(() => dialog.value?.close());
function saveReceipt() {
  if (props.busy) return;
  emit("receive", { date: props.record.date, amount: Number(received.value), receivedOn: receivedOn.value, entry_version: entryVersion, receipt_version: receiptVersion });
}
function clearReceipt() {
  if (props.busy) return;
  emit("receive", { date: props.record.date, amount: null, receivedOn: null, entry_version: entryVersion, receipt_version: receiptVersion });
}
function close() {
  if (!props.busy) emit("close");
}
</script>

<template>
  <dialog ref="dialog" class="day-dialog" aria-labelledby="history-day-title" :aria-busy="busy" @cancel.prevent="close" @click="($event.target === dialog) && close()">
    <header><div><span>{{ englishMode ? 'WORKDAY DETAILS' : t('DETALHES DA JORNADA') }}</span><h2 id="history-day-title">{{ dateLabel(record.date, { day: 'numeric', month: 'long' }) }}</h2><p>{{ dateLabel(record.date, { weekday: 'long', day: undefined, month: undefined }) }} · {{ englishMode ? (record.status === 'complete' ? 'Workday complete' : record.status === 'ongoing' ? 'In progress' : 'Incomplete record') : (record.status === 'complete' ? t('Jornada encerrada') : record.status === 'ongoing' ? t('Em andamento') : t('Registro incompleto')) }}</p></div><button class="day-close" :disabled="busy" :aria-label="englishMode ? 'Close day details' : t('Fechar detalhes do dia')" @click="close"><X :size="19" /></button></header>
    <div class="day-dialog-content">
      <div class="day-totals" :class="{ 'day-totals-hourly': englishMode }"><div><span>{{ englishMode ? 'Hours worked' : t('Trabalhadas') }}{{ record.status !== 'complete' ? (englishMode ? ' · partial' : ' · parcial') : '' }}</span><strong>{{ duration(record.worked) }}</strong></div><div v-if="!englishMode"><span>{{ t("Horas extras") }}</span><strong class="day-extra">{{ duration(record.overtime) }}</strong></div></div>
      <div class="day-timeline"><div v-for="step in steps.filter((step) => !['lunchOut', 'lunchIn'].includes(step.key) || record.lunchOut)" :key="step.key"><span class="day-timeline-dot" :class="{ missing: !record[step.key] }"></span><span>{{ step.label }}</span><strong>{{ record[step.key] || (englishMode ? 'Not recorded' : t('Não registrada')) }}</strong></div></div>
      <div v-for="(pause, index) in (record.breaks || []).slice(1)" :key="index" class="day-rate">{{ t("Pausa") }} {{ index + 2 }}: {{ pause.startTime }} – {{ pause.endTime || t('em andamento') }}</div>
      <button v-if="!preview" class="day-edit-hours" :disabled="busy" @click="emit('edit', record.date)">{{ englishMode ? 'Edit this day’s hours' : t('Editar horários deste dia') }}</button>
      <p v-if="!englishMode" class="day-regime"><Clock3 :size="14" /> {{ record.target === 0 ? t('Todas as horas contam como extras') : t('Meta de ') + duration(record.target) }}<template v-if="record.regime"> {{ t("· semana de") }} {{ record.regime.weeklyHours }}{{ t("h em") }} {{ record.regime.daysPerWeek }} {{ t("dias") }}</template></p>
      <p v-if="record.timezone" class="day-rate">{{ englishMode ? 'Times shown in' : t('Horários em') }} {{ record.timezone.replaceAll('_', ' ') }}.</p>
      <section v-if="englishMode && canCalculatePay" class="day-payment">
        <header><Wallet :size="17" /><h3>Hourly pay</h3></header>
        <div class="day-estimate"><span>{{ record.regime?.hourlyRate ? `${money(record.regime.hourlyRate)} per hour` : 'Set an hourly rate in work settings to estimate pay.' }}</span><strong>{{ money(record.hourlyEarnings) }}</strong></div>
      </section>
      <section v-else-if="canCalculatePay" class="day-payment">
        <header><Wallet :size="17" /><h3>{{ t("Recebimento das horas extras") }}</h3></header>
        <div v-if="error" class="day-receipt-error" role="alert"><p>{{ error }}</p><button type="button" :disabled="busy" @click="emit('refresh')">{{ t("Atualizar jornada") }}</button></div>
        <template v-if="record.overtime || record.receivedOn">
          <div class="day-estimate"><span>{{ t("Estimativa bruta deste dia") }}</span><strong>{{ money(record.estimated) }}</strong></div>
          <div v-if="record.overtimeRate != null"><p v-for="(part, index) in record.overtimeBreakdown" :key="index" class="day-rate">{{ duration(part.seconds / 60) }} {{ t("com adicional de") }} {{ part.premium }}% · {{ money(Number(record.regime.monthlySalary) / Number(record.regime.monthlyHours) * (1 + part.premium / 100)) }} {{ t("/ hora") }}</p></div>
          <p v-else class="day-rate">{{ t("Sem salário registrado neste dia. Você pode informar o valor que recebeu pelas horas extras.") }}</p>
          <p v-if="record.receivedOn" class="day-received-info">{{ t("Recebido:") }} {{ money(record.received) }} {{ t("em") }} {{ dateLabel(record.receivedOn, { year: 'numeric' }) }}.</p>
          <form v-if="record.status === 'complete' || preview" @submit.prevent="saveReceipt">
            <fieldset :disabled="busy || !record.overtime" class="day-receipt-form">
              <div class="day-receipt-fields"><label>{{ t("Valor recebido") }}<div class="day-currency"><span>R$</span><input v-model="received" :aria-label="t('Valor recebido')" type="number" step="0.01" min="0.01" max="999999999" required></div></label><label>{{ t("Data do recebimento") }}<input v-model="receivedOn" type="date" :max="record.today || today" :min="record.date" required></label></div>
              <button class="btn primary day-receive" type="submit"><Check :size="15" />{{ busy ? t('Salvando...') : record.receivedOn ? t('Atualizar recebimento') : t('Marcar como recebido') }}{{ preview && !busy ? t(' na prévia') : '' }}</button>
            </fieldset>
          </form>
          <p v-else class="day-no-extra">{{ t("Encerre a jornada para registrar o recebimento.") }}</p>
          <button v-if="record.receivedOn" :disabled="busy" class="day-clear-receipt" type="button" @click="clearReceipt">{{ t("Limpar recebimento") }}</button>
        </template>
        <p v-else class="day-no-extra">{{ t("Este dia ainda não tem horas extras para receber.") }}</p>
      </section>
      <p class="day-demo-note"><Info :size="14" /> {{ englishMode ? (preview ? 'This is a preview. Changes will not be saved.' : 'This pay estimate is based on your recorded hours.') : (preview ? t('Esta é uma simulação. Alterações ficam apenas nesta prévia.') : t('O valor estimado é bruto. Registre o valor efetivamente recebido para acompanhar seus pagamentos.')) }}</p>
    </div>
  </dialog>
</template>

<style scoped>
.day-dialog {
  border: 1px solid var(--theme-line, #e2e9f5);
  border-radius: 17px;
  padding: 0;
  width: min(490px, calc(100vw - 32px));
  max-height: 90dvh;
  overflow-y: auto;
  color: var(--theme-text-secondary, #8195b5);
  box-shadow: 0 25px 100px var(--theme-shadow, #3b527c26);
}
.day-dialog::backdrop {
  background: var(--theme-overlay, #354b773b);
  backdrop-filter: blur(3px);
}
.day-dialog > header {
  padding: 25px;
  border-bottom: 1px solid var(--theme-line, #ecf0f7);
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 16px;
}
header > div > span {
  font-size: 8px;
  letter-spacing: 1.3px;
  color: var(--theme-text-muted, #a5b3c9);
}
h2 {
  color: var(--theme-text-secondary, #7189b1);
  font-size: 24px;
  letter-spacing: -.5px;
  font-weight: 500;
  margin-top: 9px;
}
header p {
  color: var(--theme-text-muted, #a0aec4);
  font-size: 10px;
  margin-top: 9px;
}
.day-close {
  display: grid;
  place-items: center;
  width: 29px;
  height: 29px;
  border-radius: 8px;
  color: var(--theme-text-muted, #a3b3cd);
}
.day-close:hover {
  background: var(--theme-surface-muted, #f3f6fc);
}
.day-dialog-content {
  padding: 25px;
}
.day-totals {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  border: 1px solid var(--theme-line, #e8edf8);
  background: var(--theme-panel, #f8faff);
  padding: 17px;
  border-radius: 11px;
}
.day-totals-hourly {
  grid-template-columns: 1fr;
}
.day-totals span {
  font-size: 9px;
  color: var(--theme-text-muted, #97a8c4);
}
.day-totals strong {
  display: block;
  color: var(--theme-text-secondary, #7b93ba);
  font-size: 23px;
  font-weight: 500;
  margin-top: 8px;
}
.day-totals .day-extra {
  color: var(--theme-text-muted, #ac94cb);
}
.day-timeline {
  margin: 24px 0 14px;
}
.day-timeline > div {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 0;
  font-size: 11px;
}
.day-timeline strong {
  margin-left: auto;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  font-size: 12px;
}
.day-timeline-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--theme-accent, #afc3ed);
}
.day-timeline-dot.missing {
  background: var(--theme-surface, #e2e8f2);
}
.day-regime {
  display: flex;
  align-items: center;
  gap: 7px;
  border-top: 1px solid var(--theme-line, #f0f3f8);
  padding-top: 16px;
  color: var(--theme-text-muted, #a3b2c9);
  font-size: 9px;
}
.day-edit-hours {
  display: block;
  font-size: 10px;
  color: var(--theme-text-muted, #8aa4d2);
  margin: 0 0 18px auto;
  padding: 5px 0;
}
.day-payment {
  margin-top: 27px;
  padding-top: 24px;
  border-top: 1px solid var(--theme-line, #edf1f7);
}
.day-payment > header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--theme-success, #90ac9d);
}
h3 {
  font-size: 12px;
  font-weight: 550;
  color: var(--theme-text-secondary, #8ca598);
}
.day-estimate {
  display: flex;
  justify-content: space-between;
  margin-top: 19px;
  font-size: 10px;
}
.day-estimate strong {
  font-size: 14px;
  color: var(--theme-success, #86a393);
  font-weight: 500;
}
.day-rate {
  color: var(--theme-text-muted, #a7b4c8);
  font-size: 9px;
  line-height: 1.9;
  margin-top: 8px;
}
.day-receipt-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 19px;
}
label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 10px;
  color: var(--theme-text-muted, #93a4bf);
  min-width: 0;
}
input {
  width: 100%;
  min-width: 0;
  height: 39px;
  border: 1px solid var(--theme-line, #e4eaf5);
  border-radius: 7px;
  background: var(--theme-panel, #fcfdff);
  color: var(--theme-text-secondary, #8298ba);
  padding: 0 9px;
  font-size: 12px;
}
.day-currency {
  display: flex;
  align-items: center;
  border: 1px solid var(--theme-line, #e4eaf5);
  border-radius: 7px;
  padding-left: 10px;
  background: var(--theme-panel, #fcfdff);
}
.day-currency input {
  border: 0;
  background: transparent;
}
.day-currency > span {
  font-size: 10px;
}
.day-receive {
  width: 100%;
  margin-top: 16px;
  font-size: 10px;
}
.day-clear-receipt {
  display: block;
  margin: 13px auto 0;
  font-size: 9px;
  color: var(--theme-text-secondary, #ad96ae);
}
.day-demo-note {
  display: flex;
  align-items: start;
  gap: 7px;
  font-size: 9px;
  line-height: 1.9;
  color: var(--theme-text-muted, #a3b2c9);
  background: var(--theme-panel, #f7f9fe);
  padding: 13px;
  margin-top: 23px;
  border-radius: 8px;
}
.day-demo-note svg {
  flex-shrink: 0;
  margin-top: 2px;
}
.day-no-extra {
  font-size: 11px;
  color: var(--theme-text-muted, #a5b3c9);
  margin-top: 15px;
}
.day-receipt-form {
  padding: 0;
  margin: 0;
  border: 0;
  min-width: 0;
}
.day-receipt-error {
  background: var(--theme-danger-soft, #fff5f6);
  color: var(--theme-text-secondary, #b37d8d);
  border: 1px solid var(--theme-line, #f1e0e5);
  border-radius: 8px;
  padding: 12px;
  font-size: 10px;
  line-height: 1.8;
  margin-top: 15px;
}
.day-receipt-error button {
  color: var(--theme-text-muted, #8da5d0);
  font-size: 9px;
  padding: 7px 0 0;
}
.day-received-info {
  color: var(--theme-success, #8aa797);
  font-size: 10px;
  line-height: 1.8;
  margin-top: 12px;
}
@media (max-width: 480px) {
  .day-dialog > header,
  .day-dialog-content {
    padding: 20px;
  }
  .day-totals strong {
    font-size: 20px;
  }
}
</style>
