<script setup>
import { vValidate } from "../../shared/validation";
import { computed, reactive, ref, watch } from "vue";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Search, X, FolderOpen, Sparkles, GripVertical, CalendarOff, CheckCircle2, Clock3 } from "@lucide/vue";
import { state, mutate } from "../../state/workspace";
import { currentLocale, t } from "../../state/locale";
import { dateKey, monthDays, parseDay, deliveryLabel } from "./calendar";
import { useCalendarDrag } from "./calendarDrag";
import CalendarTaskCard from "./CalendarTaskCard.vue";
import Modal from "../../shared/Modal.vue";
const emit = defineEmits(["open-task", "new-task"]);
const today = dateKey(/* @__PURE__ */ new Date());
const month = ref(new Date((/* @__PURE__ */ new Date()).getFullYear(), (/* @__PURE__ */ new Date()).getMonth(), 1, 12));
const projectFilter = ref("all"), search = ref(""), calendar = ref(null), schedule = ref(null), scheduleDate = ref("");
const pendingDates = reactive({});
const { dragging, over, preview, position: dragPosition, start: startDrag, cancel: cancelDrag } = useCalendarDrag(calendar, () => !!state.saving, scheduleTask);
const days = computed(() => monthDays(month.value));
const monthTitle = computed(() => new Intl.DateTimeFormat(currentLocale.value, { month: "long", year: "numeric" }).format(month.value));
const scoped = computed(() => state.tasks.map((t) => Object.hasOwn(pendingDates, t.id) ? { ...t, due_date: pendingDates[t.id] } : t).filter((t) => (projectFilter.value === "all" || (projectFilter.value === "none" ? t.project_id === null : t.project_id === Number(projectFilter.value))) && t.title.toLocaleLowerCase(currentLocale.value).includes(search.value.trim().toLocaleLowerCase(currentLocale.value))));
const undated = computed(() => scoped.value.filter((t) => !t.due_date));
const monthly = computed(() => scoped.value.filter((t) => t.due_date?.startsWith(dateKey(month.value).slice(0, 7))));
const completed = computed(() => monthly.value.filter((t) => t.status === "done").length);
const late = computed(() => scoped.value.filter((t) => t.due_date && t.due_date < today && t.status !== "done").length);
const byDay = computed(() => {
  const result = /* @__PURE__ */ new Map();
  for (const task of scoped.value) {
    if (!task.due_date) continue;
    const list = result.get(task.due_date) || [];
    list.push(task);
    result.set(task.due_date, list);
  }
  for (const list of result.values()) list.sort((a, b) => (a.status === "done") - (b.status === "done") || a.position - b.position || a.id - b.id);
  return result;
});
const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
watch(() => state.projects.map((p) => p.id).join(","), () => {
  if (!["all", "none"].includes(projectFilter.value) && !state.projects.some((p) => p.id === Number(projectFilter.value))) projectFilter.value = "all";
});
watch([projectFilter, search, month], cancelDrag);
function changeMonth(delta) {
  const next = new Date(month.value);
  next.setDate(1);
  next.setMonth(next.getMonth() + delta);
  if (next.getFullYear() >= 1 && next.getFullYear() <= 9999) month.value = next;
}
function goToday() {
  month.value = new Date(parseDay(today).getFullYear(), parseDay(today).getMonth(), 1, 12);
}
const dayTasks = (key) => byDay.value.get(key) || [];
const dayLabel = (key) => new Intl.DateTimeFormat(currentLocale.value, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(parseDay(key));
function createTask(key) {
  emit("new-task", key, projectFilter.value);
}
async function scheduleTask(id, key) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task || state.saving || !scoped.value.some((t) => t.id === id)) return;
  if ((task.due_date || null) === key) return;
  if (key !== null && !days.value.some((day) => day.key === key)) return;
  pendingDates[id] = key;
  try {
    await mutate("/tasks/" + id + "/schedule", "PATCH", { due_date: key }, key ? t("Data de entrega atualizada.") : t("Task movida para sem data."));
  } finally {
    delete pendingDates[id];
  }
}
function openSchedule(task) {
  schedule.value = task;
  scheduleDate.value = task.due_date || "";
}
function closeSchedule() {
  if (!state.saving) schedule.value = null;
}
async function saveSchedule(clear = false) {
  if (state.saving) return;
  const result = await mutate("/tasks/" + schedule.value.id + "/schedule", "PATCH", { due_date: clear ? null : scheduleDate.value || null }, clear ? t("Data de entrega removida.") : t("Data de entrega salva."));
  if (result) {
    if (!clear && scheduleDate.value) {
      const day = parseDay(scheduleDate.value);
      day.setDate(1);
      month.value = day;
    }
    schedule.value = null;
  }
}
</script>
<template>
 <section ref="calendar" class="task-calendar" :class="{'is-dragging-task':dragging!==null}" :aria-label="t('Calendário de entregas')">
  <div class="calendar-summary"><div class="calendar-summary-title"><span class="calendar-summary-icon"><CalendarDays :size="24" /></span><div><span class="eyebrow">{{ t("IDEIAS COM DIA PARA ACONTECER") }}</span><h3>{{ t("Um espaço para suas próximas entregas.") }}</h3><p>{{ t("Arraste as tasks até um dia e encontre o seu ritmo.") }}</p></div></div><div class="calendar-stats"><span><strong>{{ monthly.length }}</strong> {{ t("entregas no mês") }}</span><span><CheckCircle2 :size="13" /><strong>{{ completed }}</strong> {{ t("concluídas") }}</span><span v-if="late" class="calendar-late"><Clock3 :size="13" /><strong>{{ late }}</strong> {{ t("atrasadas") }}</span></div></div>
  <div class="calendar-toolbar"><div class="calendar-month-nav"><button class="icon-btn" :aria-label="t('Mês anterior')" @click="changeMonth(-1)"><ChevronLeft :size="19" /></button><h3 aria-live="polite">{{ monthTitle }}</h3><button class="icon-btn" :aria-label="t('Próximo mês')" @click="changeMonth(1)"><ChevronRight :size="19" /></button><button class="calendar-today-btn" @click="goToday">{{ t("Hoje") }}</button></div><div class="calendar-filter"><FolderOpen :size="15" /><select v-model="projectFilter" :aria-label="t('Filtrar calendário por projeto')"><option value="all">{{ t("Todos os projetos") }}</option><option value="none">{{ t("Sem projeto") }}</option><option v-for="p in state.projects" :key="p.id" :value="String(p.id)">{{ p.title }}</option></select></div><div class="calendar-search"><Search :size="15" /><input v-model="search" :placeholder="t('Buscar task...')" :aria-label="t('Buscar no calendário')"><button v-if="search" class="icon-btn tiny" :aria-label="t('Limpar busca do calendário')" @click="search=''"><X :size="13" /></button></div></div>
  <div class="calendar-layout">
   <div class="calendar-board">
    <div class="calendar-scroll">
     <Transition name="calendar-month" mode="out-in">
      <div :key="dateKey(month)" class="calendar-month-grid">
       <div v-for="(name,i) in weekdays" :key="name" class="calendar-weekday" :class="{weekend:i>=5}">{{ t(name) }}</div>
       <div v-for="day in days" :key="day.key" class="calendar-day" :data-date="day.key" :data-calendar-drop="day.key" :class="{outside:day.outside,today:day.key===today,weekend:day.weekend,'drop-target':over===day.key}">
        <header><time :datetime="day.key" :aria-label="dayLabel(day.key)">{{ day.day }}</time><span v-if="day.key===today" class="calendar-today-label">{{ t("HOJE") }}</span><button class="calendar-add" :aria-label="t('Criar task em ')+dayLabel(day.key)" :title="t('Criar task neste dia')" @click="createTask(day.key)"><Plus :size="13" /></button></header>
        <TransitionGroup name="calendar-card" tag="div" class="calendar-day-tasks">
         <CalendarTaskCard v-for="task in dayTasks(day.key)" :key="task.id" :task="task" :dragging="dragging===task.id" @open="emit('open-task',$event)" @schedule="openSchedule" @drag-start="startDrag" />
        </TransitionGroup>
        <span v-if="over===day.key&&!dayTasks(day.key).length" class="calendar-drop-hint"><Plus :size="18" />{{ t("Solte aqui") }}</span>
       </div>
      </div>
     </Transition>
    </div>
    <footer class="calendar-board-footer"><GripVertical :size="13" /><span>{{ t("Arraste para mudar a entrega. Use o ícone de calendário do card para escolher uma data.") }}</span></footer>
   </div>
   <aside class="calendar-unscheduled" data-calendar-drop="undated" :class="{'drop-target':over==='undated'}" :aria-label="t('Tasks sem data de entrega')">
    <header><span class="calendar-unscheduled-icon"><CalendarOff :size="19" /></span><div><h4>{{ t("Sem data de entrega") }}</h4><p>{{ undated.length }} {{ undated.length===1?t('task esperando um dia'):t('tasks esperando um dia') }}</p></div></header>
    <p class="calendar-unscheduled-hint">{{ t("Traga suas ideias para o calendário.") }}<br>{{ t("Arraste um card até o dia da entrega.") }}</p>
    <TransitionGroup name="calendar-card" tag="div" class="calendar-unscheduled-list">
     <CalendarTaskCard v-for="task in undated" :key="task.id" :task="task" :dragging="dragging===task.id" unscheduled @open="emit('open-task',$event)" @schedule="openSchedule" @drag-start="startDrag" />
    </TransitionGroup>
    <div v-if="!undated.length" class="calendar-empty"><img src="/ui/calendar-garden.svg" :alt="t('Ilustração de um calendário entre plantas')"><strong>{{ search?t('Nenhuma task encontrada.'):t('Tudo encontrou seu dia.') }}</strong><p>{{ search?t('Tente outro nome ou projeto.'):t('Suas tasks com data aparecem no calendário.') }}</p></div>
    <div class="calendar-side-note"><Sparkles :size="17" /><strong>{{ t("Um dia, uma conquista.") }}</strong><p>{{ t("Planeje com espaço para respirar.") }}<br>{{ t("Cada pequeno passo conta.") }}</p></div>
    <p class="calendar-remove-hint">{{ t("Arraste um card de volta para esta lateral para remover a data.") }}</p>
   </aside>
  </div>
  <p v-if="!monthly.length" class="calendar-month-note">{{ search?t('Nenhuma entrega com esse nome neste mês.'):t('Este mês está aberto para novas entregas.') }} <button class="text-btn" @click="createTask(dateKey(month))">{{ t("Criar uma task") }} </button></p>
 </section>
 <Teleport to="body"><div v-if="preview" class="calendar-drag-preview" :class="{unscheduled:preview.unscheduled,'valid-target':over!==null}" :style="{width:dragPosition.width+'px',transform:`translate3d(${dragPosition.x}px,${dragPosition.y}px,0)`}" aria-hidden="true" inert><CalendarTaskCard :task="preview.task" :unscheduled="preview.unscheduled" /></div></Teleport>
 <Modal v-if="schedule" :title="t('Data de entrega')" @close="closeSchedule"><form v-validate novalidate class="form-stack" @submit.prevent="saveSchedule()"><p class="calendar-schedule-title">{{ schedule.title }}</p><label>{{ t("Dia da entrega") }}<input v-model="scheduleDate" type="date" data-validate-min="0001-01-01" data-validate-max="9999-12-31" :aria-label="t('Dia da entrega')" autofocus></label><p class="muted small">{{ deliveryLabel(scheduleDate) }}</p><footer class="modal-actions"><button type="button" class="btn secondary" :disabled="!!state.saving" @click="closeSchedule">{{ t("Cancelar") }}</button><button v-if="schedule.due_date" type="button" class="text-btn" :disabled="!!state.saving" @click="saveSchedule(true)">{{ t("Remover data") }}</button><button class="btn primary" :disabled="!!state.saving">{{ state.saving?t('Salvando...'):t('Salvar data') }}</button></footer></form></Modal>
</template>

<style src="./calendar.css">

</style>
