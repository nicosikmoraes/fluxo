import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { mount,flushPromises } from "@vue/test-utils";
import Root from "../src/Root.vue";
import AuthScreen from "../src/features/auth/AuthScreen.vue";
import BillingSettings from "../src/features/billing/BillingSettings.vue";
import { auth } from "../src/features/auth/auth";
import { setLocale } from "../src/state/locale";
let wrapper,site,user;
const respond=body=>({ok:true,status:200,json:async()=>body});
beforeEach(()=>{
 setLocale("pt-BR");auth.user=null;auth.loading=true;auth.error="";auth.csrfToken="public-test-token";auth.site=null;
 site={name:"Tempozi",email:"suporte@example.com",registration_enabled:true,maintenance:false};
 user={id:1,name:"Usuário",email:"user@example.com",is_admin:false,locale:"pt-BR"};
 vi.stubGlobal("fetch",vi.fn(async()=>respond({user,site,csrf_token:"token"})));
});
afterEach(()=>{wrapper?.unmount();auth.user=null;auth.site=null;auth.error="";setLocale("pt-BR");vi.unstubAllGlobals();});
const root=()=>mount(Root,{global:{stubs:{App:{template:'<div data-testid="workspace">Workspace</div>'},DesktopRoot:true,AuthScreen:true}}});
describe("administrative public settings",()=>{
 it("shows maintenance to ordinary users with the configured support address",async()=>{
  site.maintenance=true;wrapper=root();await flushPromises();
  expect(wrapper.text()).toContain("Voltamos em breve.");expect(wrapper.find('[data-testid="workspace"]').exists()).toBe(false);
  expect(wrapper.find('a[href="mailto:suporte@example.com"]').exists()).toBe(true);
 });
 it("keeps administrators able to enter the workspace during maintenance",async()=>{
  site.maintenance=true;user.is_admin=true;wrapper=root();await flushPromises();
  expect(wrapper.find('[data-testid="workspace"]').exists()).toBe(true);expect(wrapper.text()).not.toContain("Voltamos em breve.");
 });
 it("hides registration controls when registration is disabled",()=>{
  auth.site={...site,registration_enabled:false};wrapper=mount(AuthScreen,{global:{stubs:{LanguageSelect:true}}});
  expect(wrapper.text()).toContain("Novos cadastros estão temporariamente desativados.");expect(wrapper.findAll(".auth-policy-note")).toHaveLength(1);
  expect(wrapper.findAll("button").some(b=>["Criar conta","Crie sua conta"].includes(b.text()))).toBe(false);
 });
 it("explains complimentary Pro access without showing a paid checkout button",async()=>{
  auth.user=user;auth.loading=false;
  vi.stubGlobal("fetch",vi.fn(async()=>respond({plan:"pro",access_source:"manual",courtesy_expires_at:"2026-11-29T12:00:00Z",entitlements:{work_tracking:true},price:{amounts:{usd:500,brl:1299}},usage:{projects:0},subscription:null,checkout_available:true,portal_available:false})));
  wrapper=mount(BillingSettings);await flushPromises();
  expect(wrapper.text()).toContain("Seu acesso Pro foi concedido pela administração.");expect(wrapper.text()).toContain("Válido até");
  expect(wrapper.findAll("button").some(b=>b.text().includes("Assinar Tempozi Pro"))).toBe(false);
 });
});
