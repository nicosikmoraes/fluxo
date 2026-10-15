import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { mount } from '@vue/test-utils';
import DailyList from '../src/components/DailyList.vue';
import App from '../src/App.vue';
import { state,refresh } from '../src/workspace';
let wrapper;
async function api(route,method='GET',data){const response=await fetch('/api'+route,{method,headers:{Accept:'application/json',...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});if(!response.ok)throw new Error(await response.text());return response.status===204?true:response.json();}
const wait=fn=>vi.waitFor(fn,{timeout:8000,interval:30});
const button=text=>wrapper.findAll('button').find(b=>b.text().trim()===text);
async function settle(){await wait(()=>{expect(state.saving).toBe(0);expect(wrapper.find('.daily-loading').exists()).toBe(false);});}
async function start(component=DailyList){wrapper=mount(component,{attachTo:document.body});await wait(()=>expect(wrapper.find('.daily-loading').exists()).toBe(false));}
beforeEach(async()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-15T15:00:00Z'));
 for(const day of ['2026-10-15','2026-10-16']){const data=await api('/daily-list?date='+day);for(const entry of data.entries){if(entry.routine_id)await api('/daily-routines/'+entry.routine_id+'/stop','PATCH',{date:'1900-01-01'});await api('/daily-list/'+entry.id,'DELETE');}}
 const data=await api('/workspace');for(const task of data.tasks)await api('/tasks/'+task.id,'DELETE');for(const project of data.projects)await api('/projects/'+project.id,'DELETE',{delete_tasks:false});state.saving=0;state.toast=null;await refresh();
});
afterEach(()=>{wrapper?.unmount();document.body.innerHTML='';vi.useRealTimers();});
it('salva uma atividade rápida, conclui e mantém os dados ao reabrir',async()=>{
 await start();await wrapper.find('.daily-quick input').setValue('Ler por 20 minutos');await wrapper.find('.daily-quick').trigger('submit');await wait(()=>expect(wrapper.findAll('.daily-entry')).toHaveLength(1));
 await wrapper.find('[role="checkbox"]').trigger('click');await wait(()=>expect(wrapper.find('[role="checkbox"]').attributes('aria-checked')).toBe('true'));
 wrapper.unmount();await start();expect(wrapper.find('.daily-entry-title').text()).toBe('Ler por 20 minutos');expect(wrapper.find('.daily-progress').text()).toContain('1/1');
});
it('traz atividades de vários projetos, impede duplicatas e sincroniza a conclusão',async()=>{
 for(const name of ['Portal','Alinhamento']){const project=await api('/projects','POST',{title:name,cover:'desk'});const task=await api('/tasks','POST',{title:'Entrega '+name,project_id:project.id});await api('/tasks/'+task.id+'/activities','POST',{title:'Validar '+name});}await refresh();await start();
 await button('Trazer de um projeto').trigger('click');await wrapper.findAll('.daily-source-item')[0].trigger('click');await wait(()=>expect(wrapper.findAll('.daily-entry')).toHaveLength(1));await settle();expect(wrapper.findAll('.daily-source-item')[0].attributes('disabled')).toBeDefined();
 await wrapper.findAll('.daily-source-item')[1].trigger('click');await wait(()=>expect(wrapper.findAll('.daily-entry')).toHaveLength(2));await settle();await button('Concluir seleção').trigger('click');await wrapper.findAll('[role="checkbox"]')[0].trigger('click');await wait(()=>expect(state.tasks[0].activities[0].status).toBe('done'));await settle();
 await wrapper.find('.daily-entry:not(.completed) .daily-remove').trigger('click');await wait(()=>expect(wrapper.findAll('.daily-entry')).toHaveLength(1));expect((await api('/workspace')).tasks[1].activities).toHaveLength(1);
});
it('cria uma rotina com prioridade e inicia o próximo dia sem concluir a repetição',async()=>{
 await start();await button('Nova atividade').trigger('click');await wrapper.find('.modal input:not([type])').setValue('Planejar meu dia');const checks=wrapper.findAll('.modal input[type="checkbox"]');await checks[0].setValue(true);await checks[1].setValue(true);await wrapper.find('.modal form').trigger('submit');await wait(()=>expect(wrapper.find('.daily-priority').exists()).toBe(true));
 await wrapper.find('[role="checkbox"]').trigger('click');await wait(()=>expect(wrapper.find('.daily-progress').text()).toContain('1/1'));await wrapper.find('[aria-label="Escolher dia"]').setValue('2026-10-16');await wait(()=>expect(wrapper.find('.daily-entry-title').text()).toBe('Planejar meu dia'));expect(wrapper.find('[role="checkbox"]').attributes('aria-checked')).toBe('false');
 await button('Parar repetição').trigger('click');await settle();expect(wrapper.text()).not.toContain('Parar repetição');await wrapper.find('[aria-label="Escolher dia"]').setValue('2026-10-17');await wait(()=>expect(wrapper.find('.daily-loading').exists()).toBe(false));expect(wrapper.findAll('.daily-entry')).toHaveLength(0);
});
it('leva pendências para o dia seguinte sem levar atividades concluídas',async()=>{
 await api('/daily-list','POST',{date:'2026-10-15',title:'Continuar amanhã'});const done=await api('/daily-list','POST',{date:'2026-10-15',title:'Já feita'});await api('/daily-list/'+done.id,'PATCH',{completed:true});await start();
 await wrapper.find('.daily-carry button').trigger('click');await wait(()=>expect(wrapper.find('[aria-label="Escolher dia"]').element.value).toBe('2026-10-16'));await wait(()=>expect(wrapper.findAll('.daily-entry')).toHaveLength(1));expect(wrapper.find('.daily-entry-title').text()).toBe('Continuar amanhã');
 await wrapper.find('[aria-label="Escolher dia"]').setValue('2026-10-15');await wait(()=>expect(wrapper.findAll('.daily-entry')).toHaveLength(1));expect(wrapper.find('.daily-entry-title').text()).toBe('Já feita');
});
it('respeita bloqueios e abre a atividade original para resolver a dependência',async()=>{
 const task=await api('/tasks','POST',{title:'Minha entrega'});const activity=await api('/tasks/'+task.id+'/activities','POST',{title:'Aguardar API'});await api('/activities/'+activity.id,'PATCH',{blocked:true,blocking_person:'Mariana',blocking_reason:'Validar contrato'});await api('/daily-list','POST',{date:'2026-10-15',activity_id:activity.id});await refresh();await start();
 expect(wrapper.find('[role="checkbox"]').attributes('disabled')).toBeDefined();expect(wrapper.find('.daily-block').text()).toContain('Mariana');await button('Ver atividade').trigger('click');expect(wrapper.emitted('open-task')[0]).toEqual([task.id,activity.id]);
});
it('abre Meu dia pela navegação existente sem trocar o tema',async()=>{
 state.loading=true;wrapper=mount(App,{attachTo:document.body});await wait(()=>expect(state.loading).toBe(false));await button('Meu dia').trigger('click');await wait(()=>expect(wrapper.find('.daily-list').exists()).toBe(true));expect(wrapper.find('.hero h1').text()).toBe('Hoje, um passo de cada vez.');expect(wrapper.find('.breadcrumb').text()).toContain('Meu dia');expect(wrapper.find('.hero-image').attributes('src')).toBe('/ui/hero.png');await settle();
});
