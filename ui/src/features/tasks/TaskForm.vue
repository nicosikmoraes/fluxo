<script setup>
import { t } from "../../state/locale";
import { reactive, ref } from "vue";
import { ImagePlus, X } from "@lucide/vue";
import Modal from "../../shared/Modal.vue";
import { state, mutate, upload } from "../../state/workspace";
const props = defineProps({ task: Object, projectId: [Number, String], dueDate: String });
const emit = defineEmits(["close", "saved"]);
const form = reactive({ title: props.task?.title || "", description: props.task?.description || "", project_id: props.task?.project_id ?? (Number(props.projectId) || null), cover_path: props.task?.cover_path || null, due_date: props.task?.due_date || props.dueDate || "" });
const input = ref();
async function pick(event) {
  const path = await upload(event.target.files[0]);
  if (path) form.cover_path = path;
  event.target.value = "";
}
async function save() {
  if (state.saving) return;
  const result = await mutate(props.task ? "/tasks/" + props.task.id : "/tasks", props.task ? "PATCH" : "POST", { ...form, title: form.title.trim(), project_id: form.project_id || null, due_date: form.due_date || null }, props.task ? t("Task atualizada.") : t("Sua task está pronta. Adicione os primeiros passos."));
  if (result) emit("saved", result);
}
</script>
<template>
 <Modal :title="task ? t('Editar task') : t('Nova task')" @close="emit('close')">
  <form class="form-stack" @submit.prevent="save">
   <label>{{ t("Título") }} <span class="required">*</span><input v-model="form.title" autofocus required maxlength="200" :placeholder="t('O que você quer desenvolver?')"></label>
   <label>{{ t("Descrição") }} <span class="optional">{{ t("opcional") }}</span><textarea v-model="form.description" maxlength="20000" rows="4" :placeholder="t('Contexto, ideias e o resultado que você espera...')"></textarea></label>
   <label>{{ t("Projeto") }} <span class="optional">{{ t("opcional") }}</span><select v-model="form.project_id"><option :value="null">{{ t("Sem projeto") }}</option><option v-for="p in state.projects" :key="p.id" :value="p.id">{{ p.title }}</option></select></label>
   <label>{{ t("Data de entrega") }} <span class="optional">{{ t("opcional") }}</span><input v-model="form.due_date" type="date" min="0001-01-01" max="9999-12-31" :aria-label="t('Data de entrega')"></label>
   <label>{{ t("Capa") }} <span class="optional">{{ t("opcional · até 8 MB") }}</span></label>
   <div v-if="form.cover_path" class="upload-preview"><img :src="form.cover_path" :alt="t('Capa da task')"><button type="button" class="icon-btn" :aria-label="t('Remover capa')" @click="form.cover_path = null"><X :size="16" /></button></div>
   <button v-else type="button" class="upload-zone" :disabled="!!state.saving" @click="input.click()"><ImagePlus :size="21" /> {{ t("Adicionar uma imagem") }}</button>
   <input ref="input" hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="pick">
   <footer class="modal-actions"><button type="button" class="btn secondary" @click="emit('close')">{{ t("Cancelar") }}</button><button class="btn primary" :disabled="!!state.saving">{{ state.saving ? t('Salvando...') : task ? t('Salvar alterações') : t('Criar task') }}</button></footer>
  </form>
 </Modal>
</template>
