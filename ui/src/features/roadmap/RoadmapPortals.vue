<script setup>
import { t } from "../../state/locale";
import { computed, ref, watch } from "vue";
import { Flag, Pencil, X } from "@lucide/vue";
import { state } from "../../state/workspace";
import { readPortals, savePortals } from "./roadmapPortals";
import Modal from "../../shared/Modal.vue";
import ConfirmDialog from "../../shared/ConfirmDialog.vue";
const props = defineProps({ roadmapId: Number, nodes: Array, zoom: Number, sourceNodeId: Number, positions: { type: Object, default: () => ({}) }, disabled: Boolean });
const emit = defineEmits(["connected", "reveal"]);
const markers = ref([]), form = ref(null), label = ref(""), gesture = ref(null), removingLink = ref(null);
watch(() => props.roadmapId, () => {
  form.value = null;
  gesture.value = null;
  removingLink.value = null;
});
watch(() => [props.roadmapId, state.roadmaps.find((roadmap) => roadmap.id === props.roadmapId)?.portals], () => {
  markers.value = readPortals(props.roadmapId);
}, { immediate: true });
const displayMarkers = computed(() => markers.value.map((marker) => ({ ...marker, ...props.positions[marker.id] })));
const byNode = computed(() => new Map(props.nodes.map((node) => [node.id, node])));
const links = computed(() => displayMarkers.value.flatMap((marker) => marker.sources.filter((id) => byNode.value.has(id)).map((id) => ({ id: `${marker.id}:${id}`, marker, node: byNode.value.get(id) }))));
function isDone(node) {
  return node?.activity?.status === "done" && !node.activity.blocked;
}
function isInProgress(node) {
  return node?.activity?.status === "doing" && !node.activity.blocked;
}
function finished(marker) {
  const nodes = marker.sources.map((id) => byNode.value.get(id)).filter(Boolean);
  return nodes.length > 0 && nodes.every(isDone);
}
function inProgress(marker) {
  return marker.sources.some((id) => isInProgress(byNode.value.get(id)));
}
async function persist() {
  const id = props.roadmapId;
  const saved = await savePortals(id, markers.value);
  if (props.roadmapId === id) markers.value = readPortals(id);
  return saved;
}
function openForm(point) {
  if (props.disabled) return;
  let x = Math.max(0, Math.round(point.x - 80)), y = Math.max(0, Math.round(point.y - 48));
  while (markers.value.some((marker) => Math.abs(marker.x - x) < 180 && Math.abs(marker.y - y) < 150) || props.nodes.some((node) => x < node.x + 292 && x + 180 > node.x && y < node.y + 204 && y + 150 > node.y)) x += 200;
  label.value = "";
  form.value = { x, y };
}
async function createConnected(point, source) {
  if (props.disabled || !byNode.value.has(source)) return null;
  const marker = { id: crypto.randomUUID(), label: "", x: Math.min(1e6, Math.max(0, Math.round(point.x - 80))), y: Math.min(1e6, Math.max(0, Math.round(point.y - 48))), sources: [source] };
  const next = [...markers.value, marker];
  if (!await savePortals(props.roadmapId, next)) return null;
  markers.value = next;
  emit("connected");
  emit("reveal", { ...marker, width: 160, height: 110 });
  return marker;
}
function edit(marker) {
  if (props.disabled) return;
  label.value = marker.label;
  form.value = { id: marker.id };
}
async function save() {
  if (props.disabled || !form.value) return;
  if (form.value.id) {
    const marker = markers.value.find((marker2) => marker2.id === form.value.id);
    if (marker) marker.label = label.value.trim();
  } else {
    const marker = { id: crypto.randomUUID(), label: label.value.trim(), x: form.value.x, y: form.value.y, sources: [] };
    markers.value.push(marker);
    emit("reveal", { ...marker, width: 160, height: 140 });
  }
  if (await persist()) form.value = null;
}
async function remove(marker) {
  if (props.disabled) return;
  markers.value = markers.value.filter((item) => item.id !== marker.id);
  await persist();
}
async function connect(id, source = props.sourceNodeId) {
  const marker = markers.value.find((marker2) => marker2.id === id);
  if (props.disabled || !marker || !byNode.value.has(source)) return;
  if (!marker.sources.includes(source)) {
    marker.sources.push(source);
    if (!await persist()) return;
  }
  emit("connected");
}
function path(link) {
  const start = { x: link.node.x + 272, y: link.node.y + 92 }, end = { x: link.marker.x + 42, y: link.marker.y + 48 };
  const d = Math.max(70, Math.abs(end.x - start.x) * 0.45);
  return `M ${start.x} ${start.y} C ${start.x + d} ${start.y}, ${end.x - d} ${end.y}, ${end.x} ${end.y}`;
}
function startMove(event, marker) {
  if (props.disabled || event.button !== 0 || props.sourceNodeId) return;
  event.preventDefault();
  gesture.value = { id: marker.id, x: marker.x, y: marker.y, startX: event.clientX, startY: event.clientY };
  event.currentTarget.setPointerCapture?.(event.pointerId);
}
function move(event) {
  const g = gesture.value, marker = markers.value.find((marker2) => marker2.id === g?.id);
  if (!marker) return;
  marker.x = Math.min(1e6, Math.max(0, Math.round(g.x + (event.clientX - g.startX) / props.zoom)));
  marker.y = Math.min(1e6, Math.max(0, Math.round(g.y + (event.clientY - g.startY) / props.zoom)));
}
async function endMove() {
  if (gesture.value) {
    gesture.value = null;
    await persist();
  }
}
function cancelMove() {
  const g = gesture.value, marker = markers.value.find((marker2) => marker2.id === g?.id);
  if (marker) {
    marker.x = g.x;
    marker.y = g.y;
  }
  gesture.value = null;
}
async function keyMove(event, marker) {
  if (props.disabled || event.target !== event.currentTarget) return;
  marker = markers.value.find((item) => item.id === marker.id);
  if (!marker) return;
  const delta = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }[event.key];
  if (!delta) return;
  event.preventDefault();
  event.stopPropagation();
  marker.x = Math.min(1e6, Math.max(0, marker.x + delta[0]));
  marker.y = Math.min(1e6, Math.max(0, marker.y + delta[1]));
  await persist();
  emit("reveal", { ...marker, width: 160, height: 140 });
}
async function removeLink() {
  const link = removingLink.value, marker = markers.value.find((item) => item.id === link.marker.id);
  if (marker) {
    marker.sources = marker.sources.filter((id) => id !== link.node.id);
    await persist();
  }
  removingLink.value = null;
}
function setPositions(positions) {
  const byId = new Map(positions.map((position) => [position.id, position]));
  markers.value = markers.value.map((marker) => {
    const position = byId.get(marker.id);
    return position ? { ...marker, x: position.x, y: position.y } : marker;
  });
}
defineExpose({ openForm, createConnected, connect, markers, setPositions, cancelMove });
</script>
<template>
 <svg class="maps-connections portal-connections" width="100%" height="100%" :aria-label="t('Conexões com portais')"><g v-for="link in links" :key="link.id"><path :d="path(link)" class="map-edge portal-link" :class="{finished:isDone(link.node),'in-progress':isInProgress(link.node)}"/><path :d="path(link)" class="portal-trail" :class="{finished:isDone(link.node),'in-progress':isInProgress(link.node)}" pathLength="100"/><path :d="path(link)" class="map-edge-hit" role="button" tabindex="0" :aria-label="t('Remover conexão com portal')" @pointerdown.stop @click.stop="removingLink=link" @keydown.enter.prevent.stop="removingLink=link" @keydown.space.prevent.stop="removingLink=link"/></g></svg>
 <article v-for="marker in displayMarkers" :key="marker.id" class="map-portal" :class="{finished:finished(marker),'in-progress':inProgress(marker)}" :style="{left:marker.x+'px',top:marker.y+'px'}" tabindex="0" :aria-label="(marker.label||t('Portal sem texto'))+(inProgress(marker)?t('. Em andamento'):finished(marker)?t('. Concluído'):'')+t('. Use as setas para mover.')" @keydown="keyMove($event,marker)">
  <div class="map-portal-actions"><button class="icon-btn tiny" :aria-label="t('Editar texto do portal')" @pointerdown.stop @click="edit(marker)"><Pencil :size="13"/></button><button class="icon-btn tiny" :aria-label="t('Remover portal')" @pointerdown.stop @click="remove(marker)"><X :size="13"/></button></div>
  <button class="map-portal-input" :data-portal-input="marker.id" :aria-label="t('Conectar ao portal ')+(marker.label||t('sem texto'))" @pointerdown.stop @click.stop="connect(marker.id)"></button>
  <div class="map-portal-symbol" @pointerdown.stop="startMove($event,marker)" @pointermove.stop="move" @pointerup.stop="endMove" @pointercancel.stop="cancelMove"><Flag :size="26" :stroke-width="1.6"/><span v-if="inProgress(marker)" class="map-portal-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span></div>
  <button v-if="marker.label" class="map-portal-label" @pointerdown.stop @click="edit(marker)">{{ marker.label }}</button>
 </article>
 <Teleport to="body">
 <Modal v-if="form" :title="form.id?t('Editar portal'):t('Adicionar portal')" @close="form=null"><form class="form-stack" @submit.prevent="save"><label>{{ t("Texto abaixo") }} <span class="optional">{{ t("opcional") }}</span><input v-model="label" maxlength="160" autofocus :placeholder="t('Ex.: Entrega do site')"></label><p class="muted small">{{ t("Um marco visual para organizar seu caminho.") }}</p><footer class="modal-actions"><button type="button" class="btn secondary" @click="form=null">{{ t("Cancelar") }}</button><button class="btn primary">{{ form.id?t('Salvar'):t('Adicionar portal') }}</button></footer></form></Modal>
 <ConfirmDialog v-if="removingLink" :title="t('Remover conexão?')" message="O portal e a atividade continuam no roadmap." @close="removingLink=null" @confirm="removeLink"/>
 </Teleport>
</template>
