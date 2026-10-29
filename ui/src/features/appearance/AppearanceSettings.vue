<script setup>
import { t } from "../../state/locale";
import { Check, Moon, Palette, Sun } from "@lucide/vue";
import { setTheme, theme } from "./theme";
const options = [
  { id: "light", name: "Claro", description: "Leve e luminoso para o seu dia.", icon: Sun },
  { id: "graphite", name: "Grafite", description: "Tons escuros com detalhes em lilás.", icon: Moon },
];
</script>

<template>
  <section class="appearance-settings" aria-labelledby="appearance-heading">
    <header><span class="appearance-heading-icon"><Palette :size="18" /></span><div><h2 id="appearance-heading">{{ t("Aparência") }}</h2><p>{{ t("Escolha como você quer ver o seu espaço.") }}</p></div></header>
    <div class="appearance-options" role="radiogroup" :aria-label="t('Tema do Fluxo')">
      <label v-for="option in options" :key="option.id" class="appearance-option" :class="{ 'is-selected': theme === option.id }">
        <input type="radio" name="fluxo-theme" :value="option.id" :checked="theme === option.id" @change="setTheme(option.id)">
        <span class="appearance-preview" :class="option.id" aria-hidden="true"><i class="preview-sidebar"></i><span class="preview-main"><i></i><span><b></b><b></b><b></b></span></span></span>
        <span class="appearance-option-label"><component :is="option.icon" :size="15" /><strong>{{ t(option.name) }}</strong><Check v-if="theme === option.id" :size="15" class="appearance-selected" /></span>
        <small>{{ t(option.description) }}</small>
      </label>
    </div>
    <p class="appearance-note" role="status">{{ theme === 'graphite' ? t('Tema Grafite ativado.') : t('Tema claro ativado.') }} {{ t("Sua escolha é salva automaticamente neste navegador.") }}</p>
  </section>
</template>

<style scoped>
.appearance-settings { padding: 21px; margin-bottom: 24px; border: 1px solid var(--theme-line, #e8edf7); border-radius: 11px; background: var(--theme-panel, #fff); }
header { display: flex; align-items: center; gap: 10px; margin-bottom: 17px; }
.appearance-heading-icon { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; color: var(--theme-accent, #8c79b5); background: var(--theme-accent-soft, #f4effb); }
h2 { color: var(--theme-text, #7186a8); font-size: 14px; font-weight: 550; }
header p { margin-top: 5px; color: var(--theme-text-muted, #99a9bf); font-size: 11px; }
.appearance-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; max-width: 650px; }
.appearance-option { position: relative; min-width: 0; padding: 10px; border: 1px solid var(--theme-line, #e4eaf5); border-radius: 9px; cursor: pointer; }
.appearance-option.is-selected { border-color: var(--theme-accent, #a08ac1); box-shadow: 0 0 0 1px var(--theme-accent, #a08ac1); }
.appearance-option:focus-within { outline: 3px solid var(--theme-accent, #b8a2d6); outline-offset: 3px; }
.appearance-option input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.appearance-preview { display: flex; height: 76px; padding: 0; border: 1px solid #e6eaf2; background: #f7f8fc; border-radius: 5px; overflow: hidden; }
.preview-sidebar { width: 24%; border-right: 1px solid #e4e8f0; background: #fff; }
.preview-main { flex: 1; padding: 10px; min-width: 0; }
.preview-main > i { display: block; height: 13px; width: 70%; border-radius: 3px; background: #d9e3fa; }
.preview-main > span { display: flex; gap: 5px; margin-top: 8px; }
.preview-main b { display: block; width: 32%; height: 30px; border: 1px solid #e2e8f3; border-radius: 3px; background: #fff; }
.appearance-preview.graphite { background: #151719; border-color: #36393f; }
.graphite .preview-sidebar { background: #1e2023; border-color: #36393f; }
.graphite .preview-main > i { background: #5c4b6c; }
.graphite .preview-main b { background: #25272c; border-color: #45404d; }
.appearance-option-label { display: flex; align-items: center; gap: 6px; margin-top: 10px; color: var(--theme-text, #7c8fac); }
.appearance-option-label strong { font-size: 12px; font-weight: 550; }
.appearance-selected { margin-left: auto; color: var(--theme-accent, #9b83bf); }
.appearance-option > small { display: block; margin-top: 4px; color: var(--theme-text-muted, #9baac0); font-size: 10px; }
.appearance-note { margin-top: 13px; color: var(--theme-text-muted, #99a9bf); font-size: 10px; line-height: 1.7; }
@media (max-width: 450px) { .appearance-settings { padding: 16px; } .appearance-options { grid-template-columns: 1fr; } }
</style>
