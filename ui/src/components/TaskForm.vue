<script setup>
import { reactive, ref } from 'vue';
import { ImagePlus, X } from '@lucide/vue';
import Modal from './Modal.vue';
import { state, mutate, upload } from '../workspace';
const props = defineProps({ task: Object, projectId: [Number, String] });
const emit = defineEmits(['close', 'saved']);
const form = reactive({ title: props.task?.title || '', description: props.task?.description || '', project_id: props.task?.project_id ?? (Number(props.projectId) || null), cover_path: props.task?.cover_path || null });
const input = ref();
async function pick(event) { const path = await upload(event.target.files[0]); if(path) form.cover_path = path; event.target.value = ''; }
async function save() {
 if (state.saving) return;
 const result = await mutate(props.task ? '/tasks/' + props.task.id : '/tasks', props.task ? 'PATCH' : 'POST', { ...form, title: form.title.trim(), project_id: form.project_id || null }, props.task ? 'Task atualizada.' : 'Sua task está pronta. Adicione os primeiros passos.');
 if (result) emit('saved', result);
}
</script>
<template>
 <Modal :title="task ? 'Editar task' : 'Nova task'" @close="emit('close')">
  <form class="form-stack" @submit.prevent="save">
   <label>Título <span class="required">*</span><input v-model="form.title" autofocus required maxlength="200" placeholder="O que você quer desenvolver?"></label>
   <label>Descrição <span class="optional">opcional</span><textarea v-model="form.description" maxlength="20000" rows="4" placeholder="Contexto, ideias e o resultado que você espera..."></textarea></label>
   <label>Projeto <span class="optional">opcional</span><select v-model="form.project_id"><option :value="null">Sem projeto</option><option v-for="p in state.projects" :key="p.id" :value="p.id">{{ p.title }}</option></select></label>
   <label>Capa <span class="optional">opcional · até 8 MB</span></label>
   <div v-if="form.cover_path" class="upload-preview"><img :src="form.cover_path" alt="Capa da task"><button type="button" class="icon-btn" aria-label="Remover capa" @click="form.cover_path = null"><X :size="16" /></button></div>
   <button v-else type="button" class="upload-zone" :disabled="!!state.saving" @click="input.click()"><ImagePlus :size="21" /> Adicionar uma imagem</button>
   <input ref="input" hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="pick">
   <footer class="modal-actions"><button type="button" class="btn secondary" @click="emit('close')">Cancelar</button><button class="btn primary" :disabled="!!state.saving">{{ state.saving ? 'Salvando...' : task ? 'Salvar alterações' : 'Criar task' }}</button></footer>
  </form>
 </Modal>
</template>
