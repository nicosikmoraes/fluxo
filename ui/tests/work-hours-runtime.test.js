import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { h } from "vue";
import { auth, apiRequest } from "../src/features/auth/auth";
import { notify } from "../src/state/workspace";
import ProfileSettings from "../src/features/work-hours/ProfileSettings.vue";
import { useWorkHours } from "../src/features/work-hours/useWorkHours";
import { defaultWorkSettings, emptyWorkEntries } from "../src/features/work-hours/workHours";
import { setLocale } from "../src/state/locale";

vi.mock("../src/features/auth/auth", async () => {
  const { reactive } = await import("vue");
  return { auth: reactive({ user: null }), apiRequest: vi.fn() };
});
vi.mock("../src/state/workspace", () => ({ notify: vi.fn() }));

const wrappers = [];

function response(enabled = true) {
  const settings = { ...defaultWorkSettings, enabled, monthlySalary: 4400, timezone: "UTC" };
  const record = {
    date: "2026-10-16", timezone: "UTC", version: 1, regime: settings,
    entries: { startedAt: "08:00", lunchOut: "12:00", lunchIn: "13:00", finishedAt: "" },
    instants: { startedAt: "2026-10-16T08:00:00Z", lunchOut: "2026-10-16T12:00:00Z", lunchIn: "2026-10-16T13:00:00Z", finishedAt: null },
  };
  return { settings, settings_version: 1, today: "2026-10-16", day: record, active_day: record, server_now: "2026-10-16T16:24:00Z" };
}

function open() {
  let runtime;
  const wrapper = mount({ setup() {
    runtime = useWorkHours();
    return () => h(ProfileSettings, { workHours: runtime });
  } });
  wrappers.push(wrapper);
  return { wrapper, runtime };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-16T16:24:00Z"));
  auth.user = { id: 77, name: "Pessoa de teste", email: "teste@example.com", billing: { plan: "pro", entitlements: { work_tracking: true, pay_calculation: true } } };
  vi.mocked(apiRequest).mockReset().mockResolvedValue(response());
  vi.mocked(notify).mockReset();
  localStorage.clear();
  setLocale("pt-BR");
});

afterEach(() => {
  wrappers.forEach((wrapper) => wrapper.unmount());
  wrappers.length = 0;
  vi.useRealTimers();
});

describe("Jornada conectada à conta", () => {
  it("não carrega registros, calcula nem inicia contador para a conta gratuita", async () => {
    auth.user.billing = { plan: "free", entitlements: { work_tracking: false, pay_calculation: false } };
    const { wrapper, runtime } = open();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(120000);
    await runtime.read();
    await runtime.save({ settings: { enabled: true } });
    await runtime.act("start");

    expect(apiRequest).not.toHaveBeenCalled();
    expect(runtime.day.value).toEqual({ valid: false, showWidget: false });
    expect(wrapper.find(".work-settings").exists()).toBe(false);
    expect(wrapper.find(".work-tracking-upgrade").exists()).toBe(true);
  });

  it("descarta a resposta pendente e para o widget ao perder a assinatura", async () => {
    let complete;
    vi.mocked(apiRequest).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    const { wrapper, runtime } = open();
    auth.user.billing.entitlements.work_tracking = false;
    complete(response());
    await flushPromises();
    await vi.advanceTimersByTimeAsync(120000);

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(runtime.state.data).toBeNull();
    expect(runtime.day.value).toEqual({ valid: false, showWidget: false });
    expect(wrapper.find(".work-settings").exists()).toBe(false);
  });

  it("interrompe o acompanhamento se o servidor informar que a assinatura terminou", async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(Object.assign(new Error("Assinatura necessária."), { status: 403 }));
    const { wrapper, runtime } = open();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(120000);

    expect(runtime.canTrack.value).toBe(false);
    expect(wrapper.find(".work-tracking-upgrade").exists()).toBe(true);
    expect(apiRequest).toHaveBeenCalledTimes(1);

    auth.user.billing.entitlements.work_tracking = true;
    await flushPromises();

    expect(runtime.state.data.day.date).toBe("2026-10-16");
    expect(wrapper.find(".work-settings").exists()).toBe(true);
  });
  it("carrega os dados salvos e atualiza o contador sem novas gravações", async () => {
    const { wrapper, runtime } = open();
    await flushPromises();
    expect(wrapper.find("#work-weekly").element.value).toBe("44");
    expect(wrapper.find("#work-lunchIn").element.value).toBe("13:00");
    expect(runtime.day.value.remainingSeconds).toBe(84 * 60);
    await vi.advanceTimersByTimeAsync(30000);
    expect(runtime.day.value.remainingSeconds).toBe(84 * 60 - 30);
    expect(vi.mocked(apiRequest)).toHaveBeenCalledTimes(1);
  });

  it("mantém o formulário e mostra o erro quando a gravação falha", async () => {
    const { wrapper, runtime } = open();
    await flushPromises();
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error("Não foi possível salvar."));
    await wrapper.find("#work-weekly").setValue("40");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toContain("Não foi possível salvar");
    expect(wrapper.find("#work-weekly").element.value).toBe("40");
    expect(runtime.state.data.settings.weeklyHours).toBe(44);
    expect(vi.mocked(notify)).not.toHaveBeenCalled();
  });

  it("mantém a versão original do formulário durante uma atualização de outra aba", async () => {
    const { wrapper, runtime } = open();
    await flushPromises();
    await wrapper.find("#work-weekly").setValue("40");
    vi.mocked(apiRequest).mockResolvedValueOnce({ ...response(), settings_version: 2 });
    await runtime.read();
    await flushPromises();
    const conflict = Object.assign(new Error("As configurações mudaram em outra aba."), { status: 409 });
    vi.mocked(apiRequest).mockRejectedValueOnce(conflict);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(vi.mocked(apiRequest).mock.lastCall[2].settings_version).toBe(1);
    expect(wrapper.find('[role="alert"]').text()).toContain("outra aba");
  });

  it("grava a saída pelo servidor e congela o contador", async () => {
    const { runtime } = open();
    await flushPromises();
    const finished = response();
    finished.day.entries.finishedAt = "16:24";
    finished.day.instants.finishedAt = "2026-10-16T16:24:00Z";
    finished.day.version = 2;
    vi.mocked(apiRequest).mockResolvedValueOnce(finished);
    await runtime.finish();
    expect(vi.mocked(apiRequest).mock.lastCall).toEqual(["/profile/work-hours/records", "POST", { date: "2026-10-16", entry_version: 1, action: "finish" }]);
    const worked = runtime.day.value.workedSeconds;
    await vi.advanceTimersByTimeAsync(20000);
    expect(runtime.day.value.workedSeconds).toBe(worked);
    expect(runtime.day.value.finished).toBe(true);
  });

  it("descarta respostas da conta anterior após uma troca de usuário", async () => {
    let resolve;
    vi.mocked(apiRequest).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const { runtime } = open();
    auth.user = { id: 88 };
    resolve(response());
    await flushPromises();
    expect(runtime.state.data).toBeNull();
    expect(runtime.day.value.showWidget).toBe(false);
  });

  it("só guarda a preferência visual do widget no navegador", async () => {
    const { runtime } = open();
    await flushPromises();
    runtime.expanded.value = true;
    await flushPromises();
    expect(localStorage.getItem("fluxo:work-widget:77")).toBe("expanded");
    expect(JSON.stringify({ ...localStorage })).not.toContain("4400");
  });

  it("carrega um dia vazio depois da troca de data, sem reutilizar os registros anteriores", async () => {
    const old = response();
    old.day.entries.finishedAt = "16:24";
    old.day.instants.finishedAt = "2026-10-16T16:24:00Z";
    vi.mocked(apiRequest).mockResolvedValueOnce(old);
    const { wrapper, runtime } = open();
    await flushPromises();
    const next = response();
    next.today = "2026-10-17";
    next.server_now = "2026-10-17T00:01:00Z";
    next.day = { ...next.day, date: "2026-10-17", entries: { ...emptyWorkEntries }, instants: {}, version: 0 };
    next.active_day = next.day;
    vi.mocked(apiRequest).mockResolvedValueOnce(next);
    await runtime.read();
    expect(runtime.day.value.showWidget).toBe(true);
    expect(runtime.state.data.active_day.date).toBe("2026-10-17");
    expect(wrapper.find("#work-date").element.value).toBe("2026-10-17");
  });

  it("preserva as alterações pendentes quando o usuário tenta trocar de data", async () => {
    const { wrapper } = open();
    await flushPromises();
    await wrapper.find("#work-weekly").setValue("40");
    await wrapper.find("#work-date").setValue("2026-10-15");
    expect(wrapper.find("#work-date").element.value).toBe("2026-10-16");
    expect(wrapper.find("#work-weekly").element.value).toBe("40");
    expect(wrapper.find('[role="alert"]').text()).toContain("Salve suas alterações");
    expect(vi.mocked(apiRequest)).toHaveBeenCalledTimes(1);
  });

  it("salva a ativação antes de registrar a entrada com o relógio do servidor", async () => {
    const initial = response(false);
    initial.settings.monthlySalary = null;
    initial.day.entries = { ...emptyWorkEntries };
    initial.day.instants = {};
    initial.day.version = 0;
    const saved = structuredClone(initial);
    saved.settings.enabled = true;
    saved.settings_version = 2;
    const recorded = structuredClone(saved);
    recorded.day.entries.startedAt = "16:24";
    recorded.day.instants.startedAt = "2026-10-16T16:24:15Z";
    recorded.day.version = 1;
    recorded.server_now = "2026-10-16T16:24:15Z";
    vi.mocked(apiRequest).mockReset().mockResolvedValueOnce(initial).mockResolvedValueOnce(saved).mockResolvedValueOnce(recorded);
    const { wrapper } = open();
    await flushPromises();
    await wrapper.find('[role="switch"]').trigger("click");
    await wrapper.find(".work-record-now").trigger("click");
    await flushPromises();
    expect(vi.mocked(apiRequest).mock.calls[1][1]).toBe("PUT");
    expect(vi.mocked(apiRequest).mock.calls[1][2].settings.enabled).toBe(true);
    expect(vi.mocked(apiRequest).mock.calls[2]).toEqual(["/profile/work-hours/records", "POST", { date: "2026-10-16", entry_version: 0, step: "startedAt" }]);
    expect(wrapper.find("#work-startedAt").element.value).toBe("16:24");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });
});
