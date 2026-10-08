<script setup>
import { reactive, ref } from 'vue';
import { ImagePlus, Check, X } from '@lucide/vue';
import Modal from './Modal.vue';
import { state, mutate, upload } from '../workspace';
const props=defineProps({ project:Object }); const emit=defineEmits(['close','saved']);
const form=reactive({ title:props.project?.title || '', cover:props.project?.cover || 'desk', cover_path:props.project?.cover_path || null });
const input=ref(); const covers=[{id:'desk',name:'Criativo'},{id:'violet',name:'Lavanda'},{id:'mint',name:'Natureza'},{id:'peach',name:'Aurora'}];
async function pick(e) { const p=await upload(e.target.files[0]); if(p) form.cover_path=p; e.target.value=''; }
async function save() { if(state.saving) return; const r=await mutate(props.project ? '/projects/'+props.project.id : '/projects',props.project?'PATCH':'POST',{...form,title:form.title.trim()},props.project?'Projeto atualizado.':'Novo projeto criado.'); if(r) emit('saved',r); }
</script>
<template>
 <Modal :title="project ? 'Editar projeto' : 'Novo projeto'" @close="emit('close')">
  <form class="form-stack" @submit.prevent="save">
   <label>Nome do projeto <span class="required">*</span><input v-model="form.title" autofocus required maxlength="160" placeholder="Dê um nome à sua próxima ideia"></label>
   <label>Escolha uma capa</label>
   <div class="cover-options"><button v-for="c in covers" :key="c.id" type="button" class="cover-option" :class="{selected:form.cover===c.id && !form.cover_path}" @click="form.cover=c.id;form.cover_path=null"><div class="cover-art" :class="c.id"><img src="/ui/hero.png" alt=""><Check v-if="form.cover===c.id && !form.cover_path" :size="18" /></div><span>{{ c.name }}</span></button></div>
   <div v-if="form.cover_path" class="upload-preview"><img :src="form.cover_path" alt="Capa do projeto"><button type="button" class="icon-btn" aria-label="Remover imagem" @click="form.cover_path=null"><X :size="16" /></button></div>
   <button v-else type="button" class="upload-zone" :disabled="!!state.saving" @click="input.click()"><ImagePlus :size="20" /> Ou envie sua imagem · até 8 MB</button>
   <input ref="input" hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="pick">
   <footer class="modal-actions"><button type="button" class="btn secondary" @click="emit('close')">Cancelar</button><button class="btn primary" :disabled="!!state.saving">{{ state.saving ? 'Salvando...' : project ? 'Salvar alterações' : 'Criar projeto' }}</button></footer>
  </form>
 </Modal>
</template>
