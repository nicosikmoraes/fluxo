<script setup>
import { computed, onMounted, ref } from "vue";
import { Check, CreditCard, LoaderCircle, RefreshCw, Sparkles } from "@lucide/vue";
import { auth, apiRequest } from "../auth/auth";
import { currentLocale, t } from "../../state/locale";

const data = ref(null);
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const result = new URLSearchParams(window.location.search).get("checkout");
const pro = computed(() => data.value?.plan === "pro");
const canSubscribe = computed(() => !pro.value && (!data.value?.subscription || ['canceled', 'incomplete_expired'].includes(data.value.subscription.status)));
const price = computed(() => new Intl.NumberFormat(currentLocale.value, { style: "currency", currency: "USD" }).format((data.value?.price?.amount ?? 500) / 100));
const pending = computed(() => result === "success" && !pro.value);
const status = computed(() => ({ active: "Ativa", past_due: "Pagamento pendente", unpaid: "Pagamento pendente", incomplete: "Pagamento pendente", canceled: "Cancelada", paused: "Pausada", trialing: "Período de teste" })[data.value?.subscription?.status] || "Gratuito");
const freeFeatures = ["Até 3 projetos", "1 roadmap por projeto", "Registro e histórico de horas"];
const proFeatures = ["Projetos ilimitados", "Roadmaps ilimitados por projeto", "Cálculo de pagamento", "Sem anúncios"];

async function read() {
  if (loading.value) return;
  const userId = auth.user?.id;
  loading.value = true;
  error.value = "";
  try {
    const response = await apiRequest("/billing");
    if (auth.user?.id !== userId) return;
    data.value = response;
    auth.user.billing = { plan: response.plan, entitlements: response.entitlements };
  } catch (failure) {
    error.value = failure.message;
  } finally {
    loading.value = false;
  }
}
async function open(kind) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const response = await apiRequest(`/billing/${kind}`, "POST");
    window.location.assign(response.url);
  } catch (failure) {
    error.value = failure.message;
  } finally {
    busy.value = false;
  }
}
onMounted(read);
</script>

<template>
  <section class="billing-screen">
    <header class="billing-heading"><span><Sparkles :size="16" /> {{ t("PLANOS DO FLUXO") }}</span><h1>{{ t("Mais espaço para suas ideias.") }}</h1><p>{{ t("Comece gratuitamente. Escolha o Pro quando precisar ir além.") }}</p></header>
    <p v-if="error" class="billing-message error" role="alert">{{ error }}</p>
    <p v-if="pending" class="billing-message" role="status">{{ t("Seu pagamento está sendo confirmado. Atualize o plano em instantes.") }}</p>
    <p v-else-if="result === 'cancelled'" class="billing-message">{{ t("Checkout encerrado. Seu plano continua como antes.") }}</p>
    <div class="billing-toolbar"><span>{{ t("Seu plano") }}: <strong>{{ pro ? 'Fluxo Pro' : t('Gratuito') }}</strong><template v-if="data?.subscription"> · {{ t(status) }}</template></span><button class="text-btn" :disabled="loading || busy" @click="read"><RefreshCw :size="14" :class="{ spin: loading }" /> {{ t("Atualizar plano") }}</button></div>
    <div class="billing-plans">
      <article class="billing-plan"><span class="billing-tag">{{ !pro ? t('SEU PLANO ATUAL') : t('PARA COMEÇAR') }}</span><h2>{{ t("Gratuito") }}</h2><p class="billing-price">{{ t("Grátis") }}</p><p>{{ t("Organize seu trabalho no seu ritmo.") }}</p><ul><li v-for="feature in freeFeatures" :key="feature"><Check :size="16" /> {{ t(feature) }}</li></ul><span v-if="data" class="billing-usage">{{ t('{count} de 3 projetos em uso', { count: data.usage.projects }) }}</span></article>
      <article class="billing-plan billing-pro"><span class="billing-tag"><Sparkles :size="13" /> {{ pro ? t('SEU PLANO ATUAL') : 'FLUXO PRO' }}</span><h2>Fluxo Pro</h2><p class="billing-price">{{ price }} <small>{{ t("/ mês") }}</small></p><p>{{ t("Um único plano para acompanhar seu crescimento.") }}</p><ul><li v-for="feature in proFeatures" :key="feature"><Check :size="16" /> {{ t(feature) }}</li></ul>
        <button v-if="canSubscribe" class="btn primary" :disabled="!data?.checkout_available || busy || loading" @click="open('checkout')"><LoaderCircle v-if="busy" :size="16" class="spin" /><Sparkles v-else :size="16" /> {{ t(data?.checkout_available ? 'Assinar Fluxo Pro' : 'Assinaturas em breve') }}</button>
        <button v-if="data?.portal_available" class="btn secondary" :disabled="busy || loading" @click="open('portal')"><CreditCard :size="16" /> {{ t("Gerenciar assinatura") }}</button>
        <p v-if="currentLocale !== 'en-US'" class="billing-note">{{ t("Preço base de US$ 5 por mês. A opção de pagar em reais e o valor final da conversão são apresentados no checkout, quando disponíveis.") }}</p>
        <p class="billing-note">{{ t("Você pode cancelar a renovação pelo portal de cobrança.") }}</p>
      </article>
    </div>
    <p class="billing-footnote">{{ t("Ao voltar ao gratuito, seus dados são preservados. Os limites se aplicam a novas criações e ao cálculo de pagamento.") }}</p>
  </section>
</template>

<style scoped>
.billing-screen { max-width: 960px; margin: 0 auto; padding-bottom: 40px; color: var(--theme-text); }
.billing-heading { margin: 12px 0 28px; }
.billing-heading > span { display: flex; align-items: center; gap: 7px; color: var(--theme-accent); font-size: 10px; letter-spacing: 1.4px; }
h1 { margin: 12px 0; font-size: clamp(25px, 3vw, 36px); font-weight: 550; letter-spacing: -1px; }
.billing-heading p, .billing-plan > p, .billing-footnote { color: var(--theme-text-secondary); font-size: 13px; line-height: 1.8; }
.billing-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 14px; margin-bottom: 18px; font-size: 12px; }
.billing-plans { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }
.billing-plan { display: flex; flex-direction: column; align-items: flex-start; padding: 28px; border: 1px solid var(--theme-line); border-radius: 16px; background: var(--theme-panel); }
.billing-pro { border-color: var(--theme-accent); background: linear-gradient(145deg, var(--theme-accent-soft), var(--theme-panel) 70%); }
.billing-tag { display: inline-flex; align-items: center; gap: 5px; padding: 6px 9px; border-radius: 7px; background: var(--theme-accent-soft); color: var(--theme-accent); font-size: 9px; letter-spacing: .6px; }
h2 { margin: 22px 0 8px; font-size: 22px; font-weight: 550; }
.billing-plan > .billing-price { color: var(--theme-text); font-size: 34px; letter-spacing: -1px; margin-bottom: 8px; line-height: 1.5; }
.billing-price small { font-size: 12px; letter-spacing: 0; color: var(--theme-text-muted); }
ul { list-style: none; padding: 0; margin: 22px 0; display: grid; gap: 14px; font-size: 13px; }
li { display: flex; align-items: center; gap: 9px; } li svg { color: var(--theme-accent); flex-shrink: 0; }
.billing-plan .btn { margin: 5px 0; width: 100%; justify-content: center; }
.billing-plan > .billing-note, .billing-footnote { margin-top: 15px; font-size: 11px; }
.billing-usage { font-size: 11px; color: var(--theme-text-muted); margin-top: auto; }
.billing-message { padding: 15px; border-radius: 9px; background: var(--theme-accent-soft); margin-bottom: 18px; line-height: 1.7; font-size: 12px; }
.billing-message.error { color: var(--theme-danger, #b85663); }
@media (max-width: 640px) { .billing-plans { grid-template-columns: 1fr; } .billing-plan { padding: 23px; } .billing-toolbar { flex-wrap: wrap; } }
</style>
