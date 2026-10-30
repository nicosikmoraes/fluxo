<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Search, ChevronDown, Check, X, Users } from '@lucide/vue';
const props=defineProps({modelValue:{type:String,default:''},users:{type:Array,required:true},id:{type:String,default:'grant-recipient'},remote:Boolean,loading:Boolean,error:{type:String,default:''},total:{type:Number,default:0}});
const emit=defineEmits(['update:modelValue','search']);
const root=ref(null),input=ref(null),opened=ref(false),query=ref(''),active=ref(0);
const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const selected=computed(()=>props.users.find(user=>String(user.id)===props.modelValue));
const results=computed(()=>props.loading?[]:props.remote?props.users:props.users.filter(user=>normalize(user.name+' '+user.email).includes(normalize(query.value))));
const initials=name=>name.split(' ').map(n=>n[0]).slice(0,2).join('');
const listId=computed(()=>props.id+'-listbox');
function show(){if(opened.value)return;query.value='';opened.value=true;emit('search','');active.value=Math.max(0,results.value.findIndex(user=>String(user.id)===props.modelValue));}
function choose(user){emit('update:modelValue',String(user.id));opened.value=false;query.value='';input.value?.focus();}
function update(event){query.value=event.target.value;emit('search',query.value);emit('update:modelValue','');opened.value=true;active.value=0;}
function clear(){emit('update:modelValue','');query.value='';emit('search','');opened.value=true;active.value=0;input.value?.focus();}
function close(){opened.value=false;query.value='';}
function scrollActive(){nextTick(()=>root.value?.querySelector('[data-active="true"]')?.scrollIntoView?.({block:'nearest'}));}
function keydown(event){
 if(event.key==='Escape'&&opened.value){event.preventDefault();event.stopPropagation();close();return;}
 if(event.key==='Tab'){close();return;}
 if(event.key==='ArrowDown'||event.key==='ArrowUp'){
  event.preventDefault();if(!opened.value){show();scrollActive();return;}
  active.value=Math.max(0,Math.min(results.value.length-1,active.value+(event.key==='ArrowDown'?1:-1)));scrollActive();
 }
 if(event.key==='Enter'&&opened.value){event.preventDefault();if(results.value[active.value])choose(results.value[active.value]);}
}
function outside(event){if(root.value&&!root.value.contains(event.target))close();}
function focusout(event){if(!root.value?.contains(event.relatedTarget))close();}
watch(results,()=>{active.value=0;});
onMounted(()=>document.addEventListener('pointerdown',outside));
onBeforeUnmount(()=>document.removeEventListener('pointerdown',outside));
</script>
<template>
 <div ref="root" class="recipient-picker" @keydown="keydown" @focusout="focusout">
  <div class="recipient-input" :class="{opened,chosen:!!selected}">
   <Search :size="16"/>
   <input ref="input" :id="id" role="combobox" autocomplete="off" aria-autocomplete="list" :aria-controls="listId" :aria-expanded="opened" :aria-activedescendant="opened&&results[active]?id+'-option-'+results[active].id:undefined" :value="opened?query:(selected?.name||'')" placeholder="Buscar por nome ou e-mail" @focus="show" @input="update"/>
   <button v-if="selected" type="button" class="picker-clear" aria-label="Limpar destinatário" @click="clear"><X :size="14"/></button>
   <button type="button" class="picker-toggle" :aria-label="opened?'Fechar lista de usuários':'Abrir lista de usuários'" :aria-expanded="opened" @click="opened?close():(show(),input?.focus())"><ChevronDown :size="16"/></button>
  </div>
  <span v-if="selected&&!opened" class="recipient-selected-email">{{selected.email}}</span>
  <div v-if="opened" class="recipient-dropdown">
   <div class="recipient-result-count">{{remote?total:results.length}} {{(remote?total:results.length)===1?'usuário disponível':'usuários disponíveis'}}</div>
   <div :id="listId" role="listbox" aria-label="Usuários elegíveis para cortesia" class="recipient-options">
    <div v-for="(user,index) in results" :id="id+'-option-'+user.id" :key="user.id" role="option" :aria-selected="String(user.id)===modelValue" :data-user-id="user.id" :data-active="active===index" class="recipient-option" @pointermove="active=index" @pointerdown.prevent @click="choose(user)">
     <span class="recipient-avatar">{{initials(user.name)}}</span><span class="recipient-person"><strong>{{user.name}}</strong><small>{{user.email}}</small></span><Check v-if="String(user.id)===modelValue" :size="16"/>
    </div>
    <div v-if="loading" class="recipient-empty" role="status"><span>Buscando usuários…</span></div><div v-else-if="error" class="recipient-empty" role="alert"><span>{{error}}</span></div><div v-else-if="!results.length" class="recipient-empty"><Users :size="23"/><strong>Nenhum usuário encontrado</strong><span>Tente outro nome ou e-mail.</span></div>
   </div>
   <div class="recipient-keyboard-hint">↑ ↓ para navegar <span>Enter para selecionar</span></div>
  </div>
 </div>
</template>
<style scoped>
.recipient-picker{position:relative;margin-top:8px;min-width:0}
.recipient-input{display:flex;align-items:center;gap:9px;padding:0 16px;background:var(--theme-surface-muted);border:1px solid var(--theme-line);border-radius:7px;color:var(--theme-text-muted)}
.recipient-input:focus-within{border-color:var(--theme-accent);box-shadow:0 0 0 3px var(--theme-accent-soft)}
.recipient-input input{width:100%;min-width:0;padding:12px 0;border:0;background:none;color:var(--theme-text);font-size:12px;outline:none;box-shadow:none}
.recipient-input input::placeholder{color:var(--theme-text-muted)}
.picker-toggle,.picker-clear{display:flex;align-items:center;justify-content:center;padding:4px;color:var(--theme-text-muted);flex-shrink:0;border-radius:4px}
.picker-toggle:hover,.picker-clear:hover{color:var(--theme-accent);background:var(--theme-accent-soft)}
.recipient-selected-email{display:block;margin:7px 0 0 1px;color:var(--theme-text-muted);font-size:10px}
.recipient-dropdown{position:absolute;top:calc(100% + 6px);left:0;right:0;z-index:10;border:1px solid var(--theme-line);border-radius:9px;overflow:hidden;background:var(--theme-panel);box-shadow:0 10px 28px var(--theme-shadow)}
.recipient-result-count{font-size:10px;color:var(--theme-text-muted);padding:10px 12px;border-bottom:1px solid var(--theme-line)}
.recipient-options{max-height:210px;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}
.recipient-option{padding:10px 12px;display:flex;align-items:center;gap:10px;cursor:pointer;color:var(--theme-text-secondary)}
.recipient-option[data-active="true"],.recipient-option[aria-selected="true"]{background:var(--theme-accent-soft);color:var(--theme-accent)}
.recipient-avatar{width:30px;height:30px;display:grid;place-items:center;flex-shrink:0;border-radius:50%;font-size:10px;color:var(--theme-accent);background:var(--theme-accent-soft)}
.recipient-person{flex:1;min-width:0}.recipient-person strong{display:block;font-size:11px;font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.recipient-person small{display:block;color:var(--theme-text-muted);font-size:10px;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.recipient-empty{display:grid;justify-items:center;padding:25px 12px;gap:9px;color:var(--theme-text-muted)}.recipient-empty strong{font-size:11px;color:var(--theme-text-secondary)}.recipient-empty span{font-size:10px}
.recipient-keyboard-hint{display:flex;justify-content:space-between;border-top:1px solid var(--theme-line);padding:9px 12px;color:var(--theme-text-muted);font-size:9px;background:var(--theme-surface-muted)}
@media(max-width:500px){.recipient-options{max-height:185px}.recipient-input input{font-size:16px}.recipient-keyboard-hint{display:none}}
</style>
