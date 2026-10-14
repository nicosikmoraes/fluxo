<script setup>
import { computed } from 'vue';
import { CalendarDays, Check, LockKeyhole, GripVertical } from '@lucide/vue';
import { state, label } from '../workspace';
const props=defineProps({task:Object,unscheduled:Boolean,dragging:Boolean});
const emit=defineEmits(['open','schedule','drag-start']);
const project=computed(()=>state.projects.find(p=>p.id===props.task.project_id));
</script>
<template>
 <article class="calendar-task" :class="[project?.cover||'neutral',{done:task.status==='done',blocked:task.blocked_count,'is-dragging':dragging}]" draggable="false" :data-task-id="task.id" @dragstart.prevent @pointerdown="emit('drag-start',$event,task)">
  <div class="calendar-card-top"><span class="calendar-card-project"><i></i>{{ project?.title||'Sem projeto' }}</span><button class="calendar-card-schedule" :disabled="!!state.saving" :aria-label="'Agendar '+task.title" title="Alterar data de entrega" @click="emit('schedule',task)"><CalendarDays :size="12" /></button></div>
  <button class="calendar-card-open" :aria-label="'Abrir task '+task.title" @click="emit('open',task.id)"><img v-if="task.cover_path" :src="task.cover_path" alt="" draggable="false"><strong>{{ task.title }}</strong></button>
  <div class="calendar-card-foot"><span class="calendar-card-status" :class="task.status"><Check v-if="task.status==='done'" :size="11" /><i v-else></i>{{ label(task.status) }}</span><GripVertical :size="12" /></div>
  <p v-if="task.blocked_count" class="calendar-card-block"><LockKeyhole :size="10" />{{ task.activities.find(a=>a.blocked)?.blocking_person||'Bloqueada' }}</p>
 </article>
</template>
