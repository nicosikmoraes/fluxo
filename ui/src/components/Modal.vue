<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
defineProps({ title: String, wide: Boolean });
const emit = defineEmits(['close']);
const dialog = ref();
let previous;
onMounted(() => { previous = document.activeElement; dialog.value.showModal(); });
onUnmounted(() => previous?.focus?.());
</script>
<template>
 <dialog ref="dialog" class="modal" :class="{ wide }" @cancel.prevent="emit('close')" @click="e => e.target === dialog && emit('close')">
  <div class="modal-surface">
   <header class="modal-header"><h2>{{ title }}</h2><button class="icon-btn" aria-label="Fechar" @click="emit('close')"><span aria-hidden="true">×</span></button></header>
   <slot />
  </div>
 </dialog>
</template>
