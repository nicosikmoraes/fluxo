<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useAttrs, useId } from 'vue';
import { Check, ChevronDown } from '@lucide/vue';
defineOptions({inheritAttrs:false});
const props=defineProps({modelValue:{type:[String,Number],default:''},options:{type:Array,required:true},disabled:Boolean,required:Boolean,block:Boolean,placeholder:{type:String,default:'Selecione'}});
const emit=defineEmits(['update:modelValue','change']);
const attrs=useAttrs(),root=ref(null),trigger=ref(null),native=ref(null),popup=ref(null),opened=ref(false),active=ref(0),position=ref({});
const id=attrs.id||'app-select-'+useId(),listId=id+'-options';
const selected=computed(()=>props.options.find(option=>String(option.value)===String(props.modelValue)));
const enabled=()=>props.options.map((option,index)=>option.disabled?-1:index).filter(index=>index>=0);
function place(){
 if(!opened.value||!trigger.value)return;
 const rect=trigger.value.getBoundingClientRect(),width=Math.min(Math.max(rect.width,190),window.innerWidth-24);
 const desired=Math.min(280,props.options.length*38+12),below=window.innerHeight-rect.bottom-20,above=rect.top-20;
 const up=below<desired&&above>below,maxHeight=Math.min(desired,Math.max(80,up?above:below));
 position.value={position:'fixed',left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12))+'px',top:(up?Math.max(12,rect.top-maxHeight-8):rect.bottom+8)+'px',width:width+'px',maxHeight:maxHeight+'px'};
}
function focusActive(){nextTick(()=>popup.value?.querySelector('[data-active="true"]')?.scrollIntoView?.({block:'nearest'}));}
function show(){if(props.disabled)return;opened.value=true;const index=props.options.findIndex(option=>String(option.value)===String(props.modelValue));active.value=index>=0&&!props.options[index].disabled?index:(enabled()[0]??0);place();focusActive();}
function close(){opened.value=false;}
function nativeChanged(event){emit('update:modelValue',event.target.value);emit('change',event);}
function choose(option){if(!option||option.disabled)return;native.value.value=String(option.value);native.value.dispatchEvent(new Event('change',{bubbles:true}));close();trigger.value?.focus();}
let typed='',typeTimer;
function keys(event){
 if(event.key==='Tab'){close();return;}
 if(event.key==='Escape'&&opened.value){event.preventDefault();event.stopPropagation();close();return;}
 if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
  event.preventDefault();if(!opened.value){show();return;}
  const indexes=enabled(),current=indexes.indexOf(active.value);
  if(!indexes.length)return;
  active.value=event.key==='Home'?indexes[0]:event.key==='End'?indexes.at(-1):indexes[(current+(event.key==='ArrowDown'?1:-1)+indexes.length)%indexes.length];
  focusActive();return;
 }
 if(event.key==='Enter'||event.key===' '){event.preventDefault();opened.value?choose(props.options[active.value]):show();return;}
 if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
  event.preventDefault();typed+=event.key.toLocaleLowerCase();clearTimeout(typeTimer);typeTimer=setTimeout(()=>typed='',600);
  if(!opened.value)show();
  const index=props.options.findIndex(option=>!option.disabled&&option.label.toLocaleLowerCase().startsWith(typed));
  if(index>=0){active.value=index;focusActive();}
 }
}
function outside(event){if(opened.value&&!root.value?.contains(event.target)&&!popup.value?.contains(event.target))close();}
function blur(event){if(!root.value?.contains(event.relatedTarget)&&!popup.value?.contains(event.relatedTarget))close();}
onMounted(()=>{document.addEventListener('pointerdown',outside);document.addEventListener('scroll',place,true);window.addEventListener('resize',place);});
onBeforeUnmount(()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('scroll',place,true);window.removeEventListener('resize',place);clearTimeout(typeTimer);});
</script>
<template>
 <div ref="root" class="themed-select" :class="[attrs.class,{'is-block':block}]" :style="attrs.style" @focusout="blur">
  <button ref="trigger" :id="id" class="app-select-trigger" type="button" role="combobox" aria-haspopup="listbox" :aria-label="attrs['aria-label']" :aria-expanded="opened" :aria-controls="opened?listId:undefined" :aria-activedescendant="opened?id+'-option-'+active:undefined" :aria-required="required||undefined" :disabled="disabled" @click="opened?close():show()" @keydown="keys">
   <span v-if="$slots.icon" class="app-select-leading"><slot name="icon"/></span><span class="app-select-value">{{selected?.label||placeholder}}</span><ChevronDown :size="15" class="app-select-chevron" aria-hidden="true"/>
  </button>
  <select ref="native" :class="attrs.class" class="app-select-native" :value="modelValue" :name="attrs.name" :aria-label="attrs['aria-label']" :disabled="disabled" :required="required" aria-hidden="true" tabindex="-1" @change="nativeChanged"><option v-for="option in options" :key="option.value" :value="option.value" :disabled="option.disabled">{{option.label}}</option></select>
  <Teleport to="body"><div v-if="opened" ref="popup" :id="listId" class="app-select-popup" role="listbox" :aria-label="attrs['aria-label']" :style="position"><button v-for="(option,index) in options" :id="id+'-option-'+index" :key="option.value" class="app-select-option" type="button" role="option" tabindex="-1" :aria-selected="String(modelValue)===String(option.value)" :disabled="option.disabled" :data-active="index===active" @pointermove="active=index" @pointerdown.prevent @click="choose(option)"><span>{{option.label}}</span><Check v-if="String(modelValue)===String(option.value)" :size="14" aria-hidden="true"/></button></div></Teleport>
 </div>
</template>
<style scoped>
.themed-select{display:inline-block;min-width:160px;max-width:100%;position:relative;border:0!important;padding:0!important;background:none!important;vertical-align:middle}
.themed-select.is-block{display:block;width:100%;margin-top:8px}
.app-select-trigger{display:flex;align-items:center;gap:12px;width:100%;min-height:38px;padding:10px 16px;border:1px solid var(--theme-line,#e9edf4);border-radius:7px;background:var(--theme-panel,#fff);color:var(--theme-text-secondary,#68758d);font:inherit;font-size:12px;cursor:pointer;text-align:left}
.app-select-trigger:hover{border-color:var(--theme-line-strong,#d1dcfa);background:var(--theme-surface-hover,#f0f3fa)}
.app-select-trigger:focus-visible,.app-select-trigger[aria-expanded="true"]{outline:2px solid var(--theme-accent,#5978ed);outline-offset:2px}
.app-select-trigger:disabled{opacity:.5;cursor:not-allowed}.app-select-leading{display:flex;align-items:center;flex-shrink:0;color:var(--theme-text-muted,#8a94a6)}
.app-select-value{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.app-select-chevron{margin-left:8px;flex-shrink:0;color:var(--theme-text-muted,#8a94a6)}
.app-select-native{position:absolute!important;width:1px!important;height:1px!important;min-width:0!important;margin:0!important;padding:0!important;opacity:0!important;pointer-events:none!important;clip-path:inset(50%)!important;overflow:hidden!important;border:0!important}
.app-select-popup{z-index:400;padding:5px;border:1px solid var(--theme-line,#e9edf4);border-radius:9px;background:var(--theme-panel,#fff);color:var(--theme-text,#303b52);box-shadow:0 10px 30px var(--theme-shadow,#384c7b26);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;box-sizing:border-box;font:12px Inter,"Segoe UI",Arial,sans-serif}
.app-select-option{display:flex;align-items:center;justify-content:space-between;gap:18px;width:100%;min-height:36px;padding:9px 12px;border:0;border-radius:5px;background:transparent;color:var(--theme-text-secondary,#68758d);font:inherit;text-align:left;cursor:pointer;box-sizing:border-box}
.app-select-option[data-active="true"],.app-select-option[aria-selected="true"]{background:var(--theme-accent-soft,#edf2ff);color:var(--theme-accent,#5978ed)}
.app-select-option:disabled{opacity:.45;cursor:not-allowed}.app-select-option span{white-space:normal;line-height:1.5}
@media(prefers-reduced-motion:no-preference){.app-select-trigger{transition:background .15s,border-color .15s}}
</style>
