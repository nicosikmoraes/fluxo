import { describe,it,expect,beforeEach,afterEach,vi } from 'vitest';
import { mount,flushPromises } from '@vue/test-utils';
import App from '../src/App.vue';
import { state } from '../src/workspace';
let wrapper;
async function api(route,method='GET',data){const r=await fetch('/api'+route,{method,headers:{Accept:'application/json',...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});if(!r.ok)throw new Error(await r.text());return r.status===204?true:r.json();}
const wait=async(fn)=>vi.waitFor(fn,{timeout:8000,interval:30});
const button=(text)=>wrapper.findAll('button').find(b=>b.text().trim()===text);
async function start(){wrapper=mount(App,{attachTo:document.body});await wait(()=>expect(state.loading).toBe(false));}
beforeEach(async()=>{const data=await api('/workspace');for(const t of data.tasks)await api('/tasks/'+t.id,'DELETE');for(const p of data.projects)await api('/projects/'+p.id,'DELETE',{delete_tasks:false});state.tasks=[];state.projects=[];state.error='';state.toast=null;state.saving=0;});
afterEach(()=>{wrapper?.unmount();document.body.innerHTML='';});
describe('Fluxo com a API real e banco isolado',()=>{
 it('cria um projeto e uma task, abrindo o painel para os primeiros passos',async()=>{
  await start();expect(wrapper.text()).toContain('Sua próxima ideia começa aqui.');
  await wrapper.find('[aria-label="Criar projeto"]').trigger('click');await wrapper.find('.modal input').setValue('Projeto de validação');await wrapper.find('.modal form').trigger('submit');
  await wait(()=>expect(wrapper.find('.hero h1').text()).toBe('Projeto de validação'));
  await button('Nova task').trigger('click');await wrapper.find('.modal input').setValue('Construir meu produto');await wrapper.find('.modal textarea').setValue('Uma ideia de cada vez.');await wrapper.find('.modal form').trigger('submit');
  await wait(()=>expect(wrapper.find('.task-title').text()).toBe('Construir meu produto'));
  expect(wrapper.find('.activity-empty').text()).toContain('Um passo de cada vez.');expect(state.tasks[0].project_id).toBe(state.projects[0].id);
 }),
 it('adiciona atividades, bloqueia por pessoa, comenta e conclui os passos',async()=>{
  const t=await api('/tasks','POST',{title:'Implementar recurso'});await api('/tasks/'+t.id+'/activities','POST',{title:'Implementar API'});
  await start();await wrapper.find('.task-card').trigger('click');await wrapper.find('.add-activity input').setValue('Criar interface');await wrapper.find('.add-activity').trigger('submit');
  await wait(()=>expect(wrapper.findAll('.activity-card')).toHaveLength(2));
  await wrapper.findAll('.activity-card')[0].find('.mini-action').trigger('click');await wrapper.find('.modal input').setValue('Mariana');await wrapper.find('.modal textarea').setValue('Liberar o acesso à API');await wrapper.find('.modal form').trigger('submit');
  await wait(()=>expect(wrapper.find('.blocked-notice').text()).toContain('Aguardando Mariana terminar'));
  expect(wrapper.findAll('.activity-card')[0].find('.activity-check').attributes('disabled')).toBeDefined();
  await wrapper.find('.blocked-notice .text-btn').trigger('click');await wait(()=>expect(wrapper.find('.blocked-notice').exists()).toBe(false));
  // The newly added activity is expanded and ready for comments.
  await wrapper.find('.comment-form textarea').setValue('Vamos usar a API local.');await wrapper.find('.comment-form').trigger('submit');
  await wait(()=>expect(wrapper.find('.comment-body').text()).toBe('Vamos usar a API local.'));
  await wrapper.find('[aria-label="Editar comentário"]').trigger('click');await wrapper.find('.comment-content textarea').setValue('API local confirmada.');await wrapper.find('.comment-content form').trigger('submit');
  await wait(()=>expect(wrapper.find('.comment-body').text()).toBe('API local confirmada.'));
  await wrapper.find('[aria-label="Excluir comentário"]').trigger('click');await wrapper.find('.modal .danger').trigger('click');await wait(()=>expect(wrapper.find('.comment-body').exists()).toBe(false));
  await wrapper.findAll('.activity-check')[0].trigger('click');await wait(()=>expect(state.tasks[0].completed_count).toBe(1));await wrapper.findAll('.activity-check')[1].trigger('click');await wait(()=>expect(state.tasks[0].status).toBe('done'));
  expect(wrapper.find('.status-tag').text()).toBe('Concluída');expect(wrapper.find('.kanban-column.done .task-card').text()).toContain('Implementar recurso');
 }),
 it('filtra por atividade, pessoa e status sem alterar os dados',async()=>{
  const t=await api('/tasks','POST',{title:'Task principal'});const a=await api('/tasks/'+t.id+'/activities','POST',{title:'Preparar endpoint'});await api('/activities/'+a.id,'PATCH',{blocked:true,blocking_person:'Mariana',blocking_reason:'Dependência externa'});
  const other=await api('/tasks','POST',{title:'Entrega final'});const b=await api('/tasks/'+other.id+'/activities','POST',{title:'Entregar'});await api('/activities/'+b.id,'PATCH',{status:'done'});
  await start();await wrapper.find('.search-field input').setValue('Mariana');expect(wrapper.findAll('.task-card')).toHaveLength(1);expect(wrapper.find('.task-card').text()).toContain('Task principal');
  await wrapper.find('.search-field input').setValue('endpoint');expect(wrapper.findAll('.task-card')).toHaveLength(1);
  await wrapper.find('.search-field input').setValue('');await wrapper.find('.filter-select').setValue('done');expect(wrapper.findAll('.task-card')).toHaveLength(1);expect(wrapper.find('.task-card').text()).toContain('Entrega final');expect(state.tasks).toHaveLength(2);
 }),
 it('mostra atividades de várias tasks nos cards do roadmap e salva novas inclusões',async()=>{
  const p=await api('/projects','POST',{title:'Meu roadmap',cover:'desk'});
  const t=await api('/tasks','POST',{title:'Backend',project_id:p.id});const other=await api('/tasks','POST',{title:'Frontend',project_id:p.id});
  const a=await api('/tasks/'+t.id+'/activities','POST',{title:'Modelar banco'});const b=await api('/tasks/'+other.id+'/activities','POST',{title:'Desenhar tela'});const c=await api('/tasks/'+t.id+'/activities','POST',{title:'Criar endpoints'});
  const d=await api('/tasks/'+other.id+'/activities','POST',{title:'Integrar interface'});
  await api('/activities/'+a.id,'PATCH',{blocked:true,blocking_person:'Mariana',blocking_reason:'Aprovar o modelo'});
  const roadmap=await api('/projects/'+p.id+'/roadmaps','POST',{title:'Entrega'});
  const nodes=[];
  for(const [index,activity] of [a,b,c].entries()) nodes.push(await api('/roadmaps/'+roadmap.id+'/nodes','POST',{activity_id:activity.id,x:80+index*340,y:100}));
  await api('/roadmaps/'+roadmap.id+'/edges','POST',{source_node_id:nodes[0].id,target_node_id:nodes[1].id});
  await api('/roadmaps/'+roadmap.id+'/edges','POST',{source_node_id:nodes[1].id,target_node_id:nodes[2].id});
  await start();await wrapper.find('.sidebar-projects .project-link').trigger('click');await wrapper.findAll('[role="tab"]')[1].trigger('click');
  expect(wrapper.findAll('.map-node')).toHaveLength(3);expect(wrapper.find('.map-node-blocked').text()).toContain('Mariana');
  expect(wrapper.findAll('.maps-connections .map-edge')).toHaveLength(2);
  await wrapper.find('.maps-search input').setValue('Integrar interface');
  await wait(()=>expect(wrapper.findAll('.palette-card')).toHaveLength(1));
  await wrapper.find('[aria-label="Adicionar Integrar interface ao mapa"]').trigger('click');
  await wait(()=>expect(wrapper.findAll('.map-node')).toHaveLength(4));
  expect((await api('/workspace')).tasks.find(v=>v.id===other.id).activities.map(v=>v.id)).toEqual([b.id,d.id]);
  await wrapper.findAll('.map-node-title').find(title=>title.text()==='Desenhar tela').trigger('click');
  expect(wrapper.find('.activity-parent-task').text()).toBe('Frontend');expect(wrapper.find('.add-activity').exists()).toBe(false);expect(wrapper.findAll('.activity-card')).toHaveLength(1);
  // Reopen the project roadmap from the API and verify the four cards remain attached.
  wrapper.unmount();await start();await wrapper.find('.sidebar-projects .project-link').trigger('click');await wrapper.findAll('[role="tab"]')[1].trigger('click');
  expect(wrapper.findAll('.map-node-title').map(title=>title.text())).toEqual(expect.arrayContaining(['Modelar banco','Desenhar tela','Criar endpoints','Integrar interface']));
 }),
 it('exclui um projeto mantendo as tasks sem projeto',async()=>{
  const p=await api('/projects','POST',{title:'Projeto temporário',cover:'desk'});await api('/tasks','POST',{title:'Task preservada',project_id:p.id});await start();await wrapper.findAll('nav button')[1].trigger('click');
  await wrapper.find('.project-card [aria-label="Excluir projeto"]').trigger('click');await button('Manter as tasks').trigger('click');
  await wait(()=>expect(state.projects).toHaveLength(0));expect(state.tasks).toHaveLength(1);expect(state.tasks[0].project_id).toBe(null);
 });
});
