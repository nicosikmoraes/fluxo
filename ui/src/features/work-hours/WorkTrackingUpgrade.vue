<script setup>
import { Clock3, Sparkles } from "@lucide/vue";
import { t } from "../../state/locale";
defineEmits(["upgrade"]);
</script>

<template>
  <section class="work-tracking-upgrade">
    <span class="work-upgrade-icon" aria-hidden="true"><Clock3 :size="25" /></span>
    <div class="work-upgrade-copy"><span class="work-pro-label"><Sparkles :size="12" /> TEMPOZI PRO</span><h2>{{ t("Acompanhar minha jornada") }}</h2><p>{{ t("Registre entrada e saída, acompanhe suas pausas e consulte seu histórico com o Tempozi Pro.") }}</p></div>
    <button type="button" class="btn primary" @click="$emit('upgrade')">{{ t("Conhecer Tempozi Pro") }} </button>
  </section>
</template>

<style scoped>
.work-tracking-upgrade { display: flex; align-items: center; gap: 20px; padding: 27px; margin: 12px 0 24px; border: 1px solid var(--theme-accent-line, #d1dcfa); border-radius: 16px; background: var(--theme-panel, #fff); }
.work-upgrade-icon { display: grid; place-items: center; width: 56px; height: 56px; flex-shrink: 0; border-radius: 16px; color: var(--theme-accent, #5978ed); background: var(--theme-accent-soft, #edf2ff); }
.work-upgrade-copy { flex: 1; }
.work-pro-label { display: inline-flex; align-items: center; gap: 5px; color: var(--theme-accent, #5978ed); font-size: 9px; letter-spacing: 1px; }
h2 { margin: 8px 0; color: var(--theme-text, #596982); font-size: 18px; font-weight: 550; }
p { max-width: 530px; color: var(--theme-text-secondary, #8795ad); font-size: 12px; line-height: 1.8; }
.btn { flex-shrink: 0; }
@media (max-width: 760px) { .work-tracking-upgrade { flex-wrap: wrap; padding: 22px; gap: 15px; } .work-upgrade-copy { min-width: 160px; } }
</style>
