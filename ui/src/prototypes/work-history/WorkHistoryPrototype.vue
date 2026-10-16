<script setup>
import { computed, onUnmounted, ref } from "vue";
import { ArrowRight, BarChart3, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Coffee, Info, LayoutDashboard, ListTodo, Menu, Monitor, RotateCcw, Settings2, Sparkles, X } from "@lucide/vue";
import HistorySummary from "../../features/work-hours/history/components/HistorySummary.vue";
import HistoryChart from "../../features/work-hours/history/components/HistoryChart.vue";
import HistoryAverages from "../../features/work-hours/history/components/HistoryAverages.vue";
import HistoryTable from "../../features/work-hours/history/components/HistoryTable.vue";
import HistoryDayDetails from "../../features/work-hours/history/components/HistoryDayDetails.vue";
import { createDemoHistory, dailyTarget, dateLabel, demoClock, demoToday, duration, summarizeHistory } from "./historyDemo";

const records = ref(createDemoHistory());
const mobileMenu = ref(false);
const period = ref("month");
const monthOffset = ref(0);
const customStart = ref("2026-10-01");
const customEnd = ref(demoToday);
const selectedDate = ref(null);
const notice = ref("");
let noticeTimer;
onUnmounted(() => clearTimeout(noticeTimer));
const range = computed(() => {
  if (period.value === "custom") return { start: customStart.value, end: customEnd.value };
  if (period.value === "week") return { start: "2026-10-12", end: "2026-10-18" };
  const start = new Date(Date.UTC(2026, 9 + monthOffset.value, 1, 12));
  const end = new Date(Date.UTC(2026, 10 + monthOffset.value, 0, 12));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
});
const invalidRange = computed(() => !range.value.start || !range.value.end || range.value.start > range.value.end);
const filtered = computed(() => invalidRange.value ? [] : records.value.filter((record) => record.date >= range.value.start && record.date <= range.value.end));
const summary = computed(() => summarizeHistory(filtered.value));
const selected = computed(() => records.value.find((record) => record.date === selectedDate.value));
const monthTitle = computed(() => new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${range.value.start || demoToday}T12:00:00Z`)));
const rangeLabel = computed(() => invalidRange.value ? "Confira as datas do período" : `${dateLabel(range.value.start)} a ${dateLabel(range.value.end, { year: 'numeric' })}`);
const balanceLabel = computed(() => `${summary.value.balance < 0 ? '−' : '+'}${duration(summary.value.balance)}`);

function resetDemo() {
  records.value = createDemoHistory();
  period.value = "month";
  monthOffset.value = 0;
  customStart.value = "2026-10-01";
  customEnd.value = demoToday;
  selectedDate.value = null;
  showNotice("Cenário de exemplo restaurado.");
}

function showNotice(message) {
  notice.value = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.value = ""; }, 5000);
}

function receive(payload) {
  records.value = records.value.map((record) => record.date === payload.date ? { ...record, received: payload.amount, receivedOn: payload.receivedOn } : record);
  selectedDate.value = null;
  showNotice(payload.receivedOn ? "Recebimento atualizado nesta prévia. Nenhum dado da sua conta foi alterado." : "Recebimento removido da prévia.");
}
</script>

<template>
  <div class="app-shell history-prototype">
    <div v-if="mobileMenu" class="history-mobile-backdrop" @click="mobileMenu = false"></div>
    <aside class="sidebar history-sidebar" :class="{ open: mobileMenu }">
      <a class="brand" href="/"><span class="brand-mark"><span></span><span></span><span></span></span><span>fluxo<span class="brand-period">.</span></span></a>
      <div class="workspace-name"><div class="workspace-icon"><Monitor :size="17" /></div><div><strong>Meu espaço</strong><span>Feito para o seu ritmo</span></div><span class="local-dot"></span></div>
      <p class="nav-label">SEU TRABALHO</p>
      <nav aria-label="Navegação do protótipo"><a class="nav-item" href="/"><LayoutDashboard :size="18" /> Meu quadro <ArrowRight :size="12" class="history-nav-arrow" /></a><a class="nav-item" href="/ui/prototypes/work-hours.html?screen=daily"><ListTodo :size="18" /> Meu dia</a><span class="history-nav-section">SUA JORNADA</span><a class="nav-item" href="/ui/prototypes/work-hours.html"><Clock3 :size="18" /> Registro de horários</a><a class="nav-item active" href="/ui/prototypes/work-history.html" aria-current="page"><BarChart3 :size="18" /> Histórico de horas</a></nav>
      <div class="history-sidebar-note"><Coffee :size="23" /><strong>Seu tempo conta.<br>As suas pausas também.</strong><p>Conheça seu ritmo e acompanhe cada dia com mais clareza.</p><span></span><i></i></div>
      <a class="nav-item history-profile-link" href="/ui/prototypes/work-hours.html"><Settings2 :size="16" /> Configurações do perfil</a>
      <div class="history-profile"><span>NM</span><div><strong>Meu perfil</strong><small>Perfil de demonstração</small></div><ChevronRight :size="14" /></div>
    </aside>

    <div class="main-shell history-main-shell">
      <header class="topbar history-topbar"><div class="breadcrumb"><button class="history-menu" aria-label="Abrir menu" @click="mobileMenu = !mobileMenu"><Menu :size="20" /></button><span>Meu espaço</span><ChevronRight :size="13" /><strong>Histórico de horas</strong></div><span class="history-preview-label"><span></span> PRÉVIA · DADOS FICTÍCIOS</span><button class="history-reset" title="Restaurar dados de exemplo" aria-label="Restaurar dados de exemplo" @click="resetDemo"><RotateCcw :size="15" /></button></header>
      <main class="history-content">
        <section class="history-heading"><div><span class="history-eyebrow"><span></span> SUA JORNADA, COM MAIS CLAREZA</span><h1>Seu tempo conta uma história.</h1><p>Entenda seu ritmo, acompanhe suas horas e veja o valor do seu trabalho.</p></div><div class="history-heading-art" aria-hidden="true"><Clock3 :size="46" /><span></span><i></i><b></b></div></section>
        <div class="history-section-tabs"><span><BarChart3 :size="15" /> Histórico e estatísticas</span><a href="/ui/prototypes/work-hours.html">Registrar meus horários <ArrowRight :size="13" /></a></div>

        <section class="history-period" aria-label="Filtrar período"><div class="history-period-heading"><span class="history-calendar-icon"><CalendarDays :size="20" /></span><div><span class="history-period-caption">PERÍODO SELECIONADO</span><strong>{{ period === 'month' ? monthTitle : period === 'week' ? 'Esta semana' : 'Período personalizado' }}</strong><small>{{ rangeLabel }}</small></div><div v-if="period === 'month'" class="history-month-arrows"><button aria-label="Mês anterior" @click="monthOffset--"><ChevronLeft :size="16" /></button><button aria-label="Próximo mês" @click="monthOffset++"><ChevronRight :size="16" /></button></div></div><div class="history-period-controls"><label for="history-period">Visualizar<select id="history-period" v-model="period"><option value="month">Por mês</option><option value="week">Esta semana</option><option value="custom">Personalizado</option></select></label><span class="history-regime"><Clock3 :size="13" />44h / semana <span>·</span> 5 dias</span></div><div v-if="period === 'custom'" class="history-custom-dates"><label>De<input v-model="customStart" type="date" :max="customEnd || undefined"></label><label>Até<input v-model="customEnd" type="date" :min="customStart || undefined"></label><p v-if="invalidRange" role="alert">Escolha uma data final igual ou posterior à inicial.</p></div></section>

        <HistorySummary :summary="summary" />
        <p class="history-money-note"><Info :size="13" /><span>O valor estimado não confirma pagamento. “Recebido” soma os valores registrados para os dias selecionados, mesmo que o pagamento tenha ocorrido em outra data.</span></p>

        <div class="history-analysis-grid"><HistoryChart :records="filtered" @select="selectedDate = $event" /><HistoryAverages :summary="summary" /></div>

        <section v-if="summary.days" class="history-insight"><span class="history-insight-icon"><Sparkles :size="19" /></span><div><strong>{{ summary.extraDays }} {{ summary.extraDays === 1 ? 'dia com tempo extra' : 'dias com tempo extra' }} no período.</strong><p>Saldo das jornadas completas: <b>{{ balanceLabel }}</b> em relação à meta de {{ duration(dailyTarget) }} por dia.{{ summary.pending ? ` Há ${summary.pending} registro incompleto para revisar.` : ' Continue acompanhando seu ritmo.' }}</p></div><button v-if="summary.pending" @click="selectedDate = filtered.find((record) => record.status === 'pending').date">Revisar registro <ArrowRight :size="13" /></button></section>

        <HistoryTable :records="filtered" @select="selectedDate = $event" />
        <footer class="history-page-footer"><span><Clock3 :size="12" /> Horários em Brasília · simulação de {{ dateLabel(demoToday) }}, às {{ demoClock }}</span><span>Dados de exemplo · nada é salvo na sua conta</span></footer>
      </main>
    </div>
    <HistoryDayDetails v-if="selected" :key="selected.date" :record="selected" :today="demoToday" preview @close="selectedDate = null" @receive="receive" />
    <div v-if="notice" class="history-notice" role="status"><CheckCircle2 :size="17" /><span>{{ notice }}</span><button aria-label="Fechar aviso" @click="notice = ''"><X :size="15" /></button></div>
  </div>
</template>

<style scoped>
.history-prototype {
  background: #f8faff;
  min-height: 100vh;
}
.history-sidebar {
  width: 222px;
  padding: 31px 18px 22px;
}
.history-sidebar .brand {
  margin-bottom: 5px;
}
.history-sidebar .workspace-name {
  margin: 26px 0 30px;
  padding: 12px 9px;
}
.history-sidebar .nav-item {
  font-size: 11px;
  padding: 12px 11px;
}
.history-nav-arrow {
  margin-left: auto;
  color: #bbc7dc;
}
.history-nav-section {
  display: block;
  padding: 24px 12px 12px;
  font-size: 8px;
  color: #adbad0;
  letter-spacing: 1.2px;
}
.history-sidebar-note {
  margin: auto 4px 26px;
  padding: 23px 16px;
  background:
    linear-gradient(
      135deg,
      #f0f5ff,
      #fafbff);
  border: 1px solid #e7eefb;
  border-radius: 12px;
  position: relative;
  overflow: hidden;
  color: #a0b4dc;
}
.history-sidebar-note strong {
  display: block;
  font-weight: 500;
  font-size: 12px;
  line-height: 1.8;
  margin-top: 12px;
  color: #8ea5ce;
}
.history-sidebar-note p {
  font-size: 9px;
  line-height: 1.9;
  margin-top: 8px;
  color: #a8b8d3;
  max-width: 140px;
}
.history-sidebar-note > span,
.history-sidebar-note > i {
  border: 1px solid #dfe8fb;
  position: absolute;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  right: -42px;
  bottom: -25px;
}
.history-sidebar-note > i {
  width: 105px;
  height: 105px;
  right: -54px;
  bottom: -38px;
}
.history-sidebar .history-profile-link {
  font-size: 10px;
  padding: 12px 8px;
  border-top: 1px solid #edf1f8;
  border-radius: 0;
}
.history-profile {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 8px 0;
  color: #a9b8cf;
}
.history-profile > span {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: #eef3ff;
  color: #97add4;
  font-size: 9px;
}
.history-profile strong {
  font-size: 10px;
  font-weight: 500;
  color: #8ca1c2;
}
.history-profile small {
  display: block;
  font-size: 8px;
  margin-top: 4px;
}
.history-profile > svg {
  margin-left: auto;
}
.history-main-shell {
  margin-left: 222px;
  width: calc(100% - 222px);
}
.history-topbar {
  height: 65px;
  padding: 0 34px;
  justify-content: initial;
  gap: 16px;
}
.history-preview-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 7px;
  letter-spacing: .8px;
  color: #a6b4cc;
  margin-left: auto;
}
.history-preview-label > span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #b4c6ec;
}
.history-reset {
  display: grid;
  place-items: center;
  color: #a3b6d6;
  width: 28px;
  height: 28px;
  border: 1px solid #e5ecf9;
  border-radius: 8px;
}
.history-reset:hover {
  background: #f0f5ff;
}
.history-menu {
  display: none;
}
.history-content {
  max-width: 1490px;
  padding: 36px 34px 26px;
  margin: 0 auto;
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
  color: #9aaccb;
  font-size: 8px;
  letter-spacing: 1.3px;
}
.history-eyebrow > span {
  height: 5px;
  width: 5px;
  background: #a8bde7;
  border-radius: 50%;
}
h1 {
  font-size: 29px;
  font-weight: 500;
  letter-spacing: -.9px;
  color: #778fb5;
  margin: 13px 0 10px;
}
.history-heading p {
  color: #a0afc7;
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
  color: #bdcdec;
  transform: rotate(-12deg);
  margin-right: 15px;
}
.history-heading-art > svg {
  stroke-width: 1.1;
}
.history-heading-art > span {
  position: absolute;
  inset: 2px 6px;
  border: 1px dashed #d7e2f6;
  border-radius: 50%;
}
.history-heading-art > i,
.history-heading-art > b {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d1def4;
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
  background: #d4e9df;
}
.history-section-tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #e5ebf6;
  margin-bottom: 23px;
}
.history-section-tabs > span {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 2px solid #8fa9df;
  padding-bottom: 15px;
  margin-bottom: -1px;
  font-size: 10px;
  color: #849dd0;
}
.history-section-tabs > a {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #96abd0;
  font-size: 9px;
  padding-bottom: 15px;
}
.history-period {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  background: #fff;
  border: 1px solid #e6ecf6;
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
  background: #f0f4ff;
  color: #95acdb;
}
.history-period-caption {
  display: block;
  font-size: 7px;
  letter-spacing: 1px;
  color: #a7b5cd;
}
.history-period-heading strong {
  display: block;
  text-transform: capitalize;
  color: #7e95ba;
  font-size: 15px;
  font-weight: 500;
  margin: 6px 0;
}
.history-period-heading small {
  color: #a4b3ca;
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
  color: #a4b5d1;
  border: 1px solid #e9eef8;
  border-radius: 7px;
  height: 29px;
  width: 29px;
}
.history-month-arrows button:hover {
  background: #f1f5ff;
  color: #839fd4;
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
  color: #a3b2c9;
}
.history-period-controls select {
  height: 35px;
  border: 1px solid #e4ebf7;
  border-radius: 7px;
  padding: 0 12px;
  background: #fcfdff;
  color: #879fc5;
  font-size: 10px;
}
.history-regime {
  font-size: 8px;
  color: #a2b3ce;
  display: flex;
  align-items: center;
  gap: 6px;
  border-left: 1px solid #e8eef8;
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
  border-top: 1px solid #edf1f8;
  padding-top: 15px;
}
.history-custom-dates label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 9px;
  color: #9cacc7;
}
.history-custom-dates input {
  border: 1px solid #e3eaf6;
  background: #fcfdff;
  border-radius: 7px;
  padding: 9px;
  color: #819ac1;
  font-size: 11px;
}
.history-custom-dates p {
  color: #b77b89;
  font-size: 10px;
  padding-bottom: 9px;
}
.history-money-note {
  display: flex;
  align-items: start;
  gap: 7px;
  color: #a7b5cb;
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
  border: 1px solid #e1eaf9;
  border-radius: 11px;
  background:
    linear-gradient(
      110deg,
      #f0f5ff,
      #fafcff);
}
.history-insight-icon {
  color: #a0b6df;
  flex-shrink: 0;
}
.history-insight strong {
  color: #8ba2c9;
  font-size: 11px;
  font-weight: 500;
}
.history-insight p {
  font-size: 9px;
  line-height: 1.9;
  color: #a0b0cb;
  margin-top: 5px;
}
.history-insight b {
  color: #8ca4ce;
  font-weight: 500;
}
.history-insight button {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 7px;
  color: #8da7d5;
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
  color: #acbad0;
}
.history-page-footer > span:first-child {
  display: flex;
  align-items: center;
  gap: 5px;
}
.history-notice {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 9px;
  background: #fff;
  border: 1px solid #dfe8f7;
  padding: 14px 17px;
  border-radius: 10px;
  box-shadow: 0 8px 35px #47608f16;
  color: #89a0c4;
  font-size: 11px;
  max-width: calc(100vw - 30px);
}
.history-notice > svg {
  flex-shrink: 0;
}
.history-notice button {
  display: grid;
  place-items: center;
  color: #a3b5d2;
}
@media (max-width: 1200px) {
  .history-analysis-grid {
    grid-template-columns: minmax(0, 1fr) 280px;
    gap: 16px;
  }
  .history-content {
    padding: 29px 24px;
  }
  .history-regime {
    display: none;
  }
}
@media (max-width: 1000px) {
  .history-analysis-grid {
    grid-template-columns: 1fr;
  }
  .history-sidebar {
    width: 195px;
    padding-inline: 12px;
  }
  .history-main-shell {
    margin-left: 195px;
    width: calc(100% - 195px);
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
  .history-sidebar {
    width: 222px;
    padding: 28px 18px;
  }
  .history-main-shell {
    margin-left: 0;
    width: 100%;
  }
  .history-menu {
    display: grid;
    place-items: center;
    padding: 0;
    color: #99afd1;
  }
  .history-mobile-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: #354a7633;
    backdrop-filter: blur(2px);
  }
  .history-topbar {
    padding: 0 17px;
    height: 57px;
    gap: 10px;
  }
  .history-preview-label {
    font-size: 6px;
    letter-spacing: .3px;
  }
  .history-content {
    padding: 26px 16px;
  }
  h1 {
    font-size: 25px;
    line-height: 1.4;
  }
  .history-heading p {
    font-size: 10px;
  }
  .history-section-tabs > a {
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
  .history-page-footer {
    line-height: 1.8;
  }
}
</style>
