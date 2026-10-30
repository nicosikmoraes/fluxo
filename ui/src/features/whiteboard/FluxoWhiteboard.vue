<script setup>
import { vValidate } from "../../shared/validation";
import { t } from "../../state/locale";
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from "vue";
import { MousePointer2, Hand, Square, Circle, Diamond, ArrowUpRight, Minus, Pencil, Type, StickyNote, Undo2, Redo2, Copy, Trash2, Group, Ungroup, ArrowUpToLine, ArrowDownToLine, ZoomIn, ZoomOut, Scan, Download, ChevronDown, CircleHelp, Palette, Check, LoaderCircle, CloudOff, Sparkles, X, RefreshCw, LayoutTemplate, AlignLeft, AlignCenterHorizontal, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical, AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter, Grid2X2, Plus } from "@lucide/vue";
import Modal from "../../shared/Modal.vue";
import { notify } from "../../state/workspace";
import { apiRequest } from "../auth/auth";
import WhiteboardElement from "./WhiteboardElement.vue";
import { displayColor } from "./whiteboardTheme";
import { theme } from "../appearance/theme";
import { boardTemplates, createBoardTemplate } from "./templates";
import { MAX_ELEMENTS, bounds, clamp, clone, createElement, fitText, hitTest, intersects, isPath, normalizePath, resizeElements, selectionWithGroups, strokes, fills, uid } from "./whiteboard";
import "./whiteboard.css";

const props = defineProps({ board: { type: Object, required: true } });
const doc = props.board.state;
const viewport = ref();
const artwork = ref();
const editor = ref();
const editingId = ref(null);
const tool = ref("select");
const selected = ref([]);
const camera = reactive({ x: 60, y: 50, zoom: 1 });
const size = reactive({ width: 1000, height: 650 });
const style = reactive({ stroke: "#454157", fill: "transparent", strokeWidth: 2, fontSize: 20 });
const spaceDown = ref(false);
const gesture = shallowRef(null);
const inspectorOpen = ref(false);
const helpOpen = ref(false);
const reloadOpen = ref(false);
const templatesOpen = ref(false);
const boardsOpen = ref(false);
const boards = ref([{ id: "global", name: "Quadro global", is_global: true }]);
const newBoardName = ref("");
const editingBoardId = ref(null);
const renameBoardName = ref("");
const deletingBoardId = ref(null);
const boardManagerBusy = ref(false);
const boardManagerError = ref("");
const pointers = new Map();
let resizeObserver;
let clipboard = [];
const tools = [
  { id: "select", name: "Selecionar", key: "V", icon: MousePointer2 },
  { id: "hand", name: "Mover tela", key: "H", icon: Hand },
  { id: "rectangle", name: "Retângulo", key: "R", icon: Square },
  { id: "ellipse", name: "Elipse", key: "O", icon: Circle },
  { id: "diamond", name: "Losango", key: "D", icon: Diamond },
  { id: "arrow", name: "Seta", key: "A", icon: ArrowUpRight },
  { id: "line", name: "Linha", key: "L", icon: Minus },
  { id: "pen", name: "Desenhar", key: "P", icon: Pencil },
  { id: "text", name: "Texto", key: "T", icon: Type },
  { id: "note", name: "Nota adesiva", key: "N", icon: StickyNote },
];
const selectedElements = computed(() => doc.elements.filter((item) => selected.value.includes(item.id)));
const currentBoardName = computed(() => {
  const board = boards.value.find((item) => String(item.id) === String(doc.boardId));
  return !board || board.is_global ? t("Quadro global") : board.name;
});
const selectionBounds = computed(() => bounds(selectedElements.value));
const editingElement = computed(() => doc.elements.find((item) => item.id === editingId.value));
const primaryStyle = computed(() => selectedElements.value[0] || style);
const canGroup = computed(() => selectedElements.value.length > 1);
const hasGroup = computed(() => selectedElements.value.some((item) => item.groupId));
const textStyleVisible = computed(() => ["text", "note"].includes(tool.value) || selectedElements.value.some((item) => item.text || ["text", "note"].includes(item.type)));
const pathEndpoints = computed(() => {
  const item = selectedElements.value.length === 1 ? selectedElements.value[0] : null;
  return item && ["line", "arrow"].includes(item.type) ? item.points.map(([x, y], index) => ({ x: x + item.x, y: y + item.y, index })) : [];
});
const handles = computed(() => {
  const b = selectionBounds.value;
  return !b || pathEndpoints.value.length ? [] : [
    { id: "nw", x: b.x, y: b.y }, { id: "ne", x: b.x + b.width, y: b.y },
    { id: "se", x: b.x + b.width, y: b.y + b.height }, { id: "sw", x: b.x, y: b.y + b.height },
  ];
});
const hint = computed(() => {
  if (editingId.value) return t("Escreva sua ideia · Esc para terminar");
  if (spaceDown.value || tool.value === "hand") return t("Arraste para explorar o quadro");
  if (tool.value === "select") return selected.value.length ? t("Arraste para mover · Duplo clique para escrever · Delete para remover") : t("Arraste para selecionar · Espaço para navegar · Ctrl + rolagem para zoom");
  if (["note", "text"].includes(tool.value)) return t("Clique no quadro e comece a escrever");
  if (tool.value === "pen") return t("Arraste para desenhar livremente · Esc para cancelar o traço");
  return t("Arraste para desenhar · Shift para manter a proporção · Esc para cancelar");
});
const editorStyle = computed(() => {
  const item = editingElement.value;
  if (!item) return {};
  const pad = item.type === "note" ? 20 : 8;
  return { left: camera.x + (item.x + pad) * camera.zoom + "px", top: camera.y + (item.y + pad) * camera.zoom + "px",
    width: (item.width - pad * 2) * camera.zoom + "px", height: Math.max(36, item.height - pad * 2) * camera.zoom + "px",
    fontSize: item.fontSize * camera.zoom + "px", color: displayColor(item.stroke), lineHeight: 1.4 };
});
function localPoint(event) {
  const rect = viewport.value.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
function worldPoint(event) {
  const p = localPoint(event);
  return { x: clamp((p.x - camera.x) / camera.zoom, -900000, 900000), y: clamp((p.y - camera.y) / camera.zoom, -900000, 900000) };
}
function elementAt(point) { return [...doc.elements].reverse().find((item) => hitTest(item, point, 7 / camera.zoom)); }
function focusCanvas() { if (!editingId.value) viewport.value?.focus({ preventScroll: true }); }
function selectTool(id) {
  finishEditing(); cancelGesture(); tool.value = id;
  if (id !== "select") selected.value = [];
  focusCanvas();
}
function roomFor(count = 1) {
  if (doc.elements.length + count <= MAX_ELEMENTS) return true;
  notify(t("O quadro chegou a 1.500 elementos. Remova alguns antes de continuar."), "error"); return false;
}
function replaceElements(replacements) {
  const map = new Map(replacements.map((item) => [item.id, item]));
  doc.elements = doc.elements.map((item) => map.get(item.id) || item);
}
function selectElement(item, additive = false) {
  const ids = selectionWithGroups(doc.elements, [item.id]);
  selected.value = additive ? [...new Set([...selected.value, ...ids])] : ids;
}
function beginEditing(item) {
  if (!item || isPath(item)) return;
  finishEditing(); selected.value = [item.id]; tool.value = "select";
  if (item.width < 80) item.width = 160;
  if (item.height < 36) item.height = 60;
  editingId.value = item.id;
  nextTick(() => { editor.value?.focus(); editor.value?.setSelectionRange(item.text.length, item.text.length); });
}
function textInput(event) {
  const item = editingElement.value;
  if (!item) return;
  const text = Array.from(event.target.value);
  if (text.length > 4000) {
    event.target.value = text.slice(0, 4000).join("");
    notify(t("Use no máximo {count} caracteres.", { count: 4000 }), "error");
  }
  item.text = event.target.value;
  item.height = Math.max(item.height, fitText(item));
  props.board.changed();
}
function finishEditing() {
  if (!editingId.value) return;
  const item = editingElement.value;
  if (item?.type === "text" && !item.text.trim()) {
    doc.elements = doc.elements.filter((entry) => entry.id !== item.id); selected.value = [];
  }
  editingId.value = null;
  props.board.record();
}
function addText(type, point) {
  if (!roomFor()) return;
  const item = createElement(type, point.x, point.y, style);
  doc.elements.push(item); props.board.record(); beginEditing(doc.elements[doc.elements.length - 1]);
}
function quickNote() {
  addText("note", { x: (size.width / 2 - camera.x) / camera.zoom - 108, y: (size.height / 2 - camera.y) / camera.zoom - 90 });
}
function pointerDown(event) {
  if (!doc.ready || doc.loading || event.button === 2 || helpOpen.value || reloadOpen.value) return;
  const local = localPoint(event);
  pointers.set(event.pointerId, local);
  viewport.value.setPointerCapture?.(event.pointerId);
  if (pointers.size === 2) {
    cancelGesture(false); finishEditing();
    props.board.pause();
    const [a, b] = [...pointers.values()];
    gesture.value = { kind: "pinch", distance: Math.hypot(b.x - a.x, b.y - a.y), midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, camera: { ...camera } };
    return;
  }
  if (pointers.size > 2) return;
  event.preventDefault(); finishEditing(); focusCanvas();
  props.board.pause();
  const point = worldPoint(event);
  if (spaceDown.value || tool.value === "hand" || event.button === 1) {
    gesture.value = { kind: "pan", start: local, camera: { ...camera } }; return;
  }
  if (tool.value === "select") {
    const handle = event.target.closest?.("[data-handle]")?.dataset.handle;
    const endpoint = event.target.closest?.("[data-endpoint]")?.dataset.endpoint;
    if (handle || endpoint != null) {
      gesture.value = { kind: endpoint != null ? "endpoint" : "resize", handle, endpoint: Number(endpoint), start: point, box: { ...selectionBounds.value }, originals: clone(selectedElements.value) }; return;
    }
    const item = elementAt(point);
    if (item) {
      if (event.shiftKey && selected.value.includes(item.id)) {
        const remove = selectionWithGroups(doc.elements, [item.id]);
        selected.value = selected.value.filter((id) => !remove.includes(id)); return;
      }
      if (!selected.value.includes(item.id)) selectElement(item, event.shiftKey);
      gesture.value = { kind: "move", start: point, originals: clone(selectedElements.value) };
    } else {
      const base = event.shiftKey ? [...selected.value] : [];
      selected.value = base;
      gesture.value = { kind: "marquee", start: point, current: point, base };
    }
    return;
  }
  if (["note", "text"].includes(tool.value)) { gesture.value = { kind: "place", start: point, type: tool.value }; return; }
  if (!roomFor()) return;
  const item = createElement(tool.value, point.x, point.y, style);
  if (isPath(item)) item.points = [[0, 0], [0, 0]];
  doc.elements.push(item);
  gesture.value = { kind: "draw", start: point, id: item.id, type: item.type, points: [[point.x, point.y]], moved: false };
  selected.value = [];
}
function pointerMove(event) {
  const local = localPoint(event);
  if (pointers.has(event.pointerId)) pointers.set(event.pointerId, local);
  const g = gesture.value;
  if (!g) return;
  if (g.kind === "pinch") {
    if (pointers.size !== 2) return;
    const [a, b] = [...pointers.values()];
    const zoom = clamp(g.camera.zoom * Math.hypot(b.x - a.x, b.y - a.y) / (g.distance || 1), .15, 4);
    camera.x = (a.x + b.x) / 2 - (g.midpoint.x - g.camera.x) * zoom / g.camera.zoom;
    camera.y = (a.y + b.y) / 2 - (g.midpoint.y - g.camera.y) * zoom / g.camera.zoom;
    camera.zoom = zoom; return;
  }
  if (g.kind === "pan") { camera.x = g.camera.x + local.x - g.start.x; camera.y = g.camera.y + local.y - g.start.y; return; }
  const point = worldPoint(event);
  if (g.kind === "move") {
    let dx = point.x - g.start.x, dy = point.y - g.start.y;
    if (event.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    replaceElements(g.originals.map((item) => ({ ...item, x: clamp(item.x + dx, -900000, 900000), y: clamp(item.y + dy, -900000, 900000) })));
  } else if (g.kind === "marquee") {
    gesture.value = { ...g, current: point };
    const box = { x: Math.min(point.x, g.start.x), y: Math.min(point.y, g.start.y), width: Math.abs(point.x - g.start.x), height: Math.abs(point.y - g.start.y) };
    const ids = doc.elements.filter((item) => intersects(item, box)).map((item) => item.id);
    selected.value = selectionWithGroups(doc.elements, [...new Set([...g.base, ...ids])]);
  } else if (g.kind === "resize") {
    const right = g.handle.includes("e"), bottom = g.handle.includes("s");
    let width = clamp(right ? point.x - g.box.x : g.box.x + g.box.width - point.x, 24, 100000);
    let height = clamp(bottom ? point.y - g.box.y : g.box.y + g.box.height - point.y, 24, 100000);
    if (event.shiftKey && g.box.width && g.box.height) {
      const scale = Math.min(100000 / Math.max(g.box.width, g.box.height), Math.max(width / g.box.width, height / g.box.height));
      width = g.box.width * scale; height = g.box.height * scale;
    }
    const target = { x: right ? g.box.x : g.box.x + g.box.width - width, y: bottom ? g.box.y : g.box.y + g.box.height - height, width, height };
    replaceElements(resizeElements(g.originals, g.box, target).map((item) => ({ ...item, height: item.text ? Math.max(item.height, fitText(item)) : item.height })));
  } else if (g.kind === "endpoint") {
    const original = g.originals[0];
    const points = original.points.map(([x, y]) => [x + original.x, y + original.y]);
    const fixed = points[g.endpoint === 0 ? 1 : 0];
    points[g.endpoint] = [clamp(point.x, fixed[0]-100000, fixed[0]+100000), clamp(point.y, fixed[1]-100000, fixed[1]+100000)];
    replaceElements([normalizePath(original, points)]);
  } else if (g.kind === "draw") {
    const item = doc.elements.find((entry) => entry.id === g.id);
    if (!item) return;
    g.moved ||= Math.hypot(point.x - g.start.x, point.y - g.start.y) * camera.zoom > 3;
    if (isPath(item)) {
      if (g.type === "pen") {
        const last = g.points[g.points.length - 1];
        if (g.points.length < 2000 && Math.hypot(point.x - last[0], point.y - last[1]) > 1 / camera.zoom) g.points.push([point.x, point.y]);
      } else {
        let dx = point.x - g.start.x, dy = point.y - g.start.y;
        if (event.shiftKey) {
          const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
          const length = Math.hypot(dx, dy); dx = Math.cos(angle) * length; dy = Math.sin(angle) * length;
        }
        g.points = [[g.start.x, g.start.y], [g.start.x + clamp(dx, -100000, 100000), g.start.y + clamp(dy, -100000, 100000)]];
      }
      replaceElements([normalizePath(item, g.points.length > 1 ? g.points : [...g.points, g.points[0]])]);
    } else {
      let dx = clamp(point.x - g.start.x, -100000, 100000), dy = clamp(point.y - g.start.y, -100000, 100000);
      if (event.shiftKey) { const edge = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * edge; dy = Math.sign(dy || 1) * edge; }
      Object.assign(item, { x: Math.min(g.start.x, g.start.x + dx), y: Math.min(g.start.y, g.start.y + dy), width: Math.abs(dx), height: Math.abs(dy) });
    }
  }
}
function pointerUp(event) {
  pointers.delete(event.pointerId);
  const g = gesture.value;
  if (!g) { if (!pointers.size) props.board.resume(); return; }
  if (g.kind === "pinch") { if (!pointers.size) { gesture.value = null; props.board.resume(); } return; }
  gesture.value = null;
  props.board.resume();
  if (g.kind === "place") { addText(g.type, g.start); return; }
  if (g.kind === "draw") {
    const item = doc.elements.find((entry) => entry.id === g.id);
    if (item && !g.moved) {
      if (isPath(item)) replaceElements([normalizePath(item, [[g.start.x, g.start.y], [g.start.x + (g.type === "pen" ? .1 : 160), g.start.y]])]);
      else Object.assign(item, { width: 160, height: g.type === "ellipse" ? 120 : 110 });
    }
    if (g.type !== "pen") { selected.value = [g.id]; tool.value = "select"; }
  }
  if (["draw", "move", "resize", "endpoint"].includes(g.kind)) props.board.record();
}
function cancelGesture(clearPointers = true) {
  const g = gesture.value;
  if (g?.kind === "draw") doc.elements = doc.elements.filter((item) => item.id !== g.id);
  if (g?.originals) replaceElements(clone(g.originals));
  gesture.value = null;
  if (clearPointers) pointers.clear();
  props.board.resume();
}
function doubleClick(event) {
  if (tool.value !== "select" || spaceDown.value) return;
  const item = elementAt(worldPoint(event));
  if (item) beginEditing(item);
  else addText("text", worldPoint(event));
}
function zoomTo(zoom, anchor = { x: size.width / 2, y: size.height / 2 }) {
  const next = clamp(zoom, .15, 4);
  camera.x = anchor.x - (anchor.x - camera.x) * next / camera.zoom;
  camera.y = anchor.y - (anchor.y - camera.y) * next / camera.zoom;
  camera.zoom = next;
}
function wheel(event) {
  if (event.ctrlKey || event.metaKey) zoomTo(camera.zoom * Math.exp(-event.deltaY * .008), localPoint(event));
  else { camera.x -= event.deltaX; camera.y -= event.deltaY; }
}
function fitAll() {
  finishEditing();
  const box = bounds(doc.elements);
  if (!box) { Object.assign(camera, { x: 60, y: 50, zoom: 1 }); return; }
  const zoom = clamp(Math.min((size.width - 120) / Math.max(box.width, 1), (size.height - 200) / Math.max(box.height, 1)), .15, 1.5);
  Object.assign(camera, { zoom, x: size.width / 2 - (box.x + box.width / 2) * zoom, y: size.height / 2 + 20 - (box.y + box.height / 2) * zoom });
  focusCanvas();
}
function updateStyle(key, value) {
  style[key] = value;
  for (const item of selectedElements.value) {
    item[key] = value;
    if ((key === "fontSize" || key === "strokeWidth") && item.text) item.height = Math.max(item.height, fitText(item));
  }
  props.board.record();
}
function removeSelected() {
  finishEditing();
  doc.elements = doc.elements.filter((item) => !selected.value.includes(item.id));
  selected.value = []; props.board.record(); focusCanvas();
}
function duplicate(items = selectedElements.value) {
  finishEditing();
  if (!roomFor(items.length) || !items.length) return;
  const groups = new Map();
  const copies = clone(items).map((item) => {
    if (item.groupId && !groups.has(item.groupId)) groups.set(item.groupId, uid());
    return { ...item, id: uid(), x: clamp(item.x + 24, -900000, 900000), y: clamp(item.y + 24, -900000, 900000), groupId: item.groupId ? groups.get(item.groupId) : null };
  });
  doc.elements.push(...copies); selected.value = copies.map((item) => item.id); props.board.record(); focusCanvas();
}
function groupSelection(ungroup = false) {
  if (!canGroup.value && !ungroup) return;
  const groupId = ungroup ? null : uid();
  selectedElements.value.forEach((item) => item.groupId = groupId);
  props.board.record(); focusCanvas();
}
function reorder(front) {
  const chosen = selectedElements.value;
  const others = doc.elements.filter((item) => !selected.value.includes(item.id));
  doc.elements = front ? [...others, ...chosen] : [...chosen, ...others]; props.board.record(); focusCanvas();
}
function alignSelection(alignment) {
  const items = selectedElements.value;
  if (items.length < 2) return;
  const box = bounds(items);
  for (const item of items) {
    if (alignment === "left") item.x = box.x;
    if (alignment === "center-x") item.x = box.x + (box.width - item.width) / 2;
    if (alignment === "right") item.x = box.x + box.width - item.width;
    if (alignment === "top") item.y = box.y;
    if (alignment === "center-y") item.y = box.y + (box.height - item.height) / 2;
    if (alignment === "bottom") item.y = box.y + box.height - item.height;
  }
  props.board.record();
}
function distributeSelection(direction) {
  const items = selectedElements.value;
  if (items.length < 3) return;
  const horizontal = direction === "horizontal";
  const ordered = [...items].sort((a, b) => horizontal ? a.x - b.x : a.y - b.y);
  const first = ordered[0], last = ordered[ordered.length - 1];
  const start = horizontal ? first.x : first.y;
  const end = horizontal ? last.x + last.width : last.y + last.height;
  const occupied = ordered.reduce((sum, item) => sum + (horizontal ? item.width : item.height), 0);
  const gap = (end - start - occupied) / (ordered.length - 1);
  let cursor = start;
  for (const item of ordered) {
    if (horizontal) item.x = cursor;
    else item.y = cursor;
    cursor += (horizontal ? item.width : item.height) + gap;
  }
  props.board.record();
}
function arrangeAsGrid() {
  const items = selectedElements.value;
  if (items.length < 2) return;
  const box = bounds(items), columns = Math.ceil(Math.sqrt(items.length));
  const cellWidth = Math.max(140, ...items.map((item) => item.width));
  const cellHeight = Math.max(100, ...items.map((item) => item.height));
  items.forEach((item, index) => {
    item.x = box.x + (index % columns) * (cellWidth + 24);
    item.y = box.y + Math.floor(index / columns) * (cellHeight + 24);
  });
  props.board.record();
}
function insertTemplate(templateId) {
  const origin = { x: (size.width / 2 - camera.x) / camera.zoom - 360, y: (size.height / 2 - camera.y) / camera.zoom - 150 };
  const elements = createBoardTemplate(templateId, origin.x, origin.y);
  if (!elements.length || !roomFor(elements.length)) return;
  finishEditing();
  doc.elements.push(...elements);
  selected.value = elements.map((item) => item.id);
  templatesOpen.value = false;
  props.board.record();
  nextTick(fitAll);
}
function restoreHistory(direction) {
  finishEditing(); cancelGesture();
  const before = new Set(doc.elements.map((item) => item.id));
  props.board[direction]();
  const restored = doc.elements.filter((item) => !before.has(item.id)).map((item) => item.id);
  selected.value = restored.length ? restored : selected.value.filter((id) => doc.elements.some((item) => item.id === id));
  focusCanvas();
}
function undo() { restoreHistory("undo"); }
function redo() { restoreHistory("redo"); }
function keyDown(event) {
  if (helpOpen.value || reloadOpen.value || boardsOpen.value || event.target.closest?.("input,textarea,select,[contenteditable=true],dialog")) return;
  const key = event.key.toLowerCase(), modifier = event.ctrlKey || event.metaKey;
  if (event.code === "Space") { event.preventDefault(); spaceDown.value = true; return; }
  if (key === "escape") { cancelGesture(); selected.value = []; tool.value = "select"; return; }
  if (!doc.ready || doc.loading) return;
  if (modifier) {
    if (key === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    else if (key === "y") { event.preventDefault(); redo(); }
    else if (key === "a") { event.preventDefault(); tool.value = "select"; selected.value = doc.elements.map((item) => item.id); }
    else if (key === "d") { event.preventDefault(); duplicate(); }
    else if (key === "g") { event.preventDefault(); groupSelection(event.shiftKey); }
    else if (key === "c" && selected.value.length) { event.preventDefault(); clipboard = clone(selectedElements.value); }
    else if (key === "v" && clipboard.length) { event.preventDefault(); duplicate(clipboard); clipboard = clone(selectedElements.value); }
    else if (key === "s") { event.preventDefault(); props.board.save(); }
    else if (["+", "="].includes(key)) { event.preventDefault(); zoomTo(camera.zoom * 1.2); }
    else if (key === "-") { event.preventDefault(); zoomTo(camera.zoom / 1.2); }
    else if (key === "0") { event.preventDefault(); zoomTo(1); }
    return;
  }
  if (["delete", "backspace"].includes(key) && selected.value.length) { event.preventDefault(); removeSelected(); return; }
  if (key === "enter" && selectedElements.value.length === 1) { event.preventDefault(); beginEditing(selectedElements.value[0]); return; }
  if (key.startsWith("arrow") && selected.value.length) {
    event.preventDefault(); const step = event.shiftKey ? 10 : 1;
    selectedElements.value.forEach((item) => {
      if (key === "arrowleft" || key === "arrowright") item.x = clamp(item.x + (key === "arrowleft" ? -step : step), -900000, 900000);
      else item.y = clamp(item.y + (key === "arrowup" ? -step : step), -900000, 900000);
    }); props.board.record(); return;
  }
  if (key === "1") { event.preventDefault(); fitAll(); return; }
  if (key === "?") { helpOpen.value = true; return; }
  const next = tools.find((item) => item.key.toLowerCase() === key);
  if (next) { event.preventDefault(); selectTool(next.id); }
}
function keyUp(event) { if (event.code === "Space") spaceDown.value = false; }
function windowBlur() { spaceDown.value = false; cancelGesture(); }
function download(content, type, extension) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "fluxo-quadro." + extension;
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportDraft() {
  finishEditing(); download(JSON.stringify({ format: "fluxo-whiteboard", schema: 1, elements: doc.elements }, null, 2), "application/json", "json");
}
async function exportSvg() {
  finishEditing();
  await nextTick();
  const box = bounds(doc.elements);
  if (!box || !artwork.value) return;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("viewBox", `${box.x - 32} ${box.y - 32} ${box.width + 64} ${box.height + 64}`);
  svg.setAttribute("width", String(box.width + 64)); svg.setAttribute("height", String(box.height + 64));
  const background = document.createElementNS(svg.namespaceURI, "rect");
  for (const [key, value] of Object.entries({ x: box.x - 32, y: box.y - 32, width: box.width + 64, height: box.height + 64, fill: theme.value === "graphite" ? "#17191c" : "#fcfbf8" })) background.setAttribute(key, String(value));
  svg.append(background, artwork.value.cloneNode(true));
  download(new XMLSerializer().serializeToString(svg), "image/svg+xml", "svg");
}
async function reloadSaved() {
  reloadOpen.value = false; selected.value = []; await props.board.load(true); nextTick(fitAll);
}
async function refreshBoards() {
  try {
    const result = await apiRequest("/whiteboards");
    boards.value = result.whiteboards;
  } catch (error) { boardManagerError.value = error.message; }
}
async function selectBoard(boardId) {
  if (boardManagerBusy.value || doc.loading) return;
  boardManagerBusy.value = true; boardManagerError.value = "";
  try {
    finishEditing(); cancelGesture();
    await props.board.switchBoard(boardId);
    if (doc.error) { boardManagerError.value = doc.error; return; }
    selected.value = []; tool.value = "select"; boardsOpen.value = false; nextTick(fitAll);
  } catch (error) { boardManagerError.value = error.message; }
  finally { boardManagerBusy.value = false; }
}
async function createNamedBoard() {
  const name = newBoardName.value.trim();
  if (!name || boardManagerBusy.value) return;
  boardManagerBusy.value = true; boardManagerError.value = "";
  try {
    const created = await apiRequest("/whiteboards", "POST", { name });
    boards.value.push(created); newBoardName.value = "";
    boardManagerBusy.value = false;
    await selectBoard(created.id);
    if (!doc.error) boardsOpen.value = false;
  } catch (error) { boardManagerError.value = error.message; }
  finally { boardManagerBusy.value = false; }
}
function startRenamingBoard(board) {
  editingBoardId.value = String(board.id); renameBoardName.value = board.name; deletingBoardId.value = null;
}
async function saveBoardName(board) {
  const name = renameBoardName.value.trim();
  if (!name || boardManagerBusy.value) return;
  boardManagerBusy.value = true; boardManagerError.value = "";
  try {
    const updated = await apiRequest(`/whiteboards/${encodeURIComponent(board.id)}`, "PATCH", { name });
    boards.value = boards.value.map((item) => String(item.id) === String(updated.id) ? updated : item);
    editingBoardId.value = null;
  } catch (error) { boardManagerError.value = error.message; }
  finally { boardManagerBusy.value = false; }
}
async function deleteNamedBoard(board) {
  if (boardManagerBusy.value) return;
  boardManagerBusy.value = true; boardManagerError.value = "";
  try {
    if (String(doc.boardId) === String(board.id)) {
      finishEditing(); await props.board.switchBoard("global");
      if (doc.error) { boardManagerError.value = doc.error; return; }
      selected.value = []; nextTick(fitAll);
    }
    await apiRequest(`/whiteboards/${encodeURIComponent(board.id)}`, "DELETE");
    boards.value = boards.value.filter((item) => String(item.id) !== String(board.id));
    deletingBoardId.value = null; editingBoardId.value = null;
  } catch (error) { boardManagerError.value = error.message; }
  finally { boardManagerBusy.value = false; }
}
onMounted(async () => {
  window.addEventListener("keydown", keyDown); window.addEventListener("keyup", keyUp); window.addEventListener("blur", windowBlur);
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(([entry]) => { size.width = entry.contentRect.width; size.height = entry.contentRect.height; });
    resizeObserver.observe(viewport.value);
  }
  await Promise.all([props.board.load(), refreshBoards()]);
  if (doc.elements.length) nextTick(fitAll);
});
onBeforeUnmount(() => {
  cancelGesture(); finishEditing(); props.board.save(); resizeObserver?.disconnect();
  window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); window.removeEventListener("blur", windowBlur);
});
</script>

<template>
  <section class="sketch-page" :aria-label="t('Quadro de ideias')">
    <header class="sketch-heading">
      <div class="sketch-heading-icon"><Pencil :size="22" /></div>
      <div><div class="sketch-eyebrow">{{ t("ESPAÇO LIVRE") }} <span>·</span>{{ doc.boardId==='global'?'GLOBAL':t('QUADRO POR TEMA') }}</div><h1>{{ t("Quadro de ideias") }}<span>.</span></h1><p>{{ t("Um lugar para pensar com as mãos.") }}</p></div>
    <div class="sketch-heading-actions">
        <button class="sketch-board-trigger" :aria-label="t('Gerenciar quadros')" @click="boardsOpen=true;boardManagerError=''" :title="currentBoardName"><LayoutTemplate :size="15" /><span>{{ currentBoardName }}</span><ChevronDown :size="13" /></button>
        <button class="sketch-template-trigger" :aria-label="t('Abrir modelos prontos')" @click="templatesOpen=true"><LayoutTemplate :size="15" /><span>{{ t("Modelos") }}</span></button>
        <button class="sketch-help-button" :aria-label="t('Como usar o quadro')" @click="helpOpen=true"><CircleHelp :size="17" /><span>{{ t("Como usar") }}</span></button>
        <details class="sketch-export" @keydown.esc="event=>event.currentTarget.removeAttribute('open')">
          <summary><Download :size="16" /><span>{{ t("Exportar") }}</span><ChevronDown :size="13" /></summary>
          <div><button :disabled="!doc.elements.length" @click="exportSvg">{{ t("Imagem SVG") }} <span>{{ t("Pronta para compartilhar") }}</span></button><button @click="exportDraft">{{ t("Arquivo do quadro") }} <span>{{ t("Uma cópia das suas ideias") }}</span></button></div>
        </details>
      </div>
    </header>

    <div v-if="doc.error" class="sketch-error" role="alert"><CloudOff :size="17" /><p>{{ doc.error }}<span v-if="doc.ready && !doc.conflict"> {{ t("Seu rascunho continua nesta aba.") }}</span></p><button v-if="doc.conflict" @click="exportDraft">{{ t("Exportar rascunho") }}</button><button v-if="doc.conflict" @click="reloadOpen=true">{{ t("Carregar versão salva") }}</button><button v-else @click="doc.ready ? board.save() : board.load()"><RefreshCw :size="13" /> {{ t("Tentar novamente") }}</button></div>

    <div ref="viewport" class="sketch-viewport" :class="{'is-hand':spaceDown||tool==='hand','is-panning':gesture?.kind==='pan'||gesture?.kind==='pinch','is-drawing':!['hand','select'].includes(tool),'show-inspector':inspectorOpen}" tabindex="0" :aria-label="t('Área de desenho. Use as ferramentas acima ou pressione interrogação para ver os atalhos.')" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="cancelGesture()" @contextmenu.prevent="cancelGesture();selectTool('select')" @dblclick="doubleClick" @wheel.prevent="wheel">
      <svg class="sketch-scene" width="100%" height="100%" :aria-label="t('Desenhos do quadro')">
        <defs><pattern id="sketch-dots" :x="camera.x" :y="camera.y" :width="24*camera.zoom" :height="24*camera.zoom" patternUnits="userSpaceOnUse"><circle :cx="1" :cy="1" :r="camera.zoom < .4 ? .5 : .85" fill="#d6d2df" /></pattern></defs>
        <rect width="100%" height="100%" fill="url(#sketch-dots)" />
        <g :transform="`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`">
          <g ref="artwork" class="sketch-artwork"><WhiteboardElement v-for="item in doc.elements" :key="item.id" :element="item" :editing="editingId===item.id" /></g>
          <g v-if="selectionBounds && !editingId && !gesture?.kind?.includes('draw')" class="sketch-selection" :stroke-width="1.3/camera.zoom" stroke="#8271d6" fill="none">
            <rect v-if="!pathEndpoints.length" :x="selectionBounds.x-5/camera.zoom" :y="selectionBounds.y-5/camera.zoom" :width="selectionBounds.width+10/camera.zoom" :height="selectionBounds.height+10/camera.zoom" rx="2" :stroke-dasharray="hasGroup ? undefined : `${4/camera.zoom} ${3/camera.zoom}`" pointer-events="none" />
            <rect v-for="handle in handles" :key="handle.id" :data-handle="handle.id" :x="handle.x-5/camera.zoom" :y="handle.y-5/camera.zoom" :width="10/camera.zoom" :height="10/camera.zoom" :rx="2/camera.zoom" fill="white" :class="'sketch-handle-'+handle.id" />
            <circle v-for="point in pathEndpoints" :key="point.index" :data-endpoint="point.index" :cx="point.x" :cy="point.y" :r="5/camera.zoom" fill="white" class="sketch-endpoint" />
          </g>
          <rect v-if="gesture?.kind==='marquee'" :x="Math.min(gesture.start.x,gesture.current.x)" :y="Math.min(gesture.start.y,gesture.current.y)" :width="Math.abs(gesture.current.x-gesture.start.x)" :height="Math.abs(gesture.current.y-gesture.start.y)" fill="#8271d615" stroke="#8271d6" :stroke-width="1/camera.zoom" pointer-events="none" />
        </g>
      </svg>

      <div class="sketch-tools" role="toolbar" :aria-label="t('Ferramentas de desenho')" @pointerdown.stop @dblclick.stop @wheel.stop @contextmenu.stop>
        <button v-for="item in tools" :key="item.id" :aria-label="t(item.name)" :aria-pressed="tool===item.id" :title="`${t(item.name)} (${item.key})`" :class="{active:tool===item.id,'sketch-tool-divider':item.id==='rectangle'||item.id==='text'}" :disabled="!doc.ready||doc.loading" @click="selectTool(item.id)"><component :is="item.icon" :size="18" /><span class="sketch-tool-key">{{ item.key }}</span></button>
        <button class="sketch-style-toggle" :aria-label="t('Abrir opções de estilo')" :aria-expanded="inspectorOpen" @click="inspectorOpen=!inspectorOpen"><Palette :size="18" /></button>
      </div>

      <aside v-if="doc.ready && !doc.loading && (tool!=='hand' || selected.length)" class="sketch-inspector" :aria-label="t('Estilo e seleção')" @pointerdown.stop @dblclick.stop @wheel.stop @contextmenu.stop>
        <header><span>{{ selected.length ? `${selected.length} ${selected.length===1?t('elemento'):t('elementos')}` : t('SEU TRAÇO') }}</span><button class="sketch-inspector-close" :aria-label="t('Fechar opções de estilo')" @click="inspectorOpen=false"><X :size="14" /></button></header>
        <div class="sketch-inspector-section"><label>{{ t("Cor do traço") }}</label><div class="sketch-swatches"><button v-for="color in strokes" :key="color.value" :style="{'--swatch':displayColor(color.value)}" :aria-label="t('Traço {color}', { color: t(color.label) })" :aria-pressed="primaryStyle.stroke===color.value" :title="t(color.label)" :class="{chosen:primaryStyle.stroke===color.value}" @click="updateStyle('stroke',color.value)"><Check v-if="primaryStyle.stroke===color.value" :size="12" /></button></div></div>
        <div class="sketch-inspector-section"><label>{{ t("Preenchimento") }}</label><div class="sketch-swatches"><button v-for="color in fills" :key="color.value" :style="{'--swatch':displayColor(color.value, 'fill')}" :aria-label="t('Preenchimento {color}', { color: t(color.label) })" :aria-pressed="primaryStyle.fill===color.value" :title="t(color.label)" :class="{chosen:primaryStyle.fill===color.value,transparent:color.value==='transparent'}" @click="updateStyle('fill',color.value)"><Check v-if="primaryStyle.fill===color.value" :size="12" /></button></div></div>
        <div class="sketch-inspector-section"><label>{{ t("Espessura") }}</label><div class="sketch-segmented"><button v-for="width in [2,4,7]" :key="width" :aria-label="`Espessura ${width}`" :aria-pressed="primaryStyle.strokeWidth===width" :class="{active:primaryStyle.strokeWidth===width}" @click="updateStyle('strokeWidth',width)"><span :style="{height:width+'px'}"></span></button></div></div>
        <div v-if="textStyleVisible" class="sketch-inspector-section"><label>{{ t("Tamanho do texto") }}</label><div class="sketch-segmented"><button v-for="font in [16,20,28]" :key="font" :aria-label="`Texto ${font}`" :aria-pressed="primaryStyle.fontSize===font" :class="{active:primaryStyle.fontSize===font}" @click="updateStyle('fontSize',font)">{{ font }}</button></div></div>
        <template v-if="selected.length">
          <div class="sketch-inspector-section sketch-selection-actions"><label>{{ t("Organizar") }}</label><div><button :aria-label="t('Duplicar seleção')" :title="t('Duplicar (Ctrl+D)')" @click="duplicate()"><Copy :size="16" /></button><button :disabled="!canGroup" :aria-label="t('Agrupar seleção')" :title="t('Agrupar (Ctrl+G)')" @click="groupSelection()"><Group :size="16" /></button><button :disabled="!hasGroup" :aria-label="t('Desagrupar seleção')" :title="t('Desagrupar (Ctrl+Shift+G)')" @click="groupSelection(true)"><Ungroup :size="16" /></button></div><div><button :aria-label="t('Trazer para frente')" :title="t('Trazer para frente')" @click="reorder(true)"><ArrowUpToLine :size="16" /></button><button :aria-label="t('Enviar para trás')" :title="t('Enviar para trás')" @click="reorder(false)"><ArrowDownToLine :size="16" /></button><button class="sketch-delete" :aria-label="t('Excluir seleção')" :title="t('Excluir (Delete)')" @click="removeSelected"><Trash2 :size="16" /></button></div>
            <details class="sketch-align-menu"><summary :aria-label="t('Alinhar e distribuir seleção')"><AlignHorizontalDistributeCenter :size="14" /> {{ t("Alinhar e distribuir") }}</summary><div class="sketch-align-options">
              <button :aria-label="t('Alinhar à esquerda')" :disabled="selected.length<2" @click="alignSelection('left')"><AlignLeft :size="14" />{{ t("Esquerda") }}</button><button :aria-label="t('Centralizar horizontalmente')" :disabled="selected.length<2" @click="alignSelection('center-x')"><AlignCenterHorizontal :size="14" />{{ t("Centro") }}</button><button :aria-label="t('Alinhar à direita')" :disabled="selected.length<2" @click="alignSelection('right')"><AlignRight :size="14" />{{ t("Direita") }}</button>
              <button :aria-label="t('Alinhar ao topo')" :disabled="selected.length<2" @click="alignSelection('top')"><AlignStartVertical :size="14" />{{ t("Topo") }}</button><button :aria-label="t('Centralizar verticalmente')" :disabled="selected.length<2" @click="alignSelection('center-y')"><AlignCenterVertical :size="14" />{{ t("Meio") }}</button><button :aria-label="t('Alinhar à base')" :disabled="selected.length<2" @click="alignSelection('bottom')"><AlignEndVertical :size="14" />{{ t("Base") }}</button>
              <button :aria-label="t('Distribuir horizontalmente')" :disabled="selected.length<3" @click="distributeSelection('horizontal')"><AlignHorizontalDistributeCenter :size="14" />{{ t("Distribuir na horizontal") }}</button><button :aria-label="t('Distribuir verticalmente')" :disabled="selected.length<3" @click="distributeSelection('vertical')"><AlignVerticalDistributeCenter :size="14" />{{ t("Distribuir na vertical") }}</button><button :aria-label="t('Organizar em grade')" :disabled="selected.length<2" @click="arrangeAsGrid"><Grid2X2 :size="14" />{{ t("Organizar em grade") }}</button>
            </div></details>
          </div>
          <button v-if="selectedElements.length===1 && !isPath(selectedElements[0])" class="sketch-write-button" :aria-label="t('Escrever no elemento')" @click="beginEditing(selectedElements[0])"><Type :size="14" /> {{ t("Escrever no elemento") }}</button>
        </template>
        <div v-else class="sketch-style-note">{{ t("Do seu jeito,") }}<br>{{ t("um traço de cada vez.") }}<span>✧</span></div>
      </aside>

      <textarea v-if="editingElement" ref="editor" class="sketch-text-editor" :style="editorStyle" :value="editingElement.text" spellcheck="true" :aria-label="t('Texto do elemento')" :placeholder="t('Sua ideia aqui...')" @input="textInput" @blur="finishEditing" @pointerdown.stop @pointermove.stop @pointerup.stop @dblclick.stop @contextmenu.stop @wheel.stop @keydown.stop @keydown.esc.prevent="finishEditing();focusCanvas()" @keydown.ctrl.enter.prevent="finishEditing();focusCanvas()" @keydown.meta.enter.prevent="finishEditing();focusCanvas()"></textarea>

      <div v-if="doc.loading" class="sketch-loading" role="status"><LoaderCircle :size="24" class="spin" /><p>{{ t("Abrindo espaço para suas ideias...") }}</p></div>
      <div v-else-if="doc.ready && !doc.elements.length && !gesture && !editingId && ['select','hand'].includes(tool)" class="sketch-empty" @pointerdown.stop @dblclick.stop>
        <svg class="sketch-empty-art" viewBox="0 0 260 150" aria-hidden="true"><g transform="rotate(-9 75 74)"><rect x="28" y="35" width="92" height="83" rx="4" fill="#fff0ba" /><path d="M44 57h56M44 69h40M44 81h49" stroke="#cbb875" stroke-width="3" stroke-linecap="round" /><path d="M95 118v-19h25" fill="#efdda1" /></g><path d="M125 91q24 11 36-13" stroke="#a59ac8" stroke-width="2" fill="none" stroke-dasharray="5 5" /><path d="m149 78 13-2-2 13" stroke="#a59ac8" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" /><rect x="162" y="22" width="68" height="50" rx="10" fill="#eee8fa" stroke="#a89bcf" stroke-width="2" transform="rotate(7 196 47)" /><circle cx="194" cy="111" r="22" fill="#e4f1e8" stroke="#91b7a1" stroke-width="2" /><path d="m22 17 2 7 7 2-7 2-2 7-2-7-7-2 7-2Z" fill="#b8abd7" /><path d="m243 91 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="#d5bf7e" /></svg>
        <span class="sketch-empty-eyebrow">{{ t("TODA IDEIA COMEÇA COM UM TRAÇO") }}</span><h2>{{ t("Deixe o pensamento fluir") }}<span>.</span></h2><p>{{ t("Rabisque, conecte, escreva.") }}<br>{{ t("Aqui suas ideias têm espaço para crescer.") }}</p><div><button class="sketch-start-note" @click="quickNote"><StickyNote :size="16" /> {{ t("Minha primeira ideia") }}</button><button class="sketch-start-draw" @click="selectTool('pen')"><Pencil :size="15" /> {{ t("Só quero desenhar") }}</button></div><button class="sketch-empty-templates" @click="templatesOpen=true"><LayoutTemplate :size="14" /> {{ t("Começar com um modelo pronto") }}</button><span class="sketch-empty-tip">{{ t("Não precisa ficar perfeito. Só precisa começar.") }}</span>
      </div>

      <div class="sketch-bottom" @pointerdown.stop @dblclick.stop @wheel.stop>
        <div class="sketch-bottom-left"><div class="sketch-zoom"><button :aria-label="t('Diminuir zoom')" @click="zoomTo(camera.zoom/1.2)"><ZoomOut :size="16" /></button><button class="sketch-zoom-value" :aria-label="t('Restaurar zoom para 100%')" @click="zoomTo(1)">{{ Math.round(camera.zoom*100) }}%</button><button :aria-label="t('Aumentar zoom')" @click="zoomTo(camera.zoom*1.2)"><ZoomIn :size="16" /></button><i></i><button :aria-label="t('Mostrar todo o quadro')" :title="t('Mostrar tudo (1)')" @click="fitAll"><Scan :size="17" /></button></div><div class="sketch-history"><button :aria-label="t('Desfazer')" :title="t('Desfazer (Ctrl+Z)')" :disabled="!board.historyState.undo" @click="undo"><Undo2 :size="17" /></button><button :aria-label="t('Refazer')" :title="t('Refazer (Ctrl+Shift+Z)')" :disabled="!board.historyState.redo" @click="redo"><Redo2 :size="17" /></button></div></div>
        <div class="sketch-document-status" role="status"><CloudOff v-if="doc.error" :size="13" /><LoaderCircle v-else-if="doc.saving||doc.dirty" :size="13" class="spin" /><Check v-else :size="13" /><span>{{ doc.error?t('Rascunho nesta aba'):doc.saving||doc.dirty?t('Salvando ideias...'):doc.loading?t('Abrindo quadro...'):t('Suas ideias estão salvas') }}</span></div>
      </div>
    </div>
    <footer class="sketch-footer"><span>{{ hint }}</span><span>{{ doc.elements.length }} {{ doc.elements.length===1?t('elemento'):t('elementos') }}<i>·</i>{{ t("Possibilidades infinitas") }} <Sparkles :size="12" /></span></footer>

    <Modal v-if="helpOpen" :title="t('Um espaço para suas ideias')" @close="helpOpen=false"><div class="sketch-guide"><p>{{ t("Escolha uma ferramenta e clique ou arraste no quadro. Dê dois cliques em uma forma para escrever dentro dela.") }}</p><dl><div><dt>{{ t("Mover pelo quadro") }}</dt><dd><kbd>{{ t("Espaço") }}</kbd> {{ t("+ arrastar, ferramenta mão ou dois dedos") }}</dd></div><div><dt>Zoom</dt><dd><kbd>Ctrl</kbd> {{ t("+ rolagem ou gesto de pinça") }}</dd></div><div><dt>{{ t("Selecionar vários") }}</dt><dd>{{ t("Arraste uma área ou use") }} <kbd>Shift</kbd> {{ t("+ clique") }}</dd></div><div><dt>{{ t("Proporções e linhas retas") }}</dt><dd>{{ t("Segure") }} <kbd>Shift</kbd> {{ t("ao desenhar ou redimensionar") }}</dd></div><div><dt>{{ t("Desfazer / refazer") }}</dt><dd><kbd>Ctrl Z</kbd> / <kbd>Ctrl Shift Z</kbd></dd></div><div><dt>{{ t("Duplicar / agrupar") }}</dt><dd><kbd>Ctrl D</kbd> / <kbd>Ctrl G</kbd></dd></div><div><dt>{{ t("Desagrupar") }}</dt><dd><kbd>Ctrl Shift G</kbd></dd></div><div><dt>{{ t("Mover seleção") }}</dt><dd>{{ t("Setas do teclado ·") }} <kbd>Shift</kbd> {{ t("para passos maiores") }}</dd></div><div><dt>{{ t("Ver todo o quadro") }}</dt><dd><kbd>1</kbd></dd></div></dl><p class="sketch-guide-note">{{ t("Tudo é salvo automaticamente na sua conta. No Mac, use ⌘ no lugar de Ctrl.") }}</p></div></Modal>
    <Modal v-if="templatesOpen" :title="t('Escolha um ponto de partida')" @close="templatesOpen=false"><div class="sketch-template-gallery"><p>{{ t("O modelo entra no quadro perto do centro da tela. Você pode editar, mover ou apagar qualquer parte depois.") }}</p><div class="sketch-template-cards"><button v-for="template in boardTemplates" :key="template.id" class="sketch-template-card" @click="insertTemplate(template.id)"><span class="sketch-template-art" :style="{'--template-accent':template.accent}"><LayoutTemplate :size="23" /></span><strong>{{ t(template.name) }}</strong><small>{{ t(template.description) }}</small><span class="sketch-template-use">{{ t("Usar modelo") }} <ChevronDown :size="13" /></span></button></div></div></Modal>
    <Modal v-if="boardsOpen" :title="t('Seus quadros')" @close="boardsOpen=false"><div class="sketch-boards-manager"><p>{{ t("O quadro global é sua entrada principal. Crie quadros separados para organizar ideias por tema.") }}</p><form v-validate novalidate class="sketch-board-create" @submit.prevent="createNamedBoard"><input v-model="newBoardName" data-validate-maxlength="50" :aria-label="t('Nome do novo quadro')" :placeholder="t('Ex.: Projeto de viagem')"><button :disabled="!newBoardName.trim()||boardManagerBusy"><Plus :size="15" /> {{ t("Criar quadro") }}</button></form><p v-if="boardManagerError" class="sketch-board-error" role="alert">{{ boardManagerError }}</p><div class="sketch-board-list"><article v-for="boardItem in boards" :key="boardItem.id" class="sketch-board-row" :class="{'is-current':String(boardItem.id)===String(doc.boardId)}">
        <template v-if="editingBoardId===String(boardItem.id)"><form v-validate novalidate class="sketch-board-rename" @submit.prevent="saveBoardName(boardItem)"><input v-model="renameBoardName" data-validate-maxlength="50" :aria-label="t('Novo nome para {name}', { name: boardItem.name })"><button :disabled="!renameBoardName.trim()||boardManagerBusy" :aria-label="t('Salvar nome')"><Check :size="15" /></button><button type="button" :aria-label="t('Cancelar renomeação')" @click="editingBoardId=null"><X :size="15" /></button></form></template>
        <template v-else><div class="sketch-board-info"><strong>{{ boardItem.is_global ? t("Quadro global") : boardItem.name }}</strong><small>{{ boardItem.is_global?t('Principal · entrada global'):String(boardItem.id)===String(doc.boardId)?t('Quadro aberto'):t('Quadro separado') }}</small></div><div class="sketch-board-actions"><button class="sketch-board-open" :disabled="boardManagerBusy||doc.loading" @click="selectBoard(boardItem.id)">{{ String(boardItem.id)===String(doc.boardId)?t('Aberto'):t('Abrir') }}</button><button v-if="!boardItem.is_global" :aria-label="t('Renomear quadro')" :title="t('Renomear')" :disabled="boardManagerBusy" @click="startRenamingBoard(boardItem)"><Pencil :size="14" /></button><button v-if="!boardItem.is_global" :aria-label="t('Excluir quadro')" :title="t('Excluir')" :disabled="boardManagerBusy" @click="deletingBoardId=String(boardItem.id);editingBoardId=null"><Trash2 :size="14" /></button></div></template>
        <div v-if="deletingBoardId===String(boardItem.id)" class="sketch-board-confirm"><span>{{ t("Excluir “") }}{{ boardItem.is_global ? t("Quadro global") : boardItem.name }}{{ t("” e todo o conteúdo?") }}</span><button @click="deletingBoardId=null">{{ t("Cancelar") }}</button><button class="is-danger" :disabled="boardManagerBusy" @click="deleteNamedBoard(boardItem)">{{ t("Excluir quadro") }}</button></div>
      </article></div></div></Modal>
    <Modal v-if="reloadOpen" :title="t('Carregar a versão salva?')" @close="reloadOpen=false"><div class="sketch-guide"><p>{{ t("O rascunho desta aba será substituído pelo quadro salvo na sua conta. Exporte uma cópia se quiser guardar estas alterações.") }}</p><button class="btn secondary" @click="exportDraft"><Download :size="15" /> {{ t("Exportar rascunho") }}</button></div><footer class="modal-actions"><button class="btn secondary" @click="reloadOpen=false">{{ t("Continuar no rascunho") }}</button><button class="btn primary" @click="reloadSaved">{{ t("Carregar versão salva") }}</button></footer></Modal>
  </section>
</template>
