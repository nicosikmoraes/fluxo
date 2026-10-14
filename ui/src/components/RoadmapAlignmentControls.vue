<script setup>
import { computed, ref, watch } from 'vue';
import { Grid2X2, Undo2, Check, X } from '@lucide/vue';
import { request, notify, state } from '../workspace';
import { alignRoadmap, layoutSignature } from '../roadmapAlignment';
import { readPortals, savePortals } from '../roadmapPortals';
const props = defineProps({ roadmapId: Number, nodes: Array, portals: Array });
const emit = defineEmits(['preview', 'positions-saved']);
const preview = ref(null), undo = ref(null), saving = ref(false);
const snapshot = () => ({ nodes: props.nodes.map(({ id, x, y }) => ({ id, x, y })), portals: props.portals.map(({ id, x, y }) => ({ id, x, y })) });
const signature = computed(() => layoutSignature(props.nodes, props.portals));
const canUndo = computed(() => undo.value && signature.value === layoutSignature(undo.value.after.nodes, undo.value.after.portals));
watch(() => props.roadmapId, () => { preview.value = null; undo.value = null; emit('preview', null); });
watch(signature, value => {
 if (preview.value && !saving.value && value !== layoutSignature(preview.value.before.nodes, preview.value.before.portals)) {
  preview.value = null; emit('preview', null); notify('O mapa mudou. Gere outra prévia do alinhamento.', 'error');
 }
});
function start() {
 if (state.saving || saving.value || !props.nodes.length) return;
 try {
  const before = snapshot(), after = alignRoadmap(props.nodes, props.portals);
  if (layoutSignature(before.nodes, before.portals) === layoutSignature(after.nodes, after.portals)) { notify('Os cards já estão alinhados.'); return; }
  preview.value = { roadmapId: props.roadmapId, before, after }; emit('preview', after);
 } catch (error) { notify(error.message, 'error'); }
}
function cancel() { if (saving.value) return; preview.value = null; emit('preview', null); }
async function save(isUndo = false) {
 const operation = isUndo ? undo.value : preview.value;
 if (!operation || saving.value || state.saving || (isUndo && !canUndo.value)) return;
 const expected = isUndo ? operation.after : operation.before, target = isUndo ? operation.before : operation.after;
 if (signature.value !== layoutSignature(expected.nodes, expected.portals)) { notify('O mapa mudou. Gere outra prévia.', 'error'); return; }
 const original = new Map(expected.nodes.map(node => [node.id, node]));
 const portalChanges = layoutSignature([], expected.portals) !== layoutSignature([], target.portals);
 let storedPortals = [];
 if (portalChanges) {
  storedPortals = readPortals(operation.roadmapId);
  if (layoutSignature([], storedPortals) !== layoutSignature([], expected.portals)) { notify('Os portais mudaram. Atualize a página antes de alinhar.', 'error'); return; }
  if (!savePortals(operation.roadmapId, storedPortals)) { notify('O navegador não permitiu salvar os portais. O alinhamento não foi aplicado.', 'error'); return; }
 }
 saving.value = true; state.saving++;
 try {
  const result = await request('/roadmaps/' + operation.roadmapId + '/layout', 'PATCH', { nodes: target.nodes.map(node => ({ ...node, previous_x: original.get(node.id).x, previous_y: original.get(node.id).y })) });
  let portalPositions = target.portals, portalsSaved = true;
  if (portalChanges) {
   const positions = new Map(target.portals.map(portal => [portal.id, portal]));
   portalsSaved = savePortals(operation.roadmapId, storedPortals.map(portal => ({ ...portal, x: positions.get(portal.id).x, y: positions.get(portal.id).y })));
   if (!portalsSaved) portalPositions = expected.portals;
  }
  if (props.roadmapId === operation.roadmapId) {
   preview.value = null; emit('preview', null);
   undo.value = isUndo ? null : { ...operation, after: { nodes: result.nodes, portals: portalPositions } };
  }
  emit('positions-saved', { roadmapId: operation.roadmapId, nodes: result.nodes, portals: portalPositions });
  notify(portalsSaved ? (isUndo ? 'Alinhamento desfeito.' : 'Cards alinhados.') : 'Cards alinhados, mas o navegador não salvou as posições dos portais. Você pode desfazer.', portalsSaved ? 'success' : 'error');
 } catch (error) { notify(error.message || 'Não foi possível salvar o alinhamento. Tente novamente.', 'error'); }
 finally { saving.value = false; state.saving--; }
}
</script>
<template>
 <div class="roadmap-alignment-controls" aria-label="Alinhamento do roadmap">
  <template v-if="preview"><span class="alignment-summary" role="status">Prévia · {{ preview.after.rows }} {{ preview.after.rows===1?'linha':'linhas' }} · espaços preservados</span><button class="text-btn" :disabled="saving" @click="save(false)"><Check :size="14"/>{{ saving?'Salvando...':'Aplicar' }}</button><button class="text-btn" :disabled="saving" @click="cancel"><X :size="14"/>Cancelar</button></template>
  <template v-else><button class="text-btn" :disabled="!nodes.length||!!state.saving" @click="start"><Grid2X2 :size="14"/>Alinhar cards</button><button v-if="undo" class="text-btn" :disabled="!canUndo||!!state.saving" @click="save(true)"><Undo2 :size="14"/>Desfazer alinhamento</button></template>
 </div>
</template>
