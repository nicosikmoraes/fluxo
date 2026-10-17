<script setup>
import { computed, ref } from "vue";
import { ArrowUpRight, Check, ChevronUp, Clock3, Coffee, GripVertical, LogOut, Play, Pause, Settings2, TrendingUp, X } from "@lucide/vue";
import { formatWorkDuration, formatWorkMoney, formatWorkTime } from "./workHours";
import { useDraggableWidget } from "./useDraggableWidget";

const props = defineProps({
  day: { type: Object, required: true },
  entries: { type: Object, required: true },
  expanded: { type: Boolean, default: true },
  busy: { type: Boolean, default: false },
  positionKey: { type: String, default: "" },
});

const emit = defineEmits(["update:expanded", "finish", "settings", "action"]);
const anchor = ref(null);
const { style: positionStyle, dragging, start: startDragging, captureClick, moveWithKeyboard } = useDraggableWidget(anchor, () => props.positionKey);
const isExtra = computed(() => props.day.overtimeSeconds > 0);
const statusLabel = computed(() => props.day.stale ? "Revise os horários" : props.day.finished ? "Jornada encerrada" : !props.day.started ? "Pronto para começar" : props.day.paused ? "Em pausa" : isExtra.value ? "Em hora extra" : "Em andamento");
const duration = computed(() => formatWorkDuration(isExtra.value ? props.day.overtimeSeconds : props.day.remainingSeconds));
const compactLabel = computed(() => {
  if (!props.day.started) return "Iniciar meu trabalho";
  if (props.day.paused) return "Jornada em pausa";
  if (props.day.finished) return isExtra.value ? `+${duration.value} hoje` : "Jornada encerrada";
  return isExtra.value ? `+${duration.value} extras` : `${duration.value} para sair`;
});

function collapseFromHeader(event) {
  if (event.target.closest("button, a, input, select, textarea")) return;
  emit("update:expanded", false);
}
</script>

<template>
  <div v-if="day.valid && day.showWidget" ref="anchor" class="work-widget-anchor" :class="{ 'is-extra': isExtra, 'is-dragging': dragging }" :style="positionStyle" @click.capture="captureClick">
    <Transition name="work-widget" mode="out-in">
      <section v-if="expanded" key="expanded" class="work-widget" aria-label="Resumo da sua jornada">
        <header class="work-widget-header" title="Clique para recolher ou arraste para mover" @pointerdown="startDragging" @click="collapseFromHeader">
          <button class="work-widget-drag-handle" type="button" data-widget-drag-handle aria-label="Mover widget da jornada" title="Arraste para mover. Use as setas do teclado para ajustar." @keydown="moveWithKeyboard"><GripVertical :size="14" /></button>
          <span class="work-widget-icon"><Clock3 :size="17" /></span>
          <div>
            <strong>Sua jornada</strong>
            <span>Um tempo para cada coisa.</span>
          </div>
          <button class="work-widget-icon-button" aria-label="Abrir configurações da jornada" @click="emit('settings')"><Settings2 :size="15" /></button>
          <button class="work-widget-icon-button" aria-label="Recolher widget da jornada" @click="emit('update:expanded', false)"><X :size="16" /></button>
        </header>

        <div class="work-widget-body">
          <span class="work-widget-status"><i></i>{{ statusLabel }}</span>
          <p class="work-widget-caption">{{ !day.started ? 'Comece pelo widget' : day.weekend ? 'Todo o tempo conta como extra' : isExtra ? 'Além da sua jornada' : day.finished ? 'Meta do dia' : 'Tempo restante' }}</p>
          <div class="work-widget-duration" :class="{ 'is-idle': !day.started }">
            <TrendingUp v-if="isExtra" :size="24" />
            <Check v-else-if="day.finished && !day.remainingSeconds" :size="24" />
            <strong>{{ !day.started ? 'Vamos começar?' : day.finished && !isExtra && !day.remainingSeconds ? 'Tudo certo!' : (isExtra ? '+' : '') + duration }}</strong>
          </div>
          <p class="work-widget-departure">
            <template v-if="day.finished">Saída registrada às <b>{{ entries.finishedAt }}</b></template>
            <template v-else-if="day.paused">O contador está pausado.</template>
            <template v-else-if="day.weekend">Adicional atual de <b>{{ day.currentPremium }}%</b>.</template>
            <template v-else-if="day.started">Seu dia fica completo às <b>{{ formatWorkTime(day.departureMinutes) }}</b><span v-if="day.departureNextDay"> do dia seguinte</span></template>
          </p>
          <p v-if="day.finished && day.remainingSeconds" class="work-widget-shortfall">Faltaram {{ duration }} para a meta diária.</p>

          <div v-if="!day.weekend" class="work-widget-progress" role="progressbar" :aria-valuenow="Math.round(day.progress)" :aria-valuemin="0" :aria-valuemax="100" aria-label="Progresso da jornada diária">
            <span :style="{ width: day.progress + '%' }"></span>
          </div>
          <div class="work-widget-progress-label"><span>{{ formatWorkDuration(day.workedSeconds) }} trabalhadas</span><span>{{ day.weekend ? 'Tudo em hora extra' : 'Meta ' + formatWorkDuration(day.targetSeconds) }}</span></div>

          <div v-if="isExtra && day.overtimeMoney !== null" class="work-widget-money">
            <span>Extras de hoje <small>valor estimado</small></span>
            <strong>{{ formatWorkMoney(day.overtimeMoney) }}</strong>
          </div>
          <div v-else-if="isExtra" class="work-widget-no-salary"><TrendingUp :size="14" /><span>Seu tempo extra está sendo contado.</span></div>

          <div class="work-widget-timeline">
            <div><span>Entrada</span><strong>{{ entries.startedAt || '—' }}</strong></div>
            <span class="work-widget-divider"></span>
            <div><span><Coffee :size="11" /> Pausas</span><strong>{{ formatWorkDuration(day.lunchSeconds) }}</strong></div>
            <span class="work-widget-divider"></span>
            <div><span>Saída</span><strong>{{ entries.finishedAt || '—' }}</strong></div>
          </div>
        </div>

        <p class="work-widget-cycle">{{ formatWorkDuration(day.cycleOvertimeSeconds) }} extras no ciclo · após 20h: 75% · domingo: 100%</p>
        <footer class="work-widget-footer">
          <button v-if="!day.started" class="work-widget-finish" :disabled="busy || day.stale" @click="emit('action', 'start')"><Play :size="14" /> Iniciar trabalho</button>
          <template v-else-if="!day.finished && !day.stale">
            <button class="work-widget-finish" :disabled="busy" @click="emit('action', day.paused ? 'resume' : 'pause')"><component :is="day.paused ? Play : Pause" :size="14" /> {{ day.paused ? 'Retomar' : 'Pausar' }}</button>
            <button class="work-widget-finish" :disabled="busy" @click="emit('finish')"><LogOut :size="14" /> {{ busy ? 'Registrando...' : 'Finalizar' }}</button>
          </template>
          <button v-else class="work-widget-finish finished" @click="emit('settings')"><Check :size="14" /> Ver registros de hoje</button>
          <button class="work-widget-minimize" aria-label="Recolher widget da jornada" @click="emit('update:expanded', false)">Recolher <ArrowUpRight :size="13" /></button>
        </footer>
      </section>

      <button v-else key="compact" class="work-widget-compact" aria-label="Abrir widget da jornada" title="Clique para abrir ou arraste para mover" @pointerdown="startDragging" @keydown="moveWithKeyboard" @click="emit('update:expanded', true)">
        <GripVertical class="work-widget-compact-grip" :size="13" />
        <span class="work-widget-compact-icon"><Clock3 :size="17" /></span>
        <span><small>SUA JORNADA</small><strong>{{ compactLabel }}</strong></span>
        <ChevronUp :size="15" />
      </button>
    </Transition>
  </div>
</template>

<style scoped>
.work-widget-cycle { padding: 12px 19px 0; color: #92a0b4; font-size: 9px; line-height: 1.7; }
.work-widget-footer { flex-wrap: wrap; }
.work-widget-anchor {
  --widget-accent: #5978ed;
  --widget-soft: #eff3ff;
  position: fixed;
  right: 25px;
  bottom: 22px;
  z-index: 40;
  max-width: calc(100vw - 24px);
}
.work-widget-anchor.is-extra {
  --widget-accent: #a87930;
  --widget-soft: #fcf5e9;
}
.work-widget-anchor.is-dragging,
.work-widget-anchor.is-dragging * {
  cursor: grabbing;
  user-select: none;
}
.work-widget {
  width: min(310px, calc(100vw - 24px));
  max-height: calc(100dvh - 24px);
  overflow-y: auto;
  border: 1px solid #e1e7f2;
  border-radius: 17px;
  background: #fff;
  box-shadow: 0 12px 45px #42578319, 0 2px 7px #42578308;
}
.work-widget-header {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 15px 15px 13px;
  border-bottom: 1px solid #f0f2f7;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.work-widget-drag-handle {
  display: grid;
  place-items: center;
  color: #bcc7d9;
  padding: 3px 0;
  cursor: grab;
}
.work-widget-icon,
.work-widget-compact-icon {
  width: 33px;
  height: 33px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  background: var(--widget-soft);
  color: var(--widget-accent);
  flex-shrink: 0;
}
.work-widget-header > div {
  flex: 1;
}
.work-widget-header strong {
  display: block;
  font-size: 12px;
  font-weight: 650;
  color: #59677f;
}
.work-widget-header > div > span {
  display: block;
  font-size: 9px;
  color: #96a2b6;
  margin-top: 4px;
}
.work-widget-icon-button {
  display: grid;
  place-items: center;
  padding: 4px;
  border-radius: 5px;
  color: #99a5b9;
}
.work-widget-icon-button:hover {
  color: var(--widget-accent);
  background: var(--widget-soft);
}
.work-widget-body {
  padding: 17px 19px 0;
}
.work-widget-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 9px;
  font-weight: 550;
  color: #6f9c89;
}
.work-widget-status i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}
.is-extra .work-widget-status {
  color: var(--widget-accent);
}
.work-widget-caption {
  color: #8795ad;
  font-size: 10px;
  margin-top: 15px;
}
.work-widget-duration {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--widget-accent);
  margin-top: 4px;
}
.work-widget-duration.is-idle strong {
  font-size: 26px;
  letter-spacing: -.8px;
}
.work-widget-duration strong {
  font-size: 33px;
  font-weight: 550;
  letter-spacing: -1.3px;
  font-variant-numeric: tabular-nums;
}
.work-widget-departure {
  font-size: 10px;
  color: #92a0b4;
  line-height: 1.7;
  margin-top: 5px;
}
.work-widget-departure b {
  color: #6e7f9b;
  font-weight: 650;
}
.work-widget-shortfall {
  font-size: 10px;
  color: #a87930;
  margin-top: 4px;
}
.work-widget-progress {
  height: 5px;
  border-radius: 10px;
  overflow: hidden;
  background: #eff2f8;
  margin-top: 18px;
}
.work-widget-progress > span {
  display: block;
  height: 100%;
  background: var(--widget-accent);
  border-radius: inherit;
  transition: width .3s;
}
.work-widget-progress-label {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: #99a5b9;
  margin-top: 7px;
}
.work-widget-money {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 12px;
  margin-top: 15px;
  background: var(--widget-soft);
  border-radius: 9px;
  color: var(--widget-accent);
  font-size: 10px;
}
.work-widget-money small {
  display: block;
  font-size: 8px;
  opacity: .75;
  margin-top: 3px;
}
.work-widget-money strong {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -.5px;
}
.work-widget-no-salary {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--widget-accent);
  font-size: 9px;
  padding: 10px;
  margin-top: 14px;
  border-radius: 7px;
  background: var(--widget-soft);
}
.work-widget-timeline {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  border-top: 1px solid #f0f2f7;
  padding: 14px 0;
  margin-top: 17px;
}
.work-widget-timeline div > span {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 8px;
  color: #a0acc0;
  margin-bottom: 5px;
}
.work-widget-timeline strong {
  display: block;
  font-size: 10px;
  color: #7888a2;
  font-weight: 550;
}
.work-widget-divider {
  width: 1px;
  height: 20px;
  background: #edf0f6;
}
.work-widget-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #fafbfe;
  border-top: 1px solid #edf0f6;
}
.work-widget-finish,
.work-widget-minimize {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--widget-accent);
  font-size: 10px;
  font-weight: 600;
  padding: 3px 0;
}
.work-widget-finish.finished {
  color: #6f9c89;
}
.work-widget-minimize {
  color: #9ba7bb;
  font-size: 9px;
  font-weight: 400;
}
.work-widget-compact {
  display: flex;
  align-items: center;
  gap: 11px;
  border: 1px solid #e1e7f2;
  border-radius: 14px;
  padding: 10px 13px 10px 10px;
  background: #fff;
  box-shadow: 0 7px 26px #42578313;
  text-align: left;
  max-width: calc(100vw - 24px);
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.work-widget-compact small {
  display: block;
  font-size: 7px;
  letter-spacing: 1px;
  color: #9aa6b9;
  margin-bottom: 4px;
}
.work-widget-compact strong {
  display: block;
  font-size: 11px;
  font-weight: 550;
  color: #6b7c97;
}
.work-widget-compact > svg:last-child {
  color: #98a6bf;
  margin-left: 8px;
}
.work-widget-compact-grip {
  color: #bdc8da;
  flex-shrink: 0;
}
.work-widget-enter-active,
.work-widget-leave-active {
  transition: opacity .16s, transform .16s;
}
.work-widget-enter-from,
.work-widget-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
@media (max-width: 600px) {
  .work-widget-anchor {
    right: 12px;
    bottom: 12px;
  }
  .work-widget {
    width: min(310px, calc(100vw - 24px));
    max-height: calc(100dvh - 85px);
    overflow-y: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .work-widget-enter-active,
  .work-widget-leave-active,
  .work-widget-progress > span {
    transition: none;
  }
}
</style>
