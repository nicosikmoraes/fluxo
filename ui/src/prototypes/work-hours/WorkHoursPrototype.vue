<script setup>
import { computed, onUnmounted, ref } from "vue";
import { ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, FolderOpen, LayoutDashboard, ListTodo, Menu, MessageSquare, Monitor, Plus, RotateCcw, Settings2, Sparkles, X } from "@lucide/vue";
import WorkHoursSettings from "../../features/work-hours/WorkHoursSettings.vue";
import WorkHoursWidget from "../../features/work-hours/WorkHoursWidget.vue";
import { calculateWorkDay, defaultWorkSettings, emptyWorkEntries, formatWorkTime, getWorkTimeline, parseWorkTime } from "../../features/work-hours/workHours";

const view = ref("settings");
const mobileMenu = ref(false);
const settings = ref({ ...defaultWorkSettings, enabled: true, monthlySalary: 4400 });
const entries = ref({ startedAt: "08:00", lunchOut: "12:00", lunchIn: "13:00", finishedAt: "" });
const nowMinutes = ref(16 * 60 + 24);
const scenario = ref("working");
const expanded = ref(false);
const notice = ref("");
let noticeTimer;
onUnmounted(() => clearTimeout(noticeTimer));
const day = computed(() => calculateWorkDay(settings.value, entries.value, nowMinutes.value));
const scenarios = [
  { value: "working", label: "Jornada em andamento" },
  { value: "overtime", label: "Fazendo hora extra" },
  { value: "no-salary", label: "Hora extra · sem salário" },
  { value: "finished", label: "Jornada encerrada" },
  { value: "lunch", label: "Antes do 3º horário" },
  { value: "disabled", label: "Primeiro acesso" },
];
const columns = [
  { title: "Pendente", subtitle: "Ideias prontas para começar", status: "pending", items: [
    { title: "Organizar as ideias da semana", project: "Meu espaço", color: "violet", body: "Um lugar para os próximos passos, sem pressa.", total: 4, done: 0 },
    { title: "Planejar o próximo lançamento", project: "Projeto Aurora", color: "mint", body: "Reunir referências e dar forma à próxima ideia.", total: 3, done: 0 },
  ] },
  { title: "Em andamento", subtitle: "Um passo mais perto", status: "doing", items: [
    { title: "Dar vida à nova interface", project: "Projeto Aurora", color: "mint", body: "Pequenos detalhes que fazem o dia fluir melhor.", total: 5, done: 3 },
  ] },
  { title: "Concluída", subtitle: "Pequenas grandes conquistas", status: "done", items: [
    { title: "Revisar as prioridades", project: "Meu espaço", color: "violet", body: "Tudo pronto para seguir em frente.", total: 3, done: 3 },
  ] },
];

function navigate(next) {
  view.value = next;
  mobileMenu.value = false;
}

function showNotice(message) {
  clearTimeout(noticeTimer);
  notice.value = message;
  noticeTimer = setTimeout(() => { notice.value = ""; }, 4500);
}

function loadScenario(value) {
  scenario.value = value;
  settings.value = { ...defaultWorkSettings, enabled: true, monthlySalary: 4400 };
  entries.value = { startedAt: "08:00", lunchOut: "12:00", lunchIn: "13:00", finishedAt: "" };
  nowMinutes.value = 16 * 60 + 24;
  expanded.value = true;
  if (value === "overtime" || value === "no-salary") nowMinutes.value = 18 * 60 + 30;
  if (value === "no-salary") settings.value.monthlySalary = "";
  if (value === "finished") {
    nowMinutes.value = 18 * 60 + 30;
    entries.value.finishedAt = "18:00";
  }
  if (value === "lunch") {
    nowMinutes.value = 12 * 60 + 35;
    entries.value.lunchIn = "";
  }
  if (value === "disabled") {
    settings.value.enabled = false;
    settings.value.monthlySalary = "";
    entries.value = { ...emptyWorkEntries };
    navigate("settings");
  }
}

function updateClock(value) {
  const minutes = parseWorkTime(value);
  if (minutes !== null) nowMinutes.value = minutes;
}

function finishWork() {
  const finishedAt = formatWorkTime(nowMinutes.value);
  const updated = { ...entries.value, finishedAt };
  const { error } = getWorkTimeline(updated);
  if (error) return showNotice(error);
  entries.value = updated;
  showNotice(`Saída registrada às ${finishedAt} nesta prévia.`);
}

function openSettings() {
  navigate("settings");
  expanded.value = false;
}

function showWidgetOnBoard() {
  navigate("board");
  expanded.value = true;
}

const previewParameters = new URLSearchParams(window.location.search);
const initialScenario = previewParameters.get("scenario");
const initialScreen = previewParameters.get("screen");
if (scenarios.some((item) => item.value === initialScenario)) loadScenario(initialScenario);
if (["settings", "board", "daily"].includes(initialScreen)) navigate(initialScreen);
expanded.value = view.value !== "settings";
</script>

<template>
  <div class="app-shell work-prototype">
    <div v-if="mobileMenu" class="prototype-mobile-backdrop" @click="mobileMenu = false"></div>
    <aside class="sidebar prototype-sidebar" :class="{ 'prototype-sidebar-open': mobileMenu }">
      <a class="brand" href="#" @click.prevent="navigate('board')"><span class="brand-mark"><span></span><span></span><span></span></span><span>fluxo<span class="brand-period">.</span></span></a>
      <div class="workspace-name"><div class="workspace-icon"><Monitor :size="17" /></div><div><strong>Meu espaço</strong><span>Feito para o seu ritmo</span></div><span class="local-dot"></span></div>
      <p class="nav-label">SEU TRABALHO</p>
      <nav aria-label="Navegação da prévia">
        <button class="nav-item" :class="{ active: view === 'board' }" @click="navigate('board')"><LayoutDashboard :size="18" /> Meu quadro <span class="nav-count">4</span></button>
        <button class="nav-item" :class="{ active: view === 'daily' }" @click="navigate('daily')"><CalendarDays :size="18" /> Meu dia</button>
      </nav>
      <div class="nav-section-title"><p class="nav-label">MEUS PROJETOS</p><FolderOpen :size="14" /></div>
      <div class="prototype-project"><span class="project-dot mint"></span>Projeto Aurora<span>2</span></div>
      <div class="prototype-project"><span class="project-dot violet"></span>Meu espaço<span>2</span></div>
      <div class="prototype-sidebar-note"><Sparkles :size="20" /><strong>Seu tempo também<br>merece espaço.</strong><p>Um passo de cada vez.<br>Uma pausa quando precisar.</p><span></span><i></i></div>
      <div class="prototype-account-area">
        <button class="nav-item prototype-settings-link" :class="{ active: view === 'settings' }" @click="navigate('settings')"><Settings2 :size="17" /> Configurações do perfil</button>
        <button class="prototype-account" @click="navigate('settings')"><span class="prototype-avatar">NM</span><span><strong>Meu perfil</strong><small>Seu espaço pessoal</small></span><ChevronRight :size="14" /></button>
      </div>
    </aside>

    <div class="main-shell prototype-main-shell">
      <header class="topbar prototype-topbar">
        <div class="breadcrumb"><button class="prototype-menu" aria-label="Abrir menu de navegação" @click="mobileMenu = !mobileMenu"><Menu :size="19" /></button><span>Meu espaço</span><ChevronRight :size="13" /><strong>{{ view === 'settings' ? 'Configurações do perfil' : view === 'daily' ? 'Meu dia' : 'Meu quadro' }}</strong></div>
        <span class="prototype-design-label"><span></span> PRÉVIA DE DESIGN</span>
        <button class="prototype-topbar-avatar" aria-label="Abrir configurações do perfil" @click="navigate('settings')">NM</button>
      </header>

      <section class="prototype-controls" aria-label="Controles do protótipo">
        <div class="prototype-controls-label"><span>PROTÓTIPO INTERATIVO</span><p>Explore a configuração e os estados do widget.</p></div>
        <div class="prototype-simulation">
          <label for="prototype-scenario">Cenário<select id="prototype-scenario" :value="scenario" @change="loadScenario($event.target.value)"><option v-for="item in scenarios" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
          <label for="prototype-clock">Relógio simulado<input id="prototype-clock" type="time" :value="formatWorkTime(nowMinutes)" @input="updateClock($event.target.value)"></label>
          <button class="prototype-reset" aria-label="Restaurar cenário da prévia" @click="loadScenario(scenario)"><RotateCcw :size="15" /></button>
        </div>
      </section>

      <main class="prototype-content">
        <template v-if="view === 'settings'">
          <header class="prototype-profile-heading"><span class="prototype-eyebrow">CONFIGURAÇÕES DO PERFIL</span><h1>Seu tempo, no seu ritmo.</h1><p>Um espaço para cuidar da sua jornada de trabalho.</p><div class="prototype-profile-ornament" aria-hidden="true"><Clock3 :size="46" /><span></span><i></i></div></header>
          <div class="prototype-settings-tabs"><span class="active"><Clock3 :size="14" /> Jornada de trabalho</span><button class="prototype-widget-preview-link" @click="showWidgetOnBoard">Ver widget no quadro <ArrowUpRight :size="13" /></button></div>
          <WorkHoursSettings v-model:settings="settings" v-model:entries="entries" :now-minutes="nowMinutes" @save="showNotice('Preferências aplicadas nesta prévia. Os dados são de demonstração.')" @open-widget="showWidgetOnBoard" />
        </template>

        <template v-else>
          <section class="hero prototype-board-hero"><img class="hero-image" src="/ui/hero.png" alt="Mesa criativa com plantas e caderno"><div class="hero-shade"></div><div class="hero-content"><span class="eyebrow"><span class="hero-dot"></span>SEU ESPAÇO PARA FAZER ACONTECER</span><h1>{{ view === 'daily' ? 'Hoje, um passo de cada vez.' : 'Um passo de cada vez.' }}</h1><p>Organize suas ideias. Encontre espaço para o seu tempo.</p><div class="hero-date">sexta-feira, 16 de outubro</div></div></section>
          <div class="prototype-board-heading"><div><h2>{{ view === 'daily' ? 'Seu dia' : 'Seu quadro' }}<span>4</span></h2><p>O progresso acontece nas pequenas atividades.</p></div><button class="prototype-view-settings" @click="navigate('settings')"><Clock3 :size="15" /> Minha jornada <ArrowRight :size="14" /></button></div>
          <div class="prototype-board-note"><span><Sparkles :size="16" /> Cada passo conta. As pausas também.</span><p>O widget da sua jornada acompanha você no canto da tela.</p></div>
          <div class="prototype-board-columns" :class="{ 'daily-layout': view === 'daily' }">
            <section v-for="column in columns" :key="column.status" class="prototype-board-column" :class="column.status">
              <header><span class="prototype-column-dot"></span><h3>{{ column.title }}</h3><span>{{ column.items.length }}</span><Plus :size="16" /></header>
              <p class="prototype-column-subtitle">{{ column.subtitle }}</p>
              <article v-for="task in column.items" :key="task.title" class="prototype-task">
                <span class="prototype-task-project" :class="task.color"><i></i>{{ task.project }}</span>
                <h4>{{ task.title }}</h4><p>{{ task.body }}</p>
                <div class="prototype-task-progress"><span :style="{ width: task.done / task.total * 100 + '%' }"></span></div>
                <footer><span><ListTodo :size="13" />{{ task.done }}/{{ task.total }}</span><span><MessageSquare :size="12" />2</span><Check v-if="task.done === task.total" :size="14" /><ArrowUpRight v-else :size="14" /></footer>
              </article>
            </section>
          </div>
          <p class="prototype-board-footnote">Tasks de exemplo para visualizar o widget durante o uso do Fluxo.</p>
          <section v-if="!day.showWidget" class="prototype-no-widget"><Clock3 :size="20" /><div><strong>{{ settings.enabled ? 'Sua jornada ainda está começando.' : 'Acompanhe seu tempo de trabalho.' }}</strong><p>{{ settings.enabled ? 'O widget aparece quando você registrar o retorno do almoço.' : 'Ative o acompanhamento nas configurações do seu perfil.' }}</p></div><button @click="navigate('settings')">Abrir configurações <ArrowRight :size="14" /></button></section>
        </template>

        <footer class="prototype-page-footer"><span>Feito para acompanhar seu ritmo.</span><span>Prévia com dados de exemplo · nada é salvo na sua conta.</span></footer>
      </main>
    </div>

    <WorkHoursWidget position-key="fluxo:work-widget-position:prototype" :day="day" :entries="entries" v-model:expanded="expanded" @finish="finishWork" @settings="openSettings" />
    <Transition name="toast"><div v-if="notice" class="prototype-notice" role="status"><CheckCircle2 :size="17" /><span>{{ notice }}</span><button aria-label="Fechar aviso" @click="notice = ''"><X :size="15" /></button></div></Transition>
  </div>
</template>

<style scoped>
.work-prototype {
  background: #f8faff;
  min-height: 100vh;
}
.prototype-sidebar {
  width: 222px;
  padding: 31px 18px 0;
}
.prototype-sidebar .brand {
  font-size: 32px;
  margin-bottom: 5px;
}
.prototype-sidebar .workspace-name {
  margin: 24px 0 32px;
  padding: 13px 10px;
}
.prototype-sidebar .nav-item {
  font-size: 11px;
  padding: 11px;
  margin-bottom: 4px;
}
.prototype-sidebar .nav-section-title {
  margin-top: 30px;
  color: #a2afc5;
  padding-right: 10px;
}
.prototype-project {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #96a6c0;
  font-size: 10px;
  padding: 13px 11px;
}
.prototype-project > span:last-child {
  margin-left: auto;
  color: #b4bed0;
  font-size: 9px;
}
.prototype-sidebar-note {
  margin: auto 4px 30px;
  padding: 24px 15px;
  background: linear-gradient(135deg, #f0f5ff, #fafbff);
  border: 1px solid #e9effc;
  border-radius: 12px;
  color: #a0b4dc;
  position: relative;
  overflow: hidden;
}
.prototype-sidebar-note > svg {
  margin-bottom: 12px;
}
.prototype-sidebar-note strong {
  display: block;
  color: #94a9ce;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.8;
}
.prototype-sidebar-note p {
  font-size: 9px;
  color: #abbad4;
  line-height: 1.9;
  margin-top: 9px;
}
.prototype-sidebar-note > span,
.prototype-sidebar-note > i {
  position: absolute;
  border: 1px solid #e1eafb;
  border-radius: 50%;
  width: 82px;
  height: 82px;
  bottom: -35px;
  right: -28px;
}
.prototype-sidebar-note > i {
  width: 59px;
  height: 59px;
  bottom: -24px;
  right: -17px;
}
.prototype-account-area {
  border-top: 1px solid #eef1f8;
  padding: 16px 0 21px;
}
.prototype-sidebar .prototype-settings-link {
  font-size: 10px;
  padding: 11px 9px;
  gap: 8px;
}
.prototype-account {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 17px 9px 0;
  text-align: left;
}
.prototype-avatar,
.prototype-topbar-avatar {
  width: 33px;
  height: 33px;
  border-radius: 11px;
  background: #eef3ff;
  color: #98add5;
  display: grid;
  place-items: center;
  font-size: 10px;
  font-weight: 550;
}
.prototype-account strong {
  font-size: 10px;
  color: #879bbd;
  font-weight: 550;
}
.prototype-account small {
  display: block;
  font-size: 8px;
  color: #b0bcd0;
  margin-top: 4px;
}
.prototype-account > svg {
  margin-left: auto;
  color: #aebbd1;
}
.prototype-main-shell {
  margin-left: 222px;
  width: calc(100% - 222px);
}
.prototype-topbar {
  height: 65px;
  padding: 0 34px;
  gap: 15px;
  background: #ffffffc4;
}
.prototype-design-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #a6b2c9;
  font-size: 7px;
  letter-spacing: .9px;
  margin-left: auto;
}
.prototype-design-label > span {
  width: 5px;
  height: 5px;
  background: #b0c4ee;
  border-radius: 50%;
}
.prototype-topbar-avatar {
  height: 29px;
  width: 29px;
  margin-left: 8px;
  font-size: 9px;
  border: 1px solid #e3ebfb;
}
.prototype-menu {
  display: none;
  padding: 3px;
}
.prototype-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  background: #f0f4fc;
  border-bottom: 1px solid #e5ebf7;
  padding: 12px 34px;
}
.prototype-controls-label > span {
  color: #8b9fca;
  font-size: 7px;
  font-weight: 600;
  letter-spacing: 1.2px;
}
.prototype-controls-label p {
  color: #9aaac5;
  font-size: 9px;
  margin-top: 5px;
}
.prototype-simulation {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}
.prototype-simulation label {
  font-size: 7px;
  color: #9caecb;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.prototype-simulation select,
.prototype-simulation input {
  height: 31px;
  border: 1px solid #dce5f5;
  border-radius: 6px;
  padding: 0 9px;
  background: #f9fbff;
  color: #7e95bb;
  font-size: 9px;
}
.prototype-simulation input {
  width: 89px;
}
.prototype-simulation input::-webkit-calendar-picker-indicator {
  opacity: .4;
  width: 12px;
}
.prototype-reset {
  display: grid;
  place-items: center;
  height: 31px;
  width: 31px;
  color: #97accf;
  background: #f9fbff;
  border: 1px solid #dce5f5;
  border-radius: 6px;
}
.prototype-content {
  max-width: 1340px;
  padding: 32px 34px 95px;
  margin: 0 auto;
}
.prototype-profile-heading {
  position: relative;
  padding: 3px 0 26px;
}
.prototype-eyebrow {
  font-size: 8px;
  letter-spacing: 1.5px;
  color: #a2b0c8;
}
.prototype-profile-heading h1 {
  color: #7790b8;
  font-size: 28px;
  font-weight: 500;
  letter-spacing: -.9px;
  margin-top: 10px;
}
.prototype-profile-heading p {
  color: #a0aec5;
  font-size: 11px;
  margin-top: 10px;
}
.prototype-profile-ornament {
  position: absolute;
  right: 22px;
  top: 5px;
  height: 78px;
  width: 100px;
  color: #c6d6f0;
  transform: rotate(-12deg);
}
.prototype-profile-ornament > svg {
  position: absolute;
  left: 24px;
  top: 14px;
  stroke-width: 1.2;
}
.prototype-profile-ornament > span {
  position: absolute;
  inset: 0;
  border: 1px dashed #dae4f4;
  border-radius: 50%;
}
.prototype-profile-ornament > i {
  position: absolute;
  right: 8px;
  top: 4px;
  height: 8px;
  width: 8px;
  border-radius: 50%;
  background: #c5d6f2;
}
.prototype-settings-tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e4eaf5;
  margin-bottom: 22px;
}
.prototype-settings-tabs > span {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  padding: 0 0 14px;
  color: #9eadc6;
}
.prototype-settings-tabs > span.active {
  color: #7c98d5;
  border-bottom: 2px solid #8aa5df;
  margin-bottom: -1px;
}
.prototype-widget-preview-link {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 9px;
  color: #8ba4ce;
  padding: 0 0 13px;
}
.prototype-board-hero {
  margin-bottom: 26px;
  height: 192px;
}
.prototype-board-hero .hero-content {
  padding: 29px;
}
.prototype-board-hero h1 {
  font-size: 27px;
}
.prototype-board-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
  margin: 0 0 22px;
}
.prototype-board-heading h2 {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 18px;
  color: #8196b9;
  font-weight: 500;
}
.prototype-board-heading h2 > span {
  display: grid;
  place-items: center;
  background: #edf2fc;
  height: 20px;
  width: 22px;
  border-radius: 6px;
  font-size: 9px;
  color: #9fafd1;
}
.prototype-board-heading p {
  font-size: 10px;
  color: #a4b3cb;
  margin-top: 7px;
}
.prototype-view-settings {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f0f5ff;
  border: 1px solid #e1eafa;
  padding: 10px 12px;
  color: #8da4d1;
  border-radius: 8px;
  font-size: 10px;
}
.prototype-board-note {
  border: 1px solid #e7edf8;
  padding: 15px 18px;
  border-radius: 11px;
  background: #fefeff;
  display: flex;
  align-items: center;
  gap: 15px;
  flex-wrap: wrap;
  margin-bottom: 23px;
}
.prototype-board-note > span {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: #93a6c6;
}
.prototype-board-note p {
  font-size: 9px;
  color: #adb9ce;
}
.prototype-board-columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.prototype-board-column {
  border: 1px solid #e9edf6;
  border-radius: 12px;
  background: #f4f7fd;
  padding: 15px 13px 45px;
  min-height: 385px;
}
.prototype-board-column.doing {
  background: #f3f6ff;
  border-color: #e4eafb;
}
.prototype-board-column.done {
  background: #f3f8f5;
  border-color: #e4eee8;
}
.prototype-board-column > header {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #9caecb;
}
.prototype-column-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #bbc8de;
}
.doing .prototype-column-dot {
  background: #a5b8ec;
}
.done .prototype-column-dot {
  background: #a6cdb9;
}
.prototype-board-column h3 {
  font-size: 11px;
  font-weight: 550;
  color: #859abd;
}
.prototype-board-column header > span:not(.prototype-column-dot) {
  font-size: 8px;
}
.prototype-board-column header > svg {
  margin-left: auto;
}
.prototype-column-subtitle {
  font-size: 8px;
  color: #b1bed3;
  margin: 7px 0 18px 14px;
}
.prototype-task {
  padding: 17px 15px 12px;
  border: 1px solid #e7ecf6;
  border-radius: 11px;
  background: #fff;
  margin-bottom: 12px;
  box-shadow: 0 3px 8px #38568003;
}
.prototype-task-project {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 7px;
  color: #afa1cd;
}
.prototype-task-project.mint {
  color: #95baa7;
}
.prototype-task-project i {
  height: 4px;
  width: 4px;
  background: currentColor;
  border-radius: 50%;
}
.prototype-task h4 {
  font-size: 12px;
  font-weight: 550;
  line-height: 1.7;
  margin-top: 10px;
  color: #8498b9;
}
.prototype-task > p {
  font-size: 9px;
  line-height: 1.8;
  margin-top: 6px;
  color: #aab7cc;
}
.prototype-task-progress {
  height: 3px;
  background: #f1f4fa;
  border-radius: 5px;
  margin-top: 18px;
}
.prototype-task-progress > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #b4c5f0;
}
.done .prototype-task-progress > span {
  background: #b8d8c6;
}
.prototype-task footer {
  display: flex;
  align-items: center;
  gap: 11px;
  color: #b0bed5;
  margin-top: 14px;
}
.prototype-task footer > span {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 8px;
}
.prototype-task footer > svg {
  margin-left: auto;
}
.prototype-board-footnote {
  font-size: 9px;
  color: #afbed5;
  margin-top: 16px;
}
.prototype-no-widget {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 19px;
  border: 1px solid #e0e9f9;
  border-radius: 11px;
  color: #96aed7;
  margin-top: 22px;
  background: #f3f7ff;
}
.prototype-no-widget strong {
  font-size: 11px;
  font-weight: 500;
}
.prototype-no-widget p {
  font-size: 9px;
  color: #a6b7d2;
  margin-top: 5px;
}
.prototype-no-widget button {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 9px;
  margin-left: auto;
}
.prototype-page-footer {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  padding: 27px 0 0;
  margin-top: 10px;
  border-top: 1px solid #e9eef8;
  color: #b1bfd5;
  font-size: 8px;
}
.prototype-notice {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid #e2eaf8;
  border-radius: 10px;
  background: #fff;
  color: #8399bf;
  font-size: 11px;
  box-shadow: 0 7px 25px #445b8b14;
  max-width: calc(100vw - 25px);
}
.prototype-notice svg {
  flex-shrink: 0;
}
.prototype-notice button {
  padding: 0;
  color: #a6b6d0;
}
@media (max-width: 1150px) {
  .prototype-sidebar {
    width: 192px;
    padding-left: 12px;
    padding-right: 12px;
  }
  .prototype-main-shell {
    width: calc(100% - 192px);
    margin-left: 192px;
  }
  .prototype-content {
    padding: 27px 23px 95px;
  }
  .prototype-controls,
  .prototype-topbar {
    padding-left: 23px;
    padding-right: 23px;
  }
  .prototype-controls-label p {
    display: none;
  }
  .prototype-board-columns {
    gap: 11px;
  }
  .prototype-board-column {
    padding-left: 9px;
    padding-right: 9px;
  }
}
@media (max-width: 760px) {
  .prototype-sidebar {
    display: flex;
    width: 222px;
    transform: translateX(-100%);
    z-index: 55;
    transition: transform .2s;
  }
  .prototype-sidebar.prototype-sidebar-open {
    transform: translateX(0);
  }
  .prototype-mobile-backdrop {
    position: fixed;
    inset: 0;
    background: #354a7640;
    z-index: 54;
  }
  .prototype-main-shell {
    margin-left: 0;
    width: 100%;
  }
  .prototype-menu {
    display: grid;
    place-items: center;
    color: #99afce;
  }
  .prototype-topbar {
    padding: 0 17px;
    height: 57px;
  }
  .prototype-topbar .breadcrumb > span,
  .prototype-topbar .breadcrumb > svg,
  .prototype-design-label {
    display: none;
  }
  .prototype-topbar-avatar {
    margin-left: auto;
  }
  .prototype-content {
    padding: 24px 17px 110px;
  }
  .prototype-controls {
    padding: 12px 17px;
    gap: 12px;
  }
  .prototype-controls-label {
    width: 100%;
  }
  .prototype-simulation {
    width: 100%;
  }
  .prototype-simulation > label:first-child {
    flex: 1;
    min-width: 0;
  }
  .prototype-simulation select {
    width: 100%;
    min-width: 0;
  }
  .prototype-profile-heading h1 {
    font-size: 24px;
  }
  .prototype-profile-heading p {
    font-size: 10px;
  }
  .prototype-profile-ornament {
    display: none;
  }
  .prototype-settings-tabs > .prototype-settings-tab-hint {
    display: none;
  }
  .prototype-board-columns {
    grid-template-columns: 1fr;
    gap: 17px;
  }
  .prototype-board-column {
    min-height: 0;
    padding: 17px;
  }
  .prototype-board-hero {
    height: 180px;
  }
  .prototype-board-hero .hero-content {
    padding: 24px 20px;
  }
  .prototype-board-heading {
    flex-wrap: wrap;
  }
  .prototype-no-widget {
    flex-wrap: wrap;
  }
  .prototype-page-footer {
    line-height: 1.8;
  }
}
@media (prefers-reduced-motion: reduce) {
  .prototype-sidebar {
    transition: none;
  }
}
</style>
