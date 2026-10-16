import { afterEach, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import App from "../src/App.vue";
import { apiRequest } from "../src/features/auth/auth";

let wrapper;
afterEach(() => { wrapper?.unmount(); localStorage.clear(); });

it("salva o perfil, restaura os horários ao abrir novamente e registra a saída pelo widget", async () => {
  localStorage.clear();
  const initial = await apiRequest("/profile/work-hours?timezone=UTC");
  const stamp = (hoursAgo) => new Date(Date.parse(initial.server_now) - hoursAgo * 3600000).toISOString();
  await apiRequest("/profile/work-hours", "PUT", {
    settings: { ...initial.settings, enabled: true, timezone: "UTC", monthlySalary: null },
    settings_version: initial.settings_version,
    date: stamp(10).slice(0, 10),
    entry_version: initial.day.version,
    entries: { startedAt: stamp(10).slice(11, 16), lunchOut: stamp(6).slice(11, 16), lunchIn: stamp(5).slice(11, 16), finishedAt: "" },
  });
  wrapper = mount(App);
  await vi.waitFor(() => expect(wrapper.find(".work-widget-anchor").exists()).toBe(true));
  await wrapper.find(".profile-nav-button").trigger("click");
  await vi.waitFor(() => expect(wrapper.find("#work-weekly").exists()).toBe(true));
  expect(wrapper.find("#work-weekly").element.value).toBe("44");
  expect(wrapper.find("#work-lunchIn").element.value).toBe(stamp(5).slice(11, 16));
  await wrapper.find("#work-salary").setValue("4400");
  await wrapper.find(".work-settings").trigger("submit");
  await vi.waitFor(async () => expect((await apiRequest("/profile/work-hours")).settings.monthlySalary).toBe(4400));
  wrapper.unmount();

  wrapper = mount(App);
  await vi.waitFor(() => expect(wrapper.find(".work-widget-anchor").exists()).toBe(true));
  if (wrapper.find(".work-widget-compact").exists()) await wrapper.find(".work-widget-compact").trigger("click");
  expect(wrapper.find(".work-widget-duration").text()).toContain("+");
  expect(wrapper.find(".work-widget-money").exists()).toBe(true);
  const calendar = wrapper.findAll("nav button").find((button) => button.text().includes("Calendário"));
  await calendar.trigger("click");
  expect(wrapper.find(".work-widget").exists()).toBe(true);
  await wrapper.find(".work-widget-finish").trigger("click");
  await vi.waitFor(() => expect(wrapper.find(".work-widget-status").text()).toContain("encerrada"));
  expect((await apiRequest("/profile/work-hours")).active_day.entries.finishedAt).toMatch(/^\d{2}:\d{2}$/);
});
