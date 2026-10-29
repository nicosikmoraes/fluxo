<script setup>
import { computed, ref } from "vue";
import { ArrowRight, Check, CheckCircle2, Clock3, Coffee, Info, LogIn, LogOut, ShieldCheck, Sparkles, TrendingUp, Wallet, X } from "@lucide/vue";
import { calculateWorkDay, formatWorkDuration, formatWorkMoney, formatWorkTime, getWorkTimeline, isWorkWeekend, payrollCycle, validateWorkSettings, workSteps } from "./workHours";
import { currentLocale, t } from "../../state/locale";

const props = defineProps({
  canCalculatePay: { type: Boolean, default: true },
  settings: { type: Object, required: true },
  entries: { type: Object, required: true },
  extraBreaks: { type: Array, default: () => [] },
  nowMinutes: { type: Number, required: true },
  date: { type: String, default: "2026-10-16" },
  maxDate: { type: String, default: "" },
  editableDate: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  canRecordNow: { type: Boolean, default: false },
  allowEqualTimes: { type: Boolean, default: false },
});
const emit = defineEmits(["update:settings", "update:entries", "update:extraBreaks", "update:date", "save", "open-widget", "record"]);
const attemptedSave = ref(false);
const englishMode = computed(() => currentLocale.value === "en-US");
const showPause = ref(false);
const weekend = computed(() => isWorkWeekend(props.date));
const visibleSteps = computed(() => workSteps.filter((step) => englishMode.value || !weekend.value || showPause.value || props.entries.lunchOut || props.entries.lunchIn || !["lunchOut", "lunchIn"].includes(step.key)));
const cycle = computed(() => payrollCycle(props.date, props.settings.cycleClosingDay || 31));
const cycleOpeningDay = computed(() => Number(props.settings.cycleClosingDay || 31) === 31 ? 1 : Number(props.settings.cycleClosingDay) + 1);
const normalizedEntries = computed(() => Object.fromEntries(workSteps.map(({ key }) => [key, normalizeTime(props.entries[key])])));
const day = computed(() => calculateWorkDay({ ...props.settings, overtimeEnabled: !englishMode.value }, normalizedEntries.value, props.nowMinutes, { allowEqual: props.allowEqualTimes, date: props.date, additionalBreaks: props.extraBreaks }));
const errors = computed(() => attemptedSave.value ? validateWorkSettings({ ...props.settings, overtimeEnabled: !englishMode.value }) : {});
const entriesError = computed(() => getWorkTimeline(normalizedEntries.value, { allowEqual: props.allowEqualTimes, date: props.date, additionalBreaks: props.extraBreaks }).error);
const salaryProvided = computed(() => props.settings.monthlySalary !== "" && props.settings.monthlySalary != null);
const stepIcons = [LogIn, Coffee, ArrowRight, LogOut];
const nextStep = computed(() => props.entries.finishedAt ? null : !props.entries.startedAt ? workSteps[0] : props.entries.lunchOut && !props.entries.lunchIn ? workSteps[2] : !englishMode.value && weekend.value && !showPause.value ? workSteps[3] : !props.entries.lunchOut ? workSteps[1] : workSteps[3]);
const dateValue = computed(() => new Date(`${props.date}T12:00:00Z`));
const shortDate = computed(() => new Intl.DateTimeFormat(currentLocale.value, { timeZone: "UTC", day: "2-digit", month: "short" }).format(dateValue.value).replace("de ", "").replace(".", "").toUpperCase());
const weekDay = computed(() => new Intl.DateTimeFormat(currentLocale.value, { timeZone: "UTC", weekday: "long" }).format(dateValue.value).toUpperCase());
const recordLabels = {
  startedAt: "Registrar entrada agora",
  lunchOut: "Registrar início da pausa",
  lunchIn: "Registrar retorno da pausa",
  finishedAt: "Registrar saída agora",
};

function updateSetting(key, value) {
  emit("update:settings", { ...props.settings, [key]: value });
}

function updateEntry(key, value) {
  emit("update:entries", { ...props.entries, [key]: value });
}

function maskTime(key, event, pauseIndex = null) {
  const input = event.target;
  const digitsBeforeCursor = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, "").length;
  const digits = input.value.replace(/\D/g, "").slice(0, 4);
  const value = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
  const cursor = Math.min(value.length, digitsBeforeCursor + (digitsBeforeCursor > 2 ? 1 : 0));
  input.value = value;
  if (pauseIndex === null) updateEntry(key, value);
  else updatePause(pauseIndex, key, value);
  input.setSelectionRange(cursor, cursor);
}

function updatePause(index, key, value) {
  emit("update:extraBreaks", props.extraBreaks.map((pause, item) => item === index ? { ...pause, [key]: value } : pause));
}

function addPause() {
  emit("update:extraBreaks", [...props.extraBreaks, { startedAt: "", finishedAt: "" }]);
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
  if (props.saving || Object.keys(validateWorkSettings({ ...props.settings, overtimeEnabled: !englishMode.value })).length || entriesError.value) return;
  emit("update:entries", normalizedEntries.value);
  emit("save");
}
</script>

<template>
  <form class="work-settings" novalidate @submit.prevent="save">
    <section class="work-activation">
      <span class="work-section-icon"><Clock3 :size="22" /></span>
      <div>
        <div class="work-activation-title"><h2>{{ t("Acompanhar minha jornada") }}</h2><span class="work-optional">{{ t("OPCIONAL") }}</span></div>
        <p>{{ t("Registre seus horários e saiba quando é hora de descansar.") }}</p>
      </div>
      <button type="button" class="work-switch" :disabled="saving" :class="{ enabled: settings.enabled }" role="switch" :aria-checked="settings.enabled" :aria-label="t('Ativar acompanhamento da jornada')" @click="updateSetting('enabled', !settings.enabled)"><span><Check v-if="settings.enabled" :size="12" /></span></button>
    </section>

    <div class="work-settings-columns">
      <div class="work-settings-main">
        <fieldset v-if="!englishMode" class="work-card" :disabled="!settings.enabled || saving">
          <legend class="work-sr-only">{{ t("Configuração da jornada semanal") }}</legend>
          <header class="work-card-heading"><span class="work-step-number">01</span><div><h3>{{ t("Qual é o seu ritmo de trabalho?") }}</h3><p>{{ t("Conte como sua semana é dividida.") }}</p></div></header>
          <div class="work-field-grid">
            <div class="work-field">
              <label for="work-weekly">{{ t("Jornada semanal") }}</label>
              <div class="work-input-unit"><input id="work-weekly" type="number" min="0.5" max="168" step="0.5" :value="settings.weeklyHours" :aria-invalid="Boolean(errors.weeklyHours)" :aria-describedby="errors.weeklyHours ? 'work-weekly-error' : undefined" @input="updateSetting('weeklyHours', $event.target.value)"><span>{{ t("horas / semana") }}</span></div>
              <p v-if="errors.weeklyHours" id="work-weekly-error" class="work-field-error">{{ errors.weeklyHours }}</p>
            </div>
            <div class="work-field">
              <label for="work-days">{{ t("Dias de trabalho") }}</label>
              <select id="work-days" :value="settings.daysPerWeek" :aria-invalid="Boolean(errors.daysPerWeek)" @change="updateSetting('daysPerWeek', Number($event.target.value))"><option v-for="days in 7" :key="days" :value="days">{{ days }} {{ days === 1 ? 'dia' : t('dias') }} {{ t("por semana") }}</option></select>
              <p v-if="errors.daysPerWeek" class="work-field-error">{{ errors.daysPerWeek }}</p>
            </div>
          </div>
          <div class="work-daily-target">
            <span class="work-daily-icon"><Sparkles :size="20" /></span>
            <div><small>{{ t("SUA JORNADA DIÁRIA") }}</small><strong>{{ day.valid ? formatWorkDuration(Number(settings.weeklyHours) * 3600 / Number(settings.daysPerWeek)) : '—' }} <span>{{ t("de trabalho por dia") }}</span></strong></div>
            <span class="work-daily-equation">{{ settings.weeklyHours || '—' }}h ÷ {{ settings.daysPerWeek }} {{ t("dias") }}</span>
          </div>
          <p class="work-helper"><Coffee :size="13" /> {{ t("A pausa para o almoço fica fora desse cálculo.") }}</p>
        </fieldset>

        <fieldset v-if="!englishMode && canCalculatePay" class="work-card" :disabled="!settings.enabled || saving">
          <legend class="work-sr-only">{{ t("Cálculo de valores das horas extras") }}</legend>
          <header class="work-card-heading"><span class="work-step-number mint"><Wallet :size="16" /></span><div><h3>{{ t("Seu tempo extra também tem valor.") }}</h3><p>{{ t("Adicione o salário para ver uma estimativa em reais.") }}</p></div><span class="work-optional">{{ t("OPCIONAL") }}</span></header>
          <div class="work-field">
            <label for="work-salary">{{ t("Salário bruto mensal") }} <span>{{ t("opcional") }}</span></label>
            <div class="work-input-unit prefix"><span>R$</span><input id="work-salary" type="number" min="0.01" step="0.01" :placeholder="t('Adicionar meu salário')" :value="settings.monthlySalary" :aria-invalid="Boolean(errors.monthlySalary)" @input="updateSetting('monthlySalary', $event.target.value)"></div>
            <p v-if="errors.monthlySalary" class="work-field-error">{{ errors.monthlySalary }}</p>
          </div>
          <div v-if="salaryProvided" class="work-field-grid work-rate-fields">
            <div class="work-field"><label for="work-monthly">{{ t("Base de horas mensais") }}</label><div class="work-input-unit"><input id="work-monthly" type="number" min="1" step="1" :value="settings.monthlyHours" :aria-invalid="Boolean(errors.monthlyHours)" @input="updateSetting('monthlyHours', $event.target.value)"><span>{{ t("horas") }}</span></div><p v-if="errors.monthlyHours" class="work-field-error">{{ errors.monthlyHours }}</p></div>
            <div class="work-field"><label for="work-premium">{{ t("Adicional da hora extra") }}</label><div class="work-input-unit"><input id="work-premium" type="number" min="0" step="1" :value="settings.overtimePremium" :aria-invalid="Boolean(errors.overtimePremium)" @input="updateSetting('overtimePremium', $event.target.value)"><span>%</span></div><p v-if="errors.overtimePremium" class="work-field-error">{{ errors.overtimePremium }}</p></div>
          </div>
          <div v-if="salaryProvided && day.valid" class="work-rate-summary"><TrendingUp :size="15" /><span>{{ t("Hora normal") }} <b>{{ formatWorkMoney(day.hourlyRate) }}</b></span><span class="work-rate-arrow">→</span><span>{{ t("Hora extra") }} <b>{{ formatWorkMoney(day.overtimeRate) }}</b></span></div>
          <p v-if="salaryProvided" class="work-helper rate-helper"><Info :size="13" /> {{ t("Ajuste a base mensal e o adicional conforme seu contrato. O valor é uma estimativa bruta, sem descontos.") }}</p>
          <p v-else class="work-helper"><Clock3 :size="13" /> {{ t("Sem salário? Você continua acompanhando todas as horas extras.") }}</p>
        </fieldset>

        <fieldset v-if="englishMode && canCalculatePay" class="work-card" :disabled="!settings.enabled || saving">
          <legend class="work-sr-only">Hourly pay rate</legend>
          <header class="work-card-heading"><span class="work-step-number mint"><Wallet :size="16" /></span><div><h3>Your hourly pay</h3><p>Set your rate to estimate your pay while you track time.</p></div><span class="work-optional">OPTIONAL</span></header>
          <div class="work-field">
            <label for="work-hourly-rate">Hourly rate <span>optional</span></label>
            <div class="work-input-unit prefix"><span>$</span><input id="work-hourly-rate" type="number" min="0.01" step="0.01" placeholder="Enter your hourly rate" :value="settings.hourlyRate" :aria-invalid="Boolean(errors.hourlyRate)" @input="updateSetting('hourlyRate', $event.target.value)"></div>
            <p v-if="errors.hourlyRate" class="work-field-error">{{ errors.hourlyRate }}</p>
          </div>
          <div v-if="settings.hourlyRate && day.valid" class="work-rate-summary"><Clock3 :size="15" /><span>Hourly rate <b>{{ formatWorkMoney(Number(settings.hourlyRate)) }}</b></span><span class="work-rate-arrow">·</span><span>Pay earned today <b>{{ formatWorkMoney(Number(settings.hourlyRate) * day.workedSeconds / 3600) }}</b></span></div>
          <p class="work-helper rate-helper"><Info :size="13" /> Pay estimates use your hourly rate and time worked. Breaks are excluded.</p>
        </fieldset>

        <fieldset v-if="!englishMode" class="work-card" :disabled="!settings.enabled || saving">
          <legend class="work-sr-only">{{ t("Ciclo de horas extras da empresa") }}</legend>
          <header class="work-card-heading"><span class="work-step-number"><Clock3 :size="16" /></span><div><h3>{{ t("Quando sua empresa fecha o mês?") }}</h3><p>{{ t("O limite de 20 horas extras reinicia a cada ciclo.") }}</p></div></header>
          <div class="work-field-grid">
            <div class="work-field"><label for="work-cycle-start">{{ t("Dia de abertura") }}</label><select id="work-cycle-start" :value="cycleOpeningDay" @change="updateSetting('cycleClosingDay', Number($event.target.value) === 1 ? 31 : Number($event.target.value) - 1)"><option v-for="number in 31" :key="number" :value="number">{{ t("Dia") }} {{ number }}</option></select></div>
            <div class="work-field"><label for="work-cycle-end">{{ t("Dia de fechamento") }}</label><select id="work-cycle-end" :value="settings.cycleClosingDay || 31" @change="updateSetting('cycleClosingDay', Number($event.target.value))"><option v-for="number in 31" :key="number" :value="number">{{ t("Dia") }} {{ number }}</option></select></div>
          </div>
          <p class="work-helper">{{ t("Ciclo desta jornada:") }} {{ cycle.start.split('-').reverse().join('/') }} {{ t("a") }} {{ cycle.end.split('-').reverse().join('/') }}{{ t(". Abertura e fechamento se ajustam juntos; em meses curtos, usamos o último dia disponível.") }}</p>
          <p class="work-helper">{{ t("Sábado: tudo é extra. Domingo: adicional de 100%. Nos demais dias, após 20h extras no ciclo, adicional de 75% sobre as próximas horas.") }}</p>
        </fieldset>

        <footer class="work-settings-save">
          <span><ShieldCheck :size="15" /> {{ t("Você escolhe o que acompanhar.") }}</span>
          <button type="submit" class="btn primary" :disabled="saving"><Check :size="16" /> {{ saving ? t('Salvando...') : t('Salvar preferências') }}</button>
        </footer>
      </div>

      <div class="work-settings-aside">
        <fieldset class="work-card work-today" :disabled="!settings.enabled || saving">
          <legend class="work-sr-only">{{ t("Registros da jornada de hoje") }}</legend>
          <header class="work-today-heading"><div><span class="work-small-label">{{ t("SEU DIA DE TRABALHO") }}</span><h3>{{ t("Um registro de cada vez.") }}</h3></div><span class="work-today-date">{{ shortDate }} <small>{{ weekDay }}</small></span></header>
          <div v-if="editableDate" class="work-date-picker"><label for="work-date">{{ t("Data da jornada") }}</label><input id="work-date" type="date" :value="date" :max="maxDate" :disabled="saving" @change="selectDate"></div>
          <button v-if="canRecordNow && nextStep" type="button" class="work-record-now" :disabled="saving" @click="emit('record', nextStep.key)"><Clock3 :size="14" />{{ t(recordLabels[nextStep.key]) }}</button>
          <p v-if="weekend && !englishMode" class="work-helper">{{ dateValue.getUTCDay() === 0 ? t('Domingo: adicional de 100%.') : t('Sábado: todas as horas são extras.') }} {{ t("A pausa é opcional.") }}</p>
          <button v-if="!englishMode && weekend && !showPause && !entries.lunchOut && !entries.lunchIn" type="button" class="work-record-now" @click="showPause = true">{{ t("Adicionar uma pausa") }}</button>
          <div class="work-time-list">
            <div v-for="(step, index) in visibleSteps" :key="step.key" class="work-time-row" :class="{ recorded: entries[step.key] }">
              <div class="work-time-label"><span class="work-time-icon"><component :is="stepIcons[workSteps.indexOf(step)]" :size="14" /></span><label :for="'work-' + step.key"><strong>{{ t(step.label) }}</strong></label></div>
              <div class="work-time-control">
                <input :id="'work-' + step.key" type="text" inputmode="numeric" maxlength="5" placeholder="HH:mm" autocomplete="off" spellcheck="false" aria-describedby="work-time-help" :value="entries[step.key]" :disabled="step.key !== 'startedAt' && !entries.startedAt" @focus="$event.target.select()" @keydown="skipTimeSeparator" @input="maskTime(step.key, $event)" @blur="updateEntry(step.key, normalizeTime($event.target.value))">
                <button v-if="entries[step.key]" type="button" class="work-time-clear" :aria-label="t('Limpar {field}', { field: t(step.label).toLocaleLowerCase(currentLocale) })" :title="t('Limpar {field}', { field: t(step.label).toLocaleLowerCase(currentLocale) })" @click="updateEntry(step.key, '')"><X :size="13" /></button>
              </div>
            </div>
          </div>
          <div v-for="(pause, index) in extraBreaks" :key="index" class="work-extra-pause">
            <div class="work-extra-heading"><strong>{{ t("Pausa") }} {{ index + 2 }}</strong><button type="button" :aria-label="t('Remover pausa ') + (index + 2)" @click="emit('update:extraBreaks', extraBreaks.filter((_, item) => item !== index))"><X :size="14" /></button></div>
            <div class="work-field-grid"><div v-for="field in [{ key: 'startedAt', label: t('Início') }, { key: 'finishedAt', label: t('Retorno') }]" :key="field.key" class="work-field"><label :for="'pause-' + index + field.key">{{ field.label }}</label><input :id="'pause-' + index + field.key" class="work-pause-input" type="text" inputmode="numeric" maxlength="5" placeholder="HH:mm" :value="pause[field.key]" @keydown="skipTimeSeparator" @input="maskTime(field.key, $event, index)" @blur="updatePause(index, field.key, normalizeTime($event.target.value))"></div></div>
          </div>
          <button v-if="entries.lunchIn && extraBreaks.length < 30" type="button" class="work-record-now" @click="addPause">{{ t("Adicionar outra pausa") }}</button>
          <p id="work-time-help" class="work-helper work-time-help">{{ t("Digite os quatro números: 0830 vira 08:30. Deixe a saída em branco enquanto estiver trabalhando.") }}</p>
          <p v-if="entriesError" class="work-field-error" role="alert">{{ entriesError }}</p>
          <div v-if="!englishMode && day.valid && day.returned && !weekend" class="work-departure-summary"><Clock3 :size="17" /><span>{{ t("Saída prevista") }} <strong>{{ formatWorkTime(day.departureMinutes) }}<small v-if="day.departureNextDay"> {{ t("· dia seguinte") }}</small></strong></span><CheckCircle2 :size="16" /></div>
          <p v-else class="work-today-pending"><Info :size="14" /> {{ !englishMode && weekend && entries.startedAt ? t('Seu tempo de trabalho já está contando como hora extra. Adicione uma pausa se precisar.') : t('Registre a entrada para acompanhar sua jornada. As pausas ficam fora das horas trabalhadas.') }}</p>
          <footer class="work-times-save"><button type="submit" class="btn primary" :disabled="saving"><Check :size="16" /> {{ saving ? t('Salvando...') : t('Salvar horários') }}</button></footer>
        </fieldset>

        <section class="work-widget-guide">
          <span class="work-guide-art"><Clock3 :size="24" /><span class="work-guide-dot"></span><span class="work-guide-line"></span><span class="work-guide-line short"></span></span>
          <div><h3>{{ t("Pertinho, sem interromper.") }}</h3><p>{{ t("Um widget discreto acompanha você em todas as telas. Recolha quando quiser e abra com um clique.") }}</p></div>
          <button v-if="day.valid && day.showWidget" type="button" @click="emit('open-widget')">{{ t("Ver minha jornada") }} <ArrowRight :size="14" /></button>
        </section>
      </div>
    </div>
  </form>
</template>

<style scoped>
.work-extra-pause { border-top: 1px solid var(--theme-line, #edf0f7); margin-top: 16px; padding-top: 14px; }
.work-extra-heading { display: flex; justify-content: space-between; margin-bottom: 12px; font-size: 11px; color: var(--theme-text-secondary, #7b8ca8); }
.work-pause-input { width: 100%; padding: 10px; border: 1px solid var(--theme-line, #e1e8f3); border-radius: 8px; font-size: 12px; }
.work-settings {
  color: var(--theme-text, #596982);
}
.work-activation {
  display: flex;
  align-items: center;
  gap: 16px;
  border: 1px solid var(--theme-line, #e2e9f9);
  border-radius: 14px;
  background: linear-gradient(110deg, var(--theme-surface-muted, #f4f7ff), var(--theme-panel, #fff) 78%);
  padding: 20px 23px;
  margin-bottom: 22px;
}
.work-section-icon {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  color: var(--theme-accent, #7890dd);
  background: var(--theme-accent-soft, #eaf0ff);
  border: 1px solid var(--theme-line, #dfe8ff);
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
  color: var(--theme-text, #586c96);
}
.work-activation p {
  font-size: 11px;
  color: var(--theme-text-secondary, #8c9bb4);
  margin-top: 7px;
  line-height: 1.6;
}
.work-optional {
  font-size: 7px;
  letter-spacing: .9px;
  color: var(--theme-text-muted, #9cabc4);
  background: var(--theme-surface-muted, #f3f6fc);
  border: 1px solid var(--theme-line, #e8edf7);
  padding: 4px 6px;
  border-radius: 5px;
}
.work-switch {
  width: 43px;
  height: 25px;
  padding: 3px;
  border-radius: 20px;
  background: var(--theme-surface, #dce3ef);
  flex-shrink: 0;
}
.work-switch > span {
  display: grid;
  place-items: center;
  width: 19px;
  height: 19px;
  background: var(--theme-panel, #fff);
  border-radius: 50%;
  box-shadow: 0 1px 3px var(--theme-shadow, #405a8b21);
  transition: transform .2s;
  color: var(--theme-accent, #7894e8);
}
.work-switch.enabled {
  background: var(--theme-accent, #7894e8);
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
  border: 1px solid var(--theme-line, #e7ecf5);
  border-radius: 13px;
  padding: 23px;
  background: var(--theme-panel, #fff);
  box-shadow: 0 3px 15px var(--theme-shadow-soft, #3e5c8e03);
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
  color: var(--theme-text-muted, #8398d1);
  background: var(--theme-surface-muted, #f0f4fe);
  border-radius: 10px;
  font-size: 10px;
  flex-shrink: 0;
}
.work-step-number.mint {
  color: var(--theme-success, #86ac9b);
  background: var(--theme-success-soft, #f0f8f4);
}
.work-card h3 {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--theme-text, #617493);
}
.work-card-heading p {
  font-size: 10px;
  color: var(--theme-text-muted, #98a6bb);
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
  color: var(--theme-text-secondary, #7b8ca8);
  font-size: 10px;
  margin-bottom: 8px;
  font-weight: 550;
}
.work-field label > span {
  color: var(--theme-text-muted, #a5b1c4);
  font-weight: 400;
  font-size: 9px;
}
.work-input-unit {
  display: flex;
  align-items: center;
  border: 1px solid var(--theme-line, #e1e8f3);
  border-radius: 8px;
  height: 42px;
  overflow: hidden;
  background: var(--theme-panel, #fdfefe);
}
.work-input-unit:focus-within {
  border-color: var(--theme-accent-line, #91a5ed);
  box-shadow: 0 0 0 3px var(--theme-shadow-soft, #5978ed0c);
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
  color: var(--theme-text-muted, #a0aec3);
  font-size: 9px;
}
.work-input-unit.prefix > span {
  padding: 0 0 0 13px;
  color: var(--theme-text-muted, #8d9fba);
  font-size: 11px;
}
.work-field select {
  width: 100%;
  height: 42px;
  border: 1px solid var(--theme-line, #e1e8f3);
  background: var(--theme-panel, #fdfefe);
  border-radius: 8px;
  padding: 0 10px;
  font-size: 11px;
}
.work-field-error {
  color: var(--theme-danger, #ad6575);
  font-size: 10px;
  line-height: 1.7;
  margin-top: 7px;
}
.work-daily-target {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--theme-surface-muted, #f4f7ff);
  border: 1px solid var(--theme-line, #e8eefc);
  border-radius: 10px;
  margin-top: 19px;
}
.work-daily-icon {
  color: var(--theme-text-muted, #94a9df);
  flex-shrink: 0;
}
.work-daily-target small {
  color: var(--theme-text-muted, #98aad0);
  font-size: 7px;
  letter-spacing: 1px;
}
.work-daily-target strong {
  display: block;
  color: var(--theme-text-secondary, #6b86c7);
  font-size: 22px;
  letter-spacing: -.7px;
  font-weight: 550;
  margin-top: 4px;
}
.work-daily-target strong > span {
  color: var(--theme-text-muted, #95a6c8);
  font-size: 9px;
  letter-spacing: 0;
  font-weight: 400;
  margin-left: 4px;
}
.work-daily-equation {
  color: var(--theme-text-muted, #a0b0cf);
  font-size: 9px;
  margin-left: auto;
  white-space: nowrap;
}
.work-helper {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 9px;
  color: var(--theme-text-muted, #a0adc1);
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
  color: var(--theme-success, #93ac9f);
  background: var(--theme-success-soft, #f3f9f6);
  padding: 12px;
  border-radius: 8px;
  margin-top: 16px;
}
.work-rate-summary b {
  color: var(--theme-success, #739b89);
  font-weight: 600;
  margin-left: 3px;
}
.work-rate-arrow {
  margin: 0 3px;
  color: var(--theme-success, #b0c8bc);
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
  color: var(--theme-text-muted, #a1afc4);
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
  color: var(--theme-text-muted, #a3b2cc);
  font-size: 7px;
  letter-spacing: 1.1px;
}
.work-today-heading h3 {
  margin-top: 7px;
  font-size: 13px;
  color: var(--theme-accent, #788cab);
  font-weight: 500;
}
.work-today-date {
  color: var(--theme-accent, #96a9c9);
  font-size: 12px;
  font-weight: 500;
  text-align: right;
  white-space: nowrap;
}
.work-today-date small {
  display: block;
  color: var(--theme-accent, #acb8cc);
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
  color: var(--theme-text-muted, #92a4c0);
  font-size: 10px;
}
.work-date-picker input {
  max-width: 150px;
  border: 1px solid var(--theme-line, #e3eaf6);
  border-radius: 7px;
  padding: 7px;
  background: var(--theme-panel, #fcfdff);
  color: var(--theme-text-secondary, #8098c1);
  font-size: 10px;
}
.work-record-now {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  padding: 11px;
  border: 1px solid var(--theme-line, #e1e9fb);
  border-radius: 8px;
  background: var(--theme-surface-muted, #f2f6ff);
  color: var(--theme-text-muted, #7b95cf);
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
  background: var(--theme-surface-muted, #f5f7fb);
  color: var(--theme-text-muted, #b1bdd1);
  border: 1px solid var(--theme-line, #edf0f7);
  border-radius: 7px;
}
.work-time-row.recorded .work-time-icon {
  background: var(--theme-surface-muted, #f0f5fe);
  color: var(--theme-text-muted, #8fa7d8);
  border-color: var(--theme-line, #e7eefb);
}
.work-time-row label {
  flex: 1;
  min-width: 0;
}
.work-time-row label strong {
  display: block;
  font-size: 10px;
  color: var(--theme-text-secondary, #8498b8);
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
  color: var(--theme-text, #687fa7);
  border: 0;
  border-radius: 7px;
  background: transparent;
  text-align: center;
  outline: none;
  box-shadow: none;
  font-variant-numeric: tabular-nums;
}
.work-time-row input::placeholder {
  color: var(--theme-text-muted, #b4c0d4);
}
.work-time-control {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  min-width: 0;
  width: 100%;
  padding: 0 4px;
  border: 1px solid var(--theme-line, #e3eaf6);
  border-radius: 7px;
  background: var(--theme-panel, #fcfdff);
}
.work-time-control:focus-within {
  border-color: var(--theme-accent-line, #91a5ed);
  box-shadow: 0 0 0 3px var(--theme-shadow-soft, #5978ed0c);
}
.work-time-clear {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 24px;
  height: 30px;
  color: var(--theme-text-muted, #95a7c3);
  border-radius: 6px;
}
.work-time-clear:hover {
  color: var(--theme-danger, #ad6575);
  background: var(--theme-danger-soft, #fff0f3);
}
.work-time-help {
  margin: 14px 0 15px;
}
.work-times-save {
  padding-top: 18px;
  margin-top: 18px;
  border-top: 1px solid var(--theme-line, #edf0f7);
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
  background: var(--theme-success-soft, #f3f8f5);
  border: 1px solid var(--theme-success-line, #e5efe9);
  padding: 13px;
  border-radius: 9px;
  color: var(--theme-success, #94b1a0);
  margin-top: -3px;
}
.work-departure-summary > span {
  flex: 1;
  color: var(--theme-text-secondary, #91a898);
  font-size: 10px;
}
.work-departure-summary strong {
  color: var(--theme-success, #7c9f8d);
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
  color: var(--theme-accent, #99aaca);
  padding: 12px;
  border-radius: 8px;
  background: var(--theme-accent-soft, #f4f7fe);
}
.work-today-pending svg {
  flex-shrink: 0;
  margin-top: 2px;
}
.work-widget-guide {
  padding: 22px;
  border: 1px dashed var(--theme-line, #dfe7f6);
  border-radius: 12px;
  background: linear-gradient(130deg, var(--theme-surface-muted, #f5f8ff), var(--theme-panel, #fafbff));
}
.work-guide-art {
  display: block;
  width: 108px;
  height: 62px;
  padding: 14px 12px;
  color: var(--theme-text-muted, #a4b7df);
  border: 1px solid var(--theme-line, #e1e9fa);
  border-radius: 11px;
  background: var(--theme-panel, #fff);
  box-shadow: 4px 5px 0 var(--theme-shadow, #eaf0fd);
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
  background: var(--theme-success, #b5d5c7);
  border-radius: 50%;
}
.work-guide-line {
  position: absolute;
  top: 28px;
  right: 13px;
  width: 44px;
  height: 4px;
  border-radius: 3px;
  background: var(--theme-accent-soft, #e7edfa);
}
.work-guide-line.short {
  top: 39px;
  right: 27px;
  width: 30px;
  background: var(--theme-accent-soft, #eff3fc);
}
.work-widget-guide h3 {
  font-size: 12px;
  color: var(--theme-text-muted, #8da2c5);
  font-weight: 550;
}
.work-widget-guide p {
  font-size: 10px;
  color: var(--theme-text-muted, #a4b3cf);
  line-height: 1.9;
  margin-top: 7px;
  max-width: 275px;
}
.work-widget-guide button {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: var(--theme-text-muted, #8ea6d6);
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
