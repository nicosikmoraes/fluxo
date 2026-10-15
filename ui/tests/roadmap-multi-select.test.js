import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { reactive,nextTick } from 'vue';
import { mount,flushPromises } from '@vue/test-utils';
vi.mock('../src/workspace',()=>({state:reactive({roadmaps:[],tasks:[],saving:0}),mutate:vi.fn(),request:vi.fn(),notify:vi.fn(),label:value=>value}));
import { state,mutate } from '../src/workspace';
import ProjectMap from '../src/components/ProjectMap.vue';
let wrapper,canvas;
const initial=[{id:5,activity_id:1,x:100,y:100},{id:6,activity_id:2,x:450,y:100},{id:7,activity_id:3,x:100,y:700}];
const coordinates=()=>wrapper.findAll('.map-node').map(node=>[parseFloat(node.element.style.left),parseFloat(node.element.style.top)]);
async function pointer(target,type,{x=100,y=100,buttons=1,button=0,pointerId=1,pointerType='mouse'}={}){
 const event=new Event(type,{bubbles:true,cancelable:true});
 for(const [key,value] of Object.entries({clientX:x,clientY:y,buttons,button,pointerId,pointerType}))Object.defineProperty(event,key,{value});
 target.element.dispatchEvent(event);await nextTick();return event;
}
async function select({rightFirst=false,reverse=false}={}){
 const start=reverse?{x:790,y:370}:{x:140,y:150},end=reverse?{x:140,y:150}:{x:790,y:370};
 await pointer(canvas,'pointerdown',{...start,button:rightFirst?2:0,buttons:rightFirst?2:1});
 await pointer(canvas,'pointermove',{...start,buttons:3,button:rightFirst?0:2});
 await pointer(canvas,'pointermove',{...end,buttons:3,button:-1});
 await pointer(canvas,'pointermove',{...end,buttons:1,button:2});
 await pointer(canvas,'pointerup',{...end,buttons:0,button:0});
}
beforeEach(async()=>{
 localStorage.clear();vi.clearAllMocks();state.saving=0;
 state.tasks=[{id:10,title:'Entrega',project_id:7,activities:[1,2,3].map(id=>({id,title:'Etapa '+id,status:'pending',blocked:false,comments:[]}))}];
 state.roadmaps=[{id:1,project_id:7,title:'Mapa',nodes:initial.map(node=>({...node})),edges:[{id:1,source_node_id:5,target_node_id:6}]}];
 mutate.mockImplementation(async(url,method,payload)=>{
  if(url.endsWith('/layout')){state.roadmaps[0].nodes=state.roadmaps[0].nodes.map(node=>({...node,...payload.nodes.find(p=>p.id===node.id)}));return {nodes:state.roadmaps[0].nodes};}
  const id=Number(url.split('/').at(-1));const node=state.roadmaps[0].nodes.find(n=>n.id===id);if(node)Object.assign(node,payload);return node;
 });
 wrapper=mount(ProjectMap,{props:{projectId:7},attachTo:document.body});await flushPromises();canvas=wrapper.find('.maps-viewport');
 canvas.element.getBoundingClientRect=()=>({left:20,top:30,width:1000,height:600});
});
afterEach(()=>{wrapper?.unmount();document.body.innerHTML='';});

describe('Seleção com os dois botões do mouse',()=>{
 it.each([false,true])('seleciona ao apertar o botão direito primeiro: %s, sem mover os cards ou o fundo',async(rightFirst)=>{
  const background=canvas.element.style.backgroundPosition;
  await select({rightFirst});expect(wrapper.findAll('.map-node.selected')).toHaveLength(2);expect(coordinates()).toEqual([[100,100],[450,100],[100,700]]);expect(canvas.element.style.backgroundPosition).toBe(background);expect(mutate).not.toHaveBeenCalled();expect(wrapper.find('.map-selection-box').exists()).toBe(false);
 });
 it('seleciona ao arrastar a área de baixo para cima e da direita para a esquerda',async()=>{
  await select({reverse:true});expect(wrapper.findAll('.map-node.selected')).toHaveLength(2);
 });
 it('mostra a área durante o gesto e não abre atividades com o clique de soltura',async()=>{
  await pointer(canvas,'pointerdown',{x:140,y:150,buttons:3});await pointer(canvas,'pointermove',{x:790,y:370,buttons:3,button:-1});expect(wrapper.find('.map-selection-box').exists()).toBe(true);
  await pointer(canvas,'pointermove',{x:790,y:370,buttons:2,button:0});
  const context=new Event('contextmenu',{bubbles:true,cancelable:true});canvas.element.dispatchEvent(context);expect(context.defaultPrevented).toBe(true);
  await pointer(canvas,'pointerup',{x:790,y:370,buttons:0,button:2});await wrapper.find('.map-node-title').trigger('click',{detail:1});expect(wrapper.emitted('open-activity')).toBeUndefined();
 });
 it('substitui um arraste já iniciado pela seleção sem salvar o deslocamento inicial',async()=>{
  await pointer(wrapper.find('.map-node-grip'),'pointerdown',{x:200,y:200});await pointer(canvas,'pointermove',{x:240,y:250,button:-1});expect(coordinates()[0]).toEqual([140,150]);
  await pointer(canvas,'pointermove',{x:240,y:250,buttons:3,button:2});expect(coordinates()).toEqual([[100,100],[450,100],[100,700]]);
  await pointer(canvas,'pointermove',{x:790,y:370,buttons:3,button:-1});await pointer(canvas,'pointerup',{x:790,y:370,buttons:0});expect(wrapper.findAll('.map-node.selected')).toHaveLength(2);expect(mutate).not.toHaveBeenCalled();
 });
 it('permite abrir uma atividade pelo teclado após terminar a seleção',async()=>{
  await select();await wrapper.find('.map-node-title').trigger('click',{detail:0});expect(wrapper.emitted('open-activity')[0]).toEqual([10,1]);
 });
 it('desloca o grupo por um único pedido, preserva os outros cards e acompanha as conexões',async()=>{
  await select();const path=wrapper.find('.map-edge').attributes('d');
  await pointer(wrapper.find('.map-node-grip'),'pointerdown',{x:200,y:200});await pointer(canvas,'pointermove',{x:250,y:280,button:-1});
  expect(coordinates()).toEqual([[150,180],[500,180],[100,700]]);expect(wrapper.find('.map-edge').attributes('d')).not.toBe(path);
  await pointer(canvas,'pointerup',{x:250,y:280,buttons:0});await flushPromises();
  expect(mutate).toHaveBeenCalledTimes(1);expect(mutate.mock.calls[0]).toEqual(['/roadmaps/1/layout','PATCH',{nodes:[{id:5,x:150,y:180,previous_x:100,previous_y:100},{id:6,x:500,y:180,previous_x:450,previous_y:100},{id:7,x:100,y:700,previous_x:100,previous_y:700}]}]);expect(wrapper.findAll('.map-node.selected')).toHaveLength(2);expect(coordinates()).toEqual([[150,180],[500,180],[100,700]]);
 });
 it('permite arrastar pelo corpo de um card da seleção sem abrir sua atividade',async()=>{
  await select();await pointer(wrapper.find('.map-node-title'),'pointerdown',{x:200,y:230});await pointer(canvas,'pointermove',{x:230,y:250,button:-1});await pointer(canvas,'pointerup',{x:230,y:250,buttons:0});await flushPromises();expect(coordinates()).toEqual([[130,120],[480,120],[100,700]]);expect(wrapper.emitted('open-activity')).toBeUndefined();
 });
 it('respeita o zoom ao selecionar e mover o grupo',async()=>{
  await wrapper.find('[aria-label="Aumentar zoom"]').trigger('click');
  await pointer(canvas,'pointerdown',{x:55,y:70,buttons:3});await pointer(canvas,'pointermove',{x:940,y:405,buttons:3,button:-1});await pointer(canvas,'pointerup',{x:940,y:405,buttons:0});expect(wrapper.findAll('.map-node.selected')).toHaveLength(2);
  await pointer(wrapper.find('.map-node-grip'),'pointerdown',{x:200,y:200});await pointer(canvas,'pointermove',{x:260,y:224,button:-1});await pointer(canvas,'pointerup',{x:260,y:224,buttons:0});await flushPromises();expect(coordinates()).toEqual([[150,120],[500,120],[100,700]]);
 });
 it('cancela o movimento com Esc sem salvar e limpa a seleção',async()=>{
  await select();await pointer(wrapper.find('.map-node-grip'),'pointerdown',{x:200,y:200});await pointer(canvas,'pointermove',{x:290,y:240,button:-1});await canvas.trigger('keydown',{key:'Escape'});expect(coordinates()).toEqual([[100,100],[450,100],[100,700]]);expect(wrapper.findAll('.map-node.selected')).toHaveLength(0);await pointer(canvas,'pointerup',{buttons:0});expect(mutate).not.toHaveBeenCalled();
 });
 it('cancela a prévia ao perder o foco da janela ou a captura do mouse',async()=>{
  await select();await pointer(wrapper.find('.map-node-grip'),'pointerdown',{x:200,y:200});await pointer(canvas,'pointermove',{x:270,y:270,button:-1});window.dispatchEvent(new Event('blur'));await nextTick();expect(coordinates()).toEqual([[100,100],[450,100],[100,700]]);expect(mutate).not.toHaveBeenCalled();
  await pointer(wrapper.find('.map-node-grip'),'pointerdown',{x:200,y:200});await pointer(canvas,'pointermove',{x:260,y:260,button:-1});await pointer(canvas,'lostpointercapture',{buttons:0});expect(coordinates()).toEqual([[100,100],[450,100],[100,700]]);
 });
 it('restaura os cards quando o salvamento é recusado, sem perder a seleção',async()=>{
  await select();mutate.mockResolvedValueOnce(null);await pointer(wrapper.find('.map-node-grip'),'pointerdown',{x:200,y:200});await pointer(canvas,'pointermove',{x:270,y:260,button:-1});await pointer(canvas,'pointerup',{x:270,y:260,buttons:0});await flushPromises();expect(coordinates()).toEqual([[100,100],[450,100],[100,700]]);expect(wrapper.findAll('.map-node.selected')).toHaveLength(2);
 });
 it('mantém o arraste individual, substitui a seleção ao arrastar outro card e não salva cliques sem movimento',async()=>{
  await select();await pointer(wrapper.findAll('.map-node-grip')[2],'pointerdown',{x:200,y:800});await pointer(canvas,'pointermove',{x:210,y:820,button:-1});await pointer(canvas,'pointerup',{x:210,y:820,buttons:0});await flushPromises();expect(mutate.mock.calls[0]).toEqual(['/roadmaps/1/nodes/7','PATCH',{x:110,y:720}]);expect(wrapper.findAll('.map-node.selected')).toHaveLength(1);
  mutate.mockClear();await pointer(wrapper.findAll('.map-node-grip')[2],'pointerdown',{x:200,y:800});await pointer(canvas,'pointerup',{x:200,y:800,buttons:0});expect(mutate).not.toHaveBeenCalled();
 });
 it('move a seleção com as setas e a limpa ao clicar no fundo, trocar de mapa ou iniciar alinhamento',async()=>{
  await select();await wrapper.find('.map-node').trigger('keydown',{key:'ArrowRight'});await flushPromises();expect(coordinates()).toEqual([[120,100],[470,100],[100,700]]);expect(mutate.mock.calls[0][0]).toBe('/roadmaps/1/layout');
  await pointer(canvas,'pointerdown',{x:950,y:550});await pointer(canvas,'pointerup',{x:950,y:550,buttons:0});expect(wrapper.findAll('.map-node.selected')).toHaveLength(0);
  await select();state.roadmaps.push({id:2,project_id:7,title:'Outro',nodes:[],edges:[]});await nextTick();await wrapper.find('[aria-label="Roadmap atual"]').setValue('2');await flushPromises();expect(wrapper.findAll('.map-node.selected')).toHaveLength(0);await wrapper.find('[aria-label="Roadmap atual"]').setValue('1');await flushPromises();await select();await wrapper.findAll('button').find(b=>b.text()==='Alinhar cards').trigger('click');expect(wrapper.findAll('.map-node.selected')).toHaveLength(0);
 });
 it('não inicia seleção durante salvamento ou com a caneta, e mantém a navegação comum com o botão esquerdo',async()=>{
  state.saving=1;await select();expect(wrapper.findAll('.map-node.selected')).toHaveLength(0);state.saving=0;
  await pointer(canvas,'pointerdown',{buttons:3,pointerType:'pen'});await pointer(canvas,'pointermove',{x:500,y:300,buttons:3,pointerType:'pen'});expect(wrapper.find('.map-selection-box').exists()).toBe(false);await pointer(canvas,'pointerup',{buttons:0,pointerType:'pen'});
  const background=canvas.element.style.backgroundPosition;await pointer(canvas,'pointerdown',{x:900,y:500});await pointer(canvas,'pointermove',{x:920,y:530,button:-1});expect(canvas.element.style.backgroundPosition).not.toBe(background);await pointer(canvas,'pointerup',{x:920,y:530,buttons:0});expect(mutate).not.toHaveBeenCalled();
 });
});
