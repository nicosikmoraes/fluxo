<script setup>
import { Moon, Sun } from "@lucide/vue";
import { theme, toggleTheme } from "./theme";
</script>

<template>
  <button class="nav-item appearance-toggle" type="button" role="switch" :aria-checked="theme === 'graphite'" :aria-label="theme === 'graphite' ? 'Tema Grafite ativado. Trocar para o tema claro' : 'Ativar tema escuro Grafite'" @click="toggleTheme">
    <Moon v-if="theme === 'graphite'" :size="17" />
    <Sun v-else :size="17" />
    <span>{{ theme === 'graphite' ? 'Tema Grafite' : 'Tema claro' }}</span>
    <span class="appearance-switch" aria-hidden="true"><i></i></span>
  </button>
</template>

<style scoped>
.appearance-toggle { font-size: 11px; }
.appearance-switch { display: block; flex-shrink: 0; width: 27px; height: 16px; margin-left: auto; padding: 3px; border-radius: 20px; background: var(--theme-line, #e9edf4); }
.appearance-switch i { display: block; width: 10px; height: 10px; border-radius: 50%; background: var(--theme-text-muted, #9aa4b5); }
[aria-checked="true"] .appearance-switch { background: var(--theme-accent-soft, #edf2ff); box-shadow: inset 0 0 0 1px var(--theme-accent-line, #d1dcfa); }
[aria-checked="true"] .appearance-switch i { background: var(--theme-accent, #5978ed); transform: translateX(11px); }
@media (prefers-reduced-motion: no-preference) { .appearance-switch i { transition: transform .18s ease, background .18s ease; } }
</style>
