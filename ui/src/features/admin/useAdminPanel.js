import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { auth, apiRequest } from '../auth/auth';

export function useAdminPanel() {
 const view=ref('overview'),search=ref(''),statusFilter=ref('all'),originFilter=ref('all'),page=ref(1),sidebar=ref(false),period=ref('month');
 const modal=ref(null),selected=ref(null),toast=ref(''),queryInput=ref(null),formError=ref(''),submitting=ref(false),error=ref(''),loading=ref(false),listLoading=ref(false);
 const overview=ref(null),users=ref([]),events=ref([]),settings=ref({name:'',email:'',defaultGrant:'30',newAccounts:true,maintenance:false}),draft=ref({...settings.value}),billingConfig=ref(null),settingsVersion=ref(0);
 const resultTotal=ref(0),totalPages=ref(1),eventPage=ref(1),eventPages=ref(1),eventTotal=ref(0);
 const grantTargets=ref([]),recipientLoading=ref(false),recipientError=ref(''),recipientTotal=ref(0);
 const form=ref({user:'',duration:'30',until:'',reason:''}),actionReason=ref('');
 const ready=computed(()=>overview.value!==null),counts=computed(()=>overview.value?.counts||{total:0,active:0,paid:0,manual:0,canceled:0,pending:0,free:0,subscribed:0,disabled:0,new:0});
 const revenue=computed(()=>overview.value?.revenue.amount||0),recentUsers=computed(()=>overview.value?.recent||[]),rows=computed(()=>users.value);
 const periodLabel=computed(()=>overview.value?.period_label||''),asOf=computed(()=>overview.value?.as_of||'');
 const currentAdmin=computed(()=>auth.user);
 const money=amount=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:(overview.value?.revenue.currency||'usd').toUpperCase()}).format(amount);
 const date=value=>value?new Date(value).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}):'—';
 const dateFull=value=>value?new Date(value).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}):'—';
 const dateTime=value=>value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'';
 const initials=name=>(name||'').split(' ').map(n=>n[0]).slice(0,2).join('');
 const labels={active:'Ativa',manual:'Cortesia',canceled:'Encerrada',past_due:'Pagamento pendente',free:'Gratuito',expired:'Expirada',unpaid:'Não paga',incomplete:'Pagamento incompleto',incomplete_expired:'Pagamento expirado',paused:'Pausada',trialing:'Em teste',other:'Outro plano'};
 const charts=computed(()=>(overview.value?.registrations||[]).map(item=>item.value));
 const chartMax=computed(()=>Math.max(4,...charts.value));
 const chartLabels=computed(()=>{const series=overview.value?.registrations||[];return series.filter((item,i)=>i===0||i===series.length-1||i%Math.max(1,Math.floor(series.length/6))===0).map(item=>item.label);});
 const line=computed(()=>charts.value.map((h,i)=>(i*600/Math.max(1,charts.value.length-1))+','+(150-h/chartMax.value*140)).join(' '));
 const today=new Date().toLocaleDateString('en-CA');
 const grantTimezone=computed(()=>overview.value?.timezone||'UTC');
 const minGrantDate=computed(()=>{if(overview.value?.min_grant_date)return overview.value.min_grant_date;const day=new Date();day.setDate(day.getDate()+1);return day.toLocaleDateString('en-CA');});
 let disposed=false,listEpoch=0,recipientEpoch=0,refreshEpoch=0,detailEpoch=0,listTimer,recipientTimer,toastTimer,priorFocus;
 function notify(message){toast.value=message;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.value='',5500);}
 function go(id,filter='all'){view.value=id;statusFilter.value=filter;originFilter.value='all';search.value='';page.value=1;sidebar.value=false;window.scrollTo({top:0,behavior:'smooth'});}
 function listParams(){const params=new URLSearchParams({page:String(page.value),per_page:'8',status:statusFilter.value,origin:originFilter.value});if(search.value)params.set('search',search.value);if(view.value==='subscriptions')params.set('subscribed','1');return params;}
 async function readUsers(epoch=++listEpoch){
  if(!['users','subscriptions'].includes(view.value))return;
  listLoading.value=true;
  try{const data=await apiRequest('/admin/users?'+listParams());if(disposed||epoch!==listEpoch)return;users.value=data.data;resultTotal.value=data.total;totalPages.value=data.last_page;if(page.value>data.last_page)page.value=data.last_page;}
  catch(failure){if(!disposed&&epoch===listEpoch){denyIfForbidden(failure);users.value=[];resultTotal.value=0;error.value=failure.message;}}
  finally{if(!disposed&&epoch===listEpoch)listLoading.value=false;}
 }
 function scheduleUsers(){const epoch=++listEpoch;clearTimeout(listTimer);listLoading.value=true;listTimer=setTimeout(()=>readUsers(epoch),search.value?250:0);}
 async function readEvents(){try{const data=await apiRequest('/admin/events?page='+eventPage.value);if(disposed)return;events.value=data.data;eventPages.value=data.last_page;eventTotal.value=data.total;}catch(failure){if(!disposed)error.value=failure.message;}}
 async function refresh(){
  const epoch=++refreshEpoch;loading.value=true;error.value='';
  try{
   const [summary,config,logs]=await Promise.all([apiRequest('/admin/overview?period='+period.value),apiRequest('/admin/settings'),apiRequest('/admin/events?page='+eventPage.value)]);
   if(disposed||epoch!==refreshEpoch)return;
   overview.value=summary;settings.value=config.settings;draft.value={...config.settings,email:config.settings.email||''};settingsVersion.value=config.version;billingConfig.value=config.billing;events.value=logs.data;eventPages.value=logs.last_page;eventTotal.value=logs.total;
   await readUsers();
  }catch(failure){if(!disposed&&epoch===refreshEpoch){denyIfForbidden(failure);error.value=failure.message;}}
  finally{if(!disposed&&epoch===refreshEpoch)loading.value=false;}
 }
 async function searchRecipients(query=''){
  const epoch=++recipientEpoch;clearTimeout(recipientTimer);recipientLoading.value=true;recipientError.value='';
  recipientTimer=setTimeout(async()=>{
   try{const data=await apiRequest('/admin/users?'+new URLSearchParams({eligible:'1',search:query,per_page:'30'}));if(disposed||epoch!==recipientEpoch)return;
    const chosen=grantTargets.value.find(user=>String(user.id)===form.value.user);const targets=data.data.filter(user=>user.can_grant);
    grantTargets.value=chosen&&!query&&!targets.some(user=>user.id===chosen.id)?[chosen,...targets]:targets;recipientTotal.value=data.total;
   }catch(failure){if(!disposed&&epoch===recipientEpoch){grantTargets.value=[];recipientError.value=failure.message;}}
   finally{if(!disposed&&epoch===recipientEpoch)recipientLoading.value=false;}
  },query?220:0);
 }
 function openGrant(user){
  form.value={user:user?String(user.id):'',duration:settings.value.defaultGrant,until:minGrantDate.value,reason:''};formError.value='';grantTargets.value=user?[user]:[];modal.value='grant';searchRecipients('');
 }
 function close(){if(!submitting.value){detailEpoch++;modal.value=null;selected.value=null;formError.value='';actionReason.value='';}}
 async function openDetails(user){if(submitting.value)return;const epoch=++detailEpoch;error.value='';try{const target=await apiRequest('/admin/users/'+user.id);if(!disposed&&epoch===detailEpoch){selected.value=target;modal.value='details';}}catch(failure){if(!disposed&&epoch===detailEpoch){denyIfForbidden(failure);error.value=failure.message;}}}
function denyIfForbidden(failure){if(failure.status!==403)return;overview.value=null;users.value=[];events.value=[];modal.value=null;selected.value=null;refreshEpoch++;listEpoch++;recipientEpoch++;if(auth.user)auth.user={...auth.user,is_admin:false};}
 async function mutate(url,method,body,message){
  if(submitting.value)return;submitting.value=true;formError.value='';
  try{await apiRequest(url,method,body);submitting.value=false;close();eventPage.value=1;await refresh();notify(message);}
  catch(failure){formError.value=failure.message;if(failure.status===409){submitting.value=false;close();await refresh();notify(failure.message);}}
  finally{submitting.value=false;}
 }
 async function grant(){
  const target=grantTargets.value.find(user=>String(user.id)===form.value.user);
  if(!target||form.value.reason.trim().length<3){formError.value='Selecione um usuário e informe um motivo com pelo menos 3 caracteres.';return;}
  if(!target.can_grant){formError.value='Esta conta não está disponível para cortesia. Atualize os dados.';return;}
  await mutate('/admin/users/'+target.id+'/grant','POST',{version:target.version,duration:form.value.duration,until:form.value.until,reason:form.value.reason.trim()},'Acesso Pro concedido a '+target.name+'.');
 }
 function requestRevoke(){actionReason.value='';formError.value='';modal.value='revoke';}
 async function revoke(){if(actionReason.value.trim().length<3){formError.value='Informe o motivo do encerramento.';return;}await mutate('/admin/users/'+selected.value.id+'/grant','DELETE',{version:selected.value.version,reason:actionReason.value.trim()},'Cortesia encerrada. Os dados da conta foram preservados.');}
 function toggleAccount(){actionReason.value='';formError.value='';modal.value='account';}
 async function confirmAccount(){if(actionReason.value.trim().length<3){formError.value='Informe o motivo da alteração.';return;}await mutate('/admin/users/'+selected.value.id,'PATCH',{version:selected.value.version,reason:actionReason.value.trim(),disabled:!selected.value.disabled},selected.value.disabled?'Conta reativada.':'Conta desativada. O usuário não poderá mais acessar o sistema.');}
 async function saveSettings(){
  if(submitting.value)return;submitting.value=true;error.value='';
  try{
   const response=await apiRequest('/admin/settings','PUT',{version:settingsVersion.value,settings:{name:draft.value.name,email:draft.value.email||null,defaultGrant:draft.value.defaultGrant,newAccounts:draft.value.newAccounts,maintenance:draft.value.maintenance}});
   if(disposed)return;settings.value=response.settings;draft.value={...response.settings,email:response.settings.email||''};settingsVersion.value=response.version;auth.site={name:response.settings.name,email:response.settings.email,registration_enabled:response.settings.newAccounts,maintenance:response.settings.maintenance};
   await readEvents();notify('Configurações salvas no sistema.');
  }catch(failure){if(!disposed){error.value=failure.message;if(failure.status===409)await refresh();}}
  finally{submitting.value=false;}
 }
 function discardSettings(){draft.value={...settings.value,email:settings.value.email||''};notify('Alterações não salvas descartadas.');}
 async function exportCsv(){
  try{const params=listParams();params.delete('page');params.delete('per_page');const response=await fetch('/api/admin/users/export?'+params,{credentials:'same-origin',cache:'no-store',headers:{Accept:'text/csv'}});
   if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.message||'Não foi possível exportar os usuários.');}
   const blob=await response.blob();const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='fluxo-usuarios-'+today+'.csv';link.click();URL.revokeObjectURL(url);notify('Lista de usuários exportada.');await readEvents();
  }catch(failure){error.value=failure.message;}
 }
 function focusSearch(){go('users');nextTick(()=>queryInput.value?.focus());}
 function keys(event){
  if(event.key==='Escape')close();
  if((event.ctrlKey||event.metaKey)&&event.key==='k'){event.preventDefault();focusSearch();}
  if(modal.value&&event.key==='Tab'){
   const items=[...document.querySelectorAll('[role="dialog"] button,[role="dialog"] input,[role="dialog"] select,[role="dialog"] textarea')].filter(el=>!el.disabled&&el.offsetParent!==null&&el.tabIndex>=0);const first=items[0],last=items.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
 }
 watch(modal,async value=>{document.body.style.overflow=value?'hidden':'';if(value){priorFocus=document.activeElement;await nextTick();document.querySelector('[role="dialog"] button')?.focus();}else priorFocus?.focus();});
 watch([search,statusFilter,originFilter],()=>page.value=1);
 watch([view,search,statusFilter,originFilter,page],scheduleUsers);
 watch(period,refresh);watch(eventPage,readEvents);
 onMounted(()=>{refresh();document.addEventListener('keydown',keys);});
 onBeforeUnmount(()=>{disposed=true;listEpoch++;recipientEpoch++;refreshEpoch++;clearTimeout(listTimer);clearTimeout(recipientTimer);clearTimeout(toastTimer);document.removeEventListener('keydown',keys);document.body.style.overflow='';});
 return {view,search,statusFilter,originFilter,page,sidebar,period,modal,selected,toast,queryInput,formError,submitting,error,loading,listLoading,ready,counts,revenue,recentUsers,rows,settings,draft,billingConfig,resultTotal,totalPages,eventPage,eventPages,eventTotal,grantTargets,recipientLoading,recipientError,recipientTotal,form,actionReason,events,currentAdmin,money,date,dateFull,dateTime,initials,labels,charts,chartMax,chartLabels,line,periodLabel,asOf,minGrantDate,grantTimezone,notify,go,refresh,searchRecipients,openGrant,close,openDetails,grant,requestRevoke,revoke,toggleAccount,confirmAccount,saveSettings,discardSettings,exportCsv,focusSearch};
}
