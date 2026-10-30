import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent,ref } from "vue";
import AppSelect from "../src/shared/AppSelect.vue";
let wrapper;
afterEach(()=>wrapper?.unmount());
const options=[{value:"all",label:"Todas as origens"},{value:"paid",label:"Pagamento Stripe"},{value:"manual",label:"Concessão manual"}];
describe("themed selects",()=>{
 it("opens a themed list and updates the value on selection",async()=>{
  wrapper=mount(AppSelect,{props:{modelValue:"all",options,"aria-label":"Filtrar origem"},global:{stubs:{Teleport:true}}});
  const trigger=wrapper.find('[role="combobox"]');expect(trigger.text()).toContain("Todas as origens");
  await trigger.trigger("click");expect(wrapper.find('[role="listbox"]').exists()).toBe(true);
  await wrapper.findAll('[role="option"]')[2].trigger("click");expect(wrapper.emitted("update:modelValue")[0]).toEqual(["manual"]);
  expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
 });
 it("supports the keyboard, disabled options and Escape without bubbling to the modal",async()=>{
  wrapper=mount(AppSelect,{props:{modelValue:"all",options:[...options,{value:"disabled",label:"Indisponível",disabled:true}]},global:{stubs:{Teleport:true}}});
  const trigger=wrapper.find('[role="combobox"]');await trigger.trigger("keydown",{key:"ArrowDown"});await trigger.trigger("keydown",{key:"End"});
  expect(trigger.attributes("aria-activedescendant")).toContain("-option-2");
  await trigger.trigger("keydown",{key:"Enter"});expect(wrapper.emitted("update:modelValue")[0]).toEqual(["manual"]);
  await trigger.trigger("click");const event=new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true});trigger.element.dispatchEvent(event);await wrapper.vm.$nextTick();
  expect(trigger.attributes("aria-expanded")).toBe("false");expect(event.defaultPrevented).toBe(true);
 });
 it("preserves select change events for existing form integrations",async()=>{
  const Host=defineComponent({components:{AppSelect},setup(){return {selected:ref("all"),options};},template:'<AppSelect v-model="selected" :options="options"/><p>{{selected}}</p>'});
  wrapper=mount(Host);await wrapper.find("select").setValue("paid");expect(wrapper.find("p").text()).toBe("paid");
  expect(wrapper.find('[role="combobox"]').text()).toContain("Pagamento Stripe");
  expect(wrapper.find("select").attributes("tabindex")).toBe("-1");
 });
 it("keeps disabled controls closed",async()=>{
  wrapper=mount(AppSelect,{props:{modelValue:"all",options,disabled:true},global:{stubs:{Teleport:true}}});
  expect(wrapper.find('[role="combobox"]').attributes("disabled")).toBeDefined();
  await wrapper.find('[role="combobox"]').trigger("click");expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
 });
});
