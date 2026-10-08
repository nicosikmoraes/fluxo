const fs=require('fs');const path=require('path');const {spawnSync}=require('child_process');const {randomUUID}=require('crypto');
const base=path.resolve(__dirname,'..');const folder=path.join(__dirname,'.runtime');fs.mkdirSync(folder,{recursive:true});const database=path.join(folder,randomUUID()+'.sqlite');fs.writeFileSync(database,'');
const env={...process.env,APP_ENV:'testing',DB_DATABASE:database};const php=path.join(base,'.runtime/php/php.exe');
function run(args){const p=spawnSync(php,args,{cwd:path.join(base,'app'),env,encoding:'utf8'});if(p.status)throw new Error(p.stdout+p.stderr);if(args[0]!=='artisan')process.stdout.write(p.stdout);}
try{
 run(['artisan','migrate','--force','--path=database/migrations/2026_10_08_000001_create_workspace_tables.php']);
 run([path.join(__dirname,'roadmap-migration.php'),'seed']);
 run(['artisan','migrate','--force']);
 run([path.join(__dirname,'roadmap-migration.php'),'assert']);
}finally{for(const suffix of ['','-journal','-wal','-shm']){const f=database+suffix;if(fs.existsSync(f))fs.unlinkSync(f);}}
