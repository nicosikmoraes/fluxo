<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { CheckCircle2, Clock3, LoaderCircle, RefreshCw, Settings2 } from "@lucide/vue";
import { auth } from "../auth/auth";
import { notify } from "../../state/workspace";
import WorkHoursSettings from "./WorkHoursSettings.vue";
import { defaultWorkSettings, emptyWorkEntries, parseWorkTime, validateWorkSettings, workSteps, workTimeInTimezone } from "./workHours";

const props = defineProps({ workHours: { type: Object, required: true }, initialDate: { type: String, default: "" } });
const emit = defineEmits(["open-widget", "open-history"]);
const settings = ref({ ...defaultWorkSettings });
const entries = ref({ ...emptyWorkEntries });
const date = ref("");
const settingsVersion = ref(0);
const entryVersion = ref(0);
const baseline = ref("");
const error = ref("");
const selecting = ref(false);
const recording = ref(false);
const initialized = ref(false);
const recordTimezone = ref("");
let previousActiveDate;
const snapshot = () => JSON.stringify([settings.value, entries.value, date.value]);
const dirty = computed(() => initialized.value && snapshot() !== baseline.value);
const busy = computed(() => props.workHours.state.saving || selecting.value || recording.value);
const nowMinutes = computed(() => parseWorkTime(workTimeInTimezone(props.workHours.now.value, settings.value.timezone || "UTC")));
const canRecordNow = computed(() => date.value === props.workHours.state.data?.today || date.value === props.workHours.state.data?.active_day.date && !props.workHours.day.value.stale);

function hydrate(data) {
  settings.value = { ...data.settings, monthlySalary: data.settings.monthlySalary ?? "" };
  entries.value = { ...data.day.entries };
  date.value = data.day.date;
  recordTimezone.value = data.day.timezone;
  settingsVersion.value = data.settings_version;
  entryVersion.value = data.day.version;
  baseline.value = snapshot();
  initialized.value = true;
  error.value = "";
}

watch(() => props.workHours.state.data, (data) => {
  if (!data) return;
  const wasViewingActive = date.value === previousActiveDate;
  if (!initialized.value || !dirty.value && (data.day.date === date.value || wasViewingActive)) hydrate(data);
  previousActiveDate = data.active_day.date;
}, { immediate: true });

onMounted(() => {
  if (props.initialDate && props.initialDate !== date.value) reload(props.initialDate);
});

async function reload(selectedDate = date.value) {
  selecting.value = true;
  error.value = "";
  try {
    const result = await props.workHours.read(selectedDate || undefined);
    if (result) hydrate(result);
  } catch (failure) {
    error.value = failure.message;
  } finally {
    selecting.value = false;
  }
}

function payload(updatedEntries = entries.value) {
  return {
    settings: { ...settings.value, monthlySalary: settings.value.monthlySalary === "" ? null : settings.value.monthlySalary },
    settings_version: settingsVersion.value,
    date: date.value,
    entry_version: entryVersion.value,
    entries: updatedEntries,
  };
}

async function save() {
  if (busy.value) return;
  error.value = "";
  try {
    const result = await props.workHours.save(payload());
    if (result) {
      hydrate(result);
      notify("Preferências e horários salvos.");
    }
  } catch (failure) {
    error.value = failure.message;
  }
}

async function recordNow(key) {
  if (busy.value) return;
  if (Object.keys(validateWorkSettings(settings.value)).length) {
    error.value = "Confira a jornada e os valores informados antes de registrar o horário.";
    return;
  }
  if (entries.value[key]) return;
  const next = workSteps.find((step) => !entries.value[step.key]);
  if (next?.key !== key) return;
  recording.value = true;
  error.value = "";
  try {
    let entry = { date: date.value, version: entryVersion.value };
    if (dirty.value) {
      const saved = await props.workHours.save(payload());
      if (!saved) return;
      hydrate(saved);
      entry = saved.day;
    }
    const result = await props.workHours.record(key, entry);
    if (result) {
      hydrate(result);
      notify(`Horário registrado às ${result.day.entries[key]}.`);
    }
  } catch (failure) {
    error.value = failure.message;
  } finally {
    recording.value = false;
  }
}

function selectDate(value) {
  if (dirty.value) {
    error.value = "Salve suas alterações antes de trocar a data da jornada.";
    return;
  }
  if (value) reload(value);
}
</script>

<template>
  <div class="profile-settings-screen">
    <header class="profile-settings-heading">
      <div><span>CONFIGURAÇÕES DO PERFIL</span><h1>Seu tempo, no seu ritmo.</h1><p>Um espaço para cuidar da sua jornada de trabalho.</p></div>
      <div class="profile-settings-ornament" aria-hidden="true"><Clock3 :size="43" /></div>
    </header>
    <div class="profile-settings-account"><span class="profile-settings-avatar">{{ auth.user?.name?.slice(0, 1).toUpperCase() }}</span><div><strong>{{ auth.user?.name }}</strong><span>{{ auth.user?.email }}</span></div><Settings2 :size="16" /></div>
    <div class="profile-settings-tabs"><span><Clock3 :size="14" /> Jornada de trabalho</span><button class="text-btn profile-history-link" :disabled="busy" @click="emit('open-history')">Ver histórico de horas <Clock3 :size="13" /></button></div>

    <div v-if="!initialized && workHours.state.loading" class="loading-state"><LoaderCircle :size="24" class="spin" /><p>Carregando seu perfil...</p></div>
    <div v-else-if="!initialized" class="profile-settings-error" role="alert"><p>{{ error || workHours.state.error }}</p><button class="text-btn" @click="reload()"><RefreshCw :size="14" /> Tentar novamente</button></div>
    <template v-else>
      <div v-if="error" class="profile-settings-error" role="alert"><p>{{ error }}</p><button class="text-btn" :disabled="busy" @click="reload()"><RefreshCw :size="14" /> Atualizar dados</button></div>
      <WorkHoursSettings v-model:settings="settings" v-model:entries="entries" :date="date" :max-date="workHours.state.data.today" :now-minutes="nowMinutes" :saving="busy" :can-record-now="canRecordNow" editable-date allow-equal-times @update:date="selectDate" @save="save()" @record="recordNow" @open-widget="emit('open-widget')" />
      <p class="profile-settings-footnote">Horários em {{ (recordTimezone || settings.timezone).replaceAll('_', ' ') }}.{{ dirty ? ' Você tem alterações para salvar.' : ' Suas preferências e seus horários ficam salvos na sua conta.' }}</p>
    </template>
  </div>
</template>

<style scoped>
.profile-settings-screen {
  max-width: 1200px;
  margin: 0 auto;
  padding-bottom: 70px;
}
.profile-settings-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 3px 0 24px;
}
.profile-settings-heading > div > span {
  color: #a2b0c8;
  font-size: 8px;
  letter-spacing: 1.5px;
}
.profile-settings-heading h1 {
  color: #7790b8;
  font-size: 28px;
  font-weight: 500;
  letter-spacing: -.9px;
  margin-top: 10px;
}
.profile-settings-heading p {
  color: #a0aec5;
  font-size: 11px;
  margin-top: 10px;
}
.profile-settings-ornament {
  display: grid;
  place-items: center;
  width: 90px;
  height: 75px;
  color: #c6d6f0;
  border: 1px dashed #dae4f4;
  border-radius: 50%;
  transform: rotate(-12deg);
  margin-right: 18px;
}
.profile-settings-ornament svg {
  stroke-width: 1.2;
}
.profile-settings-account {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 14px 17px;
  border: 1px solid #e8edf7;
  border-radius: 11px;
  background: #fff;
  margin-bottom: 24px;
}
.profile-settings-avatar {
  display: grid;
  place-items: center;
  height: 35px;
  width: 35px;
  border-radius: 11px;
  background: #eef3ff;
  color: #94a9d1;
  font-size: 12px;
}
.profile-settings-account strong {
  display: block;
  color: #8297b8;
  font-weight: 550;
  font-size: 11px;
}
.profile-settings-account div > span {
  display: block;
  color: #a5b3ca;
  font-size: 10px;
  margin-top: 5px;
  overflow-wrap: anywhere;
}
.profile-settings-account > svg {
  color: #b2bfd6;
  margin-left: auto;
  flex-shrink: 0;
}
.profile-settings-tabs {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e4eaf5;
  margin-bottom: 22px;
  gap: 14px;
}
.profile-settings-tabs > span,
.profile-settings-tabs small {
  display: flex;
  align-items: center;
  gap: 7px;
  padding-bottom: 14px;
}
.profile-settings-tabs > span {
  font-size: 10px;
  color: #7c98d5;
  border-bottom: 2px solid #8aa5df;
  margin-bottom: -1px;
}
.profile-settings-tabs small {
  color: #acbad0;
  font-size: 8px;
}
.profile-settings-error {
  padding: 15px 17px;
  background: #fff5f5;
  border: 1px solid #f3dfe4;
  border-radius: 10px;
  font-size: 11px;
  line-height: 1.8;
  color: #ad6575;
  margin-bottom: 18px;
}
.profile-settings-error .text-btn {
  margin-top: 9px;
  font-size: 10px;
}
.profile-settings-footnote {
  color: #a6b5cd;
  font-size: 9px;
  line-height: 1.9;
  margin-top: 5px;
}
.profile-history-link {
  font-size: 9px;
  padding-bottom: 14px;
}
@media (max-width: 650px) {
  .profile-settings-heading h1 {
    font-size: 24px;
  }
  .profile-settings-ornament,
  .profile-settings-tabs small {
    display: none;
  }
}
</style>
