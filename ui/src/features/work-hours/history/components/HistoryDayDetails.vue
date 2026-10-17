<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { X, Clock3, Check, Wallet, Info } from "@lucide/vue";
import { dateLabel, duration, money } from "../history";
const props = defineProps({
  record: { type: Object, required: true },
  today: { type: String, required: true },
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
const steps = [{ key: "startedAt", label: "Entrada" }, { key: "lunchOut", label: "Início da pausa" }, { key: "lunchIn", label: "Retorno da pausa" }, { key: "finishedAt", label: "Saída do trabalho" }];
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
    <header><div><span>DETALHES DA JORNADA</span><h2 id="history-day-title">{{ dateLabel(record.date, { day: 'numeric', month: 'long' }) }}</h2><p>{{ dateLabel(record.date, { weekday: 'long', day: undefined, month: undefined }) }} · {{ record.status === 'complete' ? 'Jornada encerrada' : record.status === 'ongoing' ? 'Em andamento' : 'Registro incompleto' }}</p></div><button class="day-close" :disabled="busy" aria-label="Fechar detalhes do dia" @click="close"><X :size="19" /></button></header>
    <div class="day-dialog-content">
      <div class="day-totals"><div><span>Trabalhadas{{ record.status !== 'complete' ? ' · parcial' : '' }}</span><strong>{{ duration(record.worked) }}</strong></div><div><span>Horas extras</span><strong class="day-extra">{{ duration(record.overtime) }}</strong></div></div>
      <div class="day-timeline"><div v-for="step in steps.filter((step) => !['lunchOut', 'lunchIn'].includes(step.key) || record.lunchOut)" :key="step.key"><span class="day-timeline-dot" :class="{ missing: !record[step.key] }"></span><span>{{ step.label }}</span><strong>{{ record[step.key] || 'Não registrada' }}</strong></div></div>
      <div v-for="(pause, index) in (record.breaks || []).slice(1)" :key="index" class="day-rate">Pausa {{ index + 2 }}: {{ pause.startTime }} – {{ pause.endTime || 'em andamento' }}</div>
      <button v-if="!preview" class="day-edit-hours" :disabled="busy" @click="emit('edit', record.date)">Editar horários deste dia</button>
      <p class="day-regime"><Clock3 :size="14" /> {{ record.target === 0 ? 'Todas as horas contam como extras' : 'Meta de ' + duration(record.target) }}<template v-if="record.regime"> · semana de {{ record.regime.weeklyHours }}h em {{ record.regime.daysPerWeek }} dias</template></p>
      <p v-if="record.timezone" class="day-rate">Horários em {{ record.timezone.replaceAll('_', ' ') }}.</p>
      <section class="day-payment">
        <header><Wallet :size="17" /><h3>Recebimento das horas extras</h3></header>
        <div v-if="error" class="day-receipt-error" role="alert"><p>{{ error }}</p><button type="button" :disabled="busy" @click="emit('refresh')">Atualizar jornada</button></div>
        <template v-if="record.overtime || record.receivedOn">
          <div class="day-estimate"><span>Estimativa bruta deste dia</span><strong>{{ money(record.estimated) }}</strong></div>
          <div v-if="record.overtimeRate != null"><p v-for="(part, index) in record.overtimeBreakdown" :key="index" class="day-rate">{{ duration(part.seconds / 60) }} com adicional de {{ part.premium }}% · {{ money(Number(record.regime.monthlySalary) / Number(record.regime.monthlyHours) * (1 + part.premium / 100)) }} / hora</p></div>
          <p v-else class="day-rate">Sem salário registrado neste dia. Você pode informar o valor que recebeu pelas horas extras.</p>
          <p v-if="record.receivedOn" class="day-received-info">Recebido: {{ money(record.received) }} em {{ dateLabel(record.receivedOn, { year: 'numeric' }) }}.</p>
          <form v-if="record.status === 'complete' || preview" @submit.prevent="saveReceipt">
            <fieldset :disabled="busy || !record.overtime" class="day-receipt-form">
              <div class="day-receipt-fields"><label>Valor recebido<div class="day-currency"><span>R$</span><input v-model="received" aria-label="Valor recebido" type="number" step="0.01" min="0.01" max="999999999" required></div></label><label>Data do recebimento<input v-model="receivedOn" type="date" :max="record.today || today" :min="record.date" required></label></div>
              <button class="btn primary day-receive" type="submit"><Check :size="15" />{{ busy ? 'Salvando...' : record.receivedOn ? 'Atualizar recebimento' : 'Marcar como recebido' }}{{ preview && !busy ? ' na prévia' : '' }}</button>
            </fieldset>
          </form>
          <p v-else class="day-no-extra">Encerre a jornada para registrar o recebimento.</p>
          <button v-if="record.receivedOn" :disabled="busy" class="day-clear-receipt" type="button" @click="clearReceipt">Limpar recebimento</button>
        </template>
        <p v-else class="day-no-extra">Este dia ainda não tem horas extras para receber.</p>
      </section>
      <p class="day-demo-note"><Info :size="14" /> {{ preview ? 'Esta é uma simulação. Alterações ficam apenas nesta prévia.' : 'O valor estimado é bruto. Registre o valor efetivamente recebido para acompanhar seus pagamentos.' }}</p>
    </div>
  </dialog>
</template>

<style scoped>
.day-dialog {
  border: 1px solid #e2e9f5;
  border-radius: 17px;
  padding: 0;
  width: min(490px, calc(100vw - 32px));
  max-height: 90dvh;
  overflow-y: auto;
  color: #8195b5;
  box-shadow: 0 25px 100px #3b527c26;
}
.day-dialog::backdrop {
  background: #354b773b;
  backdrop-filter: blur(3px);
}
.day-dialog > header {
  padding: 25px;
  border-bottom: 1px solid #ecf0f7;
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 16px;
}
header > div > span {
  font-size: 8px;
  letter-spacing: 1.3px;
  color: #a5b3c9;
}
h2 {
  color: #7189b1;
  font-size: 24px;
  letter-spacing: -.5px;
  font-weight: 500;
  margin-top: 9px;
}
header p {
  color: #a0aec4;
  font-size: 10px;
  margin-top: 9px;
}
.day-close {
  display: grid;
  place-items: center;
  width: 29px;
  height: 29px;
  border-radius: 8px;
  color: #a3b3cd;
}
.day-close:hover {
  background: #f3f6fc;
}
.day-dialog-content {
  padding: 25px;
}
.day-totals {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  border: 1px solid #e8edf8;
  background: #f8faff;
  padding: 17px;
  border-radius: 11px;
}
.day-totals span {
  font-size: 9px;
  color: #97a8c4;
}
.day-totals strong {
  display: block;
  color: #7b93ba;
  font-size: 23px;
  font-weight: 500;
  margin-top: 8px;
}
.day-totals .day-extra {
  color: #ac94cb;
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
  background: #afc3ed;
}
.day-timeline-dot.missing {
  background: #e2e8f2;
}
.day-regime {
  display: flex;
  align-items: center;
  gap: 7px;
  border-top: 1px solid #f0f3f8;
  padding-top: 16px;
  color: #a3b2c9;
  font-size: 9px;
}
.day-edit-hours {
  display: block;
  font-size: 10px;
  color: #8aa4d2;
  margin: 0 0 18px auto;
  padding: 5px 0;
}
.day-payment {
  margin-top: 27px;
  padding-top: 24px;
  border-top: 1px solid #edf1f7;
}
.day-payment > header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #90ac9d;
}
h3 {
  font-size: 12px;
  font-weight: 550;
  color: #8ca598;
}
.day-estimate {
  display: flex;
  justify-content: space-between;
  margin-top: 19px;
  font-size: 10px;
}
.day-estimate strong {
  font-size: 14px;
  color: #86a393;
  font-weight: 500;
}
.day-rate {
  color: #a7b4c8;
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
  color: #93a4bf;
  min-width: 0;
}
input {
  width: 100%;
  min-width: 0;
  height: 39px;
  border: 1px solid #e4eaf5;
  border-radius: 7px;
  background: #fcfdff;
  color: #8298ba;
  padding: 0 9px;
  font-size: 12px;
}
.day-currency {
  display: flex;
  align-items: center;
  border: 1px solid #e4eaf5;
  border-radius: 7px;
  padding-left: 10px;
  background: #fcfdff;
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
  color: #ad96ae;
}
.day-demo-note {
  display: flex;
  align-items: start;
  gap: 7px;
  font-size: 9px;
  line-height: 1.9;
  color: #a3b2c9;
  background: #f7f9fe;
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
  color: #a5b3c9;
  margin-top: 15px;
}
.day-receipt-form {
  padding: 0;
  margin: 0;
  border: 0;
  min-width: 0;
}
.day-receipt-error {
  background: #fff5f6;
  color: #b37d8d;
  border: 1px solid #f1e0e5;
  border-radius: 8px;
  padding: 12px;
  font-size: 10px;
  line-height: 1.8;
  margin-top: 15px;
}
.day-receipt-error button {
  color: #8da5d0;
  font-size: 9px;
  padding: 7px 0 0;
}
.day-received-info {
  color: #8aa797;
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
