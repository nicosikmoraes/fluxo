import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { reactive, nextTick } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
vi.mock('../src/workspace', () => ({ state: reactive({ roadmaps: [], tasks: [], saving: 0 }), mutate: vi.fn(), request: vi.fn(), refresh: vi.fn(), notify: vi.fn(), label: value => ({pending:'Pendente',doing:'Em andamento',done:'Concluída'}[value]||value) }));
vi.mock('../src/auth', () => ({ auth: reactive({ user: { id: 1 } }) }));
import { state, mutate, request } from '../src/workspace';
import ProjectMap from '../src/components/ProjectMap.vue';

let wrapper;
const roadmapButton = () => wrapper.find('.maps-heading .btn.primary');
const modal = () => wrapper.find('dialog.modal');
const submit = async () => { await modal().find('form').trigger('submit'); await flushPromises(); };

beforeEach(() => {
 localStorage.clear(); vi.clearAllMocks(); state.saving=0;
 state.roadmaps=[{id:1,project_id:7,title:'Mapa',card_type:'activity',nodes:[],edges:[]}];
 state.tasks=[];
 request.mockImplementation(async (url,method,payload)=>({portals:payload.portals,portals_version:payload.version+1}));
 mutate.mockResolvedValue({id:3,project_id:7,title:'Visão geral',card_type:'task',nodes:[],edges:[]});
});
afterEach(() => { wrapper?.unmount(); document.body.innerHTML=''; });

async function open() {
 wrapper=mount(ProjectMap,{props:{projectId:7},attachTo:document.body});
 await flushPromises();
}

describe('Tipos de card por roadmap', () => {
 it('grava a escolha de Tasks apenas ao criar um novo roadmap', async () => {
  await open(); await roadmapButton().trigger('click');
  await modal().find('input').setValue('Visão geral');
  const tasksChoice=modal().findAll('.map-create-option').find(button=>button.text().includes('Tasks'));
  await tasksChoice.trigger('click');
  expect(tasksChoice.attributes('aria-pressed')).toBe('true');
  expect(modal().text()).toContain('Suas tasks e atividades continuam como estão.');
  await submit();
  expect(mutate).toHaveBeenCalledExactlyOnceWith('/projects/7/roadmaps','POST',{title:'Visão geral',card_type:'task'},'Roadmap criado.');
 });

 it('mostra e adiciona tasks como cards sem editar as atividades existentes', async () => {
  const activities=[{id:101,title:'Planejar',status:'pending',blocked:false,comments:[]},{id:102,title:'Construir',status:'doing',blocked:false,comments:[]}];
  state.tasks=[
   {id:11,title:'Primeira entrega',project_id:7,status:'doing',completed_count:0,blocked_count:0,comments_count:0,activities},
   {id:12,title:'Publicação',project_id:7,status:'pending',completed_count:0,blocked_count:0,comments_count:0,activities:[]},
  ];
  state.roadmaps=[{id:1,project_id:7,title:'Visão geral',card_type:'task',nodes:[{id:9,task_id:11,activity_id:null,x:10,y:20}],edges:[]}];
  const snapshot=JSON.stringify(state.tasks);
  await open();
  expect(wrapper.find('.map-node.task-card .map-node-title').text()).toBe('Primeira entrega');
  expect(wrapper.find('.maps-palette h4').text()).toContain('Suas tasks');
  await wrapper.find('[aria-label="Adicionar Publicação ao mapa"]').trigger('click'); await flushPromises();
  expect(mutate).toHaveBeenCalledWith('/roadmaps/1/nodes','POST',expect.objectContaining({task_id:12}));
  expect(mutate.mock.calls[0][2].x).toBeGreaterThanOrEqual(0); expect(mutate.mock.calls[0][2].y).toBeGreaterThanOrEqual(0);
  expect(JSON.stringify(state.tasks)).toBe(snapshot);
 });

 it('abre o painel da task pelo card do roadmap, sem selecionar uma atividade', async () => {
  state.tasks=[{id:11,title:'Entrega',project_id:7,status:'pending',completed_count:0,blocked_count:0,comments_count:0,activities:[]}];
  state.roadmaps=[{id:1,project_id:7,title:'Visão geral',card_type:'task',nodes:[{id:9,task_id:11,activity_id:null,x:10,y:20}],edges:[]}];
  await open();
  await wrapper.find('.map-node-title').trigger('click'); await nextTick();
  expect(wrapper.emitted('open-activity')).toEqual([[11,null]]);
 });
});
