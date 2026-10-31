<script setup>
import { computed, reactive, ref } from "vue";
import { CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck, UserRound } from "@lucide/vue";
import { apiRequest, auth } from "./auth";
import LanguageSelect from "../appearance/LanguageSelect.vue";
import { currentLocale, t } from "../../state/locale";
const props = defineProps({ resetToken: { type: String, default: "" }, resetEmail: { type: String, default: "" } });
const emit = defineEmits(["reset-finished"]);
const mode = ref(props.resetToken ? "reset" : "login");
const values = reactive({ name: "", email: props.resetEmail, password: "", password_confirmation: "", remember: false });
const busy = ref(false);
const reveal = ref(false);
const error = ref("");
const success = ref("");
const fieldErrors = reactive({ name: "", email: "", password: "", password_confirmation: "" });
const title = computed(() => ({ login: t("Que bom ter você de volta"), register: t("Crie seu espaço no Fluxo"), forgot: t("Vamos recuperar seu acesso"), reset: t("Um novo começo") })[mode.value]);
const description = computed(() => ({ login: t("Entre para continuar no seu espaço de trabalho."), register: t("Suas ideias merecem um lugar para acontecer."), forgot: t("Informe seu e-mail para receber um link de recuperação."), reset: t("Escolha uma nova senha para entrar no seu espaço.") })[mode.value]);
const action = computed(() => ({ login: t("Entrar no Fluxo"), register: t("Criar minha conta"), forgot: t("Enviar instruções"), reset: t("Salvar nova senha") })[mode.value]);
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
  if (!email) fieldErrors.email = t("Informe seu e-mail.");
  else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.email = t("Digite um e-mail válido.");
  if (mode.value === "register" && !values.name.trim()) fieldErrors.name = t("Informe seu nome.");
  if (mode.value !== "forgot") {
    if (!values.password) fieldErrors.password = mode.value === "register" ? t("Crie uma senha.") : mode.value === "reset" ? t("Digite sua nova senha.") : t("Informe sua senha.");
    else if ((mode.value === "register" || mode.value === "reset") && values.password.length < 8) fieldErrors.password = t("Use uma senha com pelo menos 8 caracteres.");
    if ((mode.value === "register" || mode.value === "reset") && values.password !== values.password_confirmation) fieldErrors.password_confirmation = t("As senhas precisam ser iguais.");
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
      success.value = t("Senha atualizada. Você já pode entrar com sua nova senha.");
    } else {
      const payload = mode.value === "register" ? { name: values.name, email: values.email, password: values.password, password_confirmation: values.password_confirmation, locale: currentLocale.value } : { email: values.email, password: values.password, remember: values.remember };
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
  <header class="auth-header"><a class="brand" href="/" :aria-label="t('Fluxo, início')"><span class="brand-mark"><span></span><span></span><span></span></span><span>fluxo<span class="brand-period">.</span></span></a><LanguageSelect :disabled="busy" /><span class="auth-header-note">{{ t("Seu espaço. Seu ritmo.") }}</span></header>
  <div class="auth-layout">
   <section class="auth-story" :aria-label="t('Bem-vindo ao Fluxo')"><span class="auth-eyebrow"><i></i> {{ t("SEU TRABALHO, PASSO A PASSO") }}</span><h1>{{ t("Retome") }} <br>{{ t("o seu fluxo") }}<span>.</span></h1><p>{{ t("Seu dia ganha espaço quando tudo") }}<br class="auth-wide-break"> {{ t("encontra o seu lugar.") }}</p><div class="auth-story-tag"><CheckCircle2 :size="15" /> {{ t("Pequenos passos. Grandes conquistas.") }}</div></section>
   <section class="auth-card" :aria-label="title">
    <div class="auth-card-symbol"><LockKeyhole :size="20" /></div>
    <h2>{{ title }}</h2><p class="auth-description">{{ description }}</p>
    <p v-if="mode==='login' && (auth.site?.registration_enabled===false || auth.site?.maintenance)" class="auth-policy-note" role="status">{{t(auth.site?.maintenance?"O Fluxo está em manutenção. Tente novamente em breve.":"Novos cadastros estão temporariamente desativados.")}}</p><div v-if="mode==='login' || mode==='register'" class="auth-tabs" :aria-label="t('Acesso ao Fluxo')"><button type="button" :class="{selected:mode==='login'}" :aria-pressed="mode==='login'" :disabled="busy" @click="changeMode('login')">{{ t("Entrar") }}</button><button v-if="auth.site?.registration_enabled !== false && !auth.site?.maintenance" type="button" :class="{selected:mode==='register'}" :aria-pressed="mode==='register'" :disabled="busy" @click="changeMode('register')">{{ t("Criar conta") }}</button></div>
    <div v-if="auth.message" class="auth-feedback info" role="status">{{ auth.message }}</div>
    <div v-if="error" class="auth-feedback error" role="alert">{{ error }}</div>
    <div v-if="success" class="auth-feedback success" role="status"><CheckCircle2 :size="16" /><span>{{ success }}</span></div>
    <form novalidate @submit.prevent="submit">
     <fieldset :disabled="busy">
      <div v-if="mode==='register'" class="auth-field"><label for="auth-name">{{ t("Como podemos te chamar?") }}</label><div class="auth-input" :class="{'has-error':fieldErrors.name}"><UserRound :size="17" /><input id="auth-name" v-model="values.name" name="name" autocomplete="name" :placeholder="t('Seu nome')" @input="clearFieldError('name')" :aria-invalid="!!fieldErrors.name" aria-describedby="auth-name-error" /></div><p v-if="fieldErrors.name" id="auth-name-error" class="auth-field-error" role="alert">{{ fieldErrors.name }}</p></div>
      <div class="auth-field"><label for="auth-email">{{ t("E-mail") }}</label><div class="auth-input" :class="{'has-error':fieldErrors.email}"><Mail :size="17" /><input id="auth-email" v-model="values.email" type="email" name="email" autocomplete="email" :placeholder="t('voce@exemplo.com')" @input="clearFieldError('email')" :aria-invalid="!!fieldErrors.email" aria-describedby="auth-email-error" /></div><p v-if="fieldErrors.email" id="auth-email-error" class="auth-field-error" role="alert">{{ fieldErrors.email }}</p></div>
      <div v-if="mode!=='forgot'" class="auth-field"><label for="auth-password">{{ mode==='reset'?t('Nova senha'):t('Senha') }}</label><div class="auth-input" :class="{'has-error':fieldErrors.password}"><LockKeyhole :size="17" /><input id="auth-password" v-model="values.password" :type="reveal?'text':'password'" name="password" :autocomplete="mode==='login'?'current-password':'new-password'" :placeholder="mode==='login'?t('Sua senha'):t('Mínimo de 8 caracteres')" @input="clearFieldError('password')" :aria-invalid="!!fieldErrors.password" aria-describedby="auth-password-error" /><button type="button" class="auth-reveal" :aria-label="reveal?t('Ocultar senha'):t('Mostrar senha')" :aria-pressed="reveal" @click="reveal=!reveal"><EyeOff v-if="reveal" :size="17" /><Eye v-else :size="17" /></button></div><p v-if="fieldErrors.password" id="auth-password-error" class="auth-field-error" role="alert">{{ fieldErrors.password }}</p></div>
      <div v-if="mode==='register' || mode==='reset'" class="auth-field"><label for="auth-confirm">{{ t("Confirmar senha") }}</label><div class="auth-input" :class="{'has-error':fieldErrors.password_confirmation}"><LockKeyhole :size="17" /><input id="auth-confirm" v-model="values.password_confirmation" type="password" name="password_confirmation" autocomplete="new-password" :placeholder="t('Digite a senha novamente')" @input="clearFieldError('password_confirmation')" :aria-invalid="!!fieldErrors.password_confirmation" aria-describedby="auth-confirm-error" /></div><p v-if="fieldErrors.password_confirmation" id="auth-confirm-error" class="auth-field-error" role="alert">{{ fieldErrors.password_confirmation }}</p></div>
      <div v-if="mode==='login'" class="auth-options"><label><input v-model="values.remember" type="checkbox" name="remember" /> {{ t("Manter conectado") }}</label><button type="button" @click="changeMode('forgot')">{{ t("Esqueci minha senha") }}</button></div>
      <button type="submit" class="auth-submit"><LoaderCircle v-if="busy" :size="17" class="spin" /><span>{{ busy?t('Só um instante...'):action }}</span></button>
     </fieldset>
    </form>
    <p v-if="(mode==='login' || mode==='register') && auth.site?.registration_enabled !== false && !auth.site?.maintenance" class="auth-switch">{{ mode==='login'?t('Primeira vez por aqui?'):t('Já tem uma conta?') }} <button type="button" :disabled="busy" @click="changeMode(mode==='login'?'register':'login')">{{ mode==='login'?t('Crie sua conta'):t('Entrar') }}</button></p>
    <button v-else class="auth-back" type="button" :disabled="busy" @click="changeMode('login')">{{ t("Voltar para entrar") }}</button>
    <div class="auth-trust"><ShieldCheck :size="14" /><span>{{ t("Um espaço só seu, para cada ideia.") }}</span></div>
   </section>
  </div>
  <footer class="auth-footer"><span>{{ t("Feito para o seu ritmo.") }}</span><span>fluxo. © {{ new Date().getFullYear() }}</span></footer>
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
  background: var(--theme-accent-soft, #edf3fb);
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
      var(--theme-accent-soft, #edf5ff95) 0%,
      var(--theme-accent-soft, #edf5ff20) 55%,
      var(--theme-accent, #27385419) 100%);
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
  color: var(--theme-text, #5b6f91);
  background: var(--theme-panel, #ffffffad);
  padding: 10px 16px;
  border: 1px solid var(--theme-line, #fff9);
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
  color: var(--theme-text, #34445e);
  text-shadow: 0 1px 20px var(--theme-shadow, #ffffff80);
}
.auth-eyebrow {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: .16em;
  color: var(--theme-text, #5e749b);
}
.auth-eyebrow i {
  width: 22px;
  height: 1px;
  background: var(--theme-accent, #849bc6);
}
.auth-story h1 {
  font-size: clamp(48px, 5.8vw, 78px);
  line-height: 1.02;
  letter-spacing: -3px;
  font-weight: 750;
  margin: 26px 0 21px;
}
.auth-story h1 > span {
  color: var(--theme-accent, #5978ed);
}
.auth-story > p {
  font-size: 16px;
  line-height: 1.75;
  color: var(--theme-text, #5a6e89);
  max-width: 350px;
}
.auth-story-tag {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 44px;
  color: var(--theme-text, #52698e);
  font-size: 11px;
  font-weight: 550;
}
.auth-story-tag svg {
  color: var(--theme-text, #6781ae);
}
.auth-card {
  background: var(--theme-panel, #fffffff0);
  border: 1px solid var(--theme-line, #ffffffdd);
  border-radius: 22px;
  padding: 35px 38px 26px;
  box-shadow: 0 28px 90px var(--theme-shadow, #263a6430), 0 2px 8px var(--theme-shadow, #fff5);
  backdrop-filter: blur(18px);
  width: 100%;
  animation: auth-rise .65s .08s ease both;
}
.auth-card-symbol {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  background: var(--theme-surface-muted, #eef2ff);
  color: var(--theme-accent, #6e86df);
  border: 1px solid var(--theme-line, #e5ebff);
  border-radius: 13px;
  margin-bottom: 23px;
  box-shadow: 0 4px 12px var(--theme-shadow-soft, #5978ed08);
}
.auth-card h2 {
  font-size: 25px;
  letter-spacing: -.8px;
  line-height: 1.2;
  font-weight: 700;
  color: var(--theme-text, #303b52);
  margin: 0 0 10px;
}
.auth-description {
  font-size: 12px;
  line-height: 1.7;
  color: var(--theme-text, #7e8a9f);
  margin-bottom: 24px;
}
.auth-tabs {
  display: flex;
  padding: 4px;
  border: 1px solid var(--theme-line, #e9edf4);
  border-radius: 10px;
  background: var(--theme-surface-muted, #f5f7fb);
  margin: 0 0 23px;
  gap: 4px;
}
.auth-tabs button {
  flex: 1;
  border: 0;
  border-radius: 7px;
  padding: 10px 8px;
  color: var(--theme-text, #7c879a);
  font-size: 12px;
  font-weight: 600;
}
.auth-tabs button.selected {
  color: var(--theme-accent, #506bd6);
  background: var(--theme-accent-soft, #fff);
  box-shadow: 0 2px 8px var(--theme-shadow-soft, #35466a10);
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
  color: var(--theme-text, #556178);
  margin-bottom: 8px;
}
.auth-input {
  height: 47px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid var(--theme-line, #e1e7f0);
  background: var(--theme-panel, #fff);
  border-radius: 9px;
  transition: border-color .2s, box-shadow .2s;
}
.auth-input:focus-within {
  border-color: var(--theme-accent-line, #91a5f1);
  box-shadow: 0 0 0 3px var(--theme-shadow-soft, #5978ed14);
}
.auth-input.has-error {
  border-color: var(--theme-danger-line, #d88e97);
  background: var(--theme-danger-soft, #fffafb);
}
.auth-input.has-error:focus-within {
  border-color: var(--theme-danger-line, #cf737f);
  box-shadow: 0 0 0 3px var(--theme-shadow-soft, #cf737f18);
}
.auth-field-error {
  font-size: 10px;
  line-height: 1.5;
  color: var(--theme-danger, #ad4e5a);
  margin: 6px 2px 0;
}
.auth-input > svg {
  color: var(--theme-text-muted, #9faabd);
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
  color: var(--theme-text, #303b52);
  box-shadow: none;
}
.auth-input input:focus {
  box-shadow: none;
}
.auth-input input::placeholder {
  color: var(--theme-text-muted, #9ba6b8);
}
.auth-reveal {
  display: grid;
  place-items: center;
  color: var(--theme-text-secondary, #8a97ac);
  padding: 5px;
  border-radius: 5px;
}
.auth-reveal:hover {
  background: var(--theme-surface-muted, #f1f4fd);
  color: var(--theme-accent, #5978ed);
}
.auth-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 3px 0 23px;
  font-size: 10px;
  color: var(--theme-text, #748198);
}
.auth-options label {
  display: flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
}
.auth-options input {
  accent-color: var(--theme-accent, #5978ed);
  width: 14px;
  height: 14px;
  margin: 0;
}
.auth-options button {
  font-size: 10px;
  font-weight: 600;
  color: var(--theme-accent, #5876e0);
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
  background: var(--theme-accent, #5978ed);
  color: var(--theme-on-accent, white);
  min-height: 46px;
  padding: 12px;
  font-size: 12px;
  font-weight: 650;
  box-shadow: 0 7px 17px var(--theme-shadow, #5978ed30);
  margin-top: 5px;
}
.auth-submit:hover:not(:disabled) {
  background: var(--theme-accent, #4363d9);
  transform: translateY(-1px);
  box-shadow: 0 10px 22px var(--theme-shadow, #5978ed40);
}
.auth-switch {
  text-align: center;
  font-size: 11px;
  color: var(--theme-text, #7b879c);
  margin-top: 23px;
  line-height: 1.7;
}
.auth-switch button {
  color: var(--theme-accent, #5572de);
  font-size: 11px;
  font-weight: 650;
  padding: 0 3px;
}
.auth-trust {
  border-top: 1px solid var(--theme-line, #e9edf4);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: var(--theme-text-secondary, #8a96aa);
  font-size: 10px;
  margin-top: 25px;
  padding-top: 19px;
}
.auth-trust svg {
  color: var(--theme-text-muted, #94a4c2);
}
.auth-back {
  display: flex;
  gap: 7px;
  align-items: center;
  justify-content: center;
  width: 100%;
  color: var(--theme-accent, #5876e0);
  font-size: 11px;
  margin-top: 22px;
}
.auth-feedback {
  border: 1px solid var(--theme-line, #e1e9fa);
  background: var(--theme-surface-muted, #f0f4fe);
  color: var(--theme-text, #536b9e);
  padding: 11px 12px;
  font-size: 11px;
  line-height: 1.6;
  border-radius: 9px;
  margin-bottom: 18px;
}
.auth-feedback.error {
  color: var(--theme-danger, #a34853);
  background: var(--theme-danger-soft, #fff3f4);
  border-color: var(--theme-danger-line, #f4dde1);
}
.auth-feedback.success {
  color: var(--theme-success, #477e68);
  background: var(--theme-success-soft, #f0faf5);
  border-color: var(--theme-success-line, #d7ebdf);
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
  color: var(--theme-text, #546c8a);
  text-shadow: 0 1px 10px var(--theme-shadow, #fff);
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
      var(--theme-accent-soft, #dfeafd),
      transparent 50%),
    var(--theme-surface-muted, #f5f7fc);
  color: var(--theme-text-secondary, #7185b2);
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
  background: var(--theme-accent-soft, #edf2ff);
  color: var(--theme-accent, #5978ed);
  font-weight: 700;
}
.account-exit {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--theme-text-secondary, #7e8ba2);
  padding: 7px 9px;
  border-radius: 7px;
}
.account-exit:hover {
  background: var(--theme-surface-muted, #f1f4fc);
  color: var(--theme-accent, #5978ed);
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
        var(--theme-accent-soft, #edf5ffb5) 0%,
        var(--theme-accent-soft, #edf5ff25) 40%,
        var(--theme-accent-soft, #e8effba0) 100%);
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
.auth-policy-note { padding: 11px 13px; border: 1px solid var(--theme-line, #e9edf4); border-radius: 8px; background: var(--theme-surface-muted, #f7f8fc); color: var(--theme-text-secondary, #68758d); font-size: 12px; line-height: 1.7; }
</style>
