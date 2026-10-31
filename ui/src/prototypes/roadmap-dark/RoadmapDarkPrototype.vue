<script setup>
import { computed, ref } from 'vue';
import { LayoutDashboard, CalendarDays, ListTodo, BarChart3, Pencil, Plus, Search, Sparkles, Settings2, Check, ChevronRight, Moon, RotateCcw, PanelLeftOpen, X, Layers3 } from '@lucide/vue';
import ProjectMap from '../../features/roadmap/ProjectMap.vue';
import TaskPanel from '../../features/tasks/TaskPanel.vue';
import { state } from '../../state/workspace';
import { demoProjectId, resetRoadmapDemo } from './roadmapDemo';
import './roadmap-dark.css';

const options = [
 { id: 'graphite', number: '01', name: 'Grafite essencial', description: 'Cards neutros, cores nos detalhes e animações suaves para acompanhar o progresso.', swatches: ['#17191c', '#26282d', '#c1afd9', '#a6ceb7'] },
 { id: 'contrast', number: '02', name: 'Contraste preciso', description: 'Superfícies bem definidas, títulos claros e conexões mais visíveis.', swatches: ['#111214', '#2b2e34', '#e2dcea', '#e1be87'] },
 { id: 'lilac', number: '03', name: 'Lilás suave', description: 'A identidade do Tempozi em camadas sutis, com profundidade e cor contida.', swatches: ['#1b1820', '#302a38', '#c1afd9', '#a6ceb7'] },
];
const query = new URLSearchParams(location.search).get('style');
const selected = ref(options.some((option) => option.id === query) ? query : 'graphite');
const showCurrent = ref(false), sidebarOpen = ref(false), instance = ref(0), opened = ref(null);
const current = computed(() => options.find((option) => option.id === selected.value));
function select(id) {
 selected.value = id; showCurrent.value = false;
 const url = new URL(location.href); url.searchParams.set('style', id); history.replaceState({}, '', url);
}
function reset() { resetRoadmapDemo(); opened.value = null; instance.value++; }
</script>
<template>
 <div class="roadmap-prototype">
  <header class="prototype-review">
   <div class="prototype-review-title"><span class="prototype-moon"><Moon :size="18"/></span><div><small>ESTUDO VISUAL</small><strong>Roadmap no escuro</strong></div></div>
   <div class="prototype-variants" role="group" aria-label="Opções de estilo do roadmap"><button v-for="option in options" :key="option.id" :class="{active:selected===option.id&&!showCurrent}" :aria-pressed="selected===option.id&&!showCurrent" @click="select(option.id)"><span>{{ option.number }}</span>{{ option.name }}</button></div>
   <a href="/" class="prototype-back">Voltar ao Tempozi</a>
  </header>
  <div class="app-shell">
   <div v-if="sidebarOpen" class="sidebar-backdrop" @click="sidebarOpen=false"></div>
   <aside class="sidebar" :class="{open:sidebarOpen}">
    <a class="brand" href="/"><span class="brand-mark"><span></span><span></span><span></span></span><span>tempozi<span class="brand-period">.</span></span></a>
    <p class="nav-label">SEU TRABALHO</p>
    <nav><a href="/" class="nav-item"><LayoutDashboard :size="19"/> Meu quadro <span class="nav-count">3</span></a><a href="/" class="nav-item"><CalendarDays :size="19"/> Calendário</a><a href="/" class="nav-item"><ListTodo :size="19"/> Meu dia</a><a href="/?view=work-history" class="nav-item"><BarChart3 :size="19"/> Histórico de horas</a><a href="/?view=whiteboard" class="nav-item"><Pencil :size="19"/> Quadro de ideias</a></nav>
    <div class="nav-section-title"><span class="nav-label">MEUS PROJETOS <span>1</span></span><Plus :size="16"/></div>
    <div class="sidebar-project-search"><Search :size="13"/><input placeholder="Buscar projetos..." aria-label="Buscar projetos da prévia" readonly></div>
    <div class="sidebar-projects"><button class="nav-item project-link active" @click="sidebarOpen=false"><span class="project-dot lavender"></span><span class="truncate">Lançamento do produto</span><span class="nav-count">3</span></button><a href="/" class="nav-item project-link"><span class="project-dot neutral"></span> Sem projeto</a></div>
    <div class="sidebar-bottom"><span class="nav-item"><Moon :size="17"/> Tema escuro</span><a href="/?view=billing" class="nav-item"><Sparkles :size="17"/> Planos e assinatura <span class="nav-count">Pro</span></a><a href="/?view=profile" class="nav-item"><Settings2 :size="17"/> Configurações do perfil</a></div>
   </aside>
   <div class="main-shell">
    <header class="topbar"><div class="breadcrumb"><button class="icon-btn mobile-menu" aria-label="Abrir menu" @click="sidebarOpen=!sidebarOpen"><PanelLeftOpen :size="21"/></button><span>Meu espaço</span><ChevronRight :size="14"/><strong>Lançamento do produto</strong></div><div class="save-indicator"><Check :size="13"/><span>Prévia com dados de exemplo</span></div><div class="account-controls"><button class="account-identity" aria-label="Conta de exemplo"><span class="account-avatar">N</span><span>Nicolas</span></button></div></header>
    <main class="main-content">
     <div class="page-heading"><div><div class="heading-title"><h2>Roadmap do projeto</h2><span class="count-badge">3</span></div><p>O progresso acontece nas pequenas atividades.</p></div></div>
     <div class="project-tabs"><span><LayoutDashboard :size="15"/> Quadro</span><span class="active"><ListTodo :size="15"/> Roadmap</span></div>
     <section class="prototype-caption" aria-live="polite"><div class="prototype-direction"><span class="prototype-option-number">{{ showCurrent?'00':current.number }}</span><div><h1>{{ showCurrent?'Estilo atual':current.name }}<span v-if="selected==='graphite'&&!showCurrent" class="prototype-recommendation">SUGESTÃO</span></h1><p>{{ showCurrent?'Referência do roadmap como está hoje no sistema.':current.description }}</p></div></div><div class="prototype-caption-actions"><div class="prototype-swatches" aria-hidden="true"><i v-for="color in current.swatches" :key="color" :style="{background:color}"></i></div><button class="prototype-compare" :aria-pressed="showCurrent" @click="showCurrent=!showCurrent">{{ showCurrent?'Voltar à proposta':'Comparar com o atual' }}</button><button class="icon-btn prototype-reset" aria-label="Restaurar mapa de exemplo" title="Restaurar mapa de exemplo" @click="reset"><RotateCcw :size="15"/></button></div></section>
     <div class="roadmap-style-preview" :data-roadmap-style="showCurrent?'current':selected"><ProjectMap :key="instance" :project-id="demoProjectId" @open-activity="(taskId,activityId)=>opened={taskId,activityId}"/></div>
     <footer class="prototype-note"><Layers3 :size="14"/><span>Mesmo roadmap, três acabamentos. Arraste os cards, use o zoom e abra uma atividade para explorar.</span><span>Dados de exemplo · alterações só nesta prévia</span></footer>
    </main>
   </div>
  </div>
  <TaskPanel v-if="opened" :key="opened.taskId+':'+opened.activityId" :task-id="opened.taskId" :initial-activity-id="opened.activityId" :activity-only="true" @close="opened=null"/>
  <div v-if="state.toast" class="toast-message" :class="state.toast.kind" role="status"><span>{{ state.toast.message }}</span><button class="icon-btn tiny" aria-label="Fechar aviso" @click="state.toast=null"><X :size="14"/></button></div>
 </div>
</template>
