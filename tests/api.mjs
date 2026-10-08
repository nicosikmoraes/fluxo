import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const app=path.join(base,'app');const php=path.join(base,'.runtime/php/php.exe');
const temp=path.join(base,'tests/.runtime');fs.mkdirSync(temp,{recursive:true});
const database=path.join(temp,randomUUID()+'.sqlite');fs.writeFileSync(database,'');
const env={...process.env,APP_ENV:'testing',APP_DEBUG:'false',DB_DATABASE:database,SESSION_DRIVER:'array',CACHE_STORE:'array'};
const migration=spawnSync(php,['artisan','migrate','--force'],{cwd:app,env,encoding:'utf8'});
if(migration.status){console.error(migration.stdout,migration.stderr);process.exit(1);}
const port=Number(process.env.FLUXO_TEST_PORT||8002);
const server=spawn(php,['-S','127.0.0.1:'+port,'-t','.',path.join(app,'vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php')],{cwd:path.join(app,'public'),env,stdio:'ignore',windowsHide:true});
const url='http://127.0.0.1:'+port;let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
async function api(route,method='GET',data,expected=200,headers={}){
 const r=await fetch(url+'/api'+route,{method,headers:{Accept:'application/json',...(data?{'Content-Type':'application/json'}:{}),...headers},body:data?JSON.stringify(data):undefined});
 const body=r.status===204?null:await r.json();assert.equal(r.status,expected,JSON.stringify(body));checks++;return body;
}
const task=(extra={})=>api('/tasks','POST',{title:'Minha task',project_id:null,description:null,cover_path:null,...extra},201);
const activity=(t,title='Passo')=>api('/tasks/'+t.id+'/activities','POST',{title},201);
const workspace=()=>api('/workspace');
try{
 let ready=false;for(let i=0;i<60;i++){try{if((await fetch(url+'/api/workspace')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}check(ready,'Servidor de teste iniciou');
 const root=await fetch(url);const rootBody=await root.text();check(root.ok,'Interface servida: '+root.status+' '+rootBody.slice(0,1000));check(rootBody.includes('/ui/assets/'),'Build integrado ao Laravel: '+rootBody.slice(0,1000));
 let t=await task();check(t.status==='pending','Task vazia pendente');
 let a=await activity(t,'Implementar API');let b=await activity(t,'Criar interface');
 await api('/activities/'+a.id,'PATCH',{status:'doing'});check((await workspace()).tasks[0].status==='doing','Status em andamento calculado');
 await api('/activities/'+b.id,'PATCH',{blocked:true},422);
 await api('/activities/'+b.id,'PATCH',{blocked:true,blocking_person:'Mariana',blocking_reason:'Liberar a API'});
 let snapshot=await workspace();check(snapshot.tasks[0].blocked_count===1,'Bloqueio visível na task');check(snapshot.tasks[0].activities[1].blocked_at,'Data do bloqueio salva');
 await api('/activities/'+b.id,'PATCH',{status:'done'},422);
 await api('/activities/'+b.id,'PATCH',{blocked:false});check((await workspace()).tasks[0].activities[1].blocking_person===null,'Desbloqueio limpa os dados');
 const c=await api('/activities/'+a.id+'/comments','POST',{body:'Decisão inicial'},201);await api('/activities/'+a.id+'/comments','POST',{body:'Outra ideia'},201);
 await api('/comments/'+c.id,'PATCH',{body:'Decisão revisada'});snapshot=await workspace();check(snapshot.tasks[0].comments_count===2,'Vários comentários');check(snapshot.tasks[0].activities[0].comments[0].body==='Decisão revisada','Edição persistida');
 await api('/comments/'+c.id,'DELETE',null,204);check((await workspace()).tasks[0].comments_count===1,'Exclusão de comentário');
 await api('/tasks/'+t.id+'/activities/reorder','POST',{ids:[b.id,a.id]},204);check((await workspace()).tasks[0].activities[0].id===b.id,'Ordem de atividades persistida');
 await api('/tasks/'+t.id+'/activities/reorder','POST',{ids:[a.id,a.id]},422);
 await api('/activities/'+a.id,'PATCH',{status:'done'});await api('/activities/'+b.id,'PATCH',{status:'done'});check((await workspace()).tasks[0].status==='done','Conclusão automática');
 await api('/activities/'+b.id,'PATCH',{status:'pending'});check((await workspace()).tasks[0].status==='doing','Reabertura atualiza status');
 let other=await task({title:'Outra task'});let outside=await activity(other);await api('/tasks/'+t.id+'/activities/reorder','POST',{ids:[outside.id,a.id]},422);
 await api('/tasks/reorder','POST',{ids:[other.id,t.id]},204);check((await workspace()).tasks[0].id===other.id,'Ordem de tasks persistida');
 await api('/tasks','POST',{title:''},422);await api('/tasks','POST',{title:'X',project_id:999},422);await api('/activities/'+outside.id,'PATCH',{status:'invalid'},422);
 await api('/tasks','POST',{title:'Externo'},403,{Origin:'https://example.com'});
 let p=await api('/projects','POST',{title:'Projeto A',cover:'desk'},201);let pt=await task({project_id:p.id});await api('/projects/'+p.id,'DELETE',{delete_tasks:false},204);check((await workspace()).tasks.find(v=>v.id===pt.id).project_id===null,'Projeto excluído mantém tasks');
 p=await api('/projects','POST',{title:'Projeto B',cover:'mint'},201);pt=await task({project_id:p.id});let pa=await activity(pt);await api('/activities/'+pa.id+'/comments','POST',{body:'Comentário'},201);await api('/projects/'+p.id,'DELETE',{delete_tasks:true},204);check(!(await workspace()).tasks.some(v=>v.id===pt.id),'Exclusão de projeto apaga tasks');await api('/activities/'+pa.id,'PATCH',{title:'Inexistente'},404);
 await api('/tasks/'+t.id,'DELETE',null,204);await api('/comments/'+c.id,'GET',null,405);await api('/activities/'+a.id,'PATCH',{title:'Inexistente'},404);
 // Validate image upload and its local serving route, then remove it by deleting its task.
 const form=new FormData();form.append('image',new Blob([fs.readFileSync(path.join(base,'ui/public/hero.png'))],{type:'image/png'}),'cover.png');
 const r=await fetch(url+'/api/images',{method:'POST',body:form,headers:{Accept:'application/json'}});const image=await r.json();check(r.status===201,'Upload de imagem');check((await fetch(url+image.path)).ok,'Imagem enviada servida');
 const it=await task({cover_path:image.path});await api('/tasks/'+it.id,'DELETE',null,204);check((await fetch(url+image.path)).status===404,'Exclusão limpa a imagem');
 const invalid=new FormData();invalid.append('image',new Blob(['texto'],{type:'text/plain'}),'bad.txt');check((await fetch(url+'/api/images',{method:'POST',body:invalid,headers:{Accept:'application/json'}})).status===422,'Arquivo inválido recusado');
 // Roadmap order spans tasks and is independent from each task's activity order.
 const rp=await api('/projects','POST',{title:'Roadmap',cover:'desk'},201);const rt=await task({title:'Backend',project_id:rp.id});const rt2=await task({title:'Frontend',project_id:rp.id});
 const ra=await activity(rt,'Banco');const rb=await activity(rt2,'Tela');const rc=await activity(rt,'API');
 check(ra.roadmap_position===0&&rb.roadmap_position===1&&rc.roadmap_position===2,'Atividades acrescentadas ao final do roadmap');
 await api('/projects/'+rp.id+'/roadmap/reorder','POST',{ids:[rc.id,rb.id,ra.id]},204);
 snapshot=await workspace();let roadTasks=snapshot.tasks.filter(v=>v.project_id===rp.id);let road=roadTasks.flatMap(v=>v.activities).sort((a,b)=>a.roadmap_position-b.roadmap_position);
 check(road.map(v=>v.id).join(',')===[rc.id,rb.id,ra.id].join(','),'Ordem global do roadmap persistida');check(roadTasks.find(v=>v.id===rt.id).activities.map(v=>v.id).join(',')===[ra.id,rc.id].join(','),'Ordem interna da task preservada');
 await api('/projects/'+rp.id+'/roadmap/reorder','POST',{ids:[rc.id,rb.id]},422);await api('/projects/'+rp.id+'/roadmap/reorder','POST',{ids:[rc.id,rb.id,rb.id]},422);
 const outsideTask=await task();const outsideActivity=await activity(outsideTask);await api('/projects/'+rp.id+'/roadmap/reorder','POST',{ids:[rc.id,rb.id,outsideActivity.id]},422);
 const appended=await activity(rt2,'Integrar');check(appended.roadmap_position===3,'Novo passo anexado após reordenação');
 const target=await api('/projects','POST',{title:'Destino',cover:'mint'},201);const targetTask=await task({project_id:target.id});const firstTarget=await activity(targetTask,'Primeiro destino');
 await api('/tasks/'+rt.id,'PATCH',{title:'Backend',project_id:target.id,description:null,cover_path:null});snapshot=await workspace();road=snapshot.tasks.filter(v=>v.project_id===target.id).flatMap(v=>v.activities).sort((a,b)=>a.roadmap_position-b.roadmap_position);
 check(road.map(v=>v.id).join(',')===[firstTarget.id,rc.id,ra.id].join(','),'Mover task acrescenta seus passos ao roadmap de destino');
 await api('/tasks/'+rt.id,'PATCH',{title:'Backend',project_id:null,description:null,cover_path:null});check((await workspace()).tasks.find(v=>v.id===rt.id).activities.every(v=>v.roadmap_position===null),'Remover projeto limpa a ordem do roadmap');
 console.log('PASSOU — '+checks+' verificações de API e persistência, em banco isolado.');
}finally{
 server.kill();await new Promise(resolve=>server.once('exit',resolve));
 for(const suffix of ['','-wal','-shm','-journal']){const file=database+suffix;if(fs.existsSync(file))fs.unlinkSync(file);}
}
