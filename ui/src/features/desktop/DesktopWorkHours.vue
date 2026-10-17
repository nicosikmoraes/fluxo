<script setup>
import {
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch
} from "vue";
import {
  BarChart3,
  Clock3,
  LoaderCircle,
  Pin,
  RefreshCw,
  Settings2
} from "@lucide/vue";
import WorkHoursWidget from "../work-hours/WorkHoursWidget.vue";
import {
  useWorkHours
} from "../work-hours/useWorkHours";
import {
  state
} from "../../state/workspace";
import {
  desktopCall,
  dragDesktopWidget,
  hideDesktopWidget,
  openDesktopWorkspace
} from "./desktopBridge";

const workHours = useWorkHours();
const {
  day,
  expanded
} = workHours;
const content = ref(null);
const alwaysOnTop = ref(true);
const nativeError = ref("");
let observer;
let resizeTimer;
let lastLayout = "";

async function nativeAction(action) {
  try {
    nativeError.value = "";
    return await action();
  } catch (error) {
    nativeError.value = "Não foi possível ajustar a janela. " + String(error);
    return null;
  }
}

function resize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(async () => {
    await nextTick();
    const height = Math.ceil(content.value?.getBoundingClientRect().height || 190);
    const mode = expanded.value ? "widget" : "compact";
    const layout = mode + ":" + height;
    if (layout === lastLayout) return;
    lastLayout = layout;
    const result = await nativeAction(() => desktopCall("desktop_layout", {
      mode,
      height
    }));
    if (result === null && nativeError.value) lastLayout = "";
  }, 90);
}

async function toggleTop() {
  const preferences = await nativeAction(() => desktopCall("desktop_toggle_top"));
  if (preferences) alwaysOnTop.value = preferences.alwaysOnTop;
}

async function refreshPreferences() {
  const preferences = await nativeAction(() => desktopCall("desktop_preferences"));
  if (preferences) alwaysOnTop.value = preferences.alwaysOnTop;
}

watch(expanded, resize);
onMounted(async () => {
  const preferences = await nativeAction(() => desktopCall("desktop_preferences"));
  if (preferences) {
    expanded.value = preferences.expanded;
    alwaysOnTop.value = preferences.alwaysOnTop;
  }
  window.addEventListener("focus", refreshPreferences);
  observer = new ResizeObserver(resize);
  if (content.value) observer.observe(content.value);
  resize();
});
onUnmounted(() => {
  window.removeEventListener("focus", refreshPreferences);
  observer?.disconnect();
  clearTimeout(resizeTimer);
});
</script>

<template>
  <div ref="content" class="desktop-jornada" :class="{ compact: !expanded }">
    <div v-if="workHours.state.loading && !workHours.state.data" class="desktop-jornada-card"><LoaderCircle :size="24" class="spin" /><p>Reunindo seus horários…</p></div>
    <div v-else-if="!workHours.state.data" class="desktop-jornada-card"><Clock3 :size="26" /><h1>Sua jornada está aqui.</h1><p>{{ workHours.state.error }}</p><button class="btn primary" @click="workHours.read().catch(() => {})"><RefreshCw :size="14" /> Tentar novamente</button></div>
    <div v-else-if="!workHours.state.data.settings.enabled" class="desktop-jornada-card">
      <Clock3 :size="30" /><h1>Seu tempo merece espaço.</h1><p>Configure sua jornada para acompanhar os horários e as horas extras por aqui.</p>
      <button class="btn primary" @click="nativeAction(() => openDesktopWorkspace())"><Settings2 :size="14" /> Configurar minha jornada</button>
      <button class="text-btn" @click="nativeAction(hideDesktopWidget)">Recolher perto do relógio</button>
    </div>
    <WorkHoursWidget v-else native-window :day="day" :entries="workHours.state.data.active_day.entries" v-model:expanded="expanded" :busy="workHours.state.saving" @action="workHours.act" @finish="workHours.finish" @settings="nativeAction(() => openDesktopWorkspace())" @drag="nativeAction(dragDesktopWidget)" @hide="nativeAction(hideDesktopWidget)" @move="nativeAction(() => desktopCall('desktop_nudge', { direction: $event }))" />
    <footer v-if="expanded" class="desktop-jornada-tools">
      <span>Salvo neste computador</span>
      <button :class="{ active: alwaysOnTop }" :aria-pressed="alwaysOnTop" title="Manter sobre outras janelas" aria-label="Manter sobre outras janelas" @click="toggleTop"><Pin :size="13" /></button>
      <button title="Histórico de horas" aria-label="Abrir histórico de horas" @click="nativeAction(() => openDesktopWorkspace('work-history'))"><BarChart3 :size="14" /></button>
    </footer>
    <p v-if="state.toast" class="desktop-jornada-toast" :class="state.toast.kind" role="status">{{ state.toast.message }}</p>
    <p v-if="nativeError" class="desktop-jornada-toast error" role="alert">{{ nativeError }}</p>
  </div>
</template>

<style scoped>
.desktop-jornada {
  padding: 8px;
  width: 100%;
}

.desktop-jornada-card {
  padding: 24px 22px;
  display: grid;
  justify-items: start;
  gap: 15px;
  color: #8b9dbd;
  border: 1px solid #e1e7f2;
  border-radius: 16px;
  background: #fff;
}

.desktop-jornada-card h1 {
  color: #7189b2;
  font-size: 19px;
  font-weight: 550;
  line-height: 1.4;
}

.desktop-jornada-card p {
  font-size: 12px;
  line-height: 1.8;
}

.desktop-jornada-card .btn {
  font-size: 11px;
}

.desktop-jornada-card .text-btn {
  font-size: 10px;
}

.desktop-jornada-tools {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 6px 0;
  font-size: 9px;
  color: #98a7bd;
}

.desktop-jornada-tools span {
  flex: 1;
}

.desktop-jornada-tools button {
  padding: 5px;
  border-radius: 5px;
  background: #fff;
  color: #a4b0c3;
  border: 1px solid #e6ebf5;
}

.desktop-jornada-tools button.active {
  color: #6b89dd;
  background: #f0f4ff;
}

.desktop-jornada-toast {
  margin-top: 8px;
  border: 1px solid #e1e9f8;
  border-radius: 8px;
  background: #f4f7ff;
  color: #718ab9;
  padding: 10px;
  font-size: 10px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.desktop-jornada-toast.error {
  color: #ad6575;
  background: #fff5f5;
  border-color: #f3dfe4;
}
</style>
