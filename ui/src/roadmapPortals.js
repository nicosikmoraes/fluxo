import { state, request, notify, refresh } from './workspace';
import { auth } from './auth';

const coordinate = value => Math.min(1000000, Math.max(0, Math.round(Number(value) || 0)));
export function normalizePortals(stored) {
 if (!Array.isArray(stored)) return [];
 const ids = new Set();
 return stored.filter(item => item && typeof item.id === 'string' && !ids.has(item.id) && ids.add(item.id)).map(item => ({
  id: item.id, label: typeof item.label === 'string' ? item.label.slice(0, 160) : '',
  x: coordinate(item.x), y: coordinate(item.y),
  sources: Array.isArray(item.sources) ? [...new Set(item.sources.filter(id => Number.isInteger(id) && id > 0))] : [],
 }));
}
export function readPortals(roadmapId) {
 return normalizePortals(state.roadmaps.find(roadmap => roadmap.id === roadmapId)?.portals);
}
export async function savePortals(roadmapId, portals) {
 const owner = auth.user?.id;
 const roadmap = state.roadmaps.find(item => item.id === roadmapId);
 if (!owner || !roadmap) return false;
 const nodes = new Set((roadmap.nodes || []).map(node => node.id));
 const payload = normalizePortals(portals).map(portal => ({ ...portal, sources: portal.sources.filter(id => nodes.has(id)) }));
 state.saving++;
 try {
  const result = await request('/roadmaps/' + roadmapId + '/portals', 'PUT', { portals: payload, version: roadmap.portals_version || 0 });
  if (auth.user?.id !== owner) return false;
  const current = state.roadmaps.find(item => item.id === roadmapId);
  if (current) Object.assign(current, result);
  return true;
 } catch (error) {
  notify(error.message || 'Não foi possível salvar os portais. Tente novamente.', 'error');
  if (error.status === 409 && auth.user?.id === owner) await refresh().catch(() => {});
  return false;
 } finally { state.saving = Math.max(0, state.saving - 1); }
}
