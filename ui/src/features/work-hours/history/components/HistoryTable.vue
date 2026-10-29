<script setup>
import { computed, ref, watch } from "vue";
import { ChevronLeft, ChevronRight, ArrowUpRight, ListFilter, CalendarDays } from "@lucide/vue";
import { dateLabel, duration, money } from "../history";
import { currentLocale, t } from "../../../../state/locale";
const props = defineProps({ canCalculatePay: { type: Boolean, default: true }, records: { type: Array, required: true } });
const emit = defineEmits(["select"]);
const filter = ref("all");
const page = ref(1);
const pageSize = 7;
const englishMode = computed(() => currentLocale.value === "en-US");
const filters = computed(() => englishMode.value ? [{ id: "all", label: "All days" }, { id: "pending", label: "Incomplete" }] : [{ id: "all", label: t("Todos os dias") }, { id: "extra", label: t("Com hora extra") }, { id: "pending", label: t("Incompletos") }]);
const filtered = computed(() => props.records.filter((record) => filter.value === "all" || (filter.value === "extra" ? record.overtime > 0 : record.status === "pending")).toSorted((a, b) => b.date.localeCompare(a.date)));
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)));
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize));
watch(englishMode, () => { filter.value = "all"; page.value = 1; });
watch([() => props.records.map((record) => record.date).join(","), filter], () => { page.value = 1; });
</script>

<template>
  <section class="history-table-card">
    <header><div><span>{{ englishMode ? 'YOUR HISTORY' : t('SEU HISTÓRICO') }}</span><h2>{{ englishMode ? 'Every day tells a story.' : t('Cada dia tem a sua história.') }}</h2><p>{{ englishMode ? 'Review your work hours and estimated pay.' : t('Confira seus horários e acompanhe o que já foi recebido.') }}</p></div><span class="history-table-count">{{ records.length }} {{ englishMode ? 'days' : t('dias') }}</span></header>
    <div class="history-table-filters"><ListFilter :size="14" /><button v-for="item in filters" :key="item.id" :class="{ active: filter === item.id }" :aria-pressed="filter === item.id" @click="filter = item.id">{{ item.label }}</button></div>
    <div v-if="!filtered.length" class="history-table-empty"><CalendarDays :size="28" /><strong>{{ englishMode ? 'No records here yet.' : t('Nenhum registro por aqui.') }}</strong><p>{{ englishMode ? 'Choose a different period or filter.' : t('Escolha outro período ou ajuste o filtro para explorar seus dias.') }}</p></div>
    <div v-else class="history-table-scroll"><table><caption class="history-visually-hidden">{{ englishMode ? 'Daily work records for the selected period' : t('Registros diários de jornada no período selecionado') }}</caption><thead><tr><th scope="col">{{ englishMode ? 'Day' : t('Dia') }}</th><th scope="col">{{ englishMode ? 'Start' : t('Entrada') }}</th><th scope="col">{{ englishMode ? 'Breaks' : t('Pausas') }}</th><th scope="col">{{ englishMode ? 'Finish' : t('Saída') }}</th><th scope="col">{{ englishMode ? 'Hours worked' : t('Trabalhadas') }}</th><th v-if="!englishMode" scope="col">{{ t("Horas extras") }}</th><th v-if="englishMode && canCalculatePay" scope="col">Pay earned</th><th v-if="!englishMode && canCalculatePay" scope="col">{{ t("Valor das extras") }}</th><th scope="col"><span class="history-visually-hidden">{{ englishMode ? 'Details' : t('Detalhes') }}</span></th></tr></thead><tbody><tr v-for="record in visible" :key="record.date"><td><button class="history-date-button" @click="emit('select', record.date)"><strong>{{ dateLabel(record.date) }}</strong><span>{{ dateLabel(record.date, { weekday: 'long', day: undefined, month: undefined }) }}</span></button></td><td>{{ record.startedAt }}</td><td><span>{{ record.lunchOut || "—" }} <span class="history-range-arrow">→</span> {{ record.lunchIn || "—" }}</span><small v-if="record.lunch != null">{{ duration(record.lunch) }} {{ englishMode ? 'break' : t('de pausa') }}{{ (record.breaks || []).length > 1 ? ' · ' + record.breaks.length + (englishMode ? ' breaks' : t(' pausas')) : '' }}</small></td><td><template v-if="record.finishedAt">{{ record.finishedAt }}</template><span v-else class="day-status" :class="record.status">{{ record.status === 'ongoing' ? (englishMode ? 'In progress' : t('Em andamento')) : (englishMode ? 'Not entered' : t('Não informada')) }}</span></td><td><strong class="history-worked">{{ duration(record.worked) }}</strong><small v-if="record.status !== 'complete'">{{ englishMode ? 'Partial' : t('Parcial') }}</small></td><td v-if="!englishMode"><span v-if="record.overtime" class="history-extra">+{{ duration(record.overtime) }}</span><span v-else class="history-dash">—</span></td><td v-if="englishMode && canCalculatePay"><strong class="history-money">{{ record.hourlyEarnings == null ? '—' : money(record.hourlyEarnings) }}</strong></td><td v-if="!englishMode && canCalculatePay"><template v-if="record.overtime || record.receivedOn"><strong class="history-money">{{ record.estimated == null ? t("Sem estimativa") : money(record.estimated) }}</strong><small class="history-payment" :class="{ paid: record.receivedOn }">{{ record.receivedOn ? t('{amount} recebido', { amount: money(record.received) }) : t('Estimado · não recebido') }}</small></template><span v-else class="history-dash">—</span></td><td><button class="history-detail-button" :aria-label="(englishMode ? 'View details for ' : t('Ver detalhes de ')) + dateLabel(record.date)" @click="emit('select', record.date)"><ArrowUpRight :size="15" /></button></td></tr></tbody></table></div>
    <footer><span>{{ filtered.length ? t('{first}–{last} de {total} dias', { first: (page - 1) * pageSize + 1, last: Math.min(page * pageSize, filtered.length), total: filtered.length }) : t('0 dias') }}</span><div><button :disabled="page <= 1" :aria-label="t('Página anterior')" @click="page--"><ChevronLeft :size="15" /></button><span>{{ page }} / {{ totalPages }}</span><button :disabled="page >= totalPages" :aria-label="t('Próxima página')" @click="page++"><ChevronRight :size="15" /></button></div></footer>
  </section>
</template>

<style scoped>
.history-table-card {
  background: var(--theme-panel, #fff);
  border: 1px solid var(--theme-line, #e6ecf6);
  border-radius: 13px;
  overflow: hidden;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 25px 25px 20px;
}
header > div > span {
  color: var(--theme-text-muted, #a2b0c8);
  font-size: 8px;
  letter-spacing: 1.4px;
}
header h2 {
  font-size: 16px;
  font-weight: 550;
  color: var(--theme-text-secondary, #7389ad);
  margin: 9px 0 7px;
}
header p {
  color: var(--theme-text-muted, #9caac0);
  font-size: 10px;
  line-height: 1.8;
}
.history-table-count {
  font-size: 9px;
  background: var(--theme-surface-muted, #f2f5fc);
  border: 1px solid var(--theme-line, #e9eef8);
  color: var(--theme-text-muted, #9baecc);
  padding: 7px 10px;
  border-radius: 7px;
  white-space: nowrap;
}
.history-table-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 0 25px 19px;
  color: var(--theme-text-muted, #a3b2cb);
}
.history-table-filters > svg {
  margin-right: 6px;
}
.history-table-filters button {
  border: 1px solid transparent;
  border-radius: 7px;
  padding: 7px 10px;
  font-size: 9px;
  color: var(--theme-text-muted, #9caac0);
}
.history-table-filters button.active {
  background: var(--theme-accent-soft, #f0f4fe);
  color: var(--theme-accent, #859ed4);
  border-color: var(--theme-accent-line, #e3ebfc);
}
.history-table-scroll {
  overflow-x: auto;
  position: relative;
}
table {
  border-collapse: collapse;
  width: 100%;
  min-width: 850px;
  text-align: left;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
thead {
  background: var(--theme-panel, #fafbfe);
}
th {
  font-size: 8px;
  color: var(--theme-text-muted, #a3b1c7);
  font-weight: 500;
  padding: 13px 12px;
  border-block: 1px solid var(--theme-line, #edf1f8);
  white-space: nowrap;
}
th:first-child,
td:first-child {
  padding-left: 25px;
}
td {
  padding: 16px 12px;
  color: var(--theme-text-muted, #8b9fbf);
  border-bottom: 1px solid var(--theme-line, #f0f3f8);
  white-space: nowrap;
}
tr:last-child td {
  border-bottom: 0;
}
tbody tr:hover {
  background: var(--theme-panel, #fcfdff);
}
td small {
  display: block;
  font-size: 8px;
  color: var(--theme-text-muted, #a9b6cb);
  margin-top: 6px;
}
.history-date-button {
  padding: 0;
  text-align: left;
}
.history-date-button strong {
  color: var(--theme-text-secondary, #8299be);
  font-size: 11px;
  font-weight: 550;
}
.history-date-button span {
  display: block;
  font-size: 8px;
  color: var(--theme-text-muted, #a5b4cc);
  margin-top: 6px;
}
.history-range-arrow {
  font-size: 9px;
  color: var(--theme-text-muted, #bec9dc);
  margin: 0 2px;
}
.history-worked {
  color: var(--theme-text-secondary, #7a91b5);
  font-weight: 500;
}
.history-extra {
  background: var(--theme-accent-soft, #f5f1fb);
  color: var(--theme-text-muted, #ad94ca);
  border-radius: 5px;
  padding: 5px 6px;
  font-size: 9px;
}
.history-money {
  color: var(--theme-success, #87a696);
  font-size: 10px;
  font-weight: 500;
}
.history-payment.paid {
  color: var(--theme-success, #8fb39e);
}
.history-dash {
  color: var(--theme-text-muted, #c3cddd);
}
.day-status {
  font-size: 8px;
  padding: 5px 7px;
  border-radius: 5px;
}
.ongoing {
  background: var(--theme-surface-muted, #eff4ff);
  color: var(--theme-text-muted, #90a5d2);
}
.pending {
  background: var(--theme-warning-soft, #fcf5e9);
  color: var(--theme-warning, #bea274);
}
.history-detail-button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  color: var(--theme-text-muted, #afbed6);
  border-radius: 7px;
}
.history-detail-button:hover {
  background: var(--theme-accent-soft, #edf3ff);
  color: var(--theme-text-muted, #819ed9);
}
footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 25px;
  border-top: 1px solid var(--theme-line, #edf1f8);
  font-size: 9px;
  color: var(--theme-text-muted, #a5b3c9);
}
footer div {
  display: flex;
  gap: 12px;
  align-items: center;
}
footer button {
  display: grid;
  place-items: center;
  border: 1px solid var(--theme-line, #e7edf7);
  border-radius: 6px;
  width: 26px;
  height: 26px;
}
.history-table-empty {
  padding: 45px 20px;
  text-align: center;
  color: var(--theme-text-muted, #a3b6d5);
  display: grid;
  justify-items: center;
  gap: 12px;
}
.history-table-empty strong {
  font-size: 13px;
  font-weight: 500;
}
.history-table-empty p {
  font-size: 10px;
  line-height: 1.8;
}
.history-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (max-width: 600px) {
  header {
    padding: 20px 16px;
  }
  .history-table-filters {
    padding-inline: 16px;
  }
  footer {
    padding-inline: 16px;
  }
}
</style>
