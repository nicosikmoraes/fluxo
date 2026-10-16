<script setup>
import { LogIn, LogOut, Coffee, Timer } from "@lucide/vue";
import { clock, duration } from "../history";
defineProps({ summary: { type: Object, required: true } });
</script>

<template>
  <section class="averages-card">
    <header><span>SEU RITMO</span><h2>Um retrato da sua rotina.</h2><p>Médias dos {{ summary.complete }} dias com jornada completa.</p></header>
    <div class="average-row"><span class="average-icon"><LogIn :size="17" /></span><div><p>Você costuma chegar às</p><strong>{{ clock(summary.averageArrival) }}</strong></div><span class="average-unit">entrada</span></div>
    <div class="average-row"><span class="average-icon violet"><LogOut :size="17" /></span><div><p>E encerrar o dia às</p><strong>{{ clock(summary.averageDeparture) }}</strong></div><span class="average-unit">saída</span></div>
    <div class="average-row"><span class="average-icon mint"><Coffee :size="17" /></span><div><p>Sua pausa para o almoço</p><strong>{{ summary.averageLunch == null ? '—' : duration(summary.averageLunch) }}</strong></div><span class="average-unit">em média</span></div>
    <div class="average-row"><span class="average-icon peach"><Timer :size="17" /></span><div><p>Tempo trabalhado por dia</p><strong>{{ summary.averageWorked == null ? '—' : duration(summary.averageWorked) }}</strong></div><span class="average-unit">em média</span></div>
    <footer>Os dias em andamento e os registros incompletos ficam fora das médias.</footer>
  </section>
</template>

<style scoped>
.averages-card {
  border: 1px solid #e6ecf6;
  border-radius: 13px;
  background: #fff;
  padding: 24px;
}
header > span {
  font-size: 8px;
  letter-spacing: 1.4px;
  color: #a2b0c8;
}
header h2 {
  margin: 9px 0 7px;
  color: #7389ad;
  font-size: 15px;
  font-weight: 550;
}
header p {
  font-size: 10px;
  color: #9caac0;
  line-height: 1.8;
}
.average-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 0;
  border-bottom: 1px solid #f0f3f8;
}
.average-icon {
  width: 35px;
  height: 35px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: #f1f5ff;
  color: #91a7d7;
  flex-shrink: 0;
}
.violet {
  background: #f5f1fb;
  color: #b09acf;
}
.mint {
  background: #f0f7f3;
  color: #9abaac;
}
.peach {
  background: #fcf4ee;
  color: #c5a58b;
}
.average-row p {
  font-size: 9px;
  color: #9aabc3;
  margin-bottom: 6px;
}
.average-row strong {
  font-size: 21px;
  font-weight: 500;
  letter-spacing: -.6px;
  color: #7e95b9;
  font-variant-numeric: tabular-nums;
}
.average-unit {
  margin-left: auto;
  color: #a9b6cb;
  font-size: 8px;
  white-space: nowrap;
}
footer {
  margin-top: 15px;
  font-size: 9px;
  line-height: 1.9;
  color: #a8b5c9;
}
@media (max-width: 480px) {
  .averages-card {
    padding: 20px;
  }
}
</style>
