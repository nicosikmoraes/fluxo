<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from "vue";
import { Layers3, LayoutDashboard, FolderOpen, Plus, Search, ChevronRight, ArrowUpRight, Check, CheckCircle2, Circle, Clock3, LockKeyhole, MessageSquare, ListTodo, GripVertical, Pencil, Trash2, MoreHorizontal, Sparkles, X, PanelLeftClose, PanelLeftOpen, RefreshCw, Image, ArrowRight, Monitor, LoaderCircle, CalendarDays, LogOut } from "@lucide/vue";
import { state, load, mutate, label, notify } from "./state/workspace";
import { auth, signOut } from "./features/auth/auth";
import { vSortable } from "./shared/sortable";
import TaskForm from "./features/tasks/TaskForm.vue";
import ProjectForm from "./features/projects/ProjectForm.vue";
import TaskPanel from "./features/tasks/TaskPanel.vue";
import ConfirmDialog from "./shared/ConfirmDialog.vue";
import ProjectRoadmap from "./features/roadmap/ProjectMap.vue";
import TaskCalendar from "./features/calendar/TaskCalendar.vue";
import DailyList from "./features/daily/DailyList.vue";
import ThemeToggle from "./features/appearance/ThemeToggle.vue";
import { useWhiteboard } from "./features/whiteboard/useWhiteboard";
const FluxoWhiteboard = defineAsyncComponent(() => import("./features/whiteboard/FluxoWhiteboard.vue"));
const whiteboard = useWhiteboard();
const whiteboardBusy = computed(() => whiteboard.state.saving || whiteboard.state.dirty);
import { BarChart3, Settings2 } from "@lucide/vue";
import ProfileSettings from "./features/work-hours/ProfileSettings.vue";
import { isDesktop, desktopCall } from "./features/desktop/desktopBridge";
import WorkHoursWidget from "./features/work-hours/WorkHoursWidget.vue";
import { useWorkHours } from "./features/work-hours/useWorkHours";
import WorkHistory from "./features/work-hours/history/WorkHistory.vue";
const workHours = useWorkHours();
const { day: workDay, expanded: workWidgetExpanded } = workHours;
function showWorkWidget() {
  if (isDesktop) {
    desktopCall("desktop_show").catch(() => {});
    return;
  }
  workWidgetExpanded.value = true;
}

const initialView = new URLSearchParams(window.location.search).get("view");
const view = ref(["profile", "work-history", "whiteboard"].includes(initialView) ? initialView : "board");
const profileDate = ref("");
const historySaving = ref(false);
watch(view, (value) => {
  const url = new URL(window.location.href);
  if (["profile", "work-history", "whiteboard"].includes(value)) url.searchParams.set("view", value);
  else url.searchParams.delete("view");
  window.history.replaceState({}, "", url);
});
const selectedProject = ref("all");
const search = ref("");
const blockedOnly = ref(false);
const statusFilter = ref("all");
const sidebarOpen = ref(false);
const projectView = ref("board");
const openActivity = ref(null);
const activityOnly = ref(false);
const taskForm = ref(null);
const projectForm = ref(null);
const openTask = ref(null);
const deleting = ref(null);
const columns = [{ id: "pending", title: "Pendente", icon: Circle, description: "Ideias prontas para começar" }, { id: "doing", title: "Em andamento", icon: Clock3, description: "Um passo mais perto" }, { id: "done", title: "Concluída", icon: CheckCircle2, description: "Pequenas grandes conquistas" }];
const currentProject = computed(() => state.projects.find((p) => p.id === Number(selectedProject.value)));
const scopedTasks = computed(() => state.tasks.filter((t) => selectedProject.value === "all" || (selectedProject.value === "none" ? t.project_id === null : t.project_id === Number(selectedProject.value))));
const visibleTasks = computed(() => scopedTasks.value.filter((t) => {
  const q = search.value.trim().toLocaleLowerCase("pt-BR");
  const text = [t.title, t.description, ...t.activities.map((a) => a.title + " " + (a.blocking_person || ""))].join(" ").toLocaleLowerCase("pt-BR");
  return (!q || text.includes(q)) && (!blockedOnly.value || t.blocked_count > 0) && (statusFilter.value === "all" || t.status === statusFilter.value);
}));
const blockedCount = computed(() => scopedTasks.value.filter((t) => t.blocked_count).length);
const completedCount = computed(() => scopedTasks.value.filter((t) => t.status === "done").length);
const filteredProjects = computed(() => state.projects.filter((p) => p.title.toLocaleLowerCase("pt-BR").includes(search.value.trim().toLocaleLowerCase("pt-BR"))));
const hasFilter = computed(() => !!search.value || blockedOnly.value || statusFilter.value !== "all");
const today = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(/* @__PURE__ */ new Date());
function chooseProject(id) {
  projectView.value = "board";
  selectedProject.value = id;
  view.value = "board";
  search.value = "";
  blockedOnly.value = false;
  statusFilter.value = "all";
  sidebarOpen.value = false;
}
function changeView(v) {
  projectView.value = "board";
  view.value = v;
  if (v === "calendar" || v === "daily" || v === "whiteboard") selectedProject.value = "all";
  search.value = "";
  sidebarOpen.value = false;
}
function showTask(id, activityId = null, onlyActivity = false) {
  openTask.value = id;
  openActivity.value = activityId;
  activityOnly.value = onlyActivity && activityId != null;
}
function newTask(dueDate = null, projectId = null) {
  taskForm.value = { task: null, dueDate, projectId };
}
function editTask(task) {
  taskForm.value = { task };
}
function askDeleteTask(task) {
  deleting.value = { type: "tasks", id: task.id, title: "Excluir task?", message: "“" + task.title + "” e todas as suas atividades e comentários serão excluídos." };
}
function askDeleteProject(project) {
  deleting.value = { type: "projects", id: project.id, title: "Excluir projeto?", message: "Escolha o que acontece com as tasks de “" + project.title + "”: manter sem projeto ou excluir tudo.", project: true };
}
async function deleteItem(deleteTasks) {
  const item = deleting.value;
  const r = await mutate("/" + item.type + "/" + item.id, "DELETE", item.project ? { delete_tasks: !!deleteTasks } : null, "Excluído.");
  if (r) {
    if (item.type === "tasks" && openTask.value === item.id) openTask.value = null;
    if (item.project && Number(selectedProject.value) === item.id) selectedProject.value = "all";
    deleting.value = null;
  }
}
function taskSaved(task) {
  const editing = !!taskForm.value.task;
  taskForm.value = null;
  if (!editing) showTask(task.id);
}
function projectSaved(project) {
  const editing = !!projectForm.value?.project;
  projectForm.value = null;
  if (!editing) chooseProject(project.id);
}
async function reorder(ids) {
  if (!state.saving) await mutate("/tasks/reorder", "POST", { ids });
}
function clearFilters() {
  search.value = "";
  blockedOnly.value = false;
  statusFilter.value = "all";
}
const projectTasks = (p) => state.tasks.filter((t) => t.project_id === p.id);
const projectProgress = (p) => {
  const list = projectTasks(p);
  return list.length ? Math.round(list.filter((t) => t.status === "done").length / list.length * 100) : 0;
};
const logoutBusy = ref(false);
async function logout() {
  if (logoutBusy.value || state.saving || workHours.state.saving || historySaving.value || whiteboardBusy.value) return;
  logoutBusy.value = true;
  try {
    await signOut();
  } catch (error) {
    notify(error.message, "error");
  } finally {
    logoutBusy.value = false;
  }
}
function openProfile(date) {
  profileDate.value = typeof date === "string" ? date : "";
  view.value = "profile";
  sidebarOpen.value = false;
  workWidgetExpanded.value = false;
}
onMounted(load);
</script>
<template>
 <div class="app-shell">
  <div v-if="sidebarOpen" class="sidebar-backdrop" @click="sidebarOpen=false"></div>
  <aside class="sidebar" :class="{open:sidebarOpen}">
   <a class="brand" href="#" @click.prevent="chooseProject('all')"><span class="brand-mark"><span></span><span></span><span></span></span><span>fluxo<span class="brand-period">.</span></span></a>
   <div class="workspace-name"><div class="workspace-icon"><Monitor :size="17" /></div><div><strong>Meu espaço</strong><span>Feito para o seu ritmo</span></div><span class="local-dot" title="Espaço local"></span></div>
   <p class="nav-label">SEU TRABALHO</p>
   <nav><button class="nav-item" :class="{active:view==='board'&&selectedProject==='all'}" @click="chooseProject('all')"><LayoutDashboard :size="19" /> Meu quadro <span class="nav-count">{{ state.tasks.length }}</span></button><button class="nav-item" :class="{active:view==='projects'}" @click="changeView('projects')"><FolderOpen :size="19" /> Projetos <span class="nav-count">{{ state.projects.length }}</span></button><button class="nav-item" :class="{active:view==='calendar'}" @click="changeView('calendar')"><CalendarDays :size="19" /> Calendário</button><button class="nav-item" :class="{active:view==='daily'}" @click="changeView('daily')"><ListTodo :size="19" /> Meu dia</button><button class="nav-item" :class="{active:view==='work-history'}" @click="changeView('work-history')"><BarChart3 :size="19" /> Histórico de horas</button><button class="nav-item" :class="{active:view==='whiteboard'}" @click="changeView('whiteboard')"><Pencil :size="19" /> Quadro de ideias</button></nav>
   <div class="nav-section-title"><p class="nav-label">MEUS PROJETOS</p><button class="icon-btn tiny" aria-label="Criar projeto" @click="projectForm={project:null}"><Plus :size="16" /></button></div>
   <div class="sidebar-projects"><button v-for="p in state.projects" :key="p.id" class="nav-item project-link" :class="{active:view==='board'&&Number(selectedProject)===p.id}" @click="chooseProject(p.id)"><span class="project-dot" :class="p.cover"></span><span class="truncate">{{ p.title }}</span><span class="nav-count">{{ projectTasks(p).length }}</span></button><p v-if="!state.projects.length" class="sidebar-empty">Suas ideias merecem<br>um lugar só delas.</p><button class="nav-item project-link" :class="{active:view==='board'&&selectedProject==='none'}" @click="chooseProject('none')"><span class="project-dot neutral"></span> Sem projeto</button></div>
   <div class="sidebar-bottom"><ThemeToggle /><button class="nav-item profile-nav-button" :class="{active:view==='profile'}" @click="openProfile"><Settings2 :size="17" /> Configurações do perfil</button><div class="local-footer"><span class="local-dot"></span> No seu computador <span class="local-version">v1.0</span></div></div>
  </aside>
  <div class="main-shell">
   <header class="topbar"><div class="breadcrumb"><button class="icon-btn mobile-menu" aria-label="Abrir menu" @click="sidebarOpen=!sidebarOpen"><PanelLeftOpen :size="21" /></button><span>Meu espaço</span><ChevronRight :size="14" /><strong>{{ view==='whiteboard'?'Quadro de ideias':view==='work-history'?'Histórico de horas':view==='profile'?'Configurações do perfil':view==='daily'?'Meu dia':view==='calendar'?'Calendário':view==='projects'?'Projetos':currentProject?.title|| (selectedProject==='none'?'Sem projeto':'Meu quadro') }}</strong></div><div class="save-indicator"><LoaderCircle v-if="state.saving || workHours.state.saving || historySaving || whiteboardBusy" :size="13" class="spin" /><Check v-else :size="13" /><span>{{ state.saving || workHours.state.saving || historySaving || whiteboardBusy?(whiteboard.state.error?'Quadro com alterações não salvas':'Salvando...'):'Tudo salvo localmente' }}</span></div><div class="account-controls"><button class="account-identity" :title="auth.user?.email" aria-label="Abrir configurações do perfil" @click="openProfile"><span class="account-avatar">{{ auth.user?.name?.slice(0,1).toUpperCase() }}</span><span class="truncate">{{ auth.user?.name }}</span></button><button class="account-exit" :disabled="logoutBusy || !!state.saving || workHours.state.saving || historySaving || whiteboardBusy" @click="logout"><LogOut :size="15" /> {{ logoutBusy?'Saindo...':'Sair' }}</button></div></header>
   <main class="main-content" :class="{'sketch-main':view==='whiteboard'}">
    <section v-if="!['profile','work-history','whiteboard'].includes(view)" class="hero" :class="{'project-hero':currentProject,'calendar-hero':view==='calendar'}" :style="currentProject?.cover_path?{backgroundImage:'url('+currentProject.cover_path+')'}:undefined"><img v-if="!currentProject?.cover_path" :src="view==='calendar'?'/ui/calendar-garden.svg':'/ui/hero.png'" :alt="view==='calendar'?'Ilustração de um calendário entre plantas e ideias':'Ilustração de uma mesa criativa com notebook, plantas e caderno'" class="hero-image" :class="currentProject?.cover"><div class="hero-shade"></div><div class="hero-content"><span class="eyebrow"><span class="hero-dot"></span>{{ view==='daily'?'UM DIA PARA CADA PEQUENA CONQUISTA':view==='calendar'?'SEU CALENDÁRIO DE ENTREGAS':currentProject?'ESPAÇO DO PROJETO':'SEU ESPAÇO PARA FAZER ACONTECER' }}</span><h1>{{ view==='daily'?'Hoje, um passo de cada vez.':view==='calendar'?'Dê um dia às suas ideias.':currentProject?.title || (view==='projects'?'Toda ideia merece um espaço.':'Um passo de cada vez.') }}</h1><p>{{ view==='daily'?'Atividades de todos os projetos, no seu ritmo.':view==='calendar'?'Planeje suas entregas, encontre espaço e veja suas ideias avançarem.':currentProject?'Organize seus passos e acompanhe cada conquista.':view==='projects'?'Reúna suas tasks, dê forma às ideias e comece algo novo.':'Organize suas ideias. Desbloqueie seus próximos passos.' }}</p><div class="hero-date">{{ today }}</div></div></section>
    <ProfileSettings v-if="view==='profile'" :work-hours="workHours" :initial-date="profileDate" @open-widget="showWorkWidget" @open-history="changeView('work-history')" />
    <WorkHistory v-else-if="view==='work-history'" :work-hours="workHours" @register="openProfile" @saving-change="historySaving=$event" />
    <FluxoWhiteboard v-else-if="view==='whiteboard'" :board="whiteboard" />
    <template v-else-if="state.loading"><div class="loading-state"><LoaderCircle :size="28" class="spin" /><p>Abrindo seu espaço...</p></div></template>
    <div v-else-if="state.error" class="error-state"><p>{{ state.error }}</p><button class="btn primary" @click="load"><RefreshCw :size="16" /> Tentar novamente</button></div>
    <template v-else>
     <div v-if="view!=='daily'" class="page-heading"><div><div class="heading-title"><h2>{{ view==='calendar'?'Seu calendário':view==='projects'?'Seus projetos':currentProject?(projectView==='roadmap'?'Roadmap do projeto':'Quadro do projeto'):'Seu quadro' }}</h2><span class="count-badge">{{ view==='projects'?state.projects.length:scopedTasks.length }}</span></div><p>{{ view==='calendar'?'Suas tasks, no dia em que devem ser entregues.':view==='projects'?'Um lugar para cada ideia.': 'O progresso acontece nas pequenas atividades.' }}</p></div><div class="inline-actions"><template v-if="currentProject&&view==='board'"><button class="icon-btn" aria-label="Editar projeto" @click="projectForm={project:currentProject}"><Pencil :size="17" /></button><button class="icon-btn danger-text" aria-label="Excluir projeto" @click="askDeleteProject(currentProject)"><Trash2 :size="17" /></button></template><button class="btn primary" @click="view==='projects'?projectForm={project:null}:newTask()"><Plus :size="18" />{{ view==='projects'?'Novo projeto':'Nova task' }}</button></div></div>
     <div v-if="currentProject&&view==='board'" class="project-tabs" role="tablist" aria-label="Visualização do projeto"><button role="tab" :aria-selected="projectView==='board'" :class="{active:projectView==='board'}" @click="projectView='board'"><LayoutDashboard :size="15" /> Quadro</button><button role="tab" :aria-selected="projectView==='roadmap'" :class="{active:projectView==='roadmap'}" @click="projectView='roadmap'"><ListTodo :size="15" /> Roadmap</button></div>
     <div v-if="view!=='daily'&&view!=='calendar'&&(projectView!=='roadmap'||!currentProject||view!=='board')" class="toolbar"><div class="search-field"><Search :size="17" /><input v-model="search" :placeholder="view==='projects'?'Buscar projetos...':'Buscar tasks, atividades ou pessoas...'" aria-label="Buscar"><button v-if="search" class="icon-btn tiny" aria-label="Limpar busca" @click="search=''"><X :size="14" /></button><span v-else class="search-key">⌕</span></div><template v-if="view==='board'"><div class="toolbar-filters"><button class="filter-pill" :class="{selected:!blockedOnly}" @click="blockedOnly=false">Todas <span>{{ scopedTasks.length }}</span></button><button class="filter-pill" :class="{selected:blockedOnly}" @click="blockedOnly=!blockedOnly"><LockKeyhole :size="13" /> Com bloqueio <span>{{ blockedCount }}</span></button></div><select v-model="statusFilter" class="filter-select" aria-label="Filtrar por status"><option value="all">Todos os status</option><option value="pending">Pendentes</option><option value="doing">Em andamento</option><option value="done">Concluídas</option></select></template></div>
     <DailyList v-if="view==='daily'" @open-task="showTask" />
     <TaskCalendar v-else-if="view==='calendar'" @open-task="showTask" @new-task="newTask" />
     <ProjectRoadmap v-else-if="view==='board'&&currentProject&&projectView==='roadmap'" :key="currentProject.id" :project-id="currentProject.id" @open-activity="(taskId,activityId)=>showTask(taskId,activityId,true)" @new-task="newTask" />
     <template v-else-if="view==='board'">
      <div v-if="!scopedTasks.length&&!hasFilter" class="welcome-strip"><div class="welcome-symbol"><Sparkles :size="22" /></div><div><strong>Sua próxima ideia começa aqui.</strong><p>Crie uma task, divida em atividades e acompanhe seu progresso.</p></div><button class="text-btn" @click="newTask()">Criar primeira task <ArrowRight :size="15" /></button></div>
      <div v-if="hasFilter&&!visibleTasks.length" class="no-results"><Search :size="24" /><strong>Nenhuma task por aqui.</strong><p>Tente outro termo ou ajuste os filtros.</p><button class="text-btn" @click="clearFilters">Limpar filtros</button></div>
      <div class="kanban"><section v-for="col in columns" :key="col.id" class="kanban-column" :class="col.id"><header class="column-heading"><span class="column-icon"><component :is="col.icon" :size="16" /></span><h3>{{ col.title }}</h3><span class="column-count">{{ visibleTasks.filter(t=>t.status===col.id).length }}</span><button v-if="col.id==='pending'" class="icon-btn tiny" aria-label="Adicionar task" @click="newTask()"><Plus :size="17" /></button></header><p class="column-subtitle">{{ col.description }}</p>
       <div v-sortable="reorder" class="task-list" :class="{'is-saving':state.saving}"><article v-for="t in visibleTasks.filter(t=>t.status===col.id)" :key="t.id" :data-id="t.id" class="task-card" :class="{'has-block':t.blocked_count}" tabindex="0" role="button" :aria-label="'Abrir task '+t.title" @click="showTask(t.id)" @keydown.enter.self="showTask(t.id)" @keydown.space.self.prevent="showTask(t.id)"><img v-if="t.cover_path" :src="t.cover_path" alt="Capa da task" class="task-card-cover"><div class="card-inner"><div class="card-topline"><span class="project-label" :class="state.projects.find(p=>p.id===t.project_id)?.cover||'neutral'"><span></span>{{ state.projects.find(p=>p.id===t.project_id)?.title||'Sem projeto' }}</span><button class="drag-handle" :disabled="!!state.saving" aria-label="Arrastar task para reordenar" @click.stop><GripVertical :size="16" /></button></div><h4>{{ t.title }}</h4><p v-if="t.description" class="card-description">{{ t.description }}</p><div v-if="t.blocked_count" class="card-block"><LockKeyhole :size="13" /><span>Aguardando {{ t.activities.find(a=>a.blocked)?.blocking_person }}{{ t.blocked_count>1?' + '+(t.blocked_count-1):'' }}</span></div><div v-if="t.activities.length" class="card-progress"><div class="progress-track"><span :style="{width:t.completed_count/t.activities.length*100+'%'}" :class="{complete:t.status==='done'}"></span></div></div><footer class="card-footer"><span><ListTodo :size="14" />{{ t.completed_count }}/{{ t.activities.length }}</span><span><MessageSquare :size="13" />{{ t.comments_count }}</span><div class="spacer"></div><span v-if="t.status==='done'" class="completed-label"><Check :size="13" /> Feita!</span><ArrowUpRight v-else :size="15" class="card-arrow" /></footer></div></article></div>
       <div v-if="!visibleTasks.some(t=>t.status===col.id)" class="column-empty"><div class="empty-orbit" :class="col.id"><component :is="col.icon" :size="24" /><span></span><i></i></div><strong>{{ col.id==='pending'?'Espaço para uma nova ideia':col.id==='doing'?'Seu próximo passo está aqui':'As conquistas vão aparecer aqui' }}</strong><p>{{ col.id==='pending'?'Crie uma task para começar.':col.id==='doing'?'Inicie uma atividade para ver sua task avançar.':'Conclua todas as atividades de uma task e celebre.' }}</p></div>
       <button v-if="col.id==='pending'" class="add-card" @click="newTask()"><Plus :size="16" /> Adicionar task</button>
      </section></div>
      <footer class="board-footer"><span><GripVertical :size="13" /> Arraste para organizar. As atividades definem a coluna.</span><span v-if="scopedTasks.length"><CheckCircle2 :size="14" />{{ completedCount }} {{ completedCount===1?'task concluída':'tasks concluídas' }}</span><span v-else>Seu ritmo. Seu fluxo.</span></footer>
     </template>
     <template v-else><div v-if="!state.projects.length" class="projects-empty"><img src="/ui/hero.png" alt="Mesa criativa ilustrada"><span class="eyebrow">IDEIAS PRECISAM DE ESPAÇO</span><h3>O próximo projeto pode ser seu favorito.</h3><p>Crie um espaço para reunir as tasks de uma ideia,<br>um produto ou algo que você quer colocar no mundo.</p><button class="btn primary" @click="projectForm={project:null}"><Plus :size="17" /> Criar meu primeiro projeto</button></div><div v-else-if="!filteredProjects.length" class="no-results"><Search :size="25" /><strong>Nenhum projeto encontrado.</strong><button class="text-btn" @click="search=''">Limpar busca</button></div><div v-else class="project-grid"><article v-for="p in filteredProjects" :key="p.id" class="project-card"><button class="project-cover cover-art" :class="p.cover" @click="chooseProject(p.id)"><img :src="p.cover_path||'/ui/hero.png'" :alt="'Capa do projeto '+p.title"><span class="cover-open"><ArrowUpRight :size="20" /></span></button><div class="project-card-body"><div class="project-card-title"><button @click="chooseProject(p.id)">{{ p.title }}</button><button class="icon-btn tiny" aria-label="Editar projeto" @click="projectForm={project:p}"><Pencil :size="15" /></button><button class="icon-btn tiny danger-text" aria-label="Excluir projeto" @click="askDeleteProject(p)"><Trash2 :size="15" /></button></div><p>{{ projectTasks(p).length }} {{ projectTasks(p).length===1?'task':'tasks' }}<span>·</span>{{ projectTasks(p).filter(t=>t.blocked_count).length }} com bloqueio</p><div class="project-progress-label"><span>Progresso</span><strong>{{ projectProgress(p) }}%</strong></div><div class="progress-track"><span :style="{width:projectProgress(p)+'%'}" :class="{complete:projectProgress(p)===100}"></span></div><button class="text-btn" @click="chooseProject(p.id)">Abrir quadro <ArrowRight :size="14" /></button></div></article><button class="new-project-card" @click="projectForm={project:null}"><span><Plus :size="25" /></span><strong>Criar um projeto</strong><p>Dê espaço à próxima ideia.</p></button></div></template>
    </template>
   </main>
  </div>
  <TaskPanel v-if="openTask&&state.tasks.some(t=>t.id===openTask)" :key="openTask+':'+openActivity+':'+activityOnly" :task-id="openTask" :initial-activity-id="openActivity" :activity-only="activityOnly" @close="openTask=null" @edit="editTask" @delete="askDeleteTask" />
  <TaskForm v-if="taskForm" :task="taskForm.task" :project-id="taskForm.projectId??selectedProject" :due-date="taskForm.dueDate" @close="taskForm=null" @saved="taskSaved" />
  <ProjectForm v-if="projectForm" :project="projectForm.project" @close="projectForm=null" @saved="projectSaved" />
  <ConfirmDialog v-if="deleting" :title="deleting.title" :message="deleting.message" :project="deleting.project" @close="deleting=null" @confirm="deleteItem" />
  <WorkHoursWidget v-if="!isDesktop" :position-key="'fluxo:work-widget-position:' + auth.user?.id" :day="workDay" :entries="workHours.state.data?.active_day.entries || {}" v-model:expanded="workWidgetExpanded" :busy="workHours.state.saving" @finish="workHours.finish" @action="workHours.act" @settings="openProfile" />
  <Transition name="toast"><div v-if="state.toast" class="toast-message" :class="state.toast.kind" role="status"><CheckCircle2 v-if="state.toast.kind==='success'" :size="18" /><Circle v-else :size="18" /><span>{{ state.toast.message }}</span><button class="icon-btn tiny" aria-label="Fechar aviso" @click="state.toast=null"><X :size="14" /></button></div></Transition>
 </div>
</template>

<style scoped>
.profile-nav-button {
  margin-top: 15px;
  margin-bottom: 5px;
  font-size: 10px;
  gap: 8px;
}
.account-identity {
  text-align: left;
}
.account-identity:hover {
  color: var(--theme-accent, #5978ed);
}
</style>
