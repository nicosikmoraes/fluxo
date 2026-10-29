<script setup>
import { ref } from "vue";
import { Languages } from "@lucide/vue";
import { currentLocale, saveLocale, t } from "../../state/locale";

const props = defineProps({ disabled: { type: Boolean, default: false } });
const saving = ref(false);
const error = ref("");

async function changeLocale(event) {
  if (props.disabled || saving.value) return;
  const locale = event.target.value;
  saving.value = true;
  error.value = "";
  try {
    await saveLocale(locale);
  } catch (failure) {
    error.value = failure.message;
    event.target.value = currentLocale.value;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <label class="language-select" :class="{ saving }">
    <Languages :size="15" aria-hidden="true" />
    <span class="language-select-label">{{ t("Idioma") }}</span>
    <select :value="currentLocale" :disabled="saving || disabled" :aria-label="t('Idioma')" @change="changeLocale">
      <option value="pt-BR">Português (Brasil)</option>
      <option value="en-US">English (US)</option>
    </select>
    <span v-if="error" class="language-select-error" role="alert">{{ error }}</span>
  </label>
</template>

<style scoped>
.language-select { display: flex; align-items: center; gap: 8px; color: var(--theme-text-muted, #8796ad); font-size: 11px; }
.language-select select { max-width: 165px; padding: 7px 9px; border: 1px solid var(--theme-line, #e4eaf5); border-radius: 8px; color: var(--theme-text, #596982); background: var(--theme-panel, #fff); font-size: 11px; }
.language-select.saving { opacity: .65; }
.language-select-error { position: absolute; margin-top: 52px; color: #b54f56; font-size: 10px; }
@media (max-width: 760px) { .language-select-label { display: none; } }
</style>
