const fs=require('fs');const path=require('path');const {spawn}=require('child_process');
const base=__dirname;const app=path.join(base,'app');const php=path.join(base,'.runtime/php/php.exe');
const url='http://127.0.0.1:8787';const logPath=path.join(base,'startup.log');
const checkOnly=process.argv.includes('--check');const noBrowser=checkOnly||process.argv.includes('--no-browser');
let server;let shuttingDown=false;let shutdownCode=0;let lastError='';
fs.writeFileSync(logPath,'Fluxo — inicialização '+new Date().toISOString()+'\n');
function log(message){process.stdout.write(message+'\n');fs.appendFileSync(logPath,message+'\n');}
async function probe(){
 const r=await fetch(url+'/api/workspace',{signal:AbortSignal.timeout(1500)});const data=await r.json();
 if(!r.ok||!Array.isArray(data.tasks)||!Array.isArray(data.projects))throw new Error(data.message||'A API não respondeu corretamente ('+r.status+').');
 const page=await fetch(url,{signal:AbortSignal.timeout(1500)});const html=await page.text();
 if(!page.ok||!html.includes('/ui/assets/'))throw new Error('A interface não está disponível ('+page.status+').');
}
async function main(){
 if(typeof fetch!=='function')throw new Error('É necessário Node.js 18 ou mais recente. Versão encontrada: '+process.version);
 for(const file of [php,path.join(app,'vendor/autoload.php'),path.join(app,'public/ui/index.html')])if(!fs.existsSync(file))throw new Error('Arquivo necessário não encontrado: '+file);
 try{await probe();log('O Fluxo já está aberto em '+url);if(!noBrowser)openBrowser();stop();return;}catch{}
 log('\nFluxo — seu trabalho, passo a passo.\nIniciando o servidor local em '+url+'...\n');
 server=spawn(php,['-S','127.0.0.1:8787','-t','.',path.join(app,'vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php')],{cwd:path.join(app,'public'),stdio:['ignore','pipe','pipe'],windowsHide:true});
 for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>{const text=chunk.toString();process.stdout.write(text);fs.appendFileSync(logPath,text);});
 server.on('error',error=>{log('Não foi possível iniciar o PHP: '+error.message);stop(1);});
 server.on('exit',code=>{if(!shuttingDown)log('O servidor foi encerrado (código '+code+'). Verifique o erro acima.');process.exit(shuttingDown?shutdownCode:(code||1));});
 for(let i=0;i<25&&!shuttingDown;i++){
  await new Promise(r=>setTimeout(r,250));
  try{
   await probe();log('\nPronto! Abra '+url+'\nMantenha esta janela aberta. Use Ctrl+C ou q e Enter para encerrar.\n');
   if(checkOnly){log('Verificação concluída: API e tela responderam corretamente.');stop();}else if(!noBrowser)openBrowser();
   return;
  }catch(e){lastError=e.cause?.message||e.message;}
 }
 if(!shuttingDown)throw new Error('O servidor não respondeu. '+lastError+'\nDetalhes em '+logPath);
}
function openBrowser(){const browser=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,stdio:'ignore'});browser.on('error',e=>log('Não foi possível abrir o navegador automaticamente: '+e.message+'\nAbra '+url+' manualmente.'));browser.unref();}
function stop(code=0){if(shuttingDown)return;shuttingDown=true;shutdownCode=code;server?.kill();setTimeout(()=>process.exit(code),150);}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
main().catch(e=>{log('ERRO: '+e.message);stop(1);});
if(!checkOnly){process.stdin.resume();process.stdin.on('data',data=>{if(data.toString().trim().toLowerCase()==='q')stop();});}
