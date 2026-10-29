<script setup>
import { t } from "../../state/locale";
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import { X, Pencil, Trash2, Plus, GripVertical, Check, Circle, MessageSquare, LockKeyhole, UnlockKeyhole, ChevronDown, ChevronRight, ArrowUpRight, Folder, Sparkles, CalendarDays, Send } from "@lucide/vue";
import { state, mutate, label, date, statuses, notify } from "../../state/workspace";
import { vSortable } from "../../shared/sortable";
import Modal from "../../shared/Modal.vue";
import ConfirmDialog from "../../shared/ConfirmDialog.vue";
import { deliveryLabel } from "../calendar/calendar";
const props = defineProps({ taskId: Number, initialActivityId: Number, activityOnly: Boolean });
const emit = defineEmits(["close", "edit", "delete"]);
const task = computed(() => state.tasks.find((t) => t.id === props.taskId));
const focusedActivity = computed(() => task.value?.activities.find((a) => a.id === props.initialActivityId));
const visibleActivities = computed(() => props.activityOnly ? focusedActivity.value ? [focusedActivity.value] : [] : task.value?.activities || []);
watch(focusedActivity, (activity) => {
  if (props.activityOnly && !activity) emit("close");
});
const project = computed(() => state.projects.find((p) => p.id === task.value?.project_id));
const dialog = ref();
const newTitle = ref("");
const expanded = ref(props.initialActivityId ?? null);
const editActivity = ref(null);
const blockActivity = ref(null);
const deleting = ref(null);
const editingComment = ref(null);
const commentEdit = ref("");
const commentDrafts = ref({});
const celebrating = ref(false);
let timer;
let previous;
onMounted(() => {
  previous = document.activeElement;
  dialog.value.showModal();
});
onUnmounted(() => {
  clearTimeout(timer);
  previous?.focus?.();
});
const progress = computed(() => task.value?.activities.length ? Math.round(task.value.completed_count / task.value.activities.length * 100) : 0);
async function addActivity() {
  if (state.saving || !newTitle.value.trim()) return;
  const r = await mutate("/tasks/" + task.value.id + "/activities", "POST", { title: newTitle.value.trim() });
  if (r) {
    newTitle.value = "";
    expanded.value = r.id;
  }
}
async function changeStatus(activity, status) {
  if (state.saving) return;
  const r = await mutate("/activities/" + activity.id, "PATCH", { status });
  if (r && status === "done") {
    celebrating.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => celebrating.value = false, 1300);
    if (task.value.status === "done") notify(t("Todos os passos concluídos. Mais uma ideia entregue!"));
  }
}
async function reorder(ids) {
  if (props.activityOnly || state.saving) return;
  await mutate("/tasks/" + task.value.id + "/activities/reorder", "POST", { ids });
}
function openEdit(a) {
  editActivity.value = { id: a.id, title: a.title };
}
async function saveActivity() {
  if (state.saving) return;
  const r = await mutate("/activities/" + editActivity.value.id, "PATCH", { title: editActivity.value.title.trim() });
  if (r) editActivity.value = null;
}
function openBlock(a) {
  blockActivity.value = { id: a.id, blocked: a.blocked, blocking_person: a.blocking_person || "", blocking_reason: a.blocking_reason || "" };
}
async function saveBlock() {
  if (state.saving) return;
  const r = await mutate("/activities/" + blockActivity.value.id, "PATCH", { blocked: true, blocking_person: blockActivity.value.blocking_person.trim(), blocking_reason: blockActivity.value.blocking_reason.trim() }, t("Bloqueio registrado. Você decide quando retomar."));
  if (r) blockActivity.value = null;
}
async function unblock(id) {
  const r = await mutate("/activities/" + id, "PATCH", { blocked: false }, t("Atividade desbloqueada. Pode seguir!"));
  if (r) blockActivity.value = null;
}
async function addComment(a) {
  const body = commentDrafts.value[a.id]?.trim();
  if (!body || state.saving) return;
  const r = await mutate("/activities/" + a.id + "/comments", "POST", { body });
  if (r) commentDrafts.value[a.id] = "";
}
function editComment(c) {
  editingComment.value = c.id;
  commentEdit.value = c.body;
}
async function saveComment() {
  if (state.saving) return;
  const r = await mutate("/comments/" + editingComment.value, "PATCH", { body: commentEdit.value.trim() });
  if (r) editingComment.value = null;
}
async function deleteItem() {
  const r = await mutate("/" + deleting.value.type + "/" + deleting.value.id, "DELETE", null, t("Excluído."));
  if (r) deleting.value = null;
}
</script>
<template>
 <dialog ref="dialog" class="task-drawer" :class="{'activity-only':activityOnly}" :aria-label="activityOnly?'Atividade: '+(focusedActivity?.title||''):'Task: '+(task?.title||'')" @cancel.prevent="emit('close')" @click="e=>e.target===dialog&&emit('close')">
  <div v-if="task" class="drawer-surface">
   <header class="drawer-header"><span class="eyebrow"><Folder :size="14" /> {{ project?.title || t('Sem projeto') }} <ChevronRight :size="13" /> {{ activityOnly?t('ATIVIDADE'):'TASK #'+String(task.id).padStart(3,'0') }}</span><div class="inline-actions"><template v-if="!activityOnly"><button class="icon-btn" :aria-label="t('Editar task')" @click="emit('edit',task)"><Pencil :size="17" /></button><button class="icon-btn danger-text" :aria-label="t('Excluir task')" @click="emit('delete',task)"><Trash2 :size="17" /></button><span class="divider"></span></template><button class="icon-btn" :aria-label="activityOnly?t('Fechar atividade'):t('Fechar task')" @click="emit('close')"><X :size="20" /></button></div></header>
   <img v-if="!activityOnly&&task.cover_path" :src="task.cover_path" class="drawer-cover" :alt="t('Capa da task')">
   <main class="drawer-content">
    <p v-if="activityOnly" class="activity-parent-task">{{ task.title }}</p>
    <template v-else>
    <div class="inline-actions"><span class="status-tag" :class="task.status"><span class="status-dot"></span>{{ t(label(task.status)) }}</span><span v-if="task.blocked_count" class="blocked-tag"><LockKeyhole :size="12" />{{ task.blocked_count }} {{ task.blocked_count===1?'bloqueio':'bloqueios' }}</span></div>
    <h1 class="task-title">{{ task.title }}</h1><p v-if="task.description" class="task-description">{{ task.description }}</p><button v-else class="text-btn subtle" @click="emit('edit',task)"><Plus :size="14" /> {{ t("Adicionar descrição") }}</button>
    <div class="task-meta"><CalendarDays :size="14" /> {{ t("Criada em") }} {{ date(task.created_at) }}</div>
    <button class="task-delivery" @click="emit('edit',task)"><CalendarDays :size="14" />{{ deliveryLabel(task.due_date) }}<Pencil :size="12" /></button>
    </template>
    <section class="activity-section"><template v-if="!activityOnly"><div class="section-heading"><h2>{{ t("Atividades") }} <span>{{ task.activities.length }}</span></h2><span class="muted small">{{ task.completed_count }} {{ t("de") }} {{ task.activities.length }} {{ t("concluídas") }}</span></div><div class="progress-track"><span :style="{width:progress+'%'}" :class="{complete:progress===100}"></span></div>
     <div v-if="!task.activities.length" class="activity-empty"><div class="empty-symbol"><Sparkles :size="26" /></div><h3>{{ t("Um passo de cada vez.") }}</h3><p>{{ t("Divida sua task em pequenas atividades.") }}<br>{{ t("O primeiro passo começa aqui embaixo.") }}</p></div>
     </template>
     <div v-sortable="reorder" class="activity-list" :class="{'is-saving':state.saving}">
      <article v-for="a in visibleActivities" :key="a.id" :data-id="a.id" class="activity-card" :class="{blocked:a.blocked,completed:a.status==='done',expanded:activityOnly||expanded===a.id}">
       <div class="activity-row"><button v-if="!activityOnly" class="drag-handle" :aria-label="t('Arrastar atividade')" :disabled="!!state.saving"><GripVertical :size="16" /></button><button class="activity-check" :class="{checked:a.status==='done'}" :disabled="a.blocked||!!state.saving" :aria-label="a.status==='done'?t('Reabrir atividade'):t('Concluir atividade')" :title="a.blocked?t('Desbloqueie antes de concluir'):undefined" @click="changeStatus(a,a.status==='done'?'pending':'done')"><Check v-if="a.status==='done'" :size="14" /><span v-else></span></button><h1 v-if="activityOnly" class="activity-focus-title">{{ a.title }}</h1><button v-else class="activity-name" @click="expanded=expanded===a.id?null:a.id">{{ a.title }}</button><button v-if="!activityOnly" class="icon-btn expand-btn" :aria-label="expanded===a.id?t('Recolher atividade'):t('Abrir atividade e comentários')" @click="expanded=expanded===a.id?null:a.id"><ChevronDown :size="16" :class="{rotated:expanded===a.id}" /></button></div>
       <div class="activity-tools"><select :value="a.status" :disabled="a.blocked||!!state.saving" :aria-label="t('Status de ')+a.title" class="status-select" :class="a.status" @change="changeStatus(a,$event.target.value)"><option v-for="s in statuses" :value="s.id" :key="s.id">{{ t(s.label) }}</option></select><button class="mini-action" :class="{amber:a.blocked}" :disabled="a.status==='done'||!!state.saving" @click="openBlock(a)"><LockKeyhole :size="13" />{{ a.blocked?t('Bloqueada'):t('Bloquear') }}</button><button v-if="!activityOnly" class="mini-action comments-button" @click="expanded=expanded===a.id?null:a.id"><MessageSquare :size="13" />{{ a.comments.length }}<span class="sr-only"> {{ t("comentários") }}</span></button><div class="spacer"></div><button class="icon-btn tiny" :aria-label="t('Editar atividade')" @click="openEdit(a)"><Pencil :size="14" /></button><button class="icon-btn tiny danger-text" :aria-label="t('Excluir atividade')" @click="deleting={type:'activities',id:a.id,title:t('Excluir atividade'),message:t('A atividade e todos os seus comentários serão excluídos.')}"><Trash2 :size="14" /></button></div>
       <div v-if="a.blocked" class="blocked-notice"><LockKeyhole :size="15" /><div><strong>{{ t("Aguardando") }} {{ a.blocking_person }} {{ t("terminar") }}</strong><p>{{ a.blocking_reason }}</p><span>{{ t("Bloqueada desde") }} {{ date(a.blocked_at) }}</span></div><button class="text-btn amber" :disabled="!!state.saving" @click="unblock(a.id)"><UnlockKeyhole :size="13" /> {{ t("Desbloquear") }}</button></div>
       <div v-if="activityOnly||expanded===a.id" class="comments-area"><h4><MessageSquare :size="14" /> {{ t("Comentários") }} <span>{{ a.comments.length }}</span></h4><p v-if="!a.comments.length" class="muted small">{{ t("Registre aqui suas ideias, decisões e próximos detalhes.") }}</p>
        <article v-for="c in a.comments" :key="c.id" class="comment"><div class="avatar">{{ t("V") }}</div><div class="comment-content"><div class="comment-meta"><strong>{{ t("Você") }}</strong><time>{{ date(c.created_at) }}</time><span v-if="c.updated_at!==c.created_at" class="muted">{{ t("editado") }}</span><div class="spacer"></div><button class="icon-btn tiny" :aria-label="t('Editar comentário')" @click="editComment(c)"><Pencil :size="12" /></button><button class="icon-btn tiny danger-text" :aria-label="t('Excluir comentário')" @click="deleting={type:'comments',id:c.id,title:t('Excluir comentário'),message:t('Este comentário será excluído permanentemente.')}"><Trash2 :size="12" /></button></div><form v-if="editingComment===c.id" @submit.prevent="saveComment"><textarea v-model="commentEdit" required maxlength="10000" rows="3" :aria-label="t('Editar comentário')"></textarea><div class="comment-form-actions"><button type="button" class="text-btn" @click="editingComment=null">{{ t("Cancelar") }}</button><button class="btn primary small-btn" :disabled="!!state.saving">{{ t("Salvar") }}</button></div></form><p v-else class="comment-body">{{ c.body }}</p></div></article>
        <form class="comment-form" @submit.prevent="addComment(a)"><textarea v-model="commentDrafts[a.id]" maxlength="10000" rows="2" :placeholder="t('Escreva um comentário...')" :aria-label="t('Novo comentário em ')+a.title" required></textarea><div class="comment-form-actions"><span class="muted small">{{ t("Só você, suas ideias e o próximo passo.") }}</span><button class="btn primary small-btn" :disabled="!!state.saving||!commentDrafts[a.id]?.trim()"><Send :size="13" /> {{ t("Comentar") }}</button></div></form>
       </div>
      </article>
     </div>
     <form v-if="!activityOnly" class="add-activity" @submit.prevent="addActivity"><Plus :size="18" /><input v-model="newTitle" maxlength="200" :placeholder="t('Adicionar uma atividade...')" :aria-label="t('Título da nova atividade')" required><button class="btn primary small-btn" :disabled="!!state.saving||!newTitle.trim()">{{ t("Adicionar") }}</button></form>
     <p v-if="!activityOnly" class="activity-help"><GripVertical :size="12" /> {{ t("Arraste pelo ícone para organizar seus passos.") }}</p>
    </section>
   </main>
   <div v-if="celebrating" class="celebration" aria-hidden="true"><i v-for="i in 18" :key="i" :style="{'--i':i,'--color':['#6e89ff','#a196ed','#86d6b0','#efc882'][i%4]}"></i></div>
  </div>
 </dialog>
 <Modal v-if="editActivity" :title="t('Editar atividade')" @close="editActivity=null"><form class="form-stack" @submit.prevent="saveActivity"><label>{{ t("Título") }} <span class="required">*</span><input v-model="editActivity.title" autofocus required maxlength="200"></label><footer class="modal-actions"><button type="button" class="btn secondary" @click="editActivity=null">{{ t("Cancelar") }}</button><button class="btn primary" :disabled="!!state.saving">{{ t("Salvar") }}</button></footer></form></Modal>
 <Modal v-if="blockActivity" :title="blockActivity.blocked?t('Editar bloqueio'):t('Bloquear atividade')" @close="blockActivity=null"><form class="form-stack" @submit.prevent="saveBlock"><div class="info-box amber"><LockKeyhole :size="20" /><p>{{ t("Registre de quem você depende. Quando a pessoa terminar, você pode desbloquear este passo.") }}</p></div><label>{{ t("De quem você está aguardando?") }} <span class="required">*</span><input v-model="blockActivity.blocking_person" autofocus required maxlength="160" :placeholder="t('Ex.: Mariana')"></label><label>{{ t("O que precisa ser concluído?") }} <span class="required">*</span><textarea v-model="blockActivity.blocking_reason" required maxlength="5000" rows="3" :placeholder="t('Ex.: liberar o acesso à API')"></textarea></label><footer class="modal-actions"><button type="button" class="btn secondary" @click="blockActivity=null">{{ t("Cancelar") }}</button><button class="btn amber-btn" :disabled="!!state.saving">{{ blockActivity.blocked?t('Salvar bloqueio'):t('Registrar bloqueio') }}</button></footer></form></Modal>
 <ConfirmDialog v-if="deleting" :title="deleting.title" :message="deleting.message" @close="deleting=null" @confirm="deleteItem" />
</template>
