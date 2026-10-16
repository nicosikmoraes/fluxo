<script setup>
import { Clock3, TrendingUp, Wallet, CircleCheck } from "@lucide/vue";
import { duration, money } from "../history";
defineProps({ summary: { type: Object, required: true } });
</script>

<template>
  <section class="history-summary" aria-label="Resumo do período">
    <article class="summary-card"><span class="summary-icon blue"><Clock3 :size="18" /></span><p>Horas trabalhadas</p><strong>{{ duration(summary.worked) }}</strong><small>{{ summary.days }} dias com registro <span>· inclui parciais</span></small></article>
    <article class="summary-card"><span class="summary-icon violet"><TrendingUp :size="18" /></span><p>Horas extras</p><strong>{{ duration(summary.overtime) }}</strong><small>Distribuídas em {{ summary.extraDays }} dias</small></article>
    <article class="summary-card"><span class="summary-icon mint"><Wallet :size="18" /></span><p>Valor estimado das extras</p><strong>{{ money(summary.estimated) }}</strong><small>{{ summary.unvaluedDays ? `${summary.unvaluedDays} dia(s) com extras sem salário registrado` : 'Valor bruto, conforme a jornada de cada dia' }}</small></article>
    <article class="summary-card received"><span class="summary-icon mint"><CircleCheck :size="18" /></span><p>Recebido pelas extras</p><strong>{{ money(summary.received) }}</strong><small>Recebimentos dos dias deste período</small></article>
  </section>
</template>

<style scoped>
.history-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}
.summary-card {
  position: relative;
  background: #fff;
  border: 1px solid #e6ecf6;
  border-radius: 13px;
  padding: 23px 20px 20px;
  min-width: 0;
}
.summary-card.received {
  background:
    linear-gradient(
      130deg,
      #f5faf7,
      #fff);
  border-color: #deece4;
}
.summary-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  margin-bottom: 19px;
}
.blue {
  background: #edf2ff;
  color: #8099dc;
}
.violet {
  background: #f2eefb;
  color: #ad98cd;
}
.mint {
  background: #edf6f1;
  color: #86ad98;
}
.summary-card p {
  font-size: 11px;
  color: #8a9bb6;
}
.summary-card strong {
  display: block;
  font-size: clamp(20px, 2vw, 29px);
  letter-spacing: -.8px;
  font-weight: 550;
  color: #657ea8;
  margin: 10px 0;
  white-space: nowrap;
}
.received strong {
  color: #7a9d89;
}
.summary-card small {
  font-size: 9px;
  line-height: 1.8;
  color: #9fadc3;
}
.summary-card small span {
  white-space: nowrap;
}
@media (max-width: 1120px) {
  .history-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 480px) {
  .history-summary {
    gap: 10px;
  }
  .summary-card {
    padding: 17px 13px;
  }
  .summary-card strong {
    font-size: 22px;
  }
  .summary-card p {
    font-size: 10px;
  }
  .summary-card small {
    font-size: 8px;
  }
}
</style>
