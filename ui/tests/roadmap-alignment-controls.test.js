import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { reactive } from 'vue';
vi.mock('../src/workspace', () => ({ request: vi.fn(), notify: vi.fn(), state: reactive({ saving: 0, roadmaps: [] }), refresh: vi.fn() }));
vi.mock('../src/auth', () => ({ auth: reactive({ user: { id: 1 } }) }));
import { request, state } from '../src/workspace';
import RoadmapAlignmentControls from '../src/components/RoadmapAlignmentControls.vue';
let wrapper;
const nodes = [{ id: 1, x: 10, y: 10 }, { id: 2, x: 355, y: 20 }];
const button = text => wrapper.findAll('button').find(button => button.text() === text);
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); state.saving = 0; state.roadmaps=[{id:7,nodes,portals:[]}]; request.mockImplementation(async (url, method, payload) => url.endsWith('/portals') ? ({portals:payload.portals,portals_version:payload.version+1}) : ({ nodes: payload.nodes.map(({ id, x, y }) => ({ id, x, y })) })); });
afterEach(() => wrapper?.unmount());
async function open() { wrapper = mount(RoadmapAlignmentControls, { props: { roadmapId: 7, nodes: nodes.map(node => ({ ...node })), portals: [] } }); }
describe('Prévia e gravação do alinhamento', () => {
 it('gera a prévia sem gravar e cancela restaurando a apresentação', async () => {
  await open(); await button('Alinhar cards').trigger('click'); expect(wrapper.text()).toContain('Prévia'); expect(request).not.toHaveBeenCalled();
  expect(wrapper.emitted('preview')[0][0].nodes).toEqual([{ id: 1, x: 10, y: 15 }, { id: 2, x: 346, y: 15 }]);
  await button('Cancelar').trigger('click'); expect(wrapper.emitted('preview').at(-1)).toEqual([null]);
 });
 it('aplica em um único pedido com posições anteriores e desfaz o resultado', async () => {
  await open(); await button('Alinhar cards').trigger('click'); await button('Aplicar').trigger('click'); await flushPromises();
  expect(request).toHaveBeenCalledTimes(1); expect(request.mock.calls[0][0]).toBe('/roadmaps/7/layout'); expect(request.mock.calls[0][2].nodes[1]).toEqual({ id: 2, x: 346, y: 15, previous_x: 355, previous_y: 20 });
  const saved = wrapper.emitted('positions-saved')[0][0]; await wrapper.setProps({ nodes: saved.nodes });
  await button('Desfazer alinhamento').trigger('click'); await flushPromises();
  expect(wrapper.emitted('positions-saved').at(-1)[0].nodes).toEqual(nodes); expect(state.saving).toBe(0);
 });
 it('mantém a prévia e as posições originais se o servidor recusar a gravação', async () => {
  await open(); request.mockRejectedValueOnce(new Error('O mapa mudou.'));
  await button('Alinhar cards').trigger('click'); await button('Aplicar').trigger('click'); await flushPromises();
  expect(wrapper.text()).toContain('Prévia'); expect(wrapper.emitted('positions-saved')).toBeUndefined(); expect(state.saving).toBe(0);
 });
 it('cancela uma prévia obsoleta e impede desfazer após movimentação manual', async () => {
  await open(); await button('Alinhar cards').trigger('click'); await wrapper.setProps({ nodes: [{ ...nodes[0], x: 99 }, nodes[1]] }); expect(wrapper.text()).not.toContain('Prévia');
  await button('Alinhar cards').trigger('click'); await button('Aplicar').trigger('click'); await flushPromises();
  const saved = wrapper.emitted('positions-saved').at(-1)[0]; await wrapper.setProps({ nodes: saved.nodes }); expect(button('Desfazer alinhamento').attributes('disabled')).toBeUndefined();
  await wrapper.setProps({ nodes: saved.nodes.map((node, index) => index ? node : { ...node, x: node.x + 20 }) }); expect(button('Desfazer alinhamento').attributes('disabled')).toBeDefined();
 });
 it('move portais somente após salvar cards e também restaura ao desfazer', async () => {
  await open(); const portals = [{ id: 'p', label: '', x: 690, y: 80, sources: [2] }]; state.roadmaps[0].portals=portals; await wrapper.setProps({ portals });
  await button('Alinhar cards').trigger('click'); expect(state.roadmaps[0].portals[0].y).toBe(80);
  await button('Aplicar').trigger('click'); await flushPromises(); const saved = wrapper.emitted('positions-saved')[0][0]; expect(saved.portals[0].y).toBe(59);
  await wrapper.setProps({ nodes: saved.nodes, portals: state.roadmaps[0].portals });
  await button('Desfazer alinhamento').trigger('click'); await flushPromises(); expect(state.roadmaps[0].portals).toEqual(portals);
 });
});
