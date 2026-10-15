import { reactive } from 'vue';
import { apiRequest, auth } from './auth';
export const state = reactive({ projects: [], tasks: [], roadmaps: [], loading: true, saving: 0, error: '', toast: null });
let toastTimer;
export function notify(message, kind = 'success') {
 clearTimeout(toastTimer); state.toast = { message, kind };
 toastTimer = setTimeout(() => state.toast = null, 4200);
}
export const request = apiRequest;
export function resetWorkspace() {
 clearTimeout(toastTimer); state.projects = []; state.tasks = []; state.roadmaps = []; state.error = ''; state.toast = null;
}
export async function refresh() {
 const owner = auth.user?.id; const data = await request('/workspace'); if (auth.user?.id !== owner) return; state.projects = data.projects; state.tasks = data.tasks; state.roadmaps = data.roadmaps || []; state.error = '';
}
export async function load() {
 state.loading = true;
 try { await refresh(); } catch (e) { state.error = 'Não foi possível carregar seu espaço. Confira se o servidor local está aberto e tente novamente.'; }
 finally { state.loading = false; }
}
export async function mutate(url, method, data, message) {
 state.saving++;
 try { const result = await request(url, method, data); await refresh(); if (message) notify(message); return result; }
 catch (e) { notify(e.message, 'error'); return null; }
 finally { state.saving = Math.max(0, state.saving - 1); }
}
export async function upload(file) {
 if (!file) return null;
 const form = new FormData(); form.append('image', file); state.saving++;
 try { return (await request('/images', 'POST', form)).path; }
 catch (e) { notify(e.message, 'error'); return null; }
 finally { state.saving--; }
}
export const statuses = [{ id: 'pending', label: 'Pendente', short: 'Pendentes' }, { id: 'doing', label: 'Em andamento', short: 'Em andamento' }, { id: 'done', label: 'Concluída', short: 'Concluídas' }];
export const label = status => statuses.find(s => s.id === status)?.label;
export const date = value => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
