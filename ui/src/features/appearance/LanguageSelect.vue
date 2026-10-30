<script setup>
import { ref } from "vue";
import { currentLocale, saveLocale, t } from "../../state/locale";

const props = defineProps({ disabled: { type: Boolean, default: false } });
const saving = ref(false);
const error = ref("");

async function changeLocale(locale) {
  if (props.disabled || saving.value || locale === currentLocale.value) return;
  saving.value = true;
  error.value = "";
  try {
    await saveLocale(locale);
  } catch (failure) {
    error.value = failure.message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="language-select" :class="{ saving }" role="group" :aria-label="t('Idioma')" :aria-busy="saving">
    <button type="button" data-locale="pt-BR" lang="pt-BR" :disabled="saving || disabled" :aria-pressed="currentLocale === 'pt-BR'" aria-label="Português (Brasil)" title="Português (Brasil)" @click="changeLocale('pt-BR')">
      <svg viewBox="0 0 28 20" aria-hidden="true"><rect width="28" height="20" fill="#229e45"/><path d="M14 2 26 10 14 18 2 10Z" fill="#ffdc36"/><circle cx="14" cy="10" r="4.4" fill="#23458b"/><path d="M10 8.8c2.7-.3 5.3.5 8.1 2.2" fill="none" stroke="#fff" stroke-width=".8"/><circle cx="13" cy="11.8" r=".35" fill="#fff"/><circle cx="15.8" cy="12.4" r=".35" fill="#fff"/></svg>
    </button>
    <button type="button" data-locale="en-US" lang="en-US" :disabled="saving || disabled" :aria-pressed="currentLocale === 'en-US'" aria-label="English (US)" title="English (US)" @click="changeLocale('en-US')">
      <svg viewBox="0 0 28 20" aria-hidden="true"><rect width="28" height="20" fill="#fff"/><path d="M0 1h28M0 4h28M0 7h28M0 10h28M0 13h28M0 16h28M0 19h28" stroke="#c7424a" stroke-width="1.55"/><path d="M0 0h12v10.8H0Z" fill="#2b3f78"/><g fill="#fff"><circle v-for="point in [[2,2],[5.8,2],[9.6,2],[3.9,4.3],[7.7,4.3],[2,6.6],[5.8,6.6],[9.6,6.6],[3.9,8.9],[7.7,8.9]]" :key="point.join('-')" :cx="point[0]" :cy="point[1]" r=".55"/></g></svg>
    </button>
    <span v-if="error" class="language-select-error" role="alert">{{ error }}</span>
  </div>
</template>

<style scoped>
.language-select { position: relative; display: flex; align-items: center; gap: 3px; padding: 3px; border: 1px solid var(--theme-line, #e4eaf5); border-radius: 10px; }
.language-select button { display: grid; place-items: center; padding: 6px; border-radius: 7px; opacity: .5; }
.language-select button[aria-pressed="true"] { background: var(--theme-accent-soft, #edf2ff); box-shadow: inset 0 0 0 1px var(--theme-accent-line, #bdccf5); opacity: 1; }
.language-select button:hover { opacity: 1; }
.language-select svg { display: block; width: 26px; height: 19px; border-radius: 3px; overflow: hidden; }
.language-select.saving { opacity: .65; }
.language-select-error { position: absolute; top: calc(100% + 6px); right: 0; width: max-content; max-width: 230px; color: var(--theme-danger, #b54f56); font-size: 10px; }
</style>
