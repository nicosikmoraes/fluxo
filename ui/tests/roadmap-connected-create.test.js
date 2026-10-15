import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { reactive, nextTick } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
vi.mock('../src/workspace', () => ({ state: reactive({ roadmaps: [], tasks: [], saving: 0 }), mutate: vi.fn(), request: vi.fn(), refresh: vi.fn(), notify: vi.fn(), label: value => value }));
vi.mock('../src/auth', () => ({ auth: reactive({ user: { id: 1 } }) }));
import { state, mutate, notify, request } from '../src/workspace';
import { readPortals, savePortals } from '../src/roadmapPortals';
import ProjectMap from '../src/components/ProjectMap.vue';
import RoadmapPortals from '../src/components/RoadmapPortals.vue';
let wrapper, canvas;
const dialog = () => wrapper.find('dialog.modal');
const option = kind => dialog().findAll('.map-create-option').find(button => button.text().startsWith(kind));
const submit = async () => { await dialog().find('form').trigger('submit'); await flushPromises(); };
async function open() {
 wrapper = mount(ProjectMap, { props: { projectId: 7 }, attachTo: document.body });
 await flushPromises(); canvas = wrapper.find('.maps-viewport');
 canvas.element.getBoundingClientRect = () => ({ left: 20, top: 30, width: 1000, height: 600 });
}
async function connect() {
 await wrapper.find('[aria-label="Conectar saída de Origem"]').trigger('click', { detail: 0 });
 await canvas.trigger('dblclick', { clientX: 600, clientY: 300 });
}
beforeEach(async () => {
 localStorage.clear(); vi.clearAllMocks(); state.saving = 0; mutate.mockResolvedValue({ id: 99 }); request.mockImplementation(async (url,method,payload)=>({portals:payload.portals,portals_version:payload.version+1}));
 state.tasks = [{ id: 10, title: 'Construção', project_id: 7, activities: [{ id: 1, title: 'Origem', status: 'pending', blocked: false, comments: [] }] }];
 state.roadmaps = [{ id: 1, project_id: 7, title: 'Mapa', nodes: [{ id: 5, activity_id: 1, x: 10, y: 20 }], edges: [] }];
 await open();
});
afterEach(() => { vi.unstubAllGlobals(); wrapper?.unmount(); document.body.innerHTML = ''; });

describe('Criação a partir da linha de um card', () => {
 it('inicia a linha pelo teclado sem capturar um ponteiro inexistente e acompanha o mouse', async () => {
  canvas.element.setPointerCapture = vi.fn();
  wrapper.find('[aria-label="Conectar saída de Origem"]').element.dispatchEvent(new PointerEvent('click', { bubbles: true, detail: 0, pointerId: -1 })); await nextTick();
  expect(canvas.element.setPointerCapture).not.toHaveBeenCalled(); const path = wrapper.find('.map-edge.draft').attributes('d');
  canvas.element.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 600, clientY: 300, pointerId: 1 })); await nextTick();
  expect(wrapper.find('.map-edge.draft').attributes('d')).not.toBe(path);
  await canvas.trigger('dblclick', { clientX: 600, clientY: 300 }); expect(dialog().exists()).toBe(true);
 });
 it('destaca Atividade por padrão e permite alternar sem perder o rascunho', async () => {
  await connect(); expect(dialog().find('h2').text()).toBe('Nova atividade conectada');
  expect(option('Atividade').attributes('aria-pressed')).toBe('true'); expect(option('Atividade').classes()).toContain('activity');
  expect(dialog().text()).toContain('Origem'); expect(dialog().find('select').element.value).toBe('10');
  await dialog().find('input').setValue('Próximo passo'); await option('Portal').trigger('click');
  expect(dialog().find('h2').text()).toBe('Novo portal conectado'); expect(dialog().findAll('input, textarea, select')).toHaveLength(0);
  expect(dialog().find('.map-create-portal-preview').exists()).toBe(true);
  await option('Atividade').trigger('click'); expect(dialog().find('input').element.value).toBe('Próximo passo');
 });
 it('cria só o portal sem texto, já conectado, no ponto escolhido e preserva ao reabrir', async () => {
  const original = JSON.stringify(state.tasks); await connect(); await option('Portal').trigger('click'); await submit();
  expect(dialog().exists()).toBe(false); expect(mutate).not.toHaveBeenCalled();
  expect(readPortals(1)).toEqual([{ id: expect.any(String), label: '', sources: [5], x: 460, y: 182 }]);
  expect(wrapper.findAll('.map-portal')).toHaveLength(1); expect(wrapper.find('.map-portal-label').exists()).toBe(false);
  expect(wrapper.findAll('.portal-link')).toHaveLength(1); expect(wrapper.find('.map-edge.draft').exists()).toBe(false);
  expect(JSON.stringify(state.tasks)).toBe(original); wrapper.unmount(); await open();
  expect(wrapper.findAll('.portal-link')).toHaveLength(1); expect(wrapper.find('.map-portal-label').exists()).toBe(false);
 });
 it('mantém a criação de atividade com título, task, posição e conexão', async () => {
  await connect(); await dialog().find('input').setValue('  Próxima etapa  '); await submit();
  expect(mutate).toHaveBeenCalledExactlyOnceWith('/roadmaps/1/activities', 'POST', { title: 'Próxima etapa', task_id: 10, source_node_id: 5, x: 540, y: 230 }, 'Atividade criada e conectada.');
  expect(dialog().exists()).toBe(false); expect(readPortals(1)).toEqual([]);
 });
 it('mantém o modal e a linha se a criação de atividade falha, sem aceitar título vazio', async () => {
  await connect(); await submit(); expect(mutate).not.toHaveBeenCalled();
  mutate.mockResolvedValueOnce(null); await dialog().find('input').setValue('Etapa'); await submit();
  expect(dialog().exists()).toBe(true); expect(dialog().find('input').element.value).toBe('Etapa'); expect(wrapper.find('.map-edge.draft').exists()).toBe(true);
 });
 it('salva portal e conexão juntos; falha de armazenamento permite tentar de novo sem duplicar', async () => {
  await savePortals(1, [{ id: 'existing', label: 'Entrega', x: 900, y: 900, sources: [] }]);
  wrapper.unmount(); await open(); await connect(); await option('Portal').trigger('click');
  request.mockRejectedValueOnce(new Error('Não foi possível salvar os portais.'));
  await submit(); expect(dialog().exists()).toBe(true); expect(wrapper.findAll('.map-portal')).toHaveLength(1);
  expect(readPortals(1)).toEqual([{ id: 'existing', label: 'Entrega', x: 900, y: 900, sources: [] }]);
  expect(notify).toHaveBeenCalledWith('Não foi possível salvar os portais.', 'error');
  expect(wrapper.find('.map-edge.draft').exists()).toBe(true); vi.unstubAllGlobals(); await submit();
  expect(readPortals(1)).toHaveLength(2); expect(readPortals(1)[0].label).toBe('Entrega'); expect(readPortals(1)[1].sources).toEqual([5]);
 });
 it('cancela sem gravar e volta a Atividade na próxima abertura', async () => {
  await connect(); await option('Portal').trigger('click'); await dialog().find('.secondary').trigger('click');
  expect(readPortals(1)).toEqual([]); expect(mutate).not.toHaveBeenCalled();
  await canvas.trigger('dblclick', { clientX: 600, clientY: 300 });
  expect(option('Atividade').attributes('aria-pressed')).toBe('true'); expect(dialog().find('input').element.value).toBe('');
 });
 it('não cria para uma origem removida nem durante outro salvamento', async () => {
  await connect(); await option('Portal').trigger('click'); state.saving = 1; await nextTick(); await submit();
  expect(readPortals(1)).toEqual([]); state.saving = 0; state.roadmaps[0].nodes = []; await nextTick(); await submit();
  expect(readPortals(1)).toEqual([]); expect(mutate).not.toHaveBeenCalled();
  const portals = wrapper.findComponent(RoadmapPortals); expect(await portals.vm.createConnected({ x: 200, y: 200 }, 5)).toBeNull();
 });
 it('fecha o modal ao trocar de roadmap sem gravar no outro mapa', async () => {
  state.roadmaps.push({ id: 2, project_id: 7, title: 'Outro', nodes: [], edges: [] }); await connect(); await option('Portal').trigger('click');
  await wrapper.find('[aria-label="Roadmap atual"]').setValue('2'); await flushPromises();
  expect(dialog().exists()).toBe(false); expect(readPortals(1)).toEqual([]); expect(readPortals(2)).toEqual([]);
 });
 it('considera a câmera e o zoom para posicionar o portal', async () => {
  await wrapper.find('[aria-label="Aumentar zoom"]').trigger('click');
  const position = canvas.element.style.backgroundPosition.split(' ').map(parseFloat);
  await connect(); await option('Portal').trigger('click'); await submit();
  const marker = readPortals(1)[0];
  expect(marker.x).toBe(Math.max(0, Math.round(Math.round((600 - 20 - position[0]) / 1.2) - 80)));
  expect(marker.y).toBe(Math.max(0, Math.round(Math.round((300 - 30 - position[1]) / 1.2) - 48)));
 });
 it('realça a atividade concluída conectada ao portal sem alterar seu status', async () => {
  state.tasks[0].activities[0].status = 'done'; await connect(); await option('Portal').trigger('click'); await submit();
  expect(wrapper.find('.map-node').classes()).toContain('portal-completed'); expect(wrapper.find('.map-completion-seal').exists()).toBe(true);
  expect(wrapper.find('.map-portal').classes()).toContain('finished'); expect(state.tasks[0].activities[0].status).toBe('done');
 });
 it('mantém a criação avulsa de atividade sem oferecer portal nesse fluxo', async () => {
  await wrapper.find('[aria-label="Nova atividade"]').trigger('click');
  expect(dialog().find('.map-create-options').exists()).toBe(false); expect(dialog().find('input').exists()).toBe(true);
 });
});
