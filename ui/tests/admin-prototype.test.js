import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import AdminPrototype from "../src/prototypes/admin/AdminPrototype.vue";
import { setTheme, THEME_STORAGE_KEY } from "../src/features/appearance/theme";
let wrapper;
beforeEach(()=>{localStorage.clear();setTheme("light");vi.stubGlobal("scrollTo",vi.fn());});
afterEach(()=>{wrapper?.unmount();setTheme("light");vi.useRealTimers();vi.unstubAllGlobals();});
const click=async text=>{const b=wrapper.findAll("button").find(b=>b.text().includes(text));expect(b,text).toBeTruthy();await b.trigger("click");await flushPromises();};
const recipient=async text=>{const input=wrapper.find('[role="dialog"] [role="combobox"]');await input.trigger("focus");await input.setValue(text);const option=wrapper.find('[role="option"]');expect(option.exists()).toBe(true);await option.trigger("click");};
describe("admin prototype",()=>{
 it("renders and searches users without calling an API",async()=>{
  const request=vi.spyOn(globalThis,"fetch");wrapper=mount(AdminPrototype);expect(wrapper.text()).toContain("Tudo flui por aqui.");
  await click("Usuários");expect(wrapper.findAll("tbody tr")).toHaveLength(8);
  await wrapper.find('input[aria-label="Buscar por nome ou e-mail"]').setValue("Marina Almeida");expect(wrapper.findAll("tbody tr")).toHaveLength(1);
  await wrapper.find('input[aria-label="Buscar por nome ou e-mail"]').setValue("not-a-user");expect(wrapper.text()).toContain("Nenhum usuário por aqui.");
  expect(request).not.toHaveBeenCalled();request.mockRestore();
 });
 it("grants complimentary Pro, records the reason and preserves paid revenue",async()=>{
  wrapper=mount(AdminPrototype);await click("Conceder acesso Pro");await recipient("gabriel.almeida@exemplo.com");
  const form=wrapper.find('[role="dialog"] form');await form.find("textarea").setValue("Parceria da comunidade");await form.trigger("submit");
  await new Promise(r=>setTimeout(r,650));await flushPromises();expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  const data=JSON.parse(localStorage.getItem("fluxo-admin-prototype-v1"));expect(data.users.find(u=>u.id===8).status).toBe("manual");expect(data.users.find(u=>u.id===8).expires).toBe("2026-11-29");
  expect(data.events[0].detail).toContain("Parceria da comunidade");expect(wrapper.text()).toContain("48 pagas · 13 cortesias");expect(wrapper.text()).toContain("955,20");
  await click("Histórico de ações");expect(wrapper.text()).toContain("Parceria da comunidade");
 });
 it("validates expiry and excludes ongoing Stripe subscriptions from the picker",async()=>{
  wrapper=mount(AdminPrototype);await click("Conceder acesso Pro");const form=wrapper.find('[role="dialog"] form');
  await wrapper.find('[role="dialog"] [role="combobox"]').trigger("focus");
  expect(wrapper.find('[data-user-id="1"]').exists()).toBe(false);expect(wrapper.find('[data-user-id="7"]').exists()).toBe(false);
  await recipient("Gabriel Almeida");await form.find("select").setValue("custom");await form.find('input[type="date"]').setValue("2026-10-29");await form.find("textarea").setValue("Prazo de teste");await form.trigger("submit");
  expect(wrapper.text()).toContain("Escolha uma data posterior");expect(localStorage.getItem("fluxo-admin-prototype-v1")).toBeNull();
 });
 it("searches recipients by email and handles empty results",async()=>{
  wrapper=mount(AdminPrototype);await click("Conceder acesso Pro");const input=wrapper.find('[role="dialog"] [role="combobox"]');
  await input.trigger("focus");expect(input.attributes("aria-expanded")).toBe("true");
  await input.setValue("not-a-person");expect(wrapper.text()).toContain("Nenhum usuário encontrado");expect(wrapper.findAll('[role="option"]')).toHaveLength(0);
  await input.setValue("gabriel.almeida");expect(wrapper.findAll('[role="option"]')).toHaveLength(1);
  await input.trigger("keydown",{key:"Enter"});expect(input.element.value).toBe("Gabriel Almeida");expect(input.attributes("aria-expanded")).toBe("false");
 });
 it("supports keyboard selection and closes the dropdown before the modal on Escape",async()=>{
  wrapper=mount(AdminPrototype);await click("Conceder acesso Pro");const input=wrapper.find('[role="dialog"] [role="combobox"]');
  await input.trigger("focus");await input.setValue("almeida");const options=wrapper.findAll('[role="option"]');expect(options.length).toBeGreaterThan(1);
  await input.trigger("keydown",{key:"ArrowDown"});expect(input.attributes("aria-activedescendant")).toBe(options[1].attributes("id"));
  await input.trigger("keydown",{key:"Enter"});expect(input.element.value).toBe("Pedro Almeida");
  await input.trigger("focus");await input.trigger("keydown",{key:"Escape"});expect(input.attributes("aria-expanded")).toBe("false");expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
 });
 it("shares the main app theme and persists the toggle",async()=>{
  setTheme("graphite");wrapper=mount(AdminPrototype);
  const toggle=wrapper.find('.theme-toggle');expect(toggle.attributes("aria-checked")).toBe("true");expect(document.documentElement.dataset.theme).toBe("graphite");
  await toggle.trigger("click");expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");expect(document.documentElement.dataset.theme).toBe("light");
  await toggle.trigger("click");expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("graphite");
 });
 it("saves settings",async()=>{
  wrapper=mount(AdminPrototype);await click("Configurações");await wrapper.find('input[type="email"]').setValue("admin@exemplo.com");await wrapper.find(".settings-form").trigger("submit");
  expect(JSON.parse(localStorage.getItem("fluxo-admin-prototype-v1")).settings.email).toBe("admin@exemplo.com");
 });
 it("ends a courtesy only after confirmation",async()=>{
  wrapper=mount(AdminPrototype);await click("Assinaturas");await click("Cortesias");await wrapper.find('button[aria-label^="Ver detalhes"]').trigger("click");await flushPromises();
  await click("Encerrar cortesia");expect(wrapper.text()).toContain("Encerrar esta cortesia?");
  await wrapper.find('[role="dialog"]').findAll("button").find(b=>b.text()==="Encerrar cortesia").trigger("click");await flushPromises();
  const data=JSON.parse(localStorage.getItem("fluxo-admin-prototype-v1"));expect(data.users.find(u=>u.id===5).status).toBe("canceled");expect(data.events[0].title).toBe("Cortesia encerrada");
 });
});
