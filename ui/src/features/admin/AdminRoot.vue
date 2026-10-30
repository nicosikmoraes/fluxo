<script setup>
import { onMounted } from 'vue';
import { ShieldCheck, RefreshCw } from '@lucide/vue';
import { auth, restoreSession } from '../auth/auth';
import AdminPanel from './AdminPanel.vue';
async function connect(){auth.loading=true;await restoreSession().catch(()=>{});}
onMounted(connect);
</script>
<template>
 <AdminPanel v-if="!auth.loading&&!auth.error&&auth.user?.is_admin" :key="auth.user.id"/>
 <main v-else class="admin-access-screen" role="status"><ShieldCheck :size="34"/><h1>{{auth.loading?'Abrindo administração…':auth.error?'Não foi possível conectar':'Acesso restrito'}}</h1><p>{{auth.error||(!auth.loading?'Entre com uma conta administradora para acessar este painel.':'Verificando sua sessão e suas permissões.')}}</p><button v-if="auth.error" class="button primary" @click="connect"><RefreshCw :size="16"/> Tentar novamente</button><a v-if="!auth.loading" class="button" href="/">Voltar ao Fluxo</a></main>
</template>
