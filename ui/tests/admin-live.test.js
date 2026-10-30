import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import AdminPanel from "../src/features/admin/AdminPanel.vue";
import AdminRoot from "../src/features/admin/AdminRoot.vue";
import { auth } from "../src/features/auth/auth";
import { setTheme } from "../src/features/appearance/theme";

let wrapper, fetchMock, target, values, summary, logs, configVersion, postStatus;
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>structuredClone(body)});
const owner={id:1,name:"Administrador real",email:"admin@example.com",is_admin:true,locale:"pt-BR"};
beforeEach(()=>{
 vi.useFakeTimers({toFake:["setTimeout","clearTimeout"]});
 vi.stubGlobal("scrollTo",vi.fn());localStorage.clear();setTheme("light");
 auth.user={...owner};auth.csrfToken="admin-csrf";auth.loading=false;auth.error="";auth.site=null;
 target={id:2,name:"Pessoa da API",email:"pessoa@example.com",status:"free",joined:"2026-10-30T10:00:00Z",expires:null,disabled:false,is_admin:false,version:3,source:null,can_grant:true,courtesy_active:false};
 values={name:"Fluxo real",email:null,defaultGrant:"30",newAccounts:true,maintenance:false};configVersion=4;logs=[];postStatus=201;
 summary={counts:{total:3,active:1,paid:1,manual:0,canceled:0,pending:0,free:2,subscribed:1,disabled:0,new:3},revenue:{amount:5,currency:"usd",estimated:true},recent:[target],registrations:[{date:"2026-10-29",label:"29/10",value:1},{date:"2026-10-30",label:"30/10",value:2}],period_label:"Últimos 30 dias",as_of:"2026-10-30T13:00:00Z"};
 fetchMock=vi.fn(async(url,options={})=>{
  const path=new URL(url,"http://localhost").pathname,method=options.method||"GET",body=options.body?JSON.parse(options.body):null;
  if(path==="/api/auth/session")return response({user:owner,site:{name:"Fluxo real"},csrf_token:"admin-csrf"});
  if(path==="/api/admin/overview")return response(summary);
  if(path==="/api/admin/settings"){
   if(method==="PUT"){values=body.settings;configVersion++;}return response({settings:values,version:configVersion,billing:{ready:false,currency:"usd",amounts:{usd:500,brl:1299}}});
  }
  if(path==="/api/admin/events")return response({data:logs,total:logs.length,last_page:1,current_page:1});
  if(path==="/api/admin/users")return response({data:[target],total:1,last_page:1,current_page:1});
  if(path==="/api/admin/users/2/grant"&&method==="POST"){
   if(postStatus!==201)return response({message:"Esta conta foi alterada. Atualize os dados e tente novamente."},postStatus);
   target={...target,status:"manual",source:"manual",version:4,courtesy_active:true,expires:"2026-11-29T12:00:00Z"};
   summary.counts.manual=1;summary.counts.active=2;summary.recent=[target];logs=[{id:9,title:"Acesso cortesia concedido",detail:body.reason,type:"grant",time:"2026-10-30T13:01:00Z",actor:owner.name}];
   return response(target,201);
  }
  if(path==="/api/admin/users/2"){
   if(method==="PATCH"){target={...target,disabled:body.disabled,version:4};}return response(target);
  }
  throw new Error("Unexpected API request: "+method+" "+url);
 });
 vi.stubGlobal("fetch",fetchMock);
});
afterEach(()=>{wrapper?.unmount();auth.user=null;auth.site=null;setTheme("light");vi.useRealTimers();vi.unstubAllGlobals();});
const settle=async()=>{await flushPromises();await vi.advanceTimersByTimeAsync(0);await flushPromises();};
const start=async()=>{wrapper=mount(AdminPanel);await settle();};
const click=async text=>{const button=wrapper.findAll("button").find(item=>item.text().includes(text));expect(button,text).toBeTruthy();await button.trigger("click");await settle();};
const chooseRecipient=async()=>{
 await click("Conceder acesso Pro");const input=wrapper.find('[role="dialog"] [role="combobox"]');await input.trigger("focus");await input.setValue("pessoa@example");
 await vi.advanceTimersByTimeAsync(250);await flushPromises();await wrapper.find('[data-user-id="2"]').trigger("click");await flushPromises();
};

describe("live administration",()=>{
 it("shows only server data and never initializes the demonstration store",async()=>{
  await start();expect(wrapper.text()).toContain("Fluxo real");expect(wrapper.text()).toContain("3");expect(wrapper.text()).toContain("5,00");
  expect(wrapper.text()).not.toMatch(/protótipo|demonstração|955,20/i);
  expect(localStorage.getItem("fluxo-admin-prototype-v1")).toBeNull();expect(wrapper.find(".attention-strip").exists()).toBe(false);expect(wrapper.find(".sparkline").exists()).toBe(false);
  expect(fetchMock.mock.calls.every(([url])=>url.startsWith("/api/admin/"))).toBe(true);
 });
 it("searches recipients on the server and sends the actual ID, version and CSRF token",async()=>{
  await start();await chooseRecipient();const form=wrapper.find('[role="dialog"] form');await form.find("textarea").setValue("Parceria real aprovada");await form.trigger("submit");await settle();
  const write=fetchMock.mock.calls.find(([url,options])=>url==="/api/admin/users/2/grant"&&options.method==="POST");
  expect(JSON.parse(write[1].body)).toMatchObject({version:3,duration:"30",reason:"Parceria real aprovada"});
  expect(write[1].headers["X-CSRF-TOKEN"]).toBe("admin-csrf");expect(write[1].credentials).toBe("same-origin");
  expect(fetchMock.mock.calls.some(([url])=>url.includes("eligible=1")&&url.includes("search=pessoa%40example"))).toBe(true);
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  expect(wrapper.text()).toContain("1 pagas · 1 cortesias");expect(wrapper.text()).toContain("5,00");
  expect(localStorage.getItem("fluxo-admin-prototype-v1")).toBeNull();expect(wrapper.find(".attention-strip").exists()).toBe(false);expect(wrapper.find(".sparkline").exists()).toBe(false);
 });
 it("does not announce success or change access optimistically when the server rejects a stale grant",async()=>{
  postStatus=409;await start();await chooseRecipient();const form=wrapper.find('[role="dialog"] form');
  await form.find("textarea").setValue("Parceria real aprovada");await form.trigger("submit");await settle();
  expect(wrapper.text()).toContain("Esta conta foi alterada");expect(wrapper.text()).toContain("1 pagas · 0 cortesias");expect(wrapper.text()).not.toContain("Acesso Pro concedido a");
 });
 it("sends search and subscription filters to the paginated API",async()=>{
  await start();await click("Usuários");await wrapper.find('input[aria-label="Buscar por nome ou e-mail"]').setValue("consulta remota");
  await vi.advanceTimersByTimeAsync(300);await flushPromises();
  expect(fetchMock.mock.calls.some(([url])=>url.includes("/admin/users?")&&url.includes("search=consulta+remota"))).toBe(true);
  expect(wrapper.text()).toContain("Pessoa da API");
  await click("Assinaturas");await click("Cortesias");
  expect(fetchMock.mock.calls.some(([url])=>url.includes("subscribed=1")&&url.includes("status=manual"))).toBe(true);
 });
 it("persists supported settings through the API and updates public site preferences",async()=>{
  await start();await click("Configurações");await wrapper.find('input[type="email"]').setValue("suporte@example.com");await wrapper.find(".settings-form").trigger("submit");await settle();
  const write=fetchMock.mock.calls.find(([url,options])=>url==="/api/admin/settings"&&options.method==="PUT");
  expect(JSON.parse(write[1].body)).toEqual({version:4,settings:{name:"Fluxo real",email:"suporte@example.com",defaultGrant:"30",newAccounts:true,maintenance:false}});
  expect(auth.site.email).toBe("suporte@example.com");expect(wrapper.text()).toContain("Configurações salvas no sistema.");
 });
 it("requires a reason and confirmation before disabling a non-admin account",async()=>{
  await start();await click("Usuários");await wrapper.find('button[aria-label^="Ver detalhes"]').trigger("click");await settle();await click("Desativar conta");
  expect(fetchMock.mock.calls.some(([,options])=>options.method==="PATCH")).toBe(false);
  expect(wrapper.find('[role="dialog"]').findAll("button").find(button=>button.text()==="Desativar conta").attributes("disabled")).toBeDefined();
  await wrapper.find('[role="dialog"] textarea').setValue("Solicitação do titular");await click("Desativar conta");
  const write=fetchMock.mock.calls.find(([url,options])=>url==="/api/admin/users/2"&&options.method==="PATCH");
  expect(JSON.parse(write[1].body)).toEqual({version:3,disabled:true,reason:"Solicitação do titular"});
 });
 it("does not render a populated dashboard when permission is denied",async()=>{
  fetchMock.mockImplementation(async()=>response({message:"Acesso restrito."},403));await start();
  expect(auth.user.is_admin).toBe(false);expect(wrapper.text()).not.toContain("Pessoa da API");expect(wrapper.text()).not.toContain("Tudo flui por aqui.");
 });
 it("does not load administrative APIs for an ordinary session",async()=>{
  auth.user=null;auth.loading=true;fetchMock.mockImplementation(async()=>response({user:{...owner,is_admin:false},site:{name:"Fluxo"},csrf_token:"token"}));
  wrapper=mount(AdminRoot);await settle();expect(wrapper.text()).toContain("Acesso restrito");
  expect(fetchMock).toHaveBeenCalledTimes(1);expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/session");
 });
});
