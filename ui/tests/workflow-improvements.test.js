import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { h, ref } from "vue";
import App from "../src/App.vue";
import WorkHoursSettings from "../src/features/work-hours/WorkHoursSettings.vue";
import WorkHoursWidget from "../src/features/work-hours/WorkHoursWidget.vue";
import { auth } from "../src/features/auth/auth";
import { setLocale } from "../src/state/locale";
import { resetWorkspace } from "../src/state/workspace";
import { defaultWorkSettings, emptyWorkEntries } from "../src/features/work-hours/workHours";

let wrapper;
const respond = (body) => ({ ok: true, status: 200, json: async () => body });
beforeEach(() => {
  window.history.replaceState({}, "", "/");
  auth.user = { id: 1, name: "Pessoa", locale: "pt-BR", billing: { plan: "free", entitlements: { work_tracking: false } } };
  auth.csrfToken = "design-test-token";
  setLocale("pt-BR");
  resetWorkspace();
});
afterEach(() => {
  wrapper?.unmount();
  auth.user = null;
  resetWorkspace();
  setLocale("pt-BR");
  vi.unstubAllGlobals();
});

describe("Projects, work tracking, and optional breaks", () => {
  it("keeps projects searchable in the sidebar and makes no work requests for a free account", async () => {
    const projects = Array.from({ length: 20 }, (_, index) => ({ id: index + 1, title: `Projeto ${index + 1}`, cover: "desk" }));
    const fetchMock = vi.fn().mockResolvedValue(respond({ projects, tasks: [], roadmaps: [] }));
    vi.stubGlobal("fetch", fetchMock);
    wrapper = mount(App);
    await flushPromises();

    expect(wrapper.find(".sidebar .workspace-name").exists()).toBe(false);
    expect(wrapper.findAll(".sidebar-projects .project-link")).toHaveLength(21);
    await wrapper.get('.sidebar-project-search input').setValue("Projeto 12");
    expect(wrapper.findAll(".sidebar-projects .project-link")).toHaveLength(2);
    expect(wrapper.get(".sidebar-projects").text()).toContain("Projeto 12");
    expect(wrapper.get(".sidebar-projects").text()).not.toContain("Projeto 13");
    expect(fetchMock.mock.calls.every(([url]) => !url.includes("work-hours"))).toBe(true);
    expect(wrapper.find(".work-widget-anchor").exists()).toBe(false);
  });

  it("shows the Pro invitation instead of history when a free account opens a history link", async () => {
    window.history.replaceState({}, "", "/?view=work-history");
    const fetchMock = vi.fn().mockResolvedValue(respond({ projects: [], tasks: [], roadmaps: [] }));
    vi.stubGlobal("fetch", fetchMock);
    wrapper = mount(App);
    await flushPromises();

    expect(wrapper.find(".work-history-screen").exists()).toBe(false);
    expect(wrapper.find(".work-tracking-upgrade").exists()).toBe(true);
    expect(fetchMock.mock.calls.every(([url]) => !url.includes("work-hours"))).toBe(true);
  });

  it("starts with only entry and exit, adds numbered pauses, and promotes the next pause on removal", async () => {
    setLocale("en-US");
    const settings = ref({ ...defaultWorkSettings, enabled: true });
    const entries = ref({ ...emptyWorkEntries, startedAt: "09:00" });
    const breaks = ref([]);
    wrapper = mount({ setup: () => () => h(WorkHoursSettings, {
      settings: settings.value, entries: entries.value, extraBreaks: breaks.value, nowMinutes: 17 * 60, date: "2026-10-16",
      "onUpdate:entries": (value) => { entries.value = value; },
      "onUpdate:extraBreaks": (value) => { breaks.value = value; },
    }) });

    expect(wrapper.find("#work-startedAt").exists()).toBe(true);
    expect(wrapper.find("#work-finishedAt").exists()).toBe(true);
    expect(wrapper.find("#work-lunchOut").exists()).toBe(false);
    const button = (label) => wrapper.findAll("button").find((item) => item.text().includes(label));
    await button("Add a break").trigger("click");
    expect(wrapper.text()).toContain("Break 1 start");
    await wrapper.get("#work-lunchOut").setValue("11:00");
    await wrapper.get("#work-lunchIn").setValue("11:15");
    await button("Add another break").trigger("click");
    await wrapper.get("#pause-0startedAt").setValue("14:00");
    await wrapper.get("#pause-0finishedAt").setValue("14:10");

    expect(wrapper.findAll(".work-extra-pause")).toHaveLength(2);
    await wrapper.get('[aria-label="Remove break 1"]').trigger("click");
    expect(wrapper.findAll(".work-extra-pause")).toHaveLength(1);
    expect(wrapper.get("#work-lunchOut").element.value).toBe("14:00");
    expect(wrapper.get("#work-lunchIn").element.value).toBe("14:10");
  });

  it("offers pause actions in the widget and lists each pause only after it exists", async () => {
    const day = { valid: true, showWidget: true, started: true, finished: false, paused: false, workedSeconds: 3600, remainingSeconds: 0, overtimeSeconds: 0, lunchSeconds: 0 };
    wrapper = mount(WorkHoursWidget, { props: { day, entries: { ...emptyWorkEntries, startedAt: "09:00" }, expanded: true } });
    expect(wrapper.find(".work-widget-pauses").exists()).toBe(false);
    await wrapper.findAll("button").find((button) => button.text().includes("Iniciar pausa")).trigger("click");
    expect(wrapper.emitted("action")[0]).toEqual(["pause"]);

    await wrapper.setProps({ day: { ...day, paused: true }, breaks: [{ startTime: "11:00", endTime: "11:15" }, { startTime: "14:00", endTime: "" }] });
    expect(wrapper.get(".work-widget-pauses").text()).toContain("Pausa 1");
    expect(wrapper.get(".work-widget-pauses").text()).toContain("Pausa 2");
    expect(wrapper.get(".work-widget-pauses").text()).toContain("14:00");
    await wrapper.findAll("button").find((button) => button.text().includes("Retornar ao trabalho")).trigger("click");
    expect(wrapper.emitted("action")[1]).toEqual(["resume"]);
    await wrapper.findAll("button").find((button) => button.text().includes("Finalizar")).trigger("click");
    expect(wrapper.emitted("finish")).toHaveLength(1);
  });
});
