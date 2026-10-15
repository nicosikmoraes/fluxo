import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { readPortals, savePortals } from '../src/roadmapPortals';
import RoadmapPortals from '../src/components/RoadmapPortals.vue';
vi.mock('../src/workspace', () => ({ notify: vi.fn(), state: { saving: 0 } }));
let wrapper;
async function open(roadmapId = 1) {
 wrapper = mount(RoadmapPortals, { global: { stubs: { teleport: true } }, props: { roadmapId, nodes: [{ id: 5, x: 10, y: 20 }], zoom: 1, sourceNodeId: 5 } });
 await flushPromises();
}
async function add(label = '') {
 wrapper.vm.openForm({ x: 500, y: 200 }); await flushPromises();
 await wrapper.find('input').setValue(label); await wrapper.find('form').trigger('submit'); await flushPromises();
}
beforeEach(() => { wrapper = undefined; localStorage.clear(); });
afterEach(() => wrapper?.unmount());
describe('Portais visuais sem acesso ao banco', () => {
 it('adiciona vários portais, com texto opcional, e preserva ao reabrir', async () => {
  await open(); await add(); await add('Entrega do site');
  expect(wrapper.findAll('.map-portal')).toHaveLength(2); expect(wrapper.findAll('.map-portal-label')).toHaveLength(1);
  wrapper.unmount(); await open(); expect(wrapper.findAll('.map-portal')).toHaveLength(2); expect(wrapper.find('.map-portal-label').text()).toBe('Entrega do site');
 });
 it('conecta atividades uma única vez, sem alterar seu status', async () => {
  await open(); await add(); const id = readPortals(1)[0].id;
  wrapper.vm.connect(id, 5); wrapper.vm.connect(id, 5); await flushPromises();
  expect(readPortals(1)[0].sources).toEqual([5]); expect(wrapper.findAll('.portal-connections .map-edge')).toHaveLength(1);
  expect(wrapper.props('nodes')).toEqual([{ id: 5, x: 10, y: 20 }]);
  await wrapper.setProps({ nodes: [] }); expect(wrapper.findAll('.portal-connections .map-edge')).toHaveLength(0);
 });
 it('permite editar, remover o texto e excluir apenas o portal', async () => {
  await open(); await add('Entrega'); await wrapper.find('[aria-label="Editar texto do portal"]').trigger('click');
  await wrapper.find('input').setValue(''); await wrapper.find('form').trigger('submit');
  expect(wrapper.find('.map-portal-label').exists()).toBe(false);
  await wrapper.find('[aria-label="Remover portal"]').trigger('click'); expect(readPortals(1)).toEqual([]);
 });
 it('salva movimentação por teclado e isola os roadmaps', async () => {
  await open(); await add(); const x = readPortals(1)[0].x;
  await wrapper.find('.map-portal').trigger('keydown', { key: 'ArrowRight' }); expect(readPortals(1)[0].x).toBe(x + 20);
  await wrapper.setProps({ roadmapId: 2 }); expect(wrapper.findAll('.map-portal')).toHaveLength(0);
  await wrapper.setProps({ roadmapId: 1 }); expect(wrapper.find('.map-portal').attributes('style')).toContain((x + 20) + 'px');
 });
 it('abre o formulário fora do quadro e aceita a criação com teleport real', async () => {
  wrapper = mount(RoadmapPortals, { attachTo: document.body, props: { roadmapId: 1, nodes: [], zoom: 1 } });
  wrapper.vm.openForm({ x: 300, y: 200 }); await flushPromises();
  const dialog = document.querySelector('dialog.modal');
  expect(dialog).not.toBeNull();
  expect(dialog.parentElement).toBe(document.body);
  expect(dialog.closest('.maps-world')).toBeNull();
  const input = dialog.querySelector('input'); input.value = 'Entrega'; input.dispatchEvent(new Event('input', { bubbles: true }));
  dialog.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flushPromises();
  expect(readPortals(1)[0].label).toBe('Entrega'); expect(document.querySelector('dialog.modal')).toBeNull();
 });
 it('a trilha chega na borda da bolinha e o portal finaliza visualmente apenas com todas as entradas concluídas', async () => {
  await open(); await add(); const id = readPortals(1)[0].id;
  await wrapper.setProps({ nodes: [{ id: 5, x: 10, y: 20, activity: { status: 'done' } }, { id: 6, x: 20, y: 220, activity: { status: 'pending' } }] });
  wrapper.vm.connect(id, 5); await flushPromises();
  const marker = readPortals(1)[0]; const edge = wrapper.find('.portal-link');
  expect(edge.attributes('d').endsWith(`${marker.x + 42} ${marker.y + 48}`)).toBe(true);
  expect(edge.attributes('marker-end')).toBeUndefined(); expect(edge.classes()).toContain('finished');
  expect(wrapper.find('.map-portal').classes()).toContain('finished');
  wrapper.vm.connect(id, 6); await flushPromises(); expect(wrapper.find('.map-portal').classes()).not.toContain('finished');
  await wrapper.setProps({ nodes: [{ id: 5, x: 10, y: 20, activity: { status: 'done' } }, { id: 6, x: 20, y: 220, activity: { status: 'done' } }] });
  expect(wrapper.find('.map-portal').classes()).toContain('finished'); expect(wrapper.findAll('.portal-trail.finished')).toHaveLength(2);
 });
 it('a prévia não grava posições e cancelar mantém o portal editável e suas conexões removíveis', async () => {
  await open(); await add(); const marker = readPortals(1)[0]; wrapper.vm.connect(marker.id, 5); await flushPromises();
  await wrapper.setProps({ positions: { [marker.id]: { x: 999, y: 888 } }, disabled: true });
  expect(wrapper.find('.map-portal').attributes('style')).toContain('999px');
  await wrapper.find('.map-portal').trigger('keydown', { key: 'ArrowRight' }); expect(readPortals(1)[0].x).toBe(marker.x);
  await wrapper.setProps({ positions: {}, disabled: false });
  await wrapper.find('.map-edge-hit').trigger('click'); await wrapper.find('.modal .danger').trigger('click'); await flushPromises();
  expect(readPortals(1)[0].sources).toEqual([]); expect(wrapper.find('.portal-link').exists()).toBe(false);
 });
 it('ignora armazenamento inválido e informa falha de gravação', () => {
  localStorage.setItem('fluxo:roadmap-portals:1', 'invalid'); expect(readPortals(1)).toEqual([]);
  vi.stubGlobal('localStorage', { setItem() { throw new Error('blocked'); } });
  expect(savePortals(1, [])).toBe(false); vi.unstubAllGlobals();
 });
 it('ativa o núcleo sem texto apenas para atividades conectadas em andamento e sem bloqueio', async () => {
  await open(); await add(); const id = readPortals(1)[0].id;
  await wrapper.setProps({ nodes: [{ id: 5, x: 10, y: 20, activity: { status: 'pending' } }, { id: 6, x: 20, y: 220, activity: { status: 'doing' } }] });
  wrapper.vm.connect(id, 5); await flushPromises();
  expect(wrapper.find('.map-portal').classes()).not.toContain('in-progress');
  wrapper.vm.connect(id, 6); await flushPromises();
  expect(wrapper.find('.map-portal').classes()).toContain('in-progress');
  expect(wrapper.find('.map-portal').classes()).not.toContain('finished');
  expect(wrapper.find('.map-portal').attributes('aria-label')).toContain('Em andamento');
  expect(wrapper.findAll('.map-portal-wave i')).toHaveLength(4);
  expect(wrapper.find('.map-portal-symbol').text()).toBe('');
  expect(wrapper.find('.map-portal-label').exists()).toBe(false);
  expect(wrapper.findAll('.portal-link.in-progress')).toHaveLength(1);
  expect(wrapper.findAll('.portal-trail.in-progress')).toHaveLength(1);
  await wrapper.setProps({ nodes: [{ id: 5, x: 10, y: 20, activity: { status: 'pending' } }, { id: 6, x: 20, y: 220, activity: { status: 'doing', blocked: true } }] });
  expect(wrapper.find('.map-portal').classes()).not.toContain('in-progress');
  expect(wrapper.find('.map-portal-wave').exists()).toBe(false);
  expect(wrapper.find('.portal-link.in-progress').exists()).toBe(false);
 });
 it('acompanha conclusão, reabertura e remoção da atividade sem gravar o estado visual', async () => {
  await open(); await add(); const id = readPortals(1)[0].id;
  await wrapper.setProps({ nodes: [{ id: 5, x: 10, y: 20, activity: { status: 'doing' } }] });
  wrapper.vm.connect(id, 5); await flushPromises(); const saved = readPortals(1);
  expect(wrapper.find('.map-portal').classes()).toContain('in-progress');
  await wrapper.setProps({ nodes: [{ id: 5, x: 10, y: 20, activity: { status: 'done' } }] });
  expect(wrapper.find('.map-portal').classes()).toContain('finished');
  expect(wrapper.find('.map-portal').classes()).not.toContain('in-progress');
  expect(wrapper.find('.map-portal-wave').exists()).toBe(false);
  expect(wrapper.find('.portal-trail').classes()).toContain('finished');
  await wrapper.setProps({ nodes: [{ id: 5, x: 10, y: 20, activity: { status: 'doing' } }] });
  expect(wrapper.find('.map-portal').classes()).toContain('in-progress');
  expect(wrapper.find('.map-portal').classes()).not.toContain('finished');
  expect(readPortals(1)).toEqual(saved);
  await wrapper.setProps({ nodes: [] });
  expect(wrapper.find('.map-portal').classes()).not.toContain('in-progress');
  expect(wrapper.find('.map-portal').classes()).not.toContain('finished');
  expect(wrapper.find('.map-portal-wave').exists()).toBe(false);
 });
 it('volta ao visual neutro ao desconectar a última atividade em andamento', async () => {
  await open(); await add(); const id = readPortals(1)[0].id;
  await wrapper.setProps({ nodes: [{ id: 5, x: 10, y: 20, activity: { status: 'doing' } }] });
  wrapper.vm.connect(id, 5); await flushPromises();
  expect(wrapper.find('.map-portal').classes()).toContain('in-progress');
  await wrapper.find('.map-edge-hit').trigger('click'); await wrapper.find('.modal .danger').trigger('click'); await flushPromises();
  expect(wrapper.find('.map-portal').classes()).not.toContain('in-progress');
  expect(wrapper.find('.map-portal-wave').exists()).toBe(false);
  expect(wrapper.find('.portal-link').exists()).toBe(false);
 });
});
