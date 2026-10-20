<script setup>
import { computed, ref, watch } from "vue";
import { BarChart3 } from "@lucide/vue";
import { dateLabel, duration } from "../history";
const props = defineProps({ records: { type: Array, required: true } });
const emit = defineEmits(["select"]);
const grouping = ref("day");
const hovered = ref(null);
const dailyTarget = computed(() => {
  const targets = [...new Set(props.records.map((record) => record.target))];
  return targets.length === 1 && targets[0] > 0 ? targets[0] : null;
});
watch(() => props.records, () => {
  if (hovered.value && grouping.value === "day") hovered.value = buckets.value.find((bucket) => bucket.date === hovered.value.date) || null;
});
watch(grouping, () => { hovered.value = null; });
const buckets = computed(() => {
  if (grouping.value === "day") return props.records.map((record) => ({ ...record, label: record.date.slice(8), description: dateLabel(record.date), count: 1 }));
  const weeks = new Map();
  for (const record of props.records) {
    const stamp = new Date(`${record.date}T12:00:00Z`);
    stamp.setUTCDate(stamp.getUTCDate() - (stamp.getUTCDay() + 6) % 7);
    const key = stamp.toISOString().slice(0, 10);
    const week = weeks.get(key) || { date: key, label: dateLabel(key), description: `Semana de ${dateLabel(key)}`, worked: 0, overtime: 0, count: 0 };
    week.worked += record.worked;
    week.overtime += record.overtime;
    week.count++;
    weeks.set(key, week);
  }
  return [...weeks.values()];
});
const ceiling = computed(() => Math.max(grouping.value === "day" ? 720 : 3000, Math.ceil(Math.max(dailyTarget.value || 0, ...buckets.value.map((bucket) => bucket.worked)) / 120) * 120));
const ticks = computed(() => [0, 1, 2, 3].map((index) => ({ value: index * ceiling.value / 3, percent: index / 3 * 100 })));
</script>

<template>
  <section class="chart-card">
    <header><div><span class="chart-eyebrow">SEU TEMPO EM PERSPECTIVA</span><h2>Como os seus dias se distribuem.</h2></div><div class="chart-toggle" aria-label="Agrupamento do gráfico"><button :class="{ active: grouping === 'day' }" :aria-pressed="grouping === 'day'" @click="grouping = 'day'">Por dia</button><button :class="{ active: grouping === 'week' }" :aria-pressed="grouping === 'week'" @click="grouping = 'week'">Por semana</button></div></header>
    <div class="chart-legend"><span><i></i>Jornada regular</span><span><i class="extra"></i>Horas extras</span><span v-if="grouping === 'day' && dailyTarget != null" class="chart-target-legend"><i class="target"></i>Meta de {{ duration(dailyTarget) }}</span></div>
    <div v-if="!records.length" class="chart-empty"><BarChart3 :size="30" /><p>Seu próximo registro começa este gráfico.</p></div>
    <template v-else>
      <div class="chart-tooltip" aria-live="polite"><template v-if="hovered"><b>{{ hovered.description }}</b><span>{{ duration(hovered.worked) }} trabalhadas</span><span v-if="hovered.overtime">+{{ duration(hovered.overtime) }} extras</span></template><span v-else>Passe sobre as barras para explorar{{ grouping === 'day' ? ' ou clique para ver o dia' : '' }}.</span></div>
      <div class="chart-scroll"><div class="chart-plot" :style="{ minWidth: Math.max(350, buckets.length * 30) + 'px' }">
        <div v-for="tick in ticks" :key="tick.percent" class="chart-gridline" :style="{ bottom: tick.percent + '%' }"><span>{{ Math.round(tick.value / 60) }}h</span></div>
        <div v-if="grouping === 'day' && dailyTarget != null" class="chart-goal" :style="{ bottom: dailyTarget / ceiling * 100 + '%' }"><span>{{ duration(dailyTarget) }}</span></div>
        <div class="chart-bars"><div v-for="bucket in buckets" :key="bucket.date" class="chart-column"><button class="chart-bar" :class="{ 'chart-bar-hover': hovered?.date === bucket.date }" :style="{ height: bucket.worked / ceiling * 100 + '%' }" :aria-label="`${bucket.description}: ${duration(bucket.worked)} trabalhadas, ${duration(bucket.overtime)} extras${grouping === 'day' ? '. Abrir detalhes' : ''}`" @mouseenter="hovered = bucket" @mouseleave="hovered = null" @focus="hovered = bucket" @blur="hovered = null" @click="grouping === 'day' && emit('select', bucket.date)"><span class="chart-extra-bar" :style="{ height: bucket.worked ? bucket.overtime / bucket.worked * 100 + '%' : 0 }"></span></button><span class="chart-day-label">{{ bucket.label }}</span></div></div>
      </div></div>
      <footer><span><BarChart3 :size="14" />{{ records.length }} dias registrados no período</span><span>As horas do dia em andamento são parciais.</span></footer>
    </template>
  </section>
</template>

<style scoped>
.chart-card {
  background: var(--theme-panel, #fff);
  border: 1px solid var(--theme-line, #e6ecf6);
  border-radius: 13px;
  padding: 24px;
  min-width: 0;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 14px;
}
.chart-eyebrow {
  font-size: 8px;
  letter-spacing: 1.3px;
  color: var(--theme-text-muted, #a2b0c8);
}
h2 {
  font-size: 15px;
  color: var(--theme-text-secondary, #7389ad);
  font-weight: 550;
  margin-top: 9px;
  line-height: 1.6;
}
.chart-toggle {
  display: flex;
  background: var(--theme-surface-muted, #f4f7fc);
  border: 1px solid var(--theme-line, #e9eef7);
  border-radius: 7px;
  padding: 3px;
  flex-shrink: 0;
}
.chart-toggle button {
  font-size: 9px;
  padding: 7px 9px;
  border-radius: 5px;
  color: var(--theme-text-muted, #9aaac5);
}
.chart-toggle button.active {
  color: var(--theme-accent, #819bd1);
  background: var(--theme-accent-soft, #fff);
  box-shadow: 0 1px 5px var(--theme-shadow-soft, #5e79b012);
}
.chart-legend {
  display: flex;
  gap: 17px;
  flex-wrap: wrap;
  margin: 24px 0 0;
  color: var(--theme-text-muted, #99a9c0);
  font-size: 9px;
}
.chart-legend span {
  display: flex;
  align-items: center;
  gap: 6px;
}
.chart-legend i {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: var(--theme-accent-soft, #bdcdef);
}
.chart-legend i.extra {
  background: var(--theme-accent, #bba6d7);
}
.chart-legend i.target {
  width: 14px;
  height: 0;
  border-top: 1px dashed var(--theme-line-strong, #aab9d9);
}
.chart-target-legend {
  margin-left: auto;
}
.chart-tooltip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 9px;
  min-height: 57px;
  font-size: 9px;
  color: var(--theme-text-muted, #9aaac3);
}
.chart-tooltip b {
  font-weight: 550;
  color: var(--theme-text-secondary, #7892be);
}
.chart-scroll {
  overflow-x: auto;
  padding: 0 3px 30px 29px;
}
.chart-plot {
  height: 235px;
  position: relative;
  margin-top: 12px;
}
.chart-gridline {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px solid var(--theme-line, #f0f3f8);
}
.chart-gridline > span {
  position: absolute;
  left: -29px;
  top: -6px;
  font-size: 8px;
  color: var(--theme-text-muted, #b1bdd0);
}
.chart-goal {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px dashed var(--theme-line-strong, #aebfdf);
  z-index: 2;
  pointer-events: none;
}
.chart-goal span {
  font-size: 7px;
  color: var(--theme-text-muted, #9cafcf);
  position: absolute;
  top: -12px;
  right: 0;
  background: var(--theme-panel, #ffffffdc);
}
.chart-bars {
  height: 100%;
  display: flex;
  align-items: end;
  justify-content: space-around;
  gap: 8px;
  padding: 0 8px;
}
.chart-column {
  flex: 1;
  display: flex;
  justify-content: end;
  align-items: center;
  flex-direction: column;
  position: relative;
  height: 100%;
  min-width: 15px;
}
.chart-bar {
  display: flex;
  flex-direction: column;
  padding: 0;
  position: relative;
  width: 100%;
  max-width: 33px;
  min-height: 2px;
  background: var(--theme-accent-soft, #bdcdef);
  border-radius: 5px 5px 0 0;
  overflow: hidden;
}
.chart-bar:hover,
.chart-bar-hover {
  background: var(--theme-accent, #9fb7e6);
}
.chart-extra-bar {
  width: 100%;
  background: var(--theme-accent, #bba6d7);
  flex-shrink: 0;
}
.chart-day-label {
  position: absolute;
  top: calc(100% + 12px);
  color: var(--theme-text-muted, #a0afc5);
  font-size: 8px;
  white-space: nowrap;
}
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid var(--theme-line, #f0f3f8);
  margin-top: 20px;
  padding-top: 17px;
  font-size: 8px;
  color: var(--theme-text-muted, #a5b3c9);
  line-height: 1.8;
}
footer span:first-child {
  display: flex;
  align-items: center;
  gap: 6px;
}
.chart-empty {
  min-height: 350px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
  justify-content: center;
  color: var(--theme-text-muted, #a8b9d7);
  font-size: 11px;
}
@media (max-width: 600px) {
  .chart-card {
    padding: 20px 16px;
  }
  header {
    flex-direction: column;
  }
  .chart-legend {
    gap: 12px;
  }
  .chart-target-legend {
    margin-left: 0;
  }
  footer {
    flex-wrap: wrap;
  }
}
</style>
