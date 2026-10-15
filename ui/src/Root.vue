<script setup>
import { onMounted, ref, watch } from 'vue';
import { LoaderCircle, RefreshCw } from '@lucide/vue';
import App from './App.vue';
import AuthScreen from './components/AuthScreen.vue';
import { auth, restoreSession } from './auth';
import { resetWorkspace } from './workspace';
const resetToken = ref(window.location.pathname.startsWith('/reset-password/') ? window.location.pathname.split('/').pop() : '');
const resetEmail = new URLSearchParams(window.location.search).get('email') || '';
watch(() => auth.user?.id, (id, previous) => { if (id !== previous) resetWorkspace(); }, { flush: 'sync' });
async function connect() { auth.loading = true; await restoreSession().catch(() => {}); }
onMounted(connect);
</script>
<template>
 <div v-if="auth.loading || auth.error" class="auth-loading" role="status">
  <LoaderCircle v-if="auth.loading" :size="28" class="spin" />
  <template v-else><p>{{ auth.error }}</p><button class="btn primary" @click="connect"><RefreshCw :size="16" /> Tentar novamente</button></template>
  <p v-if="auth.loading">Abrindo seu espaço...</p>
 </div>
 <AuthScreen v-else-if="!auth.user || resetToken" :reset-token="resetToken" :reset-email="resetEmail" @reset-finished="resetToken=''" />
 <App v-else :key="auth.user.id" />
</template>
