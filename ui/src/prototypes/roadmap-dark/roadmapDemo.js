import { state } from '../../state/workspace';
import { auth } from '../../features/auth/auth';

export const demoProjectId = 990001;
const demoDate = '2026-10-30T10:00:00Z';
const activity = (id, title, status = 'pending', extra = {}) => ({ id, title, status, blocked: false, blocking_person: null, blocked_at: demoDate, created_at: demoDate, ...extra, comments: (extra.comments || []).map((comment) => ({ body: 'Um detalhe para acompanhar neste passo.', created_at: demoDate, updated_at: demoDate, ...comment })) });
const initialWorkspace = () => ({
 projects: [{ id: demoProjectId, title: 'Lançamento do produto', cover: 'lavender' }],
 tasks: [
  { id: 990101, project_id: demoProjectId, title: 'Descoberta', status: 'done', completed_count: 2, blocked_count: 0, comments_count: 2, activities: [activity(990201, 'Entender quem vai usar', 'done', { comments: [{ id: 1 }, { id: 2 }] }), activity(990202, 'Definir a primeira entrega', 'done')] },
  { id: 990102, project_id: demoProjectId, title: 'Design e experiência', status: 'doing', completed_count: 0, blocked_count: 1, comments_count: 3, activities: [activity(990203, 'Desenhar os fluxos principais', 'doing', { comments: [{ id: 3 }, { id: 4 }, { id: 5 }] }), activity(990204, 'Validar a identidade visual', 'pending', { blocked: true, blocking_person: 'Marina', blocking_reason: 'Aguardando aprovação da identidade visual.' }), activity(990207, 'Revisar os textos da interface')] },
  { id: 990103, project_id: demoProjectId, title: 'Desenvolvimento', status: 'pending', completed_count: 0, blocked_count: 0, comments_count: 1, activities: [activity(990205, 'Construir a primeira versão', 'pending', { comments: [{ id: 6 }] }), activity(990206, 'Preparar o lançamento'), activity(990208, 'Conferir acessibilidade'), activity(990209, 'Organizar o feedback')] },
 ],
 roadmaps: [{ id: 990301, project_id: demoProjectId, title: 'Do primeiro passo ao lançamento', card_type: 'activity', portals_version: 0,
  nodes: [
   { id: 990401, activity_id: 990201, x: 40, y: 60 },
   { id: 990402, activity_id: 990202, x: 40, y: 340 },
   { id: 990403, activity_id: 990203, x: 420, y: 60 },
   { id: 990404, activity_id: 990204, x: 420, y: 340 },
   { id: 990405, activity_id: 990205, x: 800, y: 60 },
   { id: 990406, activity_id: 990206, x: 800, y: 340 },
  ],
  edges: [{ id: 990501, source_node_id: 990401, target_node_id: 990403 }, { id: 990502, source_node_id: 990402, target_node_id: 990404 }, { id: 990503, source_node_id: 990403, target_node_id: 990405 }, { id: 990504, source_node_id: 990404, target_node_id: 990406 }, { id: 990505, source_node_id: 990405, target_node_id: 990406 }],
  portals: [{ id: 'demo-milestone', label: 'Pronto para o mundo', x: 1190, y: 252, sources: [990406] }],
 }],
});
let workspace, nextId = 991000;
const clone = (value) => JSON.parse(JSON.stringify(value));
function sync() { Object.assign(state, clone(workspace), { loading: false, saving: 0, error: '', toast: null }); }
export function resetRoadmapDemo() { workspace = initialWorkspace(); sync(); }

// This adapter exists only in the prototype entry. Every request stays in memory.
export function installRoadmapDemo() {
 auth.user = { id: 990001, name: 'Nicolas', locale: 'pt-BR', billing: { plan: 'pro' } };
 auth.csrfToken = 'local-visual-prototype';
 auth.loading = false;
 resetRoadmapDemo();
 window.fetch = async (input, options = {}) => {
  const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname.replace(/^\/api/, '');
  const method = options.method || 'GET', data = options.body ? JSON.parse(options.body) : {};
  let result, status = 200;
  const parts = path.split('/').filter(Boolean), map = workspace.roadmaps.find((item) => item.id === Number(parts[1]));
  if (path === '/workspace') result = clone(workspace);
  else if (parts[0] === 'roadmaps' && map) {
   if (parts[2] === 'portals') { map.portals = data.portals; map.portals_version++; result = { portals: map.portals, portals_version: map.portals_version }; }
   else if (parts[2] === 'layout') {
    for (const position of data.nodes || []) Object.assign(map.nodes.find((node) => node.id === position.id) || {}, position);
    for (const position of data.portals || []) Object.assign(map.portals.find((portal) => portal.id === position.id) || {}, position);
    result = clone(map);
   } else if (parts[2] === 'nodes') {
    if (method === 'POST') { result = { id: ++nextId, ...data }; map.nodes.push(result); }
    else if (method === 'PATCH') { result = map.nodes.find((node) => node.id === Number(parts[3])); Object.assign(result, data); }
    else if (method === 'DELETE') { map.nodes = map.nodes.filter((node) => node.id !== Number(parts[3])); map.edges = map.edges.filter((edge) => ![edge.source_node_id, edge.target_node_id].includes(Number(parts[3]))); result = true; }
   } else if (parts[2] === 'edges') {
    if (method === 'POST') { result = { id: ++nextId, ...data }; map.edges.push(result); }
    else { map.edges = map.edges.filter((edge) => edge.id !== Number(parts[3])); result = true; }
   } else if (parts.length === 2 && method === 'PATCH') { Object.assign(map, data); result = clone(map); }
   else if (parts.length === 2 && method === 'DELETE') { workspace.roadmaps = workspace.roadmaps.filter((item) => item !== map); result = true; }
  } else if (parts[0] === 'projects' && parts[2] === 'roadmaps' && method === 'POST') {
   result = { id: ++nextId, project_id: demoProjectId, ...data, nodes: [], edges: [], portals: [], portals_version: 0 }; workspace.roadmaps.push(result);
  } else if (parts[0] === 'tasks' && parts[2] === 'activities' && method === 'POST') {
   result = activity(++nextId, data.title); workspace.tasks.find((task) => task.id === Number(parts[1]))?.activities.push(result);
  } else if (parts[0] === 'activities') {
   const task = workspace.tasks.find((item) => item.activities.some((entry) => entry.id === Number(parts[1])));
   const item = task?.activities.find((entry) => entry.id === Number(parts[1]));
   if (item && parts.length === 2 && method === 'PATCH') { Object.assign(item, data); result = clone(item); }
   else if (item && parts.length === 2 && method === 'DELETE') { task.activities = task.activities.filter((entry) => entry !== item); result = true; }
   else if (item && parts[2] === 'comments' && method === 'POST') { result = { id: ++nextId, body: data.body, created_at: demoDate, updated_at: demoDate }; item.comments.push(result); }
   if (task) { task.completed_count = task.activities.filter((entry) => entry.status === 'done').length; task.blocked_count = task.activities.filter((entry) => entry.blocked).length; }
  } else if (parts[0] === 'comments') {
   const item = workspace.tasks.flatMap((task) => task.activities).find((entry) => entry.comments.some((comment) => comment.id === Number(parts[1])));
   if (item && method === 'DELETE') { item.comments = item.comments.filter((comment) => comment.id !== Number(parts[1])); result = true; }
   else if (item && method === 'PATCH') { result = item.comments.find((comment) => comment.id === Number(parts[1])); Object.assign(result, data); }
  }
  if (result === undefined) { status = 422; result = { message: 'Esta ação não faz parte da prévia visual. Explore os cards, conexões, zoom e portais.' }; }
  return new Response(JSON.stringify(result), { status, headers: { 'Content-Type': 'application/json' } });
 };
}
