import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { reactive, nextTick } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { chooseRoadmap, readRoadmapPreferences, saveRoadmapPreference } from '../src/roadmapPreferences';
vi.mock('../src/workspace', () => ({ state: reactive({ roadmaps: [], tasks: [], saving: 0 }), mutate: vi.fn(), request: vi.fn(), notify: vi.fn(), label: value => value }));
vi.mock('../src/auth', () => ({ auth: reactive({ user: { id: 1 } }) }));
import { state, mutate, request } from '../src/workspace';
import ProjectMap from '../src/components/ProjectMap.vue';
let wrapper;
const maps = [ { id: 1, project_id: 7, title: 'Ideias', nodes: [], edges: [] }, { id: 2, project_id: 7, title: 'Entrega', nodes: [], edges: [] } ];
async function open(projectId = 7) { wrapper = mount(ProjectMap, { props: { projectId } }); await flushPromises(); return wrapper; }
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); state.roadmaps = maps.map(map => ({ ...map })); state.tasks = []; state.saving=0; request.mockImplementation(async (url,method,payload)=>({portals:payload.portals,portals_version:payload.version+1})); });
afterEach(() => wrapper?.unmount());
describe('Preferências de roadmap sem acesso ao banco', () => {
 it('reabre o último roadmap ao sair e voltar, inclusive após recarregar o componente', async () => {
  await open(); await wrapper.find('select').setValue('2'); await flushPromises(); wrapper.unmount();
  await open(); expect(wrapper.find('select').element.value).toBe('2');
 });
 it('marca um principal e o usa quando ainda não há último roadmap salvo', async () => {
  await open(); await wrapper.find('select').setValue('2'); await wrapper.find('.maps-primary').trigger('click');
  expect(readRoadmapPreferences(7).primary).toBe(2); expect(wrapper.find('.maps-primary').text()).toBe('Principal');
  localStorage.setItem('fluxo:roadmaps:7', JSON.stringify({ primary: 2 })); wrapper.unmount(); await open();
  expect(wrapper.find('select').element.value).toBe('2');
 });
 it('mantém o último aberto com prioridade sobre o principal', async () => {
  saveRoadmapPreference(7, 'primary', 2); saveRoadmapPreference(7, 'last', 1); await open();
  expect(wrapper.find('select').element.value).toBe('1');
 });
 it('usa o principal quando o último foi excluído e o primeiro se ambos sumiram', () => {
  expect(chooseRoadmap(maps, { last: 99, primary: 2 })).toBe(2);
  expect(chooseRoadmap(maps, { last: 99, primary: 98 })).toBe(1);
  expect(chooseRoadmap([], {})).toBe(null);
 });
 it('guarda preferências separadas por projeto e troca a seleção ao mudar de projeto', async () => {
  state.roadmaps.push({ id: 3, project_id: 8, title: 'Outro projeto', nodes: [], edges: [] });
  saveRoadmapPreference(7, 'last', 2); await open(); await wrapper.setProps({ projectId: 8 }); await flushPromises();
  expect(wrapper.find('select').element.value).toBe('3'); expect(readRoadmapPreferences(7).last).toBe(2);
  await wrapper.setProps({ projectId: 7 }); await flushPromises(); expect(wrapper.find('select').element.value).toBe('2');
 });
 it('recupera uma seleção válida após excluir o mapa aberto', async () => {
  saveRoadmapPreference(7, 'last', 2); await open(); state.roadmaps = state.roadmaps.filter(map => map.id !== 2); await nextTick();
  expect(wrapper.find('select').element.value).toBe('1');
 });
 it('destaca pendências e acompanha a mudança de status, preservando o aviso de bloqueio', async () => {
  const activities = ['pending', 'doing', 'done', 'pending'].map((status, index) => ({ id: index + 1, title: 'Etapa ' + index, status, blocked: index === 3, comments: [] }));
  state.tasks = [{ id: 10, title: 'Construção', project_id: 7, activities }];
  state.roadmaps[0].nodes = activities.map((activity, index) => ({ id: index + 1, activity_id: activity.id, x: index * 300, y: 0 }));
  await open();
  expect(wrapper.findAll('.map-node.pending:not(.blocked)')).toHaveLength(1);
  expect(wrapper.findAll('.map-node.blocked')).toHaveLength(1);
  expect(wrapper.findAll('.map-node.completed')).toHaveLength(1);
  state.tasks[0].activities[0].status = 'doing'; await nextTick();
  expect(wrapper.findAll('.map-node.pending:not(.blocked)')).toHaveLength(0);
  state.tasks[0].activities[1].status = 'pending'; await nextTick();
  expect(wrapper.findAll('.map-node.pending:not(.blocked)')).toHaveLength(1);
 });
 it('adiciona e conecta um portal pelo roadmap salvando o conteúdo na conta', async () => {
  state.tasks = [{ id: 10, title: 'Construção', project_id: 7, activities: [{ id: 1, title: 'Atividade', status: 'pending', comments: [] }] }];
  state.roadmaps[0].nodes = [{ id: 5, activity_id: 1, x: 10, y: 20 }];
  await open();
  await wrapper.findAll('button').find(button => button.text() === 'Adicionar portal').trigger('click');
  document.querySelector('.modal form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flushPromises();
  expect(wrapper.findAll('.map-portal')).toHaveLength(1);
  await wrapper.find('[aria-label="Conectar saída de Atividade"]').trigger('click', { detail: 0 });
  await wrapper.find('.map-portal-input').trigger('click'); await flushPromises();
  expect(wrapper.findAll('.portal-connections .map-edge')).toHaveLength(1);
  expect(wrapper.find('.map-connection-tip').exists()).toBe(false);
  expect(mutate).not.toHaveBeenCalled();
 });
 it('aplica o visual finalizado apenas ao card concluído conectado e remove ao desconectar', async () => {
  state.roadmaps[0].portals = [{ id: 'portal-test', label: '', x: 400, y: 10, sources: [5] }];
  state.tasks = [{ id: 10, title: 'Construção', project_id: 7, activities: [{ id: 1, title: 'Atividade', status: 'done', comments: [] }] }];
  state.roadmaps[0].nodes = [{ id: 5, activity_id: 1, x: 10, y: 20 }]; await open();
  expect(wrapper.find('.map-node').classes()).toContain('portal-completed'); expect(wrapper.find('.map-completion-seal').exists()).toBe(true);
  state.tasks[0].activities[0].status = 'pending'; await nextTick();
  expect(wrapper.find('.map-node').classes()).not.toContain('portal-completed'); expect(wrapper.find('.map-completion-seal').exists()).toBe(false);
  state.tasks[0].activities[0].status = 'done'; await nextTick();
  await wrapper.find('[aria-label="Remover portal"]').trigger('click');
  expect(wrapper.find('.map-node').classes()).not.toContain('portal-completed'); expect(mutate).not.toHaveBeenCalled();
 });
 it('mostra a prévia no quadro e restaura cards e portais ao cancelar, sem gravar', async () => {
  state.tasks = [{ id: 10, title: 'Construção', project_id: 7, activities: [{ id: 1, title: 'Primeiro', status: 'pending', comments: [] }, { id: 2, title: 'Segundo', status: 'pending', comments: [] }] }];
  state.roadmaps[0].nodes = [{ id: 5, activity_id: 1, x: 10, y: 10 }, { id: 6, activity_id: 2, x: 355, y: 20 }];
  const portal = { id: 'preview-portal', x: 690, y: 80, label: '', sources: [6] };
  state.roadmaps[0].portals = [portal]; await open();
  await wrapper.findAll('button').find(button => button.text() === 'Alinhar cards').trigger('click');
  expect(wrapper.findAll('.map-node')[1].attributes('style')).toContain('346px');
  expect(wrapper.find('.map-portal').attributes('style')).toContain('59px');
  expect(wrapper.find('.maps-workspace').classes()).toContain('layout-preview');
  expect(wrapper.find('[aria-label="Roadmap atual"]').attributes('disabled')).toBeDefined();
  expect(state.roadmaps[0].nodes[1].x).toBe(355); expect(state.roadmaps[0].portals[0].y).toBe(80);
  await wrapper.findAll('button').find(button => button.text() === 'Cancelar').trigger('click');
  expect(wrapper.findAll('.map-node')[1].attributes('style')).toContain('355px'); expect(wrapper.find('.map-portal').attributes('style')).toContain('80px'); expect(mutate).not.toHaveBeenCalled();
 });
 it('aplica e desfaz o alinhamento no quadro preservando metadados dos cards e portais', async () => {
  state.tasks = [{ id: 10, title: 'Construção', project_id: 7, activities: [{ id: 1, title: 'Primeiro', status: 'pending', comments: [] }, { id: 2, title: 'Segundo', status: 'done', comments: [] }] }];
  state.roadmaps[0].nodes = [{ id: 5, activity_id: 1, x: 10, y: 10 }, { id: 6, activity_id: 2, x: 355, y: 20 }];
  const portal = { id: 'apply-portal', x: 690, y: 80, label: 'Entrega', sources: [6] }; state.roadmaps[0].portals = [portal];
  request.mockImplementation(async (url, method, payload) => url.endsWith('/portals') ? ({portals:payload.portals,portals_version:payload.version+1}) : ({ nodes: payload.nodes.map(({ id, x, y }) => ({ id, x, y })) })); await open();
  await wrapper.findAll('button').find(button => button.text() === 'Alinhar cards').trigger('click');
  expect(wrapper.find('.maps-world').attributes('inert')).toBeDefined();
  await wrapper.findAll('button').find(button => button.text() === 'Aplicar').trigger('click'); await flushPromises();
  expect(state.roadmaps[0].nodes[1]).toEqual({ id: 6, activity_id: 2, x: 346, y: 15 });
  expect(wrapper.find('.map-portal-label').text()).toBe('Entrega'); expect(wrapper.find('.map-portal').attributes('style')).toContain('59px');
  expect(wrapper.find('.maps-world').attributes('inert')).toBeUndefined();
  await wrapper.findAll('button').find(button => button.text() === 'Desfazer alinhamento').trigger('click'); await flushPromises();
  expect(state.roadmaps[0].nodes[1]).toEqual({ id: 6, activity_id: 2, x: 355, y: 20 }); expect(state.roadmaps[0].portals).toEqual([portal]); expect(state.tasks[0].activities[1].status).toBe('done');
 });
 it('continua funcionando com preferências corrompidas ou armazenamento bloqueado', () => {
  localStorage.setItem('fluxo:roadmaps:7', 'invalid'); expect(readRoadmapPreferences(7)).toEqual({});
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(() => saveRoadmapPreference(7, 'last', 1)).not.toThrow(); spy.mockRestore();
 });
});
