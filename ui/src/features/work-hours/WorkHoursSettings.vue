<script setup>
import { computed, ref } from "vue";
import { ArrowRight, Check, CheckCircle2, Clock3, Coffee, Info, LogIn, LogOut, ShieldCheck, Sparkles, TrendingUp, Wallet, X } from "@lucide/vue";
import { calculateWorkDay, formatWorkDuration, formatWorkMoney, formatWorkTime, getWorkTimeline, validateWorkSettings, workSteps } from "./workHours";

const props = defineProps({
  settings: { type: Object, required: true },
  entries: { type: Object, required: true },
  nowMinutes: { type: Number, required: true },
  date: { type: String, default: "2026-10-16" },
  maxDate: { type: String, default: "" },
  editableDate: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  canRecordNow: { type: Boolean, default: false },
  allowEqualTimes: { type: Boolean, default: false },
});
const emit = defineEmits(["update:settings", "update:entries", "update:date", "save", "open-widget", "record"]);
const attemptedSave = ref(false);
const normalizedEntries = computed(() => Object.fromEntries(workSteps.map(({ key }) => [key, normalizeTime(props.entries[key])])));
const day = computed(() => calculateWorkDay(props.settings, normalizedEntries.value, props.nowMinutes, { allowEqual: props.allowEqualTimes }));
const errors = computed(() => attemptedSave.value ? validateWorkSettings(props.settings) : {});
const entriesError = computed(() => getWorkTimeline(normalizedEntries.value, { allowEqual: props.allowEqualTimes }).error);
const salaryProvided = computed(() => props.settings.monthlySalary !== "" && props.settings.monthlySalary != null);
const stepIcons = [LogIn, Coffee, ArrowRight, LogOut];
const nextStep = computed(() => workSteps.find((step) => !props.entries[step.key]));
const dateValue = computed(() => new Date(`${props.date}T12:00:00Z`));
const shortDate = computed(() => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "short" }).format(dateValue.value).replace("de ", "").replace(".", "").toUpperCase());
const weekDay = computed(() => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long" }).format(dateValue.value).toUpperCase());
const recordLabels = {
  startedAt: "Registrar entrada agora",
  lunchOut: "Registrar saída para o almoço",
  lunchIn: "Registrar retorno do almoço",
  finishedAt: "Registrar saída agora",
};

function updateSetting(key, value) {
  emit("update:settings", { ...props.settings, [key]: value });
}

function updateEntry(key, value) {
  emit("update:entries", { ...props.entries, [key]: value });
}

function maskTime(key, event) {
  const input = event.target;
  const digitsBeforeCursor = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, "").length;
  const digits = input.value.replace(/\D/g, "").slice(0, 4);
  const value = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
  const cursor = Math.min(value.length, digitsBeforeCursor + (digitsBeforeCursor > 2 ? 1 : 0));
  input.value = value;
  updateEntry(key, value);
  input.setSelectionRange(cursor, cursor);
}

function skipTimeSeparator(event) {
  const input = event.target;
  if (input.selectionStart !== input.selectionEnd) return;
  const cursor = input.selectionStart;
  if (event.key === "Backspace" && cursor === 3 && input.value[2] === ":") {
    input.setSelectionRange(2, 2);
  } else if (event.key === "Delete" && cursor === 2 && input.value[2] === ":") {
    input.setSelectionRange(3, 3);
  }
}

function normalizeTime(value) {
  const text = (value || "").trim();
  const match = text.match(/^(\d{1,2}):?(\d{2})$/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : text;
}

function selectDate(event) {
  const selected = event.target.value;
  event.target.value = props.date;
  emit("update:date", selected);
}

function save() {
  attemptedSave.value = true;
  if (props.saving || Object.keys(validateWorkSettings(props.settings)).length || entriesError.value) return;
  emit("update:entries", normalizedEntries.value);
  emit("save");
}
</script>

<template>
  <form class="work-settings" novalidate @submit.prevent="save">
    <section class="work-activation">
      <span class="work-section-icon"><Clock3 :size="22" /></span>
      <div>
        <div class="work-activation-title"><h2>Acompanhar minha jornada</h2><span class="work-optional">OPCIONAL</span></div>
        <p>Registre seus horários e saiba quando é hora de descansar.</p>
      </div>
      <button type="button" class="work-switch" :disabled="saving" :class="{ enabled: settings.enabled }" role="switch" :aria-checked="settings.enabled" aria-label="Ativar acompanhamento da jornada" @click="updateSetting('enabled', !settings.enabled)"><span><Check v-if="settings.enabled" :size="12" /></span></button>
    </section>

    <div class="work-settings-columns">
      <div class="work-settings-main">
        <fieldset class="work-card" :disabled="!settings.enabled || saving">
          <legend class="work-sr-only">Configuração da jornada semanal</legend>
          <header class="work-card-heading"><span class="work-step-number">01</span><div><h3>Qual é o seu ritmo de trabalho?</h3><p>Conte como sua semana é dividida.</p></div></header>
          <div class="work-field-grid">
            <div class="work-field">
              <label for="work-weekly">Jornada semanal</label>
              <div class="work-input-unit"><input id="work-weekly" type="number" min="0.5" max="168" step="0.5" :value="settings.weeklyHours" :aria-invalid="Boolean(errors.weeklyHours)" :aria-describedby="errors.weeklyHours ? 'work-weekly-error' : undefined" @input="updateSetting('weeklyHours', $event.target.value)"><span>horas / semana</span></div>
              <p v-if="errors.weeklyHours" id="work-weekly-error" class="work-field-error">{{ errors.weeklyHours }}</p>
            </div>
            <div class="work-field">
              <label for="work-days">Dias de trabalho</label>
              <select id="work-days" :value="settings.daysPerWeek" :aria-invalid="Boolean(errors.daysPerWeek)" @change="updateSetting('daysPerWeek', Number($event.target.value))"><option v-for="days in 7" :key="days" :value="days">{{ days }} {{ days === 1 ? 'dia' : 'dias' }} por semana</option></select>
              <p v-if="errors.daysPerWeek" class="work-field-error">{{ errors.daysPerWeek }}</p>
            </div>
          </div>
          <div class="work-daily-target">
            <span class="work-daily-icon"><Sparkles :size="20" /></span>
            <div><small>SUA JORNADA DIÁRIA</small><strong>{{ day.valid ? formatWorkDuration(day.targetSeconds) : '—' }} <span>de trabalho por dia</span></strong></div>
            <span class="work-daily-equation">{{ settings.weeklyHours || '—' }}h ÷ {{ settings.daysPerWeek }} dias</span>
          </div>
          <p class="work-helper"><Coffee :size="13" /> A pausa para o almoço fica fora desse cálculo.</p>
        </fieldset>

        <fieldset class="work-card" :disabled="!settings.enabled || saving">
          <legend class="work-sr-only">Cálculo de valores das horas extras</legend>
          <header class="work-card-heading"><span class="work-step-number mint"><Wallet :size="16" /></span><div><h3>Seu tempo extra também tem valor.</h3><p>Adicione o salário para ver uma estimativa em reais.</p></div><span class="work-optional">OPCIONAL</span></header>
          <div class="work-field">
            <label for="work-salary">Salário bruto mensal <span>opcional</span></label>
            <div class="work-input-unit prefix"><span>R$</span><input id="work-salary" type="number" min="0.01" step="0.01" placeholder="Adicionar meu salário" :value="settings.monthlySalary" :aria-invalid="Boolean(errors.monthlySalary)" @input="updateSetting('monthlySalary', $event.target.value)"></div>
            <p v-if="errors.monthlySalary" class="work-field-error">{{ errors.monthlySalary }}</p>
          </div>
          <div v-if="salaryProvided" class="work-field-grid work-rate-fields">
            <div class="work-field"><label for="work-monthly">Base de horas mensais</label><div class="work-input-unit"><input id="work-monthly" type="number" min="1" step="1" :value="settings.monthlyHours" :aria-invalid="Boolean(errors.monthlyHours)" @input="updateSetting('monthlyHours', $event.target.value)"><span>horas</span></div><p v-if="errors.monthlyHours" class="work-field-error">{{ errors.monthlyHours }}</p></div>
            <div class="work-field"><label for="work-premium">Adicional da hora extra</label><div class="work-input-unit"><input id="work-premium" type="number" min="0" step="1" :value="settings.overtimePremium" :aria-invalid="Boolean(errors.overtimePremium)" @input="updateSetting('overtimePremium', $event.target.value)"><span>%</span></div><p v-if="errors.overtimePremium" class="work-field-error">{{ errors.overtimePremium }}</p></div>
          </div>
          <div v-if="salaryProvided && day.valid" class="work-rate-summary"><TrendingUp :size="15" /><span>Hora normal <b>{{ formatWorkMoney(day.hourlyRate) }}</b></span><span class="work-rate-arrow">→</span><span>Hora extra <b>{{ formatWorkMoney(day.overtimeRate) }}</b></span></div>
          <p v-if="salaryProvided" class="work-helper rate-helper"><Info :size="13" /> Ajuste a base mensal e o adicional conforme seu contrato. O valor é uma estimativa bruta, sem descontos.</p>
          <p v-else class="work-helper"><Clock3 :size="13" /> Sem salário? Você continua acompanhando todas as horas extras.</p>
        </fieldset>

        <footer class="work-settings-save">
          <span><ShieldCheck :size="15" /> Você escolhe o que acompanhar.</span>
          <button type="submit" class="btn primary" :disabled="saving"><Check :size="16" /> {{ saving ? 'Salvando...' : 'Salvar preferências' }}</button>
        </footer>
      </div>

      <div class="work-settings-aside">
        <fieldset class="work-card work-today" :disabled="!settings.enabled || saving">
          <legend class="work-sr-only">Registros da jornada de hoje</legend>
          <header class="work-today-heading"><div><span class="work-small-label">SEU DIA DE TRABALHO</span><h3>Um registro de cada vez.</h3></div><span class="work-today-date">{{ shortDate }} <small>{{ weekDay }}</small></span></header>
          <div v-if="editableDate" class="work-date-picker"><label for="work-date">Data da jornada</label><input id="work-date" type="date" :value="date" :max="maxDate" :disabled="saving" @change="selectDate"></div>
          <button v-if="canRecordNow && nextStep" type="button" class="work-record-now" :disabled="saving" @click="emit('record', nextStep.key)"><Clock3 :size="14" />{{ recordLabels[nextStep.key] }}</button>
          <div class="work-time-list">
            <div v-for="(step, index) in workSteps" :key="step.key" class="work-time-row" :class="{ recorded: entries[step.key] }">
              <div class="work-time-label"><span class="work-time-icon"><component :is="stepIcons[index]" :size="14" /></span><label :for="'work-' + step.key"><strong>{{ step.label }}</strong></label></div>
              <div class="work-time-control">
                <input :id="'work-' + step.key" type="text" inputmode="numeric" maxlength="5" placeholder="HH:mm" autocomplete="off" spellcheck="false" aria-describedby="work-time-help" :value="entries[step.key]" :disabled="index > 0 && !entries[workSteps[index - 1].key] && !entries[step.key]" @focus="$event.target.select()" @keydown="skipTimeSeparator" @input="maskTime(step.key, $event)" @blur="updateEntry(step.key, normalizeTime($event.target.value))">
                <button v-if="entries[step.key]" type="button" class="work-time-clear" :aria-label="'Limpar ' + step.label.toLocaleLowerCase('pt-BR')" :title="'Limpar ' + step.label.toLocaleLowerCase('pt-BR')" @click="updateEntry(step.key, '')"><X :size="13" /></button>
              </div>
            </div>
          </div>
          <p id="work-time-help" class="work-helper work-time-help">Digite os quatro números: 0830 vira 08:30. Deixe a saída em branco enquanto estiver trabalhando.</p>
          <p v-if="entriesError" class="work-field-error" role="alert">{{ entriesError }}</p>
          <div v-if="day.valid && day.returned" class="work-departure-summary"><Clock3 :size="17" /><span>Saída prevista <strong>{{ formatWorkTime(day.departureMinutes) }}<small v-if="day.departureNextDay"> · dia seguinte</small></strong></span><CheckCircle2 :size="16" /></div>
          <p v-else class="work-today-pending"><Info :size="14" /> Depois de registrar o retorno do almoço, sua previsão de saída aparece automaticamente.</p>
          <footer class="work-times-save"><button type="submit" class="btn primary" :disabled="saving"><Check :size="16" /> {{ saving ? 'Salvando...' : 'Salvar horários' }}</button></footer>
        </fieldset>

        <section class="work-widget-guide">
          <span class="work-guide-art"><Clock3 :size="24" /><span class="work-guide-dot"></span><span class="work-guide-line"></span><span class="work-guide-line short"></span></span>
          <div><h3>Pertinho, sem interromper.</h3><p>Um widget discreto acompanha você em todas as telas. Recolha quando quiser e abra com um clique.</p></div>
          <button v-if="day.valid && day.showWidget" type="button" @click="emit('open-widget')">Ver minha jornada <ArrowRight :size="14" /></button>
        </section>
      </div>
    </div>
  </form>
</template>

<style scoped>
.work-settings {
  color: #596982;
}
.work-activation {
  display: flex;
  align-items: center;
  gap: 16px;
  border: 1px solid #e2e9f9;
  border-radius: 14px;
  background: linear-gradient(110deg, #f4f7ff, #fff 78%);
  padding: 20px 23px;
  margin-bottom: 22px;
}
.work-section-icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  color: #7890dd;
  background: #eaf0ff;
  border: 1px solid #dfe8ff;
  border-radius: 14px;
}
.work-activation > div {
  flex: 1;
}
.work-activation-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.work-activation h2 {
  font-size: 15px;
  font-weight: 600;
  color: #586c96;
}
.work-activation p {
  font-size: 11px;
  color: #8c9bb4;
  margin-top: 7px;
  line-height: 1.6;
}
.work-optional {
  font-size: 7px;
  letter-spacing: .9px;
  color: #9cabc4;
  background: #f3f6fc;
  border: 1px solid #e8edf7;
  padding: 4px 6px;
  border-radius: 5px;
}
.work-switch {
  width: 43px;
  height: 25px;
  padding: 3px;
  border-radius: 20px;
  background: #dce3ef;
  flex-shrink: 0;
}
.work-switch > span {
  display: grid;
  place-items: center;
  width: 19px;
  height: 19px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 3px #405a8b21;
  transition: transform .2s;
  color: #7894e8;
}
.work-switch.enabled {
  background: #7894e8;
}
.work-switch.enabled > span {
  transform: translateX(18px);
}
.work-settings-columns {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(300px, 1fr);
  gap: 22px;
  align-items: start;
}
.work-settings-main,
.work-settings-aside {
  min-width: 0;
}
.work-card {
  min-width: 0;
  margin: 0 0 18px;
  border: 1px solid #e7ecf5;
  border-radius: 13px;
  padding: 23px;
  background: #fff;
  box-shadow: 0 3px 15px #3e5c8e03;
  transition: opacity .2s;
}
.work-card:disabled {
  opacity: .5;
}
.work-card-heading {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 22px;
}
.work-card-heading > div {
  flex: 1;
}
.work-step-number {
  width: 31px;
  height: 31px;
  display: grid;
  place-items: center;
  color: #8398d1;
  background: #f0f4fe;
  border-radius: 10px;
  font-size: 10px;
  flex-shrink: 0;
}
.work-step-number.mint {
  color: #86ac9b;
  background: #f0f8f4;
}
.work-card h3 {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  color: #617493;
}
.work-card-heading p {
  font-size: 10px;
  color: #98a6bb;
  margin-top: 4px;
  line-height: 1.7;
}
.work-field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.work-field label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #7b8ca8;
  font-size: 10px;
  margin-bottom: 8px;
  font-weight: 550;
}
.work-field label > span {
  color: #a5b1c4;
  font-weight: 400;
  font-size: 9px;
}
.work-input-unit {
  display: flex;
  align-items: center;
  border: 1px solid #e1e8f3;
  border-radius: 8px;
  height: 42px;
  overflow: hidden;
  background: #fdfefe;
}
.work-input-unit:focus-within {
  border-color: #91a5ed;
  box-shadow: 0 0 0 3px #5978ed0c;
}
.work-input-unit input {
  width: 100%;
  min-width: 0;
  height: 100%;
  background: transparent;
  border: 0;
  outline: 0;
  padding: 0 12px;
  font-size: 12px;
  box-shadow: none;
}
.work-input-unit > span {
  flex-shrink: 0;
  padding-right: 12px;
  color: #a0aec3;
  font-size: 9px;
}
.work-input-unit.prefix > span {
  padding: 0 0 0 13px;
  color: #8d9fba;
  font-size: 11px;
}
.work-field select {
  width: 100%;
  height: 42px;
  border: 1px solid #e1e8f3;
  background: #fdfefe;
  border-radius: 8px;
  padding: 0 10px;
  font-size: 11px;
}
.work-field-error {
  color: #ad6575;
  font-size: 10px;
  line-height: 1.7;
  margin-top: 7px;
}
.work-daily-target {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: #f4f7ff;
  border: 1px solid #e8eefc;
  border-radius: 10px;
  margin-top: 19px;
}
.work-daily-icon {
  color: #94a9df;
  flex-shrink: 0;
}
.work-daily-target small {
  color: #98aad0;
  font-size: 7px;
  letter-spacing: 1px;
}
.work-daily-target strong {
  display: block;
  color: #6b86c7;
  font-size: 22px;
  letter-spacing: -.7px;
  font-weight: 550;
  margin-top: 4px;
}
.work-daily-target strong > span {
  color: #95a6c8;
  font-size: 9px;
  letter-spacing: 0;
  font-weight: 400;
  margin-left: 4px;
}
.work-daily-equation {
  color: #a0b0cf;
  font-size: 9px;
  margin-left: auto;
  white-space: nowrap;
}
.work-helper {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 9px;
  color: #a0adc1;
  line-height: 1.8;
  margin-top: 12px;
}
.work-helper svg {
  flex-shrink: 0;
  margin-top: 2px;
}
.work-rate-fields {
  margin-top: 15px;
}
.work-rate-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 9px;
  color: #93ac9f;
  background: #f3f9f6;
  padding: 12px;
  border-radius: 8px;
  margin-top: 16px;
}
.work-rate-summary b {
  color: #739b89;
  font-weight: 600;
  margin-left: 3px;
}
.work-rate-arrow {
  margin: 0 3px;
  color: #b0c8bc;
}
.work-settings-save {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 1px 0 20px;
}
.work-settings-save > span {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #a1afc4;
  font-size: 9px;
}
.work-settings-save .btn {
  font-size: 10px;
  padding: 11px 15px;
  white-space: nowrap;
}
.work-today-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 24px;
}
.work-small-label {
  color: #a3b2cc;
  font-size: 7px;
  letter-spacing: 1.1px;
}
.work-today-heading h3 {
  margin-top: 7px;
  font-size: 13px;
  color: #788cab;
  font-weight: 500;
}
.work-today-date {
  color: #96a9c9;
  font-size: 12px;
  font-weight: 500;
  text-align: right;
  white-space: nowrap;
}
.work-today-date small {
  display: block;
  color: #acb8cc;
  font-size: 6px;
  letter-spacing: .7px;
  margin-top: 4px;
}
.work-date-picker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: -5px 0 20px;
  color: #92a4c0;
  font-size: 10px;
}
.work-date-picker input {
  max-width: 150px;
  border: 1px solid #e3eaf6;
  border-radius: 7px;
  padding: 7px;
  background: #fcfdff;
  color: #8098c1;
  font-size: 10px;
}
.work-record-now {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  padding: 11px;
  border: 1px solid #e1e9fb;
  border-radius: 8px;
  background: #f2f6ff;
  color: #7b95cf;
  font-size: 10px;
  margin: 0 0 23px;
}
.work-time-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 12px;
}
.work-time-row {
  min-width: 0;
}
.work-time-label {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  margin-bottom: 7px;
}
.work-time-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 23px;
  height: 23px;
  background: #f5f7fb;
  color: #b1bdd1;
  border: 1px solid #edf0f7;
  border-radius: 7px;
}
.work-time-row.recorded .work-time-icon {
  background: #f0f5fe;
  color: #8fa7d8;
  border-color: #e7eefb;
}
.work-time-row label {
  flex: 1;
  min-width: 0;
}
.work-time-row label strong {
  display: block;
  font-size: 10px;
  color: #8498b8;
  font-weight: 550;
  line-height: 1.5;
}
.work-time-row input {
  flex: 1;
  width: 100%;
  min-width: 0;
  height: 44px;
  padding: 0 4px;
  font-size: 18px;
  color: #687fa7;
  border: 0;
  border-radius: 7px;
  background: transparent;
  text-align: center;
  outline: none;
  box-shadow: none;
  font-variant-numeric: tabular-nums;
}
.work-time-row input::placeholder {
  color: #b4c0d4;
}
.work-time-control {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  min-width: 0;
  width: 100%;
  padding: 0 4px;
  border: 1px solid #e3eaf6;
  border-radius: 7px;
  background: #fcfdff;
}
.work-time-control:focus-within {
  border-color: #91a5ed;
  box-shadow: 0 0 0 3px #5978ed0c;
}
.work-time-clear {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 24px;
  height: 30px;
  color: #95a7c3;
  border-radius: 6px;
}
.work-time-clear:hover {
  color: #ad6575;
  background: #fff0f3;
}
.work-time-help {
  margin: 14px 0 15px;
}
.work-times-save {
  padding-top: 18px;
  margin-top: 18px;
  border-top: 1px solid #edf0f7;
}
.work-times-save .btn {
  justify-content: center;
  width: 100%;
  padding: 12px 15px;
  font-size: 11px;
}
.work-time-row input:disabled {
  opacity: .5;
  cursor: not-allowed;
}
.work-departure-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #f3f8f5;
  border: 1px solid #e5efe9;
  padding: 13px;
  border-radius: 9px;
  color: #94b1a0;
  margin-top: -3px;
}
.work-departure-summary > span {
  flex: 1;
  color: #91a898;
  font-size: 10px;
}
.work-departure-summary strong {
  color: #7c9f8d;
  font-size: 18px;
  font-weight: 550;
  margin-left: 8px;
}
.work-departure-summary small {
  font-size: 8px;
}
.work-today-pending {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  font-size: 10px;
  line-height: 1.8;
  color: #99aaca;
  padding: 12px;
  border-radius: 8px;
  background: #f4f7fe;
}
.work-today-pending svg {
  flex-shrink: 0;
  margin-top: 2px;
}
.work-widget-guide {
  padding: 22px;
  border: 1px dashed #dfe7f6;
  border-radius: 12px;
  background: linear-gradient(130deg, #f5f8ff, #fafbff);
}
.work-guide-art {
  display: block;
  width: 108px;
  height: 62px;
  padding: 14px 12px;
  color: #a4b7df;
  border: 1px solid #e1e9fa;
  border-radius: 11px;
  background: #fff;
  box-shadow: 4px 5px 0 #eaf0fd;
  transform: rotate(-4deg);
  position: relative;
  margin: 0 0 22px 3px;
}
.work-guide-dot {
  position: absolute;
  top: 13px;
  right: 13px;
  width: 5px;
  height: 5px;
  background: #b5d5c7;
  border-radius: 50%;
}
.work-guide-line {
  position: absolute;
  top: 28px;
  right: 13px;
  width: 44px;
  height: 4px;
  border-radius: 3px;
  background: #e7edfa;
}
.work-guide-line.short {
  top: 39px;
  right: 27px;
  width: 30px;
  background: #eff3fc;
}
.work-widget-guide h3 {
  font-size: 12px;
  color: #8da2c5;
  font-weight: 550;
}
.work-widget-guide p {
  font-size: 10px;
  color: #a4b3cf;
  line-height: 1.9;
  margin-top: 7px;
  max-width: 275px;
}
.work-widget-guide button {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: #8ea6d6;
  margin-top: 15px;
  padding: 0;
}
.work-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (max-width: 1150px) {
  .work-settings-columns {
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 16px;
  }
  .work-card {
    padding: 18px;
  }
  .work-daily-equation,
  .work-card-heading > .work-optional {
    display: none;
  }
  .work-daily-target strong > span {
    display: block;
    margin: 5px 0 0;
  }
  .work-settings-save {
    flex-wrap: wrap;
  }
}
@media (max-width: 900px) {
  .work-settings-columns {
    grid-template-columns: 1fr;
  }
  .work-settings-aside {
    grid-row: 1;
  }
  .work-widget-guide {
    display: none;
  }
  .work-activation {
    padding: 16px;
    gap: 12px;
  }
  .work-activation-title > .work-optional {
    display: none;
  }
  .work-activation h2 {
    font-size: 13px;
  }
  .work-activation p {
    font-size: 10px;
  }
}
@media (max-width: 440px) {
  .work-section-icon {
    display: none;
  }
  .work-field-grid {
    gap: 10px;
  }
  .work-input-unit > span {
    padding-right: 7px;
    font-size: 8px;
  }
  .work-card {
    padding: 16px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .work-switch > span,
  .work-card {
    transition: none;
  }
}
</style>
