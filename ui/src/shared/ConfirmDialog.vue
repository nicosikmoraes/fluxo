<script setup>
import { t } from "../state/locale";
import { AlertTriangle } from "@lucide/vue";
import Modal from "./Modal.vue";
import { state } from "../state/workspace";
defineProps({ title: String, message: String, label: { type: String, default: "Excluir" }, project: Boolean });
const emit = defineEmits(["close", "confirm"]);
</script>
<template>
 <Modal :title="title" @close="emit('close')"><div class="confirm-body"><div class="danger-illustration"><AlertTriangle :size="28" /></div><p>{{ message }}</p><p class="muted small">{{ t("Esta ação é permanente.") }}</p></div>
  <footer class="modal-actions" :class="{'project-delete-actions':project}"><button class="btn secondary" @click="emit('close')">{{ t("Cancelar") }}</button><template v-if="project"><button class="btn secondary" :disabled="!!state.saving" @click="emit('confirm',false)">{{ t("Manter as tasks") }}</button><button class="btn danger" :disabled="!!state.saving" @click="emit('confirm',true)">{{ t("Excluir tudo") }}</button></template><button v-else class="btn danger" :disabled="!!state.saving" @click="emit('confirm')">{{ state.saving ? t('Excluindo...') : t(label) }}</button></footer>
 </Modal>
</template>
