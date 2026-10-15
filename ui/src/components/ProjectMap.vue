<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { Plus, Search, X, GripVertical, ArrowRight, MessageSquare, LockKeyhole, Map as MapIcon, Pencil, Trash2, ZoomIn, ZoomOut, Scan, MousePointer2, Unplug, Hand, Check, Star, Flag, Play } from '@lucide/vue';
import { state, mutate, label } from '../workspace';
import { selectionBounds, intersectingCards, translateCards, layoutMovePayload } from '../roadmapSelection';
import { readRoadmapPreferences, saveRoadmapPreference, chooseRoadmap } from '../roadmapPreferences';
import RoadmapPortals from './RoadmapPortals.vue';
import RoadmapAlignmentControls from './RoadmapAlignmentControls.vue';
import Modal from './Modal.vue';
import ConfirmDialog from './ConfirmDialog.vue';
const props=defineProps({projectId:Number});
const emit=defineEmits(['open-activity','new-task']);
const primary=ref(null), portalLayer=ref(null);
const layoutPreview=ref(null), alignmentDrafts=ref({}), portalDrafts=ref({});
const editingLocked=computed(()=>!!state.saving||!!layoutPreview.value);
const selected=ref(null), search=ref(''), viewport=ref(null), form=ref(null), title=ref(''), removingMap=ref(false);
const adding=ref(false), activityTitle=ref(''), taskId=ref(null), activityConnection=ref(null);
const connectionKind=ref('activity');
const camera=reactive({x:40,y:40,zoom:1}), cameras=new Map();
const drafts=reactive({}), gesture=ref(null), source=ref(null), ghost=ref(null), selectedEdge=ref(null);
const selectedNodeIds=ref([]);
const selectedNodeSet=computed(()=>new Set(selectedNodeIds.value));
const selectionRect=computed(()=>gesture.value?.kind==='selection'?selectionBounds(gesture.value.start,gesture.value.end):null);
let suppressGestureClick=false;
const WIDTH=272, HEIGHT=184;
const isInProgress=node=>node.activity.status==='doing'&&!node.activity.blocked;
const VIEW_MARGIN=32;
const maps=computed(()=>state.roadmaps.filter(m=>m.project_id===props.projectId));
const current=computed(()=>maps.value.find(m=>m.id===Number(selected.value)));
const tasks=computed(()=>state.tasks.filter(t=>t.project_id===props.projectId));
const activities=computed(()=>tasks.value.flatMap(t=>t.activities.map(a=>({...a,task:t}))));
const byActivity=computed(()=>new Map(activities.value.map(a=>[a.id,a])));
const nodes=computed(()=>(current.value?.nodes||[]).map(n=>({...n,...alignmentDrafts.value[n.id],...drafts[n.id],activity:byActivity.value.get(n.activity_id)})).filter(n=>n.activity));
const byNode=computed(()=>new Map(nodes.value.map(n=>[n.id,n])));
const available=computed(()=>activities.value.filter(a=>!nodes.value.some(n=>n.activity_id===a.id)&&[a.title,a.task.title].join(' ').toLocaleLowerCase('pt-BR').includes(search.value.trim().toLocaleLowerCase('pt-BR'))));
const portalSourceIds=computed(()=>new Set((portalLayer.value?.markers||[]).flatMap(marker=>marker.sources)));
const layoutItems=computed(()=>[...nodes.value.map(n=>({...n,width:WIDTH,height:HEIGHT})),...(portalLayer.value?.markers||[]).map(p=>({...p,...portalDrafts.value[p.id],width:160,height:p.label?270:110}))]);
const world=computed(()=>({width:Math.max(2400,...layoutItems.value.map(n=>n.x+n.width+600)),height:Math.max(1200,...layoutItems.value.map(n=>n.y+n.height+400))}));
const edges=computed(()=>(current.value?.edges||[]).filter(e=>byNode.value.has(e.source_node_id)&&byNode.value.has(e.target_node_id)));
watch(()=>[props.projectId,maps.value.map(m=>m.id).join(',')],(value,old)=>{
 const preferences=readRoadmapPreferences(props.projectId);
 primary.value=maps.value.some(m=>m.id===Number(preferences.primary))?Number(preferences.primary):null;
 if(old?.[0]!==props.projectId||!maps.value.some(m=>m.id===Number(selected.value))) selected.value=chooseRoadmap(maps.value,preferences);
},{immediate:true});
watch(selected,id=>{if(id!=null)saveRoadmapPreference(props.projectId,'last',Number(id));},{immediate:true});
function makePrimary(){if(!current.value)return;primary.value=current.value.id;saveRoadmapPreference(props.projectId,'primary',current.value.id);}
watch(selected,async(id,old)=>{cancelGesture();selectedNodeIds.value=[];setAlignmentPreview(null);if(old)cameras.set(Number(old),{...camera});const saved=cameras.get(Number(id));Object.assign(camera,saved||{x:40,y:40,zoom:1});cancelGesture();source.value=null;selectedEdge.value=null;adding.value=false;activityConnection.value=null;await nextTick();if(id===selected.value&&viewport.value&&!saved)fit();},{immediate:true});
const url=()=>'/roadmaps/'+current.value.id;
function worldPoint(clientX,clientY){const r=viewport.value.getBoundingClientRect();return {x:(clientX-r.left-camera.x)/camera.zoom,y:(clientY-r.top-camera.y)/camera.zoom};}
const clamp=n=>Math.min(1000000,Math.max(0,Math.round(n)));
function curve(start,end){const d=Math.max(70,Math.abs(end.x-start.x)*.45);return `M ${start.x} ${start.y} C ${start.x+d} ${start.y}, ${end.x-d} ${end.y}, ${end.x} ${end.y}`;}
function edgePath(e){const a=byNode.value.get(e.source_node_id),b=byNode.value.get(e.target_node_id);return curve({x:a.x+WIDTH,y:a.y+92},{x:b.x,y:b.y+92});}
const draftPath=computed(()=>{const n=byNode.value.get(source.value);return n&&ghost.value?curve({x:n.x+WIDTH,y:n.y+92},ghost.value):'';});
function openMapForm(edit=false){if(editingLocked.value)return;title.value=edit?current.value.title:'';form.value=edit?'edit':'create';}
async function saveMap(){if(editingLocked.value||!title.value.trim())return;const editing=form.value==='edit';const result=await mutate(editing?url():'/projects/'+props.projectId+'/roadmaps',editing?'PATCH':'POST',{title:title.value.trim()},editing?'Nome do roadmap atualizado.':'Roadmap criado.');if(result){selected.value=result.id;form.value=null;}}
async function deleteMap(){if(editingLocked.value)return;const result=await mutate(url(),'DELETE',null,'Roadmap excluído.');if(result)removingMap.value=false;}
async function addCard(activityId,point){if(!current.value||editingLocked.value)return;const r=viewport.value.getBoundingClientRect();const p=point||worldPoint(r.left+60,r.top+100);p.x=clamp(p.x);p.y=clamp(p.y);if(!point){while(nodes.value.some(n=>Math.abs(n.x-p.x)<WIDTH+25&&Math.abs(n.y-p.y)<HEIGHT+25))p.x+=WIDTH+70;}const result=await mutate(url()+'/nodes','POST',{activity_id:activityId,x:clamp(p.x),y:clamp(p.y)});if(result)revealCard(result);}
function dragAvailable(e,a){e.dataTransfer.setData('application/x-fluxo-activity',String(a.id));e.dataTransfer.effectAllowed='copy';}
function drop(e){const id=Number(e.dataTransfer.getData('application/x-fluxo-activity'));if(available.value.some(a=>a.id===id))addCard(id,worldPoint(e.clientX,e.clientY));}
function capture(e){if(e.pointerId!=null)viewport.value?.setPointerCapture?.(e.pointerId);}
function releaseCapture(pointerId){if(pointerId!=null&&viewport.value?.hasPointerCapture?.(pointerId))viewport.value.releasePointerCapture(pointerId);}
const mouseChord=e=>(!e.pointerType||e.pointerType==='mouse')&&(e.buttons&3)===3;
function clearSelection(){cancelGesture();selectedNodeIds.value=[];}
function startSelection(e){
 if(editingLocked.value||e.target.closest('.map-overlay'))return false;
 const previous=[...selectedNodeIds.value];
 cancelConnection();portalLayer.value?.cancelMove?.();selectedEdge.value=null;
 const point=worldPoint(e.clientX,e.clientY);
 gesture.value={kind:'selection',pointerId:e.pointerId,start:point,end:point,previous,moved:false};
 selectedNodeIds.value=[];suppressGestureClick=true;
 e.preventDefault();e.stopPropagation();capture(e);return true;
}
function pointerDownCapture(e){
 if(gesture.value?.kind==='selection-release'){e.preventDefault();e.stopPropagation();return;}
 suppressGestureClick=false;
 if(mouseChord(e)){startSelection(e);return;}
 if(e.button===2&&(!e.pointerType||e.pointerType==='mouse')&&!editingLocked.value&&!e.target.closest('.map-overlay')){
  gesture.value={kind:'right-ready',pointerId:e.pointerId};capture(e);
 }
}
function startMove(e,node){
 if(e.button!==0||editingLocked.value||source.value)return;
 e.preventDefault();e.stopPropagation();selectedEdge.value=null;
 if(!selectedNodeSet.value.has(node.id))selectedNodeIds.value=[node.id];
 const originals=nodes.value.filter(n=>selectedNodeSet.value.has(n.id)).map(({id,x,y})=>({id,x,y}));
 gesture.value={kind:'move',pointerId:e.pointerId,map:current.value.id,start:worldPoint(e.clientX,e.clientY),originals,layout:current.value.nodes.map(({id,x,y})=>({id,x,y})),moved:false};
 capture(e);
}
function startSelectedMove(e,node){
 if(mouseChord(e)||selectedNodeIds.value.length<2||!selectedNodeSet.value.has(node.id)||e.target.closest('.map-port,.map-node-grip,.icon-btn'))return;
 startMove(e,node);
}
function startPan(e){
 if(e.button!==0||gesture.value?.kind==='selection'||e.target.closest('.map-node,.map-portal,.map-edge-hit,.map-overlay'))return;
 selectedNodeIds.value=[];selectedEdge.value=null;
 gesture.value={kind:'pan',pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,x:camera.x,y:camera.y};capture(e);
}
function beginConnection(e,node){if(editingLocked.value||(e.button!=null&&e.button!==0))return;e.preventDefault();e.stopPropagation();selectedNodeIds.value=[];source.value=node.id;ghost.value={x:node.x+WIDTH+100,y:node.y+92};const pointerId=e.type==='pointerdown'?e.pointerId:undefined;gesture.value={kind:'connect',pointerId};if(pointerId!=null)capture(e);}
function keyboardConnection(e,node){if(e.detail===0)beginConnection(e,node);}
function updateSelection(e){
 const g=gesture.value;if(g?.kind!=='selection')return;
 g.end=worldPoint(e.clientX,e.clientY);
 g.moved=g.moved||Math.hypot(g.end.x-g.start.x,g.end.y-g.start.y)*camera.zoom>=3;
 selectedNodeIds.value=g.moved?intersectingCards(nodes.value,selectionBounds(g.start,g.end),WIDTH,HEIGHT):[];
}
function finishSelection(e){
 updateSelection(e);
 const pointerId=gesture.value?.pointerId;
 gesture.value=e.buttons?{kind:'selection-release',pointerId}:null;
 if(!e.buttons)releaseCapture(pointerId);
 e.preventDefault();e.stopPropagation();
}
function pointerMove(e){
 if(gesture.value?.pointerId!=null&&e.pointerId!==gesture.value.pointerId)return;
 if(mouseChord(e)&&!['selection','selection-release'].includes(gesture.value?.kind))startSelection(e);
 const g=gesture.value;
 if(g?.kind==='selection'){if(!mouseChord(e))finishSelection(e);else{updateSelection(e);e.preventDefault();e.stopPropagation();}return;}
 if(g?.kind==='selection-release'){e.preventDefault();e.stopPropagation();if(!e.buttons){gesture.value=null;releaseCapture(g.pointerId);}return;}
 if(source.value)ghost.value=worldPoint(e.clientX,e.clientY);
 if(!g)return;
 if(g.kind==='pan'){camera.x=g.x+e.clientX-g.startX;camera.y=g.y+e.clientY-g.startY;}
 if(g.kind==='move'){
  const point=worldPoint(e.clientX,e.clientY),dx=point.x-g.start.x,dy=point.y-g.start.y;
  if(!g.moved&&Math.hypot(dx,dy)*camera.zoom<3)return;
  g.moved=true;
  for(const position of translateCards(g.originals,dx,dy))drafts[position.id]={x:position.x,y:position.y};
 }
}
async function saveMovedCards(g,positions){
 if(!positions.some(position=>{const before=g.originals.find(node=>node.id===position.id);return before.x!==position.x||before.y!==position.y;}))return;
 const group=g.originals.length>1;
 const result=await mutate('/roadmaps/'+g.map+(group?'/layout':'/nodes/'+positions[0].id),'PATCH',group?layoutMovePayload(g.layout,positions):{x:positions[0].x,y:positions[0].y});
 if(!group&&g.map===current.value?.id)revealCard(result||byNode.value.get(positions[0].id));
}
async function pointerUp(e){
 const g=gesture.value;if(!g||(g.pointerId!=null&&g.pointerId!==e.pointerId))return;
 if(g.kind==='selection'){finishSelection(e);return;}
 if(g.kind==='selection-release'){e.preventDefault();e.stopPropagation();if(!e.buttons){gesture.value=null;releaseCapture(g.pointerId);}return;}
 if(g.kind==='right-ready'){gesture.value=null;return;}
 if(e.button!==0)return;
 gesture.value=null;
 if(g.kind==='connect'){const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-input],[data-portal-input]');if(target?.dataset.portalInput){portalLayer.value?.connect(target.dataset.portalInput,source.value);cancelConnection();}else if(target)await connect(Number(target.dataset.input));}
 if(g.kind==='move'&&g.moved){
  suppressGestureClick=true;
  try{await saveMovedCards(g,g.originals.map(node=>({id:node.id,...drafts[node.id]})));}
  finally{for(const node of g.originals)delete drafts[node.id];}
 }
}
function cancelGesture(){
 const g=gesture.value;gesture.value=null;
 if(g?.kind==='move')for(const node of g.originals)delete drafts[node.id];
 if(g?.kind==='selection')selectedNodeIds.value=g.previous;
 releaseCapture(g?.pointerId);
}
function lostCapture(e){if(e.target===viewport.value&&gesture.value?.pointerId===e.pointerId)cancelGesture();}
function captureClick(e){if(e.detail!==0&&(suppressGestureClick||gesture.value?.kind==='selection')){e.preventDefault();e.stopPropagation();}}
function cancelConnection(){source.value=null;ghost.value=null;cancelGesture();}
function cancelConnectionWithMouse(e){if(e.target.closest('.maps-viewport'))e.preventDefault();if(mouseChord(e)||['selection','selection-release'].includes(gesture.value?.kind))return;if(source.value){e.preventDefault();cancelConnection();}}
async function connect(id){if(!source.value||source.value===id||editingLocked.value)return;const from=source.value;source.value=null;ghost.value=null;await mutate(url()+'/edges','POST',{source_node_id:from,target_node_id:id});}
async function removeCard(n){if(editingLocked.value)return;if(source.value===n.id)source.value=null;await mutate(url()+'/nodes/'+n.id,'DELETE',null,'Card removido do mapa. A atividade continua na task.');}
async function removeEdge(){if(!selectedEdge.value||editingLocked.value)return;const id=selectedEdge.value;const result=await mutate(url()+'/edges/'+id,'DELETE');if(result)selectedEdge.value=null;}
function zoom(value,anchor){if(gesture.value)return;const z=Math.max(.35,Math.min(1.8,value));const rect=viewport.value.getBoundingClientRect();const p=anchor||{x:rect.width/2,y:rect.height/2};const ratio=z/camera.zoom;camera.x=p.x-(p.x-camera.x)*ratio;camera.y=p.y-(p.y-camera.y)*ratio;camera.zoom=z;}
function wheel(e){if(gesture.value)return;if(e.ctrlKey||e.metaKey){const rect=viewport.value.getBoundingClientRect();zoom(camera.zoom*Math.exp(-e.deltaY*.002),{x:e.clientX-rect.left,y:e.clientY-rect.top});}else{camera.x-=e.shiftKey?e.deltaY:e.deltaX;camera.y-=e.shiftKey?0:e.deltaY;}}
function revealCard(node){
 if(!node||!viewport.value)return;
 const itemWidth=node.width||WIDTH,itemHeight=node.height||HEIGHT;
 const rect=viewport.value.getBoundingClientRect();if(!rect.width||!rect.height)return;
 const margin=Math.min(VIEW_MARGIN,rect.width/8,rect.height/8);
 camera.zoom=Math.max(.35,Math.min(camera.zoom,(rect.width-margin*2)/itemWidth,(rect.height-margin*2)/itemHeight));
 const left=node.x*camera.zoom+camera.x,top=node.y*camera.zoom+camera.y;
 const right=left+itemWidth*camera.zoom,bottom=top+itemHeight*camera.zoom;
 if(left<margin)camera.x+=margin-left;else if(right>rect.width-margin)camera.x-=right-(rect.width-margin);
 if(top<margin)camera.y+=margin-top;else if(bottom>rect.height-margin)camera.y-=bottom-(rect.height-margin);
}
function fit(){if(!viewport.value)return;if(!layoutItems.value.length){Object.assign(camera,{x:40,y:40,zoom:1});return;}const minX=Math.min(...layoutItems.value.map(n=>n.x)),minY=Math.min(...layoutItems.value.map(n=>n.y));const width=Math.max(...layoutItems.value.map(n=>n.x+n.width))-minX,height=Math.max(...layoutItems.value.map(n=>n.y+n.height))-minY;const rect=viewport.value.getBoundingClientRect();if(!rect.width||!rect.height)return;camera.zoom=Math.max(.35,Math.min(1.2,(rect.width-VIEW_MARGIN*2)/width,(rect.height-VIEW_MARGIN*2)/height));camera.x=(rect.width-width*camera.zoom)/2-minX*camera.zoom;camera.y=(rect.height-height*camera.zoom)/2-minY*camera.zoom;}
function keydown(e){if(e.key==='Escape'){cancelConnection();selectedNodeIds.value=[];selectedEdge.value=null;}if((e.key==='Delete'||e.key==='Backspace')&&selectedEdge.value&&!e.target.closest('input,textarea,select')){e.preventDefault();removeEdge();}}
async function keyMove(e,n){
 if(e.target!==e.currentTarget||editingLocked.value||gesture.value)return;
 const delta={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[e.key];if(!delta)return;e.preventDefault();
 if(!selectedNodeSet.value.has(n.id))selectedNodeIds.value=[n.id];
 const originals=nodes.value.filter(node=>selectedNodeSet.value.has(node.id)).map(({id,x,y})=>({id,x,y}));
 await saveMovedCards({map:current.value.id,originals,layout:current.value.nodes.map(({id,x,y})=>({id,x,y}))},translateCards(originals,...delta));
}
function setAlignmentPreview(result){
 if(result){cancelConnection();selectedNodeIds.value=[];form.value=null;adding.value=false;removingMap.value=false;selectedEdge.value=null;}
 layoutPreview.value=result;
 alignmentDrafts.value=Object.fromEntries((result?.nodes||[]).map(node=>[node.id,{x:node.x,y:node.y}]));
 portalDrafts.value=Object.fromEntries((result?.portals||[]).map(portal=>[portal.id,{x:portal.x,y:portal.y}]));
}
function applySavedLayout(result){
 const map=state.roadmaps.find(map=>map.id===result.roadmapId);if(!map)return;
 const positions=new Map(result.nodes.map(node=>[node.id,node]));
 map.nodes=map.nodes.map(node=>({...node,...positions.get(node.id)}));
 if(current.value?.id===result.roadmapId)portalLayer.value?.setPositions(result.portals);
}
function newPortal(){if(editingLocked.value||!viewport.value)return;const r=viewport.value.getBoundingClientRect();portalLayer.value?.openForm(worldPoint(r.left+r.width/2,r.top+r.height/2));}
function newActivity(){if(editingLocked.value)return;activityConnection.value=null;connectionKind.value='activity';taskId.value=tasks.value[0]?.id;activityTitle.value='';adding.value=true;}
function createAtConnection(e){
 if(!source.value||!current.value||editingLocked.value||adding.value||e.target.closest('.map-node,.map-portal,.map-edge-hit,.map-overlay'))return;
 const origin=byNode.value.get(source.value);if(!origin)return;
 e.preventDefault();cancelGesture();
 const point=worldPoint(e.clientX,e.clientY);
 activityConnection.value={roadmapId:current.value.id,sourceNodeId:origin.id,sourceTitle:origin.activity.title,x:clamp(point.x),y:clamp(point.y)};
 connectionKind.value='activity';taskId.value=origin.activity.task.id;activityTitle.value='';ghost.value=point;adding.value=true;
}
function closeActivity(){if(editingLocked.value)return;adding.value=false;activityConnection.value=null;}
async function saveActivity(){
 if(editingLocked.value)return;
 const connection=activityConnection.value;
 if(connection&&(current.value?.id!==connection.roadmapId||!byNode.value.has(connection.sourceNodeId)))return;
 if(connection&&connectionKind.value==='portal'){
  const marker=portalLayer.value?.createConnected({x:connection.x,y:connection.y},connection.sourceNodeId);
  if(marker){adding.value=false;activityConnection.value=null;}
  return;
 }
 if(!activityTitle.value.trim())return;
 if(connection){
  const result=await mutate('/roadmaps/'+connection.roadmapId+'/activities','POST',{
   title:activityTitle.value.trim(),task_id:Number(taskId.value),source_node_id:connection.sourceNodeId,x:connection.x,y:connection.y,
  },'Atividade criada e conectada.');
  if(result){adding.value=false;activityConnection.value=null;source.value=null;ghost.value=null;revealCard({x:connection.x,y:connection.y});}
  return;
 }
 const result=await mutate('/tasks/'+Number(taskId.value)+'/activities','POST',{title:activityTitle.value.trim()});
 if(result){adding.value=false;await addCard(result.id);}
}
watch(()=>nodes.value.map(node=>node.id).join(','),()=>{
 const present=new Set(nodes.value.map(node=>node.id));
 if(gesture.value?.kind==='move'&&gesture.value.originals.some(node=>!present.has(node.id)))cancelGesture();
 selectedNodeIds.value=selectedNodeIds.value.filter(id=>present.has(id));
});
onMounted(()=>window.addEventListener('blur',cancelGesture));
onBeforeUnmount(()=>{cancelGesture();window.removeEventListener('blur',cancelGesture);});
</script>
<template>
 <section class="project-map" aria-label="Mapas de desenvolvimento" @contextmenu.capture="cancelConnectionWithMouse">
  <header class="maps-heading"><div class="maps-title"><span class="maps-symbol"><MapIcon :size="24" /></span><div><span class="eyebrow">SEU MUNDO DE IDEIAS</span><h3>Mapas de desenvolvimento</h3><p>Posicione suas atividades e conecte o que vem depois.</p></div></div><button class="btn primary" :disabled="editingLocked" @click="openMapForm()"><Plus :size="16" />Novo roadmap</button></header>
  <div v-if="!current" class="maps-empty"><div class="maps-empty-cards"><span>Ideia</span><ArrowRight :size="28" /><span>Construção</span><ArrowRight :size="28" /><span>Entrega</span></div><h3>Um espaço livre para seu próximo caminho.</h3><p>Crie um roadmap, arraste atividades e ligue os cards com setas.<br>Você pode ter vários mapas neste projeto.</p><button class="btn primary" :disabled="editingLocked" @click="openMapForm()"><Plus :size="16" />Criar primeiro roadmap</button></div>
  <template v-else>
   <div class="maps-bar"><div class="maps-picker"><MapIcon :size="16" /><select v-model="selected" :disabled="editingLocked" aria-label="Roadmap atual"><option v-for="m in maps" :key="m.id" :value="m.id">{{ m.title }}{{ m.id===primary?' · Principal':'' }}</option></select><button class="icon-btn" :disabled="editingLocked" aria-label="Renomear roadmap" title="Renomear roadmap" @click="openMapForm(true)"><Pencil :size="14" /></button><button class="icon-btn" :disabled="editingLocked" aria-label="Excluir roadmap" title="Excluir roadmap" @click="removingMap=true"><Trash2 :size="14" /></button></div><button class="text-btn maps-primary" :aria-pressed="current.id===primary" :disabled="current.id===primary||editingLocked" @click="makePrimary"><Star :size="14" :fill="current.id===primary?'currentColor':'none'" />{{ current.id===primary?'Principal':'Definir como principal' }}</button><button class="text-btn" :disabled="editingLocked" @click="newPortal"><Flag :size="14" />Adicionar portal</button><RoadmapAlignmentControls :roadmap-id="current.id" :nodes="current.nodes||[]" :portals="portalLayer?.markers||[]" @preview="setAlignmentPreview" @positions-saved="applySavedLayout"/><span class="maps-count">{{ nodes.length }} cards · {{ edges.length }} conexões</span><span class="maps-save">{{ layoutPreview?'Prévia não salva':state.saving?'Salvando...':'Salvo automaticamente' }}</span></div>
   <div class="maps-workspace" :class="{'layout-preview':layoutPreview}">
    <aside class="maps-palette" :inert="layoutPreview ? '' : null" aria-label="Atividades disponíveis"><header><div><span class="eyebrow">ADICIONE AO MAPA</span><h4>Suas atividades <span>{{ available.length }}</span></h4></div><button class="icon-btn" :aria-label="tasks.length?'Nova atividade':'Criar task'" @click="tasks.length?newActivity():emit('new-task')"><Plus :size="17" /></button></header><div class="maps-search"><Search :size="14" /><input v-model="search" placeholder="Buscar atividade..." aria-label="Buscar atividades para o mapa"></div><p class="palette-hint">Arraste um card para o quadro ou use +.</p><div class="palette-items"><article v-for="a in available" :key="a.id" class="palette-card" draggable="true" :class="{blocked:a.blocked}" @dragstart="dragAvailable($event,a)"><div class="palette-card-title"><GripVertical :size="13" /><strong>{{ a.title }}</strong><button class="icon-btn tiny" :disabled="!!state.saving" :aria-label="'Adicionar '+a.title+' ao mapa'" @click="addCard(a.id)"><Plus :size="15" /></button></div><small>{{ a.task.title }}</small><span class="map-status" :class="a.status">{{ label(a.status) }}</span><span v-if="a.blocked" class="palette-blocked"><LockKeyhole :size="11" />Aguardando {{ a.blocking_person }}</span></article><div v-if="!available.length" class="palette-empty"><Check v-if="activities.length&&!search" :size="22" /><Search v-else :size="22" /><p>{{ search?'Nenhuma atividade encontrada.':activities.length?'Todas as atividades já estão neste mapa.':'Crie atividades numa task para montar seu mapa.' }}</p><button v-if="!activities.length" class="text-btn" @click="tasks.length?newActivity():emit('new-task')">{{ tasks.length?'Criar atividade':'Criar uma task' }}</button></div></div><footer><MousePointer2 :size="13" />A mesma atividade pode estar em vários roadmaps.</footer></aside>
    <div class="maps-stage"><div ref="viewport" class="maps-viewport" tabindex="0" aria-label="Quadro livre do roadmap. Arraste o fundo para navegar. Segure os dois botões do mouse e arraste para selecionar cards." :class="{'is-panning':gesture?.kind==='pan','is-selecting':gesture?.kind==='selection','has-multi-selection':selectedNodeIds.length>1,'is-connecting':source}" :style="{backgroundPosition:camera.x+'px '+camera.y+'px',backgroundSize:24*camera.zoom+'px '+24*camera.zoom+'px'}" @pointerdown.capture="pointerDownCapture" @pointerdown="startPan" @pointermove.capture="pointerMove" @pointerup.capture="pointerUp" @pointercancel.capture="cancelGesture" @lostpointercapture="lostCapture" @click.capture="captureClick" @dblclick="createAtConnection" @dragover.prevent @drop.prevent="drop" @wheel.prevent="wheel" @keydown="keydown">
     <div class="maps-world" :inert="layoutPreview ? '' : null" :style="{width:world.width+'px',height:world.height+'px',transform:`translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})`}">
      <svg class="maps-connections" :width="world.width" :height="world.height" aria-label="Conexões entre atividades"><defs><marker :id="'arrow-'+current.id" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="#839be0" stroke-width="2" /></marker></defs><g v-for="e in edges" :key="e.id"><path :d="edgePath(e)" class="map-edge" :class="{selected:selectedEdge===e.id}" :marker-end="`url(#arrow-${current.id})`" /><path :d="edgePath(e)" class="map-edge-hit" @pointerdown.stop @click.stop="selectedEdge=e.id" /></g><path v-if="draftPath" :d="draftPath" class="map-edge draft" :marker-end="`url(#arrow-${current.id})`" /></svg>
      <article v-for="n in nodes" :key="n.id" class="map-node" :class="{selected:selectedNodeSet.has(n.id),blocked:n.activity.blocked,pending:n.activity.status==='pending','in-progress':isInProgress(n),completed:n.activity.status==='done','portal-completed':n.activity.status==='done'&&!n.activity.blocked&&portalSourceIds.has(n.id),connecting:source===n.id}" :style="{left:n.x+'px',top:n.y+'px'}" tabindex="0" :aria-label="n.activity.title+(selectedNodeSet.has(n.id)?'. Selecionado.':'')+'. Use as setas do teclado para mover o card ou grupo.'" @keydown="keyMove($event,n)" @pointerdown.capture="startSelectedMove($event,n)">
       <button class="map-port input" :data-input="n.id" :aria-label="'Conectar entrada de '+n.activity.title" :title="source?'Conectar aqui':'Entrada de conexão'" @pointerdown.stop @click.stop="connect(n.id)"></button>
       <div class="map-node-grip" @pointerdown="startMove($event,n)"><span><GripVertical :size="14" />{{ n.activity.task.title }}</span><button class="icon-btn tiny" :disabled="!!state.saving" :aria-label="'Remover '+n.activity.title+' do mapa'" title="Remover apenas do mapa" @pointerdown.stop @click.stop="removeCard(n)"><X :size="14" /></button></div>
       <div v-if="isInProgress(n)" class="map-progress-state"><span class="map-progress-orbit" aria-hidden="true"><Play :size="12" :stroke-width="1.6" /></span><span class="map-progress-label">{{ label(n.activity.status) }}</span></div>
       <button class="map-node-title" @pointerdown.stop @click="emit('open-activity',n.activity.task.id,n.activity.id)">{{ n.activity.title }}</button>
       <span v-if="n.activity.status==='done'&&!n.activity.blocked&&portalSourceIds.has(n.id)" class="map-completion-seal" aria-hidden="true"><Check :size="18"/></span>
       <div class="map-node-info"><span v-if="!isInProgress(n)" class="map-status" :class="n.activity.status">{{ label(n.activity.status) }}</span><button :aria-label="'Comentários de '+n.activity.title" @pointerdown.stop @click="emit('open-activity',n.activity.task.id,n.activity.id)"><MessageSquare :size="12" />{{ n.activity.comments.length }}</button></div>
       <div v-if="n.activity.blocked" class="map-node-blocked" :title="n.activity.blocking_reason"><LockKeyhole :size="12" /><span>Precisa que <strong>{{ n.activity.blocking_person }}</strong> termine</span></div><div v-else class="map-node-foot"><ArrowRight v-if="isInProgress(n)" :size="12" aria-hidden="true" /><span>{{ n.activity.status==='done'?'Etapa concluída':isInProgress(n)?'Um passo mais perto':'Conecte ao próximo passo' }}</span><span v-if="isInProgress(n)" class="map-progress-wave" aria-hidden="true"><i v-for="bar in 4" :key="bar"></i></span><ArrowRight v-else :size="13" /></div>
       <button class="map-port output" :aria-label="'Conectar saída de '+n.activity.title" title="Arraste até a entrada de outro card ou clique nos dois pontos" @pointerdown="beginConnection($event,n)" @click.stop="keyboardConnection($event,n)"></button>
      </article>
      <div v-if="selectionRect" class="map-selection-box" aria-hidden="true" :style="{left:selectionRect.x+'px',top:selectionRect.y+'px',width:selectionRect.width+'px',height:selectionRect.height+'px'}"></div>
      <RoadmapPortals ref="portalLayer" :roadmap-id="current.id" :nodes="nodes" :zoom="camera.zoom" :source-node-id="source" :positions="portalDrafts" :disabled="editingLocked" @connected="cancelConnection" @reveal="revealCard"/>
     </div>
     <div v-if="selectedNodeIds.length" class="map-overlay map-selection-actions" :aria-live="gesture?.kind==='selection'?'off':'polite'"><span>{{ selectedNodeIds.length }} {{ selectedNodeIds.length===1?'card selecionado':'cards selecionados' }}</span><button class="text-btn" :disabled="!!state.saving" @pointerdown.stop @click="clearSelection">Limpar seleção</button></div>
     <div v-if="!layoutItems.length" class="map-overlay map-guide"><span class="map-guide-icon"><MapIcon :size="32" /></span><h4>Este mundo é seu.</h4><p>Traga um card da lateral para começar.<br>Depois, mova e conecte suas ideias.</p></div>
     <div v-if="source" class="map-overlay map-connection-tip"><ArrowRight :size="15" /><span>Conecte a outro card ou dê dois cliques no espaço vazio para criar uma atividade ou portal. Botão direito para cancelar.</span><button class="icon-btn tiny" aria-label="Cancelar conexão" @pointerdown.stop @click="cancelConnection"><X :size="14" /></button></div>
     <div v-if="selectedEdge" class="map-overlay map-edge-actions"><span>Conexão selecionada</span><button class="text-btn" :disabled="!!state.saving" @pointerdown.stop @click="removeEdge"><Unplug :size="14" />Remover conexão</button><button class="icon-btn tiny" aria-label="Desmarcar conexão" @pointerdown.stop @click="selectedEdge=null"><X :size="14" /></button></div>
    </div>
     <footer class="maps-canvas-footer"><div class="map-navigation-hint"><Hand :size="13" />Dois botões + arrastar: selecionar · Arraste os cards selecionados para mover · Esc: limpar · Ctrl + rolagem: zoom</div><div class="map-controls"><button aria-label="Diminuir zoom" title="Diminuir zoom" @click="zoom(camera.zoom/1.2)"><ZoomOut :size="17" /></button><span>{{ Math.round(camera.zoom*100) }}%</span><button aria-label="Aumentar zoom" title="Aumentar zoom" @click="zoom(camera.zoom*1.2)"><ZoomIn :size="17" /></button><i></i><button aria-label="Mostrar todos os cards" title="Mostrar todos os cards" @click="fit"><Scan :size="17" /></button></div></footer>
    </div>
   </div>
  </template>
 </section>
 <Modal v-if="form" :title="form==='edit'?'Renomear roadmap':'Novo roadmap'" @close="form=null"><form class="form-stack" @submit.prevent="saveMap"><label>Nome <span class="required">*</span><input v-model="title" required maxlength="160" autofocus placeholder="Ex.: Primeira versão, Próximas ideias..."></label><p class="muted small">Cada roadmap tem seus próprios cards e conexões.</p><footer class="modal-actions"><button type="button" class="btn secondary" @click="form=null">Cancelar</button><button class="btn primary" :disabled="!!state.saving">{{ form==='edit'?'Salvar nome':'Criar roadmap' }}</button></footer></form></Modal>
 <ConfirmDialog v-if="removingMap&&current" title="Excluir roadmap?" :message="'O mapa '+current.title+' e suas conexões serão excluídos. As atividades continuam nas tasks.'" @close="removingMap=false" @confirm="deleteMap" />
 <Modal v-if="adding" :title="activityConnection?(connectionKind==='portal'?'Novo portal conectado':'Nova atividade conectada'):'Nova atividade'" @close="closeActivity">
  <form class="form-stack" @submit.prevent="saveActivity">
   <div v-if="activityConnection" class="map-create-options" role="group" aria-label="O que criar">
    <button type="button" class="map-create-option activity" :aria-pressed="connectionKind==='activity'" :disabled="editingLocked" @click="connectionKind='activity'"><span class="map-create-option-icon"><Plus :size="19" /></span><span><strong>Atividade</strong><small>O próximo passo do seu projeto</small></span><Check v-if="connectionKind==='activity'" :size="16" class="map-create-check" /></button>
    <button type="button" class="map-create-option" :aria-pressed="connectionKind==='portal'" :disabled="editingLocked" @click="connectionKind='portal'"><span class="map-create-option-icon"><Flag :size="18" /></span><span><strong>Portal</strong><small>Um marco visual no caminho</small></span><Check v-if="connectionKind==='portal'" :size="16" class="map-create-check" /></button>
   </div>
   <p v-if="activityConnection" class="map-create-source"><ArrowRight :size="14" /><span>Conectado a <strong>{{ activityConnection.sourceTitle }}</strong></span></p>
   <div v-if="activityConnection&&connectionKind==='portal'" class="map-create-portal-preview" aria-label="Prévia do portal sem texto"><span class="map-portal-symbol" aria-hidden="true"><Flag :size="26" :stroke-width="1.6" /></span></div>
   <template v-else>
    <label>Atividade <span class="required">*</span><input v-model="activityTitle" required maxlength="200" autofocus placeholder="O que você quer desenvolver?"></label>
    <label>Task de origem<select v-model="taskId" required><option v-for="t in tasks" :key="t.id" :value="t.id">{{ t.title }}</option></select></label>
   </template>
   <footer class="modal-actions"><button type="button" class="btn secondary" :disabled="editingLocked" @click="closeActivity">Cancelar</button><button class="btn primary" :disabled="editingLocked">{{ state.saving?'Criando...':activityConnection?(connectionKind==='portal'?'Criar portal e conectar':'Criar e conectar'):'Criar e adicionar ao mapa' }}</button></footer>
  </form>
 </Modal>
</template>
