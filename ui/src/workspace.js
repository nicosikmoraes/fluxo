import { reactive } from 'vue';
export const state = reactive({ projects: [], tasks: [], roadmaps: [], loading: true, saving: 0, error: '', toast: null });
let toastTimer;
export function notify(message, kind = 'success') {
 clearTimeout(toastTimer); state.toast = { message, kind };
 toastTimer = setTimeout(() => state.toast = null, 4200);
}
export async function request(url, method = 'GET', data) {
 const form = data instanceof FormData;
 const response = await fetch('/api' + url, { method, headers: { Accept: 'application/json', ...(data && !form ? { 'Content-Type': 'application/json' } : {}) }, body: data ? (form ? data : JSON.stringify(data)) : undefined });
 if (!response.ok) {
  const body = await response.json().catch(() => ({}));
  throw new Error(body.errors ? Object.values(body.errors).flat().join(' ') : body.message || 'Não foi possível salvar. Tente novamente.');
 }
 return response.status === 204 ? true : response.json();
}
export async function refresh() {
 const data = await request('/workspace'); state.projects = data.projects; state.tasks = data.tasks; state.roadmaps = data.roadmaps || []; state.error = '';
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
 finally { state.saving--; }
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
