import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import App from "../src/App.vue";
import AuthScreen from "../src/features/auth/AuthScreen.vue";
import LanguageSelect from "../src/features/appearance/LanguageSelect.vue";
import AppearanceSettings from "../src/features/appearance/AppearanceSettings.vue";
import WorkHoursSettings from "../src/features/work-hours/WorkHoursSettings.vue";
import WorkHoursWidget from "../src/features/work-hours/WorkHoursWidget.vue";
import HistoryChart from "../src/features/work-hours/history/components/HistoryChart.vue";
import HistoryTable from "../src/features/work-hours/history/components/HistoryTable.vue";
import { apiRequest, auth } from "../src/features/auth/auth";
import { currentCurrency, currentLocale, formatCurrency, formatDate, saveLocale, setLocale, t } from "../src/state/locale";
import { resetWorkspace } from "../src/state/workspace";
import { calculateRecordedWorkDay, calculateWorkDay, defaultWorkSettings, emptyWorkEntries, validateWorkSettings } from "../src/features/work-hours/workHours";
import { historyRecord, summarizeHistory } from "../src/features/work-hours/history/history";

const wrappers = [];
const hourly = { ...defaultWorkSettings, enabled: true, overtimeEnabled: false, hourlyRate: 25, timezone: "UTC" };
const entries = { startedAt: "08:00", lunchOut: "12:00", lunchIn: "13:00", finishedAt: "18:00" };
const now = new Date("2026-10-17T22:00:00Z");
function record(settings = hourly) {
  return { date: "2026-10-17", timezone: "UTC", regime: { ...settings }, version: 1, entries: { ...entries },
    instants: { startedAt: "2026-10-17T08:00:00Z", lunchOut: "2026-10-17T12:00:00Z", lunchIn: "2026-10-17T13:00:00Z", finishedAt: "2026-10-17T18:00:00Z" } };
}
function open(component, props = {}) {
  const wrapper = mount(component, { props }); wrappers.push(wrapper); return wrapper;
}
const respond = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
beforeEach(() => {
  auth.user = null; auth.csrfToken = "locale-test-token"; auth.error = ""; auth.message = "";
  localStorage.clear(); setLocale("pt-BR"); resetWorkspace();
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount()); auth.user = null; setLocale("pt-BR"); vi.unstubAllGlobals();
});

describe("Language selection", () => {
  it("switches currency, dates, page language, and browser preference together", () => {
    setLocale("en-US");
    expect(currentCurrency.value).toBe("USD");
    expect(formatCurrency(1250.5)).toBe("$1,250.50");
    expect(formatDate(new Date("2026-10-17T12:00:00Z"), { dateStyle: "long", timeZone: "UTC" })).toBe("October 17, 2026");
    expect(document.documentElement.lang).toBe("en-US");
    expect(localStorage.getItem("fluxo:locale")).toBe("en-US");
    setLocale("pt-BR");
    expect(currentCurrency.value).toBe("BRL");
    expect(formatCurrency(1250.5)).toContain("1.250,50");
  });
  it("uses each account’s preference and keeps the selection after sign-out", () => {
    auth.user = { id: 1, locale: "en-US" };
    expect(currentLocale.value).toBe("en-US");
    auth.user = null;
    expect(currentLocale.value).toBe("en-US");
    auth.user = { id: 2, locale: "pt-BR" };
    expect(currentLocale.value).toBe("pt-BR");
  });
  it("lets a guest switch language without losing a typed email or calling the API", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const wrapper = open(AuthScreen);
    await wrapper.get("#auth-email").setValue("person@example.com");
    await wrapper.get(".language-select select").setValue("en-US");
    expect(wrapper.get("h2").text()).toBe("Welcome back");
    expect(wrapper.get("#auth-email").element.value).toBe("person@example.com");
    expect(wrapper.get("#auth-password").attributes("placeholder")).toBe("Your password");
    expect(fetchMock).not.toHaveBeenCalled();
    await wrapper.get("form").trigger("submit");
    expect(wrapper.get("#auth-password-error").text()).toBe("Enter your password.");
  });
  it("registers with the selected language", async () => {
    setLocale("en-US");
    const fetchMock = vi.fn().mockResolvedValue(respond({ user: { id: 8, name: "Person", locale: "en-US" } }));
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = open(AuthScreen);
    await wrapper.findAll(".auth-tabs button")[1].trigger("click");
    await wrapper.get("#auth-name").setValue("Person");
    await wrapper.get("#auth-email").setValue("person@example.com");
    await wrapper.get("#auth-password").setValue("long password");
    await wrapper.get("#auth-confirm").setValue("long password");
    await wrapper.get("form").trigger("submit"); await flushPromises();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).locale).toBe("en-US");
    expect(auth.user.id).toBe(8);
  });
  it("saves an account preference only after the server accepts it", async () => {
    auth.user = { id: 3, name: "Person", locale: "pt-BR" };
    let complete;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { complete = resolve; })));
    const wrapper = open(LanguageSelect);
    await wrapper.get("select").setValue("en-US");
    expect(currentLocale.value).toBe("pt-BR");
    expect(wrapper.get("select").element.disabled).toBe(true);
    complete(respond({ user: { id: 3, name: "Person", locale: "en-US" } })); await flushPromises();
    expect(auth.user.locale).toBe("en-US");
    expect(wrapper.get("select").element.value).toBe("en-US");
  });
  it("keeps the original language after a failed save", async () => {
    auth.user = { id: 3, locale: "pt-BR" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond({ message: "Falha ao salvar." }, 500)));
    const wrapper = open(LanguageSelect);
    await wrapper.get("select").setValue("en-US"); await flushPromises();
    expect(currentLocale.value).toBe("pt-BR");
    expect(wrapper.get("select").element.value).toBe("pt-BR");
    expect(wrapper.get('[role="alert"]').text()).toBe("Falha ao salvar.");
  });
  it("does not restore a signed-out user when a pending preference save finishes", async () => {
    auth.user = { id: 3, locale: "pt-BR" };
    let complete;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { complete = resolve; })));
    const saving = saveLocale("en-US"); auth.user = null;
    complete(respond({ user: { id: 3, locale: "en-US" } })); await saving;
    expect(auth.user).toBeNull(); expect(currentLocale.value).toBe("pt-BR");
  });
  it("sends the selected language with API requests", async () => {
    setLocale("en-US");
    const fetchMock = vi.fn().mockResolvedValue(respond({})); vi.stubGlobal("fetch", fetchMock);
    await apiRequest("/workspace");
    expect(fetchMock.mock.calls[0][1].headers["Accept-Language"]).toBe("en-US");
  });
  it("updates constant option labels on an already open screen", async () => {
    const wrapper = open(AppearanceSettings);
    expect(wrapper.text()).toContain("Claro");
    setLocale("en-US"); await nextTick();
    expect(wrapper.text()).toContain("Graphite");
    expect(wrapper.text()).toContain("Light and bright for your day.");
    setLocale("pt-BR"); await nextTick();
    expect(wrapper.text()).toContain("Tons escuros com detalhes em lilás.");
  });
  it("interpolates user text without translating it", () => {
    setLocale("en-US");
    expect(t("Novo nome para {name}", { name: "Projetos <script>" })).toBe("New name for Projetos <script>");
    expect(t("toString")).toBe("toString");
  });
});

describe("Hourly work in English", () => {
  it("calculates pay without weekly inputs or weekend overtime", () => {
    setLocale("en-US");
    const day = calculateWorkDay({ ...hourly, weeklyHours: 0, daysPerWeek: 0, monthlySalary: -1, monthlyHours: 0 }, entries, 22 * 60, { date: "2026-10-17" });
    expect(day.valid).toBe(true); expect(day.workedSeconds).toBe(9 * 3600);
    expect(day.hourlyEarnings).toBe(225); expect(day.hourlyRate).toBe(25);
    expect(day.targetSeconds).toBeNull(); expect(day.departureMinutes).toBeNull();
    expect(day.overtimeSeconds).toBe(0); expect(day.overtimeMoney).toBeNull();
  });
  it.each([0, -5, "abc", "12.345", Infinity, 1000000000])("rejects invalid rate %s", (hourlyRate) => {
    setLocale("en-US");
    expect(validateWorkSettings({ ...hourly, hourlyRate }).hourlyRate).toContain("valid hourly rate");
  });
  it("allows time tracking without a pay rate", () => {
    const day = calculateWorkDay({ ...hourly, hourlyRate: "" }, entries, 22 * 60, { date: "2026-10-17" });
    expect(day.valid).toBe(true); expect(day.workedSeconds).toBe(9 * 3600); expect(day.hourlyEarnings).toBeNull();
  });
  it("preserves the recorded hourly rate after profile changes", () => {
    const day = calculateRecordedWorkDay({ ...hourly, hourlyRate: 50 }, record(), now);
    expect(day.hourlyEarnings).toBe(225); expect(day.hourlyRate).toBe(25); expect(day.finished).toBe(true);
  });
  it("keeps hourly records free of Brazilian overtime after switching to Portuguese", () => {
    const day = calculateRecordedWorkDay({ ...defaultWorkSettings, enabled: true }, record(), now);
    expect(day.overtimeSeconds).toBe(0); expect(day.targetSeconds).toBeNull(); expect(day.hourlyEarnings).toBe(225);
  });
  it("preserves the Portuguese salary and overtime calculation", () => {
    const day = calculateWorkDay({ ...defaultWorkSettings, enabled: true, monthlySalary: 4400 }, { ...entries, finishedAt: "18:30" }, 22 * 60, { date: "2026-10-16" });
    expect(day.overtimeSeconds).toBe(42 * 60); expect(day.overtimeMoney).toBeCloseTo(21);
  });
  it("hides weekly inputs and expected departure while preserving entered times", async () => {
    const wrapper = open(WorkHoursSettings, { settings: { ...hourly, overtimeEnabled: true }, entries: { ...entries }, nowMinutes: 22 * 60, date: "2026-10-17" });
    expect(wrapper.find("#work-weekly").exists()).toBe(true);
    setLocale("en-US"); await nextTick();
    expect(wrapper.find("#work-weekly").exists()).toBe(false);
    expect(wrapper.find("#work-salary").exists()).toBe(false);
    expect(wrapper.find("#work-cycle-start").exists()).toBe(false);
    expect(wrapper.find(".work-departure-summary").exists()).toBe(false);
    expect(wrapper.get("#work-hourly-rate").element.value).toBe("25");
    expect(wrapper.get("#work-lunchOut").element.value).toBe("12:00");
    expect(wrapper.text()).not.toContain("all hours are overtime");
    await wrapper.get("form").trigger("submit"); expect(wrapper.emitted("save")).toHaveLength(1);
  });
  it("shows worked time and earned pay in the widget", () => {
    setLocale("en-US");
    const wrapper = open(WorkHoursWidget, { day: calculateRecordedWorkDay(hourly, record(), now), entries, expanded: true });
    expect(wrapper.get(".work-widget-duration").text()).toContain("9h");
    expect(wrapper.get(".work-widget-money").text()).toContain("$225.00");
    expect(wrapper.find(".work-widget-cycle").exists()).toBe(false);
    expect(wrapper.find(".work-widget-progress").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Overtime");
  });
  it("marks history without a pay rate and omits overtime from the chart", () => {
    setLocale("en-US");
    const paid = historyRecord(record(), now);
    const unvalued = historyRecord(record({ ...hourly, hourlyRate: null }), now);
    const summary = summarizeHistory([paid, unvalued]);
    expect(summary.hourlyEarnings).toBe(225); expect(summary.unvaluedHourlyDays).toBe(1);
    expect(summary.overtime).toBe(0); expect(summary.balance).toBe(0);
    const chart = open(HistoryChart, { records: [paid] });
    expect(chart.text()).not.toContain("Overtime"); expect(chart.get(".chart-bar").attributes("aria-label")).not.toContain("extras");
    const table = open(HistoryTable, { records: [paid] });
    expect(table.text()).toContain("$225.00"); expect(table.text()).toContain("of 1 days");
    expect(table.text()).not.toContain("Horas extras");
  });
  it("renders translated task cards and preserves user-created titles", async () => {
    auth.user = { id: 7, name: "Person", locale: "en-US" };
    const settings = { ...defaultWorkSettings, timezone: "UTC" };
    const day = { date: "2026-10-17", timezone: "UTC", regime: settings, entries: { ...emptyWorkEntries }, instants: {}, version: 0 };
    vi.stubGlobal("fetch", vi.fn(async (url) => respond(url.startsWith("/api/profile/work-hours")
      ? { settings, day, active_day: day, today: day.date, settings_version: 0, server_now: now.toISOString() }
      : { projects: [{ id: 1, title: "Calendário", cover: "desk" }], tasks: [{ id: 1, project_id: 1, title: "Projetos", description: "", activities: [], status: "pending", blocked_count: 0, comments_count: 0, completed_count: 0 }], roadmaps: [] })));
    const wrapper = open(App); await flushPromises();
    expect(wrapper.get(".task-card h4").text()).toBe("Projetos");
    expect(wrapper.get(".task-card .project-label").text()).toBe("Calendário");
    expect(wrapper.get(".task-card").attributes("aria-label")).toBe("Open task Projetos");
    expect(wrapper.text()).toContain("My workspace");
  });
});
