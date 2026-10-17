<script setup>
import {
  nextTick,
  onMounted,
  ref,
  watch
} from "vue";
import {
  Clock3,
  LoaderCircle,
  RefreshCw
} from "@lucide/vue";
import AuthScreen from "../auth/AuthScreen.vue";
import {
  auth
} from "../auth/auth";
import DesktopWorkHours from "./DesktopWorkHours.vue";
import {
  desktopCall
} from "./desktopBridge";

const props = defineProps({
  connect: {
    type: Function,
    required: true
  }
});
const nativeError = ref("");
const importing = ref(false);
const importNotice = ref("");
async function importLocalData() {
  importing.value = true;
  nativeError.value = "";
  try {
    if (await desktopCall("desktop_import")) {
      await props.connect();
      importNotice.value = "Dados importados. Entre com o e-mail e a senha que você já usava no Fluxo.";
    }
  } catch (error) {
    nativeError.value = String(error);
  } finally {
    importing.value = false;
  }
}
watch(() => Boolean(auth.user), async (signedIn) => {
  document.body.classList.toggle("desktop-account", !signedIn);
  await nextTick();
  try {
    const preferences = signedIn ? await desktopCall("desktop_preferences") : null;
    await desktopCall("desktop_layout", {
      mode: signedIn ? (preferences?.expanded ? "widget" : "compact") : "account",
      height: signedIn ? (preferences?.expanded ? 210 : 80) : 760
    });
  } catch (error) {
    nativeError.value = String(error);
  }
}, {
  immediate: true
});
onMounted(() => document.body.classList.add("desktop-widget-host"));
</script>

<template>
  <main v-if="auth.loading || auth.error" class="desktop-loading">
    <Clock3 :size="28" />
    <h1>Seu tempo, no seu ritmo.</h1>
    <p>{{ auth.loading ? 'Abrindo seu espaço local…' : auth.error }}</p>
    <LoaderCircle v-if="auth.loading" class="spin" :size="20" />
    <button v-else class="btn primary" @click="props.connect"><RefreshCw :size="15" /> Tentar novamente</button>
  </main>
  <div v-else-if="!auth.user" class="desktop-account-screen">
    <div class="desktop-local-note"><span>Seu espaço é local. A conta e os registros ficam neste computador.</span><button :disabled="importing" @click="importLocalData">{{ importing ? 'Importando…' : 'Trazer dados de outra instalação' }}</button><p v-if="importNotice">{{ importNotice }}</p><small v-else>Para continuar com seu histórico atual, importe a pasta app antes de criar uma conta.</small></div>
    <AuthScreen />
  </div>
  <DesktopWorkHours v-else :key="auth.user.id" />
  <p v-if="nativeError" class="desktop-native-error" role="alert">{{ nativeError }}</p>
</template>

<style>
body.desktop-widget-host {
  background: transparent;
}

body.desktop-widget-host:not(.desktop-account) {
  overflow: hidden;
}

body.desktop-widget-host:not(.desktop-account) #app {
  min-height: 0;
}

.desktop-loading {
  margin: 8px;
  padding: 24px;
  background: #fff;
  border: 1px solid #e1e7f2;
  border-radius: 16px;
  color: #879ac0;
  display: grid;
  justify-items: center;
  gap: 14px;
  text-align: center;
}

.desktop-loading h1 {
  font-size: 18px;
  font-weight: 550;
  color: #718bb9;
}

.desktop-loading p {
  font-size: 12px;
  line-height: 1.7;
}

.desktop-account-screen {
  background: #f5f7ff;
}

.desktop-local-note {
  padding: 10px 20px;
  background: #edf2ff;
  color: #7c90b6;
  text-align: center;
  font-size: 11px;
}

.desktop-local-note button {
  margin-left: 14px;
  padding: 6px 9px;
  border: 1px solid #dce5f8;
  border-radius: 6px;
  color: #6d88c1;
  background: #fff;
  font-size: 10px;
}

.desktop-local-note small,
.desktop-local-note p {
  display: block;
  margin-top: 7px;
  line-height: 1.6;
}

.desktop-native-error {
  margin: 8px;
  padding: 12px;
  font-size: 11px;
  line-height: 1.6;
  color: #ad6575;
  background: #fff5f5;
  border-radius: 8px;
}
</style>
