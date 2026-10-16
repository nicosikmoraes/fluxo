<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronLeft, ChevronRight, Circle, Flag, Layers3, ListTodo, LockKeyhole, Plus, Repeat2, Sparkles, Target, Trash2 } from "@lucide/vue";
import { state, request, refresh, notify } from "../../state/workspace";
import { dateKey, parseDay } from "../calendar/calendar";
import Modal from "../../shared/Modal.vue";
const emit = defineEmits(["open-task"]);
const today = ref(dateKey(/* @__PURE__ */ new Date()));
const selectedDay = ref(today.value), entries = ref([]), loading = ref(false), error = ref(""), busy = ref(false);
const projectFilter = ref("all"), dialog = ref(null), quickTitle = ref(""), sourceSearch = ref(""), sourceProject = ref("all");
const form = reactive({ title: "", project_id: "", priority: false, recurring: false });
let requestId = 0, midnightTimer;
const dayLabel = computed(() => new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(parseDay(selectedDay.value)));
const days = computed(() => {
  const start = parseDay(selectedDay.value);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    return { key: dateKey(date), number: date.getDate(), label: new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", "") };
  });
});
const visible = computed(() => entries.value.filter((e) => projectFilter.value === "all" || (projectFilter.value === "none" ? !e.project : e.project?.id === Number(projectFilter.value))).sort((a, b) => Number(a.completed) - Number(b.completed) || Number(b.priority) - Number(a.priority) || a.id - b.id));
const completed = computed(() => entries.value.filter((e) => e.completed).length);
const pending = computed(() => entries.value.filter((e) => !e.completed));
const focus = computed(() => entries.value.find((e) => e.focused && !e.completed));
const sourceActivities = computed(() => state.tasks.flatMap((task) => task.activities.filter((a) => a.status !== "done").map((activity) => ({ activity, task, project: state.projects.find((p) => p.id === task.project_id) }))).filter(({ activity, task, project }) => (sourceProject.value === "all" || (sourceProject.value === "none" ? task.project_id === null : task.project_id === Number(sourceProject.value))) && [activity.title, task.title, project?.title || ""].join(" ").toLocaleLowerCase("pt-BR").includes(sourceSearch.value.trim().toLocaleLowerCase("pt-BR"))));
const addedIds = computed(() => new Set(entries.value.map((e) => e.activity_id).filter(Boolean)));
async function loadList() {
  const current = ++requestId, day = selectedDay.value;
  loading.value = true;
  error.value = "";
  try {
    const result = await request("/daily-list?date=" + day);
    if (current === requestId) entries.value = result.entries;
  } catch (e) {
    if (current === requestId) error.value = e.message;
  } finally {
    if (current === requestId) loading.value = false;
  }
}
watch(selectedDay, () => {
  entries.value = [];
  projectFilter.value = "all";
  loadList();
}, { immediate: true });
watch(() => state.tasks, () => loadList());
watch(() => state.projects, () => {
  if (!["all", "none"].includes(projectFilter.value) && !state.projects.some((p) => p.id === Number(projectFilter.value))) projectFilter.value = "all";
});
onMounted(() => {
  midnightTimer = setInterval(() => {
    const next = dateKey(/* @__PURE__ */ new Date());
    if (next !== today.value) {
      const follow = selectedDay.value === today.value;
      today.value = next;
      if (follow) selectedDay.value = next;
    }
  }, 6e4);
});
onUnmounted(() => {
  clearInterval(midnightTimer);
  requestId++;
});
function chooseDay(day) {
  if (!busy.value && day >= "1900-01-01" && day <= "2100-12-31") selectedDay.value = day;
}
function moveWeek(delta) {
  const date = parseDay(selectedDay.value);
  date.setDate(date.getDate() + delta * 7);
  chooseDay(dateKey(date));
}
async function save(url, method, data, message, linked = false) {
  if (busy.value || state.saving || loading.value) return null;
  busy.value = true;
  state.saving++;
  try {
    const result = await request(url, method, data);
    if (linked) await refresh();
    await loadList();
    if (message) notify(message);
    return result;
  } catch (e) {
    notify(e.message, "error");
    return null;
  } finally {
    busy.value = false;
    state.saving--;
  }
}
function openNew() {
  Object.assign(form, { title: "", project_id: projectFilter.value === "all" || projectFilter.value === "none" ? "" : projectFilter.value, priority: false, recurring: false });
  dialog.value = "new";
}
function openSource() {
  sourceSearch.value = "";
  sourceProject.value = "all";
  dialog.value = "source";
}
function closeDialog() {
  if (!busy.value) dialog.value = null;
}
async function addQuick() {
  const title = quickTitle.value.trim();
  if (!title) return;
  const result = await save("/daily-list", "POST", { date: selectedDay.value, title, project_id: ["all", "none"].includes(projectFilter.value) ? null : Number(projectFilter.value) }, "Atividade adicionada ao seu dia.");
  if (result) quickTitle.value = "";
}
async function addNew() {
  const title = form.title.trim();
  if (!title) return;
  const result = await save("/daily-list", "POST", { date: selectedDay.value, ...form, title, project_id: form.project_id ? Number(form.project_id) : null }, "Atividade adicionada ao seu dia.");
  if (result) {
    dialog.value = null;
    projectFilter.value = "all";
  }
}
async function addSource(activity) {
  await save("/daily-list", "POST", { date: selectedDay.value, activity_id: activity.id }, "Atividade trazida do projeto.");
}
async function update(entry, data, message) {
  return save("/daily-list/" + entry.id, "PATCH", data, message, Boolean(entry.activity_id && Object.hasOwn(data, "completed")));
}
async function carry() {
  const result = await save("/daily-list/carry", "POST", { date: selectedDay.value }, null);
  if (result) {
    if (result.moved) {
      chooseDay(result.date);
      notify(result.moved + " " + (result.moved === 1 ? "atividade levada" : "atividades levadas") + " para o próximo dia.");
    } else notify("Tudo em dia. Nenhuma pendência para levar.");
  }
}
async function remove(entry) {
  await save("/daily-list/" + entry.id, "DELETE", null, "Atividade removida deste dia.");
}
async function stopRoutine(entry) {
  await save("/daily-routines/" + entry.routine_id + "/stop", "PATCH", { date: selectedDay.value }, "A repetição termina neste dia.");
}
function openActivity(entry) {
  if (entry.task_id) emit("open-task", entry.task_id, entry.activity_id);
}
async function chooseFocus() {
  const candidate = pending.value.find((e) => !e.blocked);
  if (candidate) await update(candidate, { focused: true }, "Um passo de cada vez. Seu foco foi escolhido.");
}
</script>

<template>
 <section class="daily-list" aria-label="Lista diária">
  <header class="page-heading"><div><div class="heading-title"><h2>Meu dia</h2><span class="count-badge">{{ entries.length }}</span></div><p>Escolha o que importa e cuide dos próximos passos.</p></div><button class="btn primary" :disabled="busy||loading||!!state.saving" @click="openNew"><Plus :size="18"/>Nova atividade</button></header>
  <div class="daily-day-controls"><div class="daily-week"><button class="icon-btn" aria-label="Semana anterior" :disabled="busy||days[0].key<='1900-01-01'" @click="moveWeek(-1)"><ChevronLeft :size="17"/></button><button v-for="day in days" :key="day.key" class="daily-date" :class="{today:day.key===today}" :aria-pressed="day.key===selectedDay" :aria-label="new Intl.DateTimeFormat('pt-BR',{dateStyle:'full'}).format(parseDay(day.key))" :disabled="busy||day.key<'1900-01-01'||day.key>'2100-12-31'" @click="chooseDay(day.key)"><span>{{ day.label }}</span><strong>{{ day.number }}</strong></button><button class="icon-btn" aria-label="Próxima semana" :disabled="busy||days[6].key>='2100-12-31'" @click="moveWeek(1)"><ChevronRight :size="17"/></button></div><div class="inline-actions"><button class="text-btn" :disabled="busy||selectedDay===today" @click="chooseDay(today)">Hoje</button><label class="daily-date-picker"><span class="sr-only">Escolher dia</span><input type="date" :value="selectedDay" min="1900-01-01" max="2100-12-31" :disabled="busy" aria-label="Escolher dia" @change="chooseDay($event.target.value)"></label></div></div>
  <div class="daily-list-toolbar"><h3 class="daily-day-title">{{ dayLabel }}</h3><select v-model="projectFilter" class="filter-select" aria-label="Filtrar atividades por projeto"><option value="all">Todos os projetos</option><option v-for="project in state.projects" :key="project.id" :value="String(project.id)">{{ project.title }}</option><option value="none">Sem projeto</option></select><button class="btn secondary small-btn" :disabled="busy||loading||!!state.saving" @click="openSource"><Layers3 :size="15"/>Trazer de um projeto</button></div>
  <div v-if="error" class="error-state" role="alert"><p>{{ error }}</p><button class="btn secondary" @click="loadList">Tentar novamente</button></div>
  <div v-else-if="loading" class="daily-loading" role="status">Abrindo seu dia…</div>
  <div v-else class="daily-layout">
   <div>
    <div v-if="!visible.length" class="daily-empty"><span class="empty-symbol"><ListTodo :size="25"/></span><h3>{{ entries.length?'Nenhuma atividade neste projeto.':'Um dia com espaço para começar.' }}</h3><p>{{ entries.length?'Escolha outro projeto ou acrescente um novo passo.':'Adicione uma atividade ou traga um passo dos seus projetos.' }}</p></div>
    <div class="daily-entries">
     <article v-for="entry in visible" :key="entry.id" class="daily-entry" :class="{completed:entry.completed,focused:entry.focused,blocked:entry.blocked}">
      <button class="activity-check" :class="{checked:entry.completed}" role="checkbox" :aria-checked="entry.completed" :aria-label="(entry.completed?'Reabrir ':'Concluir ')+entry.title" :disabled="busy||!!state.saving||(entry.blocked&&!entry.completed)" @click="update(entry,{completed:!entry.completed},entry.completed?'Atividade reaberta.':'Mais um passo concluído!')"><Check v-if="entry.completed" :size="13"/></button>
      <div class="daily-entry-body"><button v-if="entry.task_id" class="daily-entry-title is-link" @click="openActivity(entry)">{{ entry.title }}<ArrowUpRight :size="12"/></button><h4 v-else class="daily-entry-title">{{ entry.title }}</h4><div class="daily-entry-meta"><span class="project-label" :class="entry.project?.cover||'neutral'"><span></span>{{ entry.project?.title||'Sem projeto' }}</span><span v-if="entry.priority" class="daily-priority"><Flag :size="11"/>Prioridade</span><span v-if="entry.recurring"><Repeat2 :size="11"/>Diária</span><span v-if="entry.focused" class="daily-focus-label"><Target :size="11"/>Em foco</span><span v-if="entry.task_title" class="daily-task-origin">{{ entry.task_title }}</span></div><div v-if="entry.blocked" class="daily-block"><LockKeyhole :size="12"/>Aguardando {{ entry.blocking_person }}<button class="text-btn" @click="openActivity(entry)">Ver atividade</button></div><div class="daily-entry-actions"><button v-if="!entry.completed" class="text-btn" :disabled="busy||!!state.saving" @click="update(entry,{focused:!entry.focused})"><Target :size="12"/>{{ entry.focused?'Tirar do foco':'Colocar em foco' }}</button><button class="text-btn subtle" :disabled="busy||!!state.saving" :aria-label="(entry.priority?'Retirar prioridade de ':'Priorizar ')+entry.title" @click="update(entry,{priority:!entry.priority})"><Flag :size="11"/>{{ entry.priority?'Retirar prioridade':'Priorizar' }}</button><button v-if="entry.recurring" class="text-btn subtle" :disabled="busy||!!state.saving" @click="stopRoutine(entry)">Parar repetição</button></div></div>
      <button class="icon-btn tiny daily-remove" :aria-label="'Remover '+entry.title+' deste dia'" :disabled="busy||!!state.saving" @click="remove(entry)"><Trash2 :size="13"/></button>
     </article>
    </div>
    <form class="add-activity daily-quick" @submit.prevent="addQuick"><Plus :size="17"/><input v-model="quickTitle" aria-label="Adicionar atividade rápida" placeholder="Adicionar uma atividade ao dia…" maxlength="200" required :disabled="busy||!!state.saving"><button class="btn primary small-btn" :disabled="busy||!!state.saving||!quickTitle.trim()">Adicionar</button></form>
   </div>
   <aside class="daily-aside"><div class="daily-focus-card"><span class="eyebrow">UM PASSO POR VEZ</span><Sparkles :size="23"/><h3>Sua atenção, aqui.</h3><p>{{ focus?.title||'Escolha uma atividade e dê a ela sua atenção.' }}</p><button v-if="!focus" class="text-btn" :disabled="busy||!!state.saving||!pending.some(e=>!e.blocked)" @click="chooseFocus">Escolher meu foco<ArrowRight :size="13"/></button><button v-else-if="focus.task_id" class="text-btn" @click="openActivity(focus)">Abrir atividade<ArrowRight :size="13"/></button></div><div class="daily-progress"><div class="section-heading"><h3>Seu progresso</h3><span class="muted small">{{ completed }}/{{ entries.length }}</span></div><div class="progress-track" role="progressbar" aria-label="Atividades concluídas" :aria-valuenow="completed" :aria-valuemin="0" :aria-valuemax="entries.length||1"><span :class="{complete:entries.length>0&&completed===entries.length}" :style="{width:(entries.length?completed/entries.length*100:0)+'%'}"></span></div><p>{{ entries.length&&completed===entries.length?'Dia concluído. Celebre sua conquista!':completed===0?'Todo começo conta.':completed+' '+(completed===1?'passo dado.':'passos dados. Continue assim.') }}</p></div><div class="daily-carry"><h3>Preparar o próximo dia</h3><p>O que não couber neste dia pode continuar no próximo.</p><button class="text-btn" :disabled="busy||!!state.saving||!pending.length||selectedDay==='2100-12-31'" @click="carry">Levar {{ pending.length||'' }} {{ pending.length===1?'pendência':'pendências' }}<ArrowRight :size="13"/></button></div></aside>
  </div>
  <footer class="board-footer daily-footer"><span><Repeat2 :size="13"/>Um novo dia, uma nova lista. As atividades seguem ligadas aos projetos.</span><span v-if="entries.length"><CheckCircle2 :size="14"/>Seu ritmo. Seu fluxo.</span></footer>
  <Modal v-if="dialog==='new'" title="Um novo passo" @close="closeDialog"><p class="daily-modal-intro">Uma atividade para {{ dayLabel }}.</p><form class="form-stack" @submit.prevent="addNew"><label>O que precisa ser feito?<input v-model="form.title" maxlength="200" required autofocus :disabled="busy" placeholder="Nome da atividade"></label><label>Projeto<select v-model="form.project_id" :disabled="busy"><option value="">Sem projeto</option><option v-for="project in state.projects" :key="project.id" :value="String(project.id)">{{ project.title }}</option></select></label><label class="daily-form-check"><input v-model="form.priority" type="checkbox" :disabled="busy">Prioridade do dia</label><label class="daily-form-check"><input v-model="form.recurring" type="checkbox" :disabled="busy">Repetir todos os dias</label><p class="daily-form-help">Atividades avulsas ficam na lista diária. Para acompanhar um passo já existente, use “Trazer de um projeto”.</p><footer class="modal-actions"><button type="button" class="btn secondary" :disabled="busy" @click="closeDialog">Cancelar</button><button class="btn primary" :disabled="busy||!!state.saving||!form.title.trim()">{{ busy?'Adicionando…':'Adicionar ao dia' }}</button></footer></form></Modal>
  <Modal v-if="dialog==='source'" title="Dos projetos para o seu dia" @close="closeDialog"><p class="daily-modal-intro">Escolha as atividades que merecem sua atenção neste dia.</p><div class="daily-source-filters"><label class="sr-only" for="daily-source-search">Buscar atividades dos projetos</label><input id="daily-source-search" v-model="sourceSearch" placeholder="Buscar atividade ou task…" type="search"><select v-model="sourceProject" aria-label="Projeto de origem"><option value="all">Todos os projetos</option><option v-for="project in state.projects" :key="project.id" :value="String(project.id)">{{ project.title }}</option><option value="none">Sem projeto</option></select></div><div class="daily-source-list"><button v-for="item in sourceActivities" :key="item.activity.id" class="daily-source-item" :disabled="busy||!!state.saving||addedIds.has(item.activity.id)" @click="addSource(item.activity)"><span class="project-dot" :class="item.project?.cover||'neutral'"></span><span><strong>{{ item.activity.title }}</strong><small>{{ item.project?.title||'Sem projeto' }} · {{ item.task.title }}</small><small v-if="item.activity.blocked" class="amber">Aguardando {{ item.activity.blocking_person }}</small></span><Check v-if="addedIds.has(item.activity.id)" :size="17"/><Plus v-else :size="17"/></button><p v-if="!sourceActivities.length" class="daily-source-empty">Nenhuma atividade pendente encontrada. Crie atividades nas tasks dos seus projetos ou adicione um passo avulso ao dia.</p></div><footer class="modal-actions"><button class="btn primary" :disabled="busy" @click="closeDialog">Concluir seleção</button></footer></Modal>
 </section>
</template>

<style>
.daily-list .page-heading {
  margin-bottom: 20px;
}
.daily-day-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  flex-wrap: wrap;
  padding-bottom: 19px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 20px;
}
.daily-week {
  display: flex;
  gap: 5px;
  align-items: center;
}
.daily-date {
  display: grid;
  place-items: center;
  gap: 5px;
  min-width: 42px;
  padding: 9px 10px;
  border-radius: 8px;
  border: 1px solid transparent;
  font-size: 10px;
  color: #8c9ab2;
}
.daily-date strong {
  font-size: 14px;
  font-weight: 550;
  color: #667997;
}
.daily-date[aria-pressed=true] {
  background: #edf2ff;
  border-color: #dce5fc;
  color: #6c86d8;
}
.daily-date[aria-pressed=true] strong {
  color: #5978ed;
}
.daily-date.today:not([aria-pressed=true]) {
  border-color: #e5eaf4;
}
.daily-date-picker input {
  border: 1px solid #e5eaf2;
  border-radius: 7px;
  background: #fff;
  padding: 7px;
  font-size: 11px;
  max-width: 136px;
  color: #8291ac;
}
.daily-day-controls > .inline-actions {
  gap: 12px;
}
.daily-list-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.daily-day-title {
  font-size: 13px;
  font-weight: 550;
  color: #6d7e9c;
  text-transform: capitalize;
  margin-right: auto;
}
.daily-list-toolbar .filter-select {
  margin: 0;
  max-width: 160px;
}
.daily-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 205px;
  gap: 24px;
  align-items: start;
}
.daily-entries {
  display: grid;
  gap: 11px;
}
.daily-entry {
  display: flex;
  gap: 11px;
  padding: 16px 13px;
  background: #fff;
  border: 1px solid #e7ecf4;
  border-radius: 10px;
  box-shadow: 0 2px 7px #52699303;
  min-width: 0;
}
.daily-entry.focused {
  border-color: #cfdaf5;
  background: #fdfdff;
}
.daily-entry.completed {
  background: #fafcfb;
  border-color: #e7f0eb;
}
.daily-entry.blocked {
  border-color: #eadfc7;
}
.daily-entry-body {
  min-width: 0;
  flex: 1;
}
.daily-entry-title {
  display: flex;
  align-items: center;
  gap: 7px;
  text-align: left;
  padding: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.6;
  overflow-wrap: anywhere;
  color: #44516a;
}
.daily-entry-title svg {
  flex-shrink: 0;
  color: #a3b2cc;
}
.daily-entry-title.is-link:hover {
  color: #5978ed;
}
.daily-entry.completed .daily-entry-title {
  color: #8b9f98;
  text-decoration: line-through;
  text-decoration-color: #cadbd3;
}
.daily-entry-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
  font-size: 10px;
  color: #9aa7bd;
}
.daily-entry-meta > span:not(.project-label) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.daily-entry-meta .project-label {
  max-width: 100%;
}
.daily-priority {
  color: #b08949;
}
.daily-focus-label {
  color: #7d97d5;
}
.daily-task-origin {
  font-size: 10px;
  overflow-wrap: anywhere;
}
.daily-entry-actions {
  display: flex;
  align-items: center;
  gap: 15px;
  flex-wrap: wrap;
  margin-top: 10px;
}
.daily-entry-actions .text-btn {
  font-size: 10px;
}
.daily-entry-actions .text-btn.subtle {
  color: #91a0b8;
}
.daily-entry .activity-check {
  margin-top: 2px;
}
.daily-remove {
  margin-top: -4px;
}
.daily-block {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  font-size: 10px;
  line-height: 1.7;
  color: #b29963;
  margin-top: 9px;
}
.daily-block .text-btn {
  font-size: 10px;
}
.daily-quick {
  margin-top: 13px;
  background: #ffffff80;
}
.daily-quick input {
  font-size: 12px;
}
.daily-aside {
  min-width: 0;
}
.daily-focus-card {
  background: #f6f8ff;
  border: 1px solid #e8edf9;
  border-radius: 12px;
  padding: 19px 16px;
}
.daily-focus-card > svg {
  color: #98a9e1;
  margin: 16px 0 12px;
}
.daily-focus-card h3 {
  font-size: 12px;
  font-weight: 600;
  color: #7186c1;
}
.daily-focus-card p {
  font-size: 11px;
  color: #8b9bb9;
  line-height: 1.8;
  margin-top: 10px;
  overflow-wrap: anywhere;
}
.daily-focus-card .text-btn {
  font-size: 11px;
  margin-top: 14px;
}
.daily-progress {
  padding: 23px 0;
}
.daily-progress .section-heading {
  margin-bottom: 12px;
}
.daily-progress h3 {
  font-size: 12px;
  font-weight: 550;
}
.daily-progress p {
  font-size: 10px;
  line-height: 1.7;
  color: #95a2b8;
  margin-top: 9px;
}
.daily-carry {
  border-top: 1px solid #e9edf4;
  padding-top: 19px;
}
.daily-carry h3 {
  font-size: 12px;
  font-weight: 550;
  color: #7889a7;
}
.daily-carry p {
  font-size: 11px;
  color: #9ba7bc;
  line-height: 1.8;
  margin: 9px 0 13px;
}
.daily-carry .text-btn {
  font-size: 11px;
}
.daily-empty {
  display: flex;
  align-items: center;
  flex-direction: column;
  text-align: center;
  padding: 30px 18px;
  background: #fff;
  border: 1px solid #e7ecf4;
  border-radius: 12px;
}
.daily-empty h3 {
  font-size: 13px;
  font-weight: 500;
  color: #8195b6;
}
.daily-empty p {
  font-size: 11px;
  line-height: 1.8;
  color: #a2aec3;
  margin-top: 8px;
}
.daily-loading {
  padding: 35px;
  color: #98abd7;
  font-size: 12px;
}
.daily-footer {
  align-items: flex-start;
  line-height: 1.8;
  flex-wrap: wrap;
  margin-top: 22px;
}
.daily-modal-intro {
  font-size: 11px;
  color: #98a6bd;
  line-height: 1.8;
  margin: -7px 0 22px;
}
.form-stack .daily-form-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 400;
}
.form-stack .daily-form-check input {
  appearance: auto;
  width: 15px;
  height: 15px;
  margin: 0;
  box-shadow: none;
  accent-color: #5978ed;
}
.daily-form-help {
  font-size: 10px;
  line-height: 1.8;
  color: #99a8bf;
}
.daily-source-filters {
  display: flex;
  gap: 9px;
  margin-bottom: 17px;
}
.daily-source-filters input,
.daily-source-filters select {
  border: 1px solid #e1e7f0;
  border-radius: 8px;
  padding: 10px;
  font-size: 11px;
  background: #fcfdff;
  min-width: 0;
}
.daily-source-filters input {
  flex: 1;
  width: 100%;
}
.daily-source-filters select {
  max-width: 150px;
}
.daily-source-list {
  display: grid;
  gap: 9px;
  max-height: 45vh;
  overflow: auto;
}
.daily-source-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
  background: #fcfdff;
  border: 1px solid #e7ecf4;
  border-radius: 9px;
  padding: 13px;
}
.daily-source-item > span:nth-child(2) {
  flex: 1;
  min-width: 0;
}
.daily-source-item strong {
  display: block;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.daily-source-item small {
  display: block;
  font-size: 10px;
  color: #9aa7bd;
  line-height: 1.7;
  margin-top: 4px;
  overflow-wrap: anywhere;
}
.daily-source-item > svg {
  color: #8da6e7;
  flex-shrink: 0;
}
.daily-source-empty {
  font-size: 12px;
  line-height: 1.8;
  color: #9aa7bd;
  padding: 18px 5px;
}
@media (max-width: 1150px) {
  .daily-layout {
    grid-template-columns: minmax(0, 1fr) 175px;
    gap: 19px;
  }
  .daily-week {
    gap: 3px;
  }
  .daily-date {
    min-width: 35px;
    padding: 8px;
  }
  .daily-day-controls > .inline-actions {
    margin-left: auto;
  }
  .daily-entry-actions {
    gap: 12px;
  }
}
@media (max-width: 900px) {
  .daily-layout {
    grid-template-columns: 1fr;
  }
  .daily-aside {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 22px;
  }
  .daily-focus-card {
    display: none;
  }
  .daily-carry {
    border-top: 0;
    padding-top: 22px;
  }
  .daily-progress {
    padding-top: 22px;
  }
  .daily-day-controls > .inline-actions {
    margin-left: 0;
  }
  .daily-list-toolbar .filter-select {
    max-width: 145px;
  }
  .daily-footer {
    font-size: 10px;
  }
  .daily-footer > span:last-child {
    font-size: 10px;
  }
}
@media (max-width: 680px) {
  .daily-list .page-heading .btn {
    font-size: 11px;
  }
  .daily-day-controls {
    gap: 15px;
  }
  .daily-week {
    width: 100%;
    justify-content: space-between;
    gap: 1px;
  }
  .daily-week .icon-btn {
    width: 23px;
  }
  .daily-date {
    min-width: 28px;
    padding: 8px 6px;
  }
  .daily-date strong {
    font-size: 13px;
  }
  .daily-date span {
    font-size: 9px;
  }
  .daily-day-controls > .inline-actions {
    width: 100%;
    justify-content: space-between;
  }
  .daily-date-picker input {
    font-size: 12px;
  }
  .daily-day-title {
    font-size: 12px;
    width: 100%;
  }
  .daily-list-toolbar {
    gap: 9px;
  }
  .daily-list-toolbar .filter-select {
    max-width: none;
    flex: 1;
    min-width: 0;
    font-size: 10px;
  }
  .daily-list-toolbar .btn {
    font-size: 10px;
    padding: 9px;
  }
  .daily-entry {
    padding: 14px 10px;
    gap: 8px;
  }
  .daily-entry-title {
    font-size: 12px;
  }
  .daily-entry-meta {
    gap: 6px;
  }
  .daily-entry-actions {
    gap: 11px;
  }
  .daily-entry-actions .text-btn {
    font-size: 10px;
  }
  .daily-task-origin {
    width: 100%;
  }
  .daily-remove {
    width: 22px !important;
  }
  .daily-quick input {
    font-size: 11px;
  }
  .daily-quick .btn {
    font-size: 10px;
  }
  .daily-aside {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .daily-progress {
    padding: 19px 0;
  }
  .daily-carry {
    border-top: 1px solid #e9edf4;
    padding-top: 17px;
  }
  .daily-carry .text-btn {
    padding: 4px 0;
  }
  .daily-footer {
    font-size: 10px;
    gap: 10px;
  }
  .daily-footer > span:last-child {
    font-size: 10px;
  }
  .daily-source-filters {
    flex-direction: column;
  }
  .daily-source-filters select {
    max-width: none;
  }
  .daily-source-list {
    max-height: 50vh;
  }
}
</style>
