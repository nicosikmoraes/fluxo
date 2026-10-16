<script setup>
import { computed, reactive, ref } from "vue";
import { CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck, UserRound } from "@lucide/vue";
import { apiRequest, auth } from "./auth";
const props = defineProps({ resetToken: { type: String, default: "" }, resetEmail: { type: String, default: "" } });
const emit = defineEmits(["reset-finished"]);
const mode = ref(props.resetToken ? "reset" : "login");
const values = reactive({ name: "", email: props.resetEmail, password: "", password_confirmation: "", remember: false });
const busy = ref(false);
const reveal = ref(false);
const error = ref("");
const success = ref("");
const fieldErrors = reactive({ name: "", email: "", password: "", password_confirmation: "" });
const title = computed(() => ({ login: "Que bom ter você de volta", register: "Crie seu espaço no Fluxo", forgot: "Vamos recuperar seu acesso", reset: "Um novo começo" })[mode.value]);
const description = computed(() => ({ login: "Entre para continuar no seu espaço de trabalho.", register: "Suas ideias merecem um lugar para acontecer.", forgot: "Informe seu e-mail para receber um link de recuperação.", reset: "Escolha uma nova senha para entrar no seu espaço." })[mode.value]);
const action = computed(() => ({ login: "Entrar no Fluxo", register: "Criar minha conta", forgot: "Enviar instruções", reset: "Salvar nova senha" })[mode.value]);
function changeMode(next) {
  mode.value = next;
  error.value = "";
  success.value = "";
  Object.keys(fieldErrors).forEach((key) => {
    fieldErrors[key] = "";
  });
  values.password = "";
  values.password_confirmation = "";
  reveal.value = false;
  auth.message = "";
  if (props.resetToken && next !== "reset") {
    window.history.replaceState({}, "", "/");
    emit("reset-finished");
  }
}
function clearFieldError(field) {
  fieldErrors[field] = "";
  error.value = "";
}
function validate() {
  Object.keys(fieldErrors).forEach((key) => {
    fieldErrors[key] = "";
  });
  const email = values.email.trim();
  if (!email) fieldErrors.email = "Informe seu e-mail.";
  else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = "Digite um e-mail válido.";
  if (mode.value === "register" && !values.name.trim()) fieldErrors.name = "Informe seu nome.";
  if (mode.value !== "forgot") {
    if (!values.password) fieldErrors.password = mode.value === "register" ? "Crie uma senha." : mode.value === "reset" ? "Digite sua nova senha." : "Informe sua senha.";
    else if ((mode.value === "register" || mode.value === "reset") && values.password.length < 6) fieldErrors.password = "Use uma senha com pelo menos 6 caracteres.";
    if ((mode.value === "register" || mode.value === "reset") && values.password !== values.password_confirmation) fieldErrors.password_confirmation = "As senhas precisam ser iguais.";
  }
  return !Object.values(fieldErrors).some(Boolean);
}
async function submit() {
  if (busy.value) return;
  error.value = "";
  success.value = "";
  if (!validate()) return;
  busy.value = true;
  try {
    if (mode.value === "forgot") {
      const data = await apiRequest("/auth/forgot-password", "POST", { email: values.email });
      success.value = data.message;
    } else if (mode.value === "reset") {
      await apiRequest("/auth/reset-password", "POST", { email: values.email, token: props.resetToken, password: values.password, password_confirmation: values.password_confirmation });
      auth.user = null;
      changeMode("login");
      success.value = "Senha atualizada. Você já pode entrar com sua nova senha.";
    } else {
      const payload = mode.value === "register" ? { name: values.name, email: values.email, password: values.password, password_confirmation: values.password_confirmation } : { email: values.email, password: values.password, remember: values.remember };
      const data = await apiRequest("/auth/" + mode.value, "POST", payload);
      values.password = "";
      values.password_confirmation = "";
      auth.message = "";
      auth.user = data.user;
    }
  } catch (failure) {
    const mapped = failure.errors || {};
    for (const field of Object.keys(fieldErrors)) if (mapped[field]?.length) fieldErrors[field] = mapped[field][0];
    error.value = Object.values(fieldErrors).some(Boolean) ? "" : failure.message;
  } finally {
    busy.value = false;
  }
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

<style>
.auth-page {
  min-height: 100svh;
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #edf3fb;
}
.auth-backdrop,
.auth-wash {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: -2;
}
.auth-backdrop {
  object-fit: cover;
  object-position: center 52%;
  animation: auth-scene 1.1s ease both;
}
.auth-wash {
  z-index: -1;
  background:
    linear-gradient(
      90deg,
      #edf5ff95 0%,
      #edf5ff20 55%,
      #27385419 100%);
}
.auth-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32px clamp(24px, 5vw, 80px);
}
.auth-header .brand {
  padding: 0;
  font-size: 30px;
}
.auth-header-note {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .03em;
  color: #5b6f91;
  background: #ffffffad;
  padding: 10px 16px;
  border: 1px solid #fff9;
  border-radius: 99px;
  backdrop-filter: blur(10px);
}
.auth-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr minmax(350px, 440px);
  align-items: center;
  gap: 50px;
  max-width: 1420px;
  width: 100%;
  margin: auto;
  padding: 28px clamp(24px, 6vw, 96px) 48px;
}
.auth-story {
  padding-bottom: 25px;
  animation: auth-rise .6s ease both;
  max-width: 500px;
  color: #34445e;
  text-shadow: 0 1px 20px #ffffff80;
}
.auth-eyebrow {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: .16em;
  color: #5e749b;
}
.auth-eyebrow i {
  width: 22px;
  height: 1px;
  background: #849bc6;
}
.auth-story h1 {
  font-size: clamp(48px, 5.8vw, 78px);
  line-height: 1.02;
  letter-spacing: -3px;
  font-weight: 750;
  margin: 26px 0 21px;
}
.auth-story h1 > span {
  color: #5978ed;
}
.auth-story > p {
  font-size: 16px;
  line-height: 1.75;
  color: #5a6e89;
  max-width: 350px;
}
.auth-story-tag {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 44px;
  color: #52698e;
  font-size: 11px;
  font-weight: 550;
}
.auth-story-tag svg {
  color: #6781ae;
}
.auth-card {
  background: #fffffff0;
  border: 1px solid #ffffffdd;
  border-radius: 22px;
  padding: 35px 38px 26px;
  box-shadow: 0 28px 90px #263a6430, 0 2px 8px #fff5;
  backdrop-filter: blur(18px);
  width: 100%;
  animation: auth-rise .65s .08s ease both;
}
.auth-card-symbol {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  background: #eef2ff;
  color: #6e86df;
  border: 1px solid #e5ebff;
  border-radius: 13px;
  margin-bottom: 23px;
  box-shadow: 0 4px 12px #5978ed08;
}
.auth-card h2 {
  font-size: 25px;
  letter-spacing: -.8px;
  line-height: 1.2;
  font-weight: 700;
  color: #303b52;
  margin: 0 0 10px;
}
.auth-description {
  font-size: 12px;
  line-height: 1.7;
  color: #7e8a9f;
  margin-bottom: 24px;
}
.auth-tabs {
  display: flex;
  padding: 4px;
  border: 1px solid #e9edf4;
  border-radius: 10px;
  background: #f5f7fb;
  margin: 0 0 23px;
  gap: 4px;
}
.auth-tabs button {
  flex: 1;
  border: 0;
  border-radius: 7px;
  padding: 10px 8px;
  color: #7c879a;
  font-size: 12px;
  font-weight: 600;
}
.auth-tabs button.selected {
  color: #506bd6;
  background: #fff;
  box-shadow: 0 2px 8px #35466a10;
}
.auth-card fieldset {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
}
.auth-field {
  margin-bottom: 17px;
}
.auth-field > label {
  display: block;
  font-size: 11px;
  font-weight: 650;
  color: #556178;
  margin-bottom: 8px;
}
.auth-input {
  height: 47px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid #e1e7f0;
  background: #fff;
  border-radius: 9px;
  transition: border-color .2s, box-shadow .2s;
}
.auth-input:focus-within {
  border-color: #91a5f1;
  box-shadow: 0 0 0 3px #5978ed14;
}
.auth-input.has-error {
  border-color: #d88e97;
  background: #fffafb;
}
.auth-input.has-error:focus-within {
  border-color: #cf737f;
  box-shadow: 0 0 0 3px #cf737f18;
}
.auth-field-error {
  font-size: 10px;
  line-height: 1.5;
  color: #ad4e5a;
  margin: 6px 2px 0;
}
.auth-input > svg {
  color: #9faabd;
  flex: none;
}
.auth-input input {
  min-width: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 12px;
  color: #303b52;
  box-shadow: none;
}
.auth-input input:focus {
  box-shadow: none;
}
.auth-input input::placeholder {
  color: #9ba6b8;
}
.auth-reveal {
  display: grid;
  place-items: center;
  color: #8a97ac;
  padding: 5px;
  border-radius: 5px;
}
.auth-reveal:hover {
  background: #f1f4fd;
  color: #5978ed;
}
.auth-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 3px 0 23px;
  font-size: 10px;
  color: #748198;
}
.auth-options label {
  display: flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
}
.auth-options input {
  accent-color: #5978ed;
  width: 14px;
  height: 14px;
  margin: 0;
}
.auth-options button {
  font-size: 10px;
  font-weight: 600;
  color: #5876e0;
  padding: 2px 0;
}
.auth-submit {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 0;
  border-radius: 9px;
  background: #5978ed;
  color: white;
  min-height: 46px;
  padding: 12px;
  font-size: 12px;
  font-weight: 650;
  box-shadow: 0 7px 17px #5978ed30;
  margin-top: 5px;
}
.auth-submit:hover:not(:disabled) {
  background: #4363d9;
  transform: translateY(-1px);
  box-shadow: 0 10px 22px #5978ed40;
}
.auth-switch {
  text-align: center;
  font-size: 11px;
  color: #7b879c;
  margin-top: 23px;
  line-height: 1.7;
}
.auth-switch button {
  color: #5572de;
  font-size: 11px;
  font-weight: 650;
  padding: 0 3px;
}
.auth-trust {
  border-top: 1px solid #e9edf4;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: #8a96aa;
  font-size: 10px;
  margin-top: 25px;
  padding-top: 19px;
}
.auth-trust svg {
  color: #94a4c2;
}
.auth-back {
  display: flex;
  gap: 7px;
  align-items: center;
  justify-content: center;
  width: 100%;
  color: #5876e0;
  font-size: 11px;
  margin-top: 22px;
}
.auth-feedback {
  border: 1px solid #e1e9fa;
  background: #f0f4fe;
  color: #536b9e;
  padding: 11px 12px;
  font-size: 11px;
  line-height: 1.6;
  border-radius: 9px;
  margin-bottom: 18px;
}
.auth-feedback.error {
  color: #a34853;
  background: #fff3f4;
  border-color: #f4dde1;
}
.auth-feedback.success {
  color: #477e68;
  background: #f0faf5;
  border-color: #d7ebdf;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.auth-feedback svg {
  flex: none;
  margin-top: 1px;
}
.auth-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 clamp(24px, 5vw, 80px) 24px;
  font-size: 10px;
  color: #546c8a;
  text-shadow: 0 1px 10px #fff;
}
.auth-loading {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  background:
    radial-gradient(
      circle at 25% 20%,
      #dfeafd,
      transparent 50%),
    #f5f7fc;
  color: #7185b2;
  font-size: 13px;
}
.account-controls {
  display: flex;
  align-items: center;
  gap: 13px;
}
.account-identity {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  max-width: 180px;
}
.account-avatar {
  width: 27px;
  height: 27px;
  display: grid;
  place-items: center;
  flex: none;
  border-radius: 9px;
  background: #edf2ff;
  color: #5978ed;
  font-weight: 700;
}
.account-exit {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #7e8ba2;
  padding: 7px 9px;
  border-radius: 7px;
}
.account-exit:hover {
  background: #f1f4fc;
  color: #5978ed;
}
@keyframes auth-rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes auth-scene {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@media (min-width: 1600px) {
  .auth-layout {
    max-width: 1540px;
    grid-template-columns: 1fr 460px;
  }
  .auth-story h1 {
    font-size: 88px;
  }
}
@media (max-width: 1000px) {
  .auth-layout {
    gap: 30px;
    grid-template-columns: 1fr minmax(340px, 400px);
    padding-left: 35px;
    padding-right: 35px;
  }
  .auth-story h1 {
    font-size: 55px;
  }
  .auth-card {
    padding: 30px;
  }
  .auth-story > p {
    font-size: 14px;
  }
}
@media (max-width: 760px) {
  .auth-header {
    padding: 22px 25px;
  }
  .auth-header-note {
    font-size: 10px;
    padding: 8px 12px;
  }
  .auth-layout {
    display: flex;
    flex-direction: column;
    gap: 27px;
    padding: 13px 22px 36px;
  }
  .auth-story {
    padding: 0;
    width: 100%;
    max-width: 440px;
  }
  .auth-eyebrow {
    font-size: 8px;
    letter-spacing: .12em;
  }
  .auth-story h1 {
    font-size: 39px;
    line-height: 1.08;
    letter-spacing: -1.7px;
    margin: 16px 0 12px;
  }
  .auth-story h1 br {
    display: none;
  }
  .auth-story > p {
    font-size: 12px;
    max-width: 330px;
  }
  .auth-wide-break {
    display: none;
  }
  .auth-story-tag {
    display: none;
  }
  .auth-card {
    max-width: 440px;
    padding: 29px 30px 24px;
    border-radius: 19px;
  }
  .auth-backdrop {
    object-position: 63% top;
  }
  .auth-wash {
    background:
      linear-gradient(
        180deg,
        #edf5ffb5 0%,
        #edf5ff25 40%,
        #e8effba0 100%);
  }
  .auth-card h2 {
    font-size: 24px;
  }
  .auth-footer {
    padding: 0 24px 20px;
  }
  .account-identity {
    display: none;
  }
  .account-controls {
    gap: 5px;
  }
}
@media (max-width: 380px) {
  .auth-header {
    padding: 20px;
  }
  .auth-header-note {
    display: none;
  }
  .auth-layout {
    padding-left: 14px;
    padding-right: 14px;
  }
  .auth-card {
    padding: 26px 22px;
  }
  .auth-options {
    font-size: 9px;
    gap: 6px;
  }
  .auth-options button {
    font-size: 9px;
  }
  .auth-story h1 {
    font-size: 35px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .auth-backdrop,
  .auth-card,
  .auth-story {
    animation: none;
  }
  .auth-submit:hover:not(:disabled) {
    transform: none;
  }
}
@media (min-width: 761px) and (max-height: 800px) {
  .auth-header {
    padding-top: 24px;
    padding-bottom: 24px;
  }
  .auth-layout {
    padding-top: 12px;
    padding-bottom: 24px;
  }
  .auth-card {
    padding: 28px 34px 23px;
  }
  .auth-card-symbol {
    display: none;
  }
  .auth-trust {
    margin-top: 20px;
    padding-top: 15px;
  }
  .auth-description {
    margin-bottom: 19px;
  }
  .auth-tabs {
    margin-bottom: 18px;
  }
  .auth-field {
    margin-bottom: 14px;
  }
  .auth-switch {
    margin-top: 18px;
  }
  .auth-footer {
    padding-bottom: 16px;
  }
}
</style>
