import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
export default async function setup(){
 const base=path.resolve('..');const app=path.join(base,'app');const php=path.join(base,'.runtime/php/php.exe');
 const folder=path.join(base,'tests/.runtime');fs.mkdirSync(folder,{recursive:true});const database=path.join(folder,randomUUID()+'.sqlite');fs.writeFileSync(database,'');
 const env={...process.env,APP_ENV:'testing',DB_DATABASE:database,SESSION_DRIVER:'array',CACHE_STORE:'array'};
 const migration=spawnSync(php,['artisan','migrate','--force'],{cwd:app,env,encoding:'utf8'});if(migration.status)throw new Error(migration.stdout+ migration.stderr);
 const server=spawn(php,['-S','127.0.0.1:8002','-t','.',path.join(app,'vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php')],{cwd:path.join(app,'public'),env,stdio:'ignore',windowsHide:true});
 let ready=false;for(let i=0;i<50;i++){try{const r=await fetch('http://127.0.0.1:8002/api/workspace');const data=await r.json();if(r.ok&&Array.isArray(data.tasks)){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
 if(!ready){server.kill();throw new Error('Servidor de teste indisponível.');}
 return async()=>{const ended=new Promise(r=>server.once('exit',r));server.kill();await ended;for(const suffix of ['','-journal','-wal','-shm']){const f=database+suffix;if(fs.existsSync(f))fs.unlinkSync(f);}};
}
