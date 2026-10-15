<script setup>
import { computed, reactive, ref } from 'vue';
import { CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck, UserRound } from '@lucide/vue';
import { apiRequest, auth } from '../auth';
const props = defineProps({ resetToken: { type: String, default: '' }, resetEmail: { type: String, default: '' } });
const emit = defineEmits(['reset-finished']);
const mode = ref(props.resetToken ? 'reset' : 'login');
const values = reactive({ name: '', email: props.resetEmail, password: '', password_confirmation: '', remember: false });
const busy = ref(false); const reveal = ref(false); const error = ref(''); const success = ref('');
const fieldErrors = reactive({ name: '', email: '', password: '', password_confirmation: '' });
const title = computed(() => ({ login: 'Que bom ter você de volta', register: 'Crie seu espaço no Fluxo', forgot: 'Vamos recuperar seu acesso', reset: 'Um novo começo' }[mode.value]));
const description = computed(() => ({ login: 'Entre para continuar no seu espaço de trabalho.', register: 'Suas ideias merecem um lugar para acontecer.', forgot: 'Informe seu e-mail para receber um link de recuperação.', reset: 'Escolha uma nova senha para entrar no seu espaço.' }[mode.value]));
const action = computed(() => ({ login: 'Entrar no Fluxo', register: 'Criar minha conta', forgot: 'Enviar instruções', reset: 'Salvar nova senha' }[mode.value]));
function changeMode(next) {
 mode.value = next; error.value = ''; success.value = ''; Object.keys(fieldErrors).forEach((key) => { fieldErrors[key] = ''; }); values.password = ''; values.password_confirmation = ''; reveal.value = false; auth.message = '';
 if (props.resetToken && next !== 'reset') { window.history.replaceState({}, '', '/'); emit('reset-finished'); }
}
function clearFieldError(field) { fieldErrors[field] = ''; error.value = ''; }
function validate() {
 Object.keys(fieldErrors).forEach((key) => { fieldErrors[key] = ''; });
 const email = values.email.trim();
 if (!email) fieldErrors.email = 'Informe seu e-mail.';
 else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = 'Digite um e-mail válido.';
 if (mode.value === 'register' && !values.name.trim()) fieldErrors.name = 'Informe seu nome.';
 if (mode.value !== 'forgot') {
  if (!values.password) fieldErrors.password = mode.value === 'register' ? 'Crie uma senha.' : mode.value === 'reset' ? 'Digite sua nova senha.' : 'Informe sua senha.';
  else if ((mode.value === 'register' || mode.value === 'reset') && values.password.length < 6) fieldErrors.password = 'Use uma senha com pelo menos 6 caracteres.';
  if ((mode.value === 'register' || mode.value === 'reset') && values.password !== values.password_confirmation) fieldErrors.password_confirmation = 'As senhas precisam ser iguais.';
 }
 return !Object.values(fieldErrors).some(Boolean);
}
async function submit() {
 if (busy.value) return;
 error.value = ''; success.value = ''; if (!validate()) return; busy.value = true;
 try {
  if (mode.value === 'forgot') {
   const data = await apiRequest('/auth/forgot-password', 'POST', { email: values.email }); success.value = data.message;
  } else if (mode.value === 'reset') {
   await apiRequest('/auth/reset-password', 'POST', { email: values.email, token: props.resetToken, password: values.password, password_confirmation: values.password_confirmation });
   auth.user = null; changeMode('login'); success.value = 'Senha atualizada. Você já pode entrar com sua nova senha.';
  } else {
   const payload = mode.value === 'register' ? { name: values.name, email: values.email, password: values.password, password_confirmation: values.password_confirmation } : { email: values.email, password: values.password, remember: values.remember };
   const data = await apiRequest('/auth/' + mode.value, 'POST', payload);
   values.password = ''; values.password_confirmation = ''; auth.message = ''; auth.user = data.user;
  }
 } catch (failure) {
  const mapped = failure.errors || {};
  for (const field of Object.keys(fieldErrors)) if (mapped[field]?.length) fieldErrors[field] = mapped[field][0];
  error.value = Object.values(fieldErrors).some(Boolean) ? '' : failure.message;
 }
 finally { busy.value = false; }
}
</script>
<template>
 <main class="auth-page">
  <img class="auth-backdrop" src="/ui/login-banner.png" alt="" fetchpriority="high" />
  <div class="auth-wash"></div>
  <header class="auth-header"><a class="brand" href="/" aria-label="Fluxo, início"><span class="brand-mark"><span></span><span></span><span></span></span><span>fluxo<span class="brand-period">.</span></span></a><span class="auth-header-note">Seu espaço. Seu ritmo.</span></header>
  <div class="auth-layout">
   <section class="auth-story" aria-label="Bem-vindo ao Fluxo"><span class="auth-eyebrow"><i></i> SEU TRABALHO, PASSO A PASSO</span><h1>Retome <br>o seu fluxo<span>.</span></h1><p>Seu dia ganha espaço quando tudo<br class="auth-wide-break"> encontra o seu lugar.</p><div class="auth-story-tag"><CheckCircle2 :size="15" /> Pequenos passos. Grandes conquistas.</div></section>
   <section class="auth-card" :aria-label="title">
    <div class="auth-card-symbol"><LockKeyhole :size="20" /></div>
    <h2>{{ title }}</h2><p class="auth-description">{{ description }}</p>
    <div v-if="mode==='login' || mode==='register'" class="auth-tabs" aria-label="Acesso ao Fluxo"><button type="button" :class="{selected:mode==='login'}" :aria-pressed="mode==='login'" :disabled="busy" @click="changeMode('login')">Entrar</button><button type="button" :class="{selected:mode==='register'}" :aria-pressed="mode==='register'" :disabled="busy" @click="changeMode('register')">Criar conta</button></div>
    <div v-if="auth.message" class="auth-feedback info" role="status">{{ auth.message }}</div>
    <div v-if="error" class="auth-feedback error" role="alert">{{ error }}</div>
    <div v-if="success" class="auth-feedback success" role="status"><CheckCircle2 :size="16" /><span>{{ success }}</span></div>
    <form novalidate @submit.prevent="submit">
     <fieldset :disabled="busy">
      <div v-if="mode==='register'" class="auth-field"><label for="auth-name">Como podemos te chamar?</label><div class="auth-input" :class="{'has-error':fieldErrors.name}"><UserRound :size="17" /><input id="auth-name" v-model="values.name" name="name" autocomplete="name" placeholder="Seu nome" @input="clearFieldError('name')" :aria-invalid="!!fieldErrors.name" aria-describedby="auth-name-error" /></div><p v-if="fieldErrors.name" id="auth-name-error" class="auth-field-error" role="alert">{{ fieldErrors.name }}</p></div>
      <div class="auth-field"><label for="auth-email">E-mail</label><div class="auth-input" :class="{'has-error':fieldErrors.email}"><Mail :size="17" /><input id="auth-email" v-model="values.email" type="email" name="email" autocomplete="email" placeholder="voce@exemplo.com" @input="clearFieldError('email')" :aria-invalid="!!fieldErrors.email" aria-describedby="auth-email-error" /></div><p v-if="fieldErrors.email" id="auth-email-error" class="auth-field-error" role="alert">{{ fieldErrors.email }}</p></div>
      <div v-if="mode!=='forgot'" class="auth-field"><label for="auth-password">{{ mode==='reset'?'Nova senha':'Senha' }}</label><div class="auth-input" :class="{'has-error':fieldErrors.password}"><LockKeyhole :size="17" /><input id="auth-password" v-model="values.password" :type="reveal?'text':'password'" name="password" :autocomplete="mode==='login'?'current-password':'new-password'" :placeholder="mode==='login'?'Sua senha':'Mínimo de 6 caracteres'" @input="clearFieldError('password')" :aria-invalid="!!fieldErrors.password" aria-describedby="auth-password-error" /><button type="button" class="auth-reveal" :aria-label="reveal?'Ocultar senha':'Mostrar senha'" :aria-pressed="reveal" @click="reveal=!reveal"><EyeOff v-if="reveal" :size="17" /><Eye v-else :size="17" /></button></div><p v-if="fieldErrors.password" id="auth-password-error" class="auth-field-error" role="alert">{{ fieldErrors.password }}</p></div>
      <div v-if="mode==='register' || mode==='reset'" class="auth-field"><label for="auth-confirm">Confirmar senha</label><div class="auth-input" :class="{'has-error':fieldErrors.password_confirmation}"><LockKeyhole :size="17" /><input id="auth-confirm" v-model="values.password_confirmation" type="password" name="password_confirmation" autocomplete="new-password" placeholder="Digite a senha novamente" @input="clearFieldError('password_confirmation')" :aria-invalid="!!fieldErrors.password_confirmation" aria-describedby="auth-confirm-error" /></div><p v-if="fieldErrors.password_confirmation" id="auth-confirm-error" class="auth-field-error" role="alert">{{ fieldErrors.password_confirmation }}</p></div>
      <div v-if="mode==='login'" class="auth-options"><label><input v-model="values.remember" type="checkbox" name="remember" /> Manter conectado</label><button type="button" @click="changeMode('forgot')">Esqueci minha senha</button></div>
      <button type="submit" class="auth-submit"><LoaderCircle v-if="busy" :size="17" class="spin" /><span>{{ busy?'Só um instante...':action }}</span></button>
     </fieldset>
    </form>
    <p v-if="mode==='login' || mode==='register'" class="auth-switch">{{ mode==='login'?'Primeira vez por aqui?':'Já tem uma conta?' }} <button type="button" :disabled="busy" @click="changeMode(mode==='login'?'register':'login')">{{ mode==='login'?'Crie sua conta':'Entrar' }}</button></p>
    <button v-else class="auth-back" type="button" :disabled="busy" @click="changeMode('login')">Voltar para entrar</button>
    <div class="auth-trust"><ShieldCheck :size="14" /><span>Um espaço só seu, para cada ideia.</span></div>
   </section>
  </div>
  <footer class="auth-footer"><span>Feito para o seu ritmo.</span><span>fluxo. © {{ new Date().getFullYear() }}</span></footer>
 </main>
</template>
