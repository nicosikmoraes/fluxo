import { afterEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import WorkHoursPrototype from "../src/prototypes/work-hours/WorkHoursPrototype.vue";
import { calculateRecordedWorkDay, calculateWorkDay, defaultWorkSettings, emptyWorkEntries, formatWorkDuration, getWorkTimeline, validateWorkSettings } from "../src/features/work-hours/workHours";

const settings = { ...defaultWorkSettings, enabled: true, monthlySalary: 4400 };
const entries = { startedAt: "08:00", lunchOut: "12:00", lunchIn: "13:00", finishedAt: "" };
const wrappers = [];

afterEach(() => {
  wrappers.forEach((wrapper) => wrapper.unmount());
  wrappers.length = 0;
});

describe("Cálculo da jornada", () => {
  it("divide 44 horas em cinco dias e desconta o almoço da previsão de saída", () => {
    const day = calculateWorkDay(settings, entries, 16 * 60 + 24);
    expect(day.targetSeconds).toBe(8 * 3600 + 48 * 60);
    expect(day.lunchSeconds).toBe(3600);
    expect(day.departureMinutes).toBe(17 * 60 + 48);
    expect(day.workedSeconds).toBe(7 * 3600 + 24 * 60);
    expect(day.remainingSeconds).toBe(84 * 60);
    expect(formatWorkDuration(day.targetSeconds)).toBe("8h 48min");
  });

  it("calcula 42 minutos extras e R$ 21 com salário 4400, base 220 e adicional 50%", () => {
    const day = calculateWorkDay(settings, entries, 18 * 60 + 30);
    expect(day.overtimeSeconds).toBe(42 * 60);
    expect(day.hourlyRate).toBe(20);
    expect(day.overtimeRate).toBe(30);
    expect(day.overtimeMoney).toBeCloseTo(21);
    expect(day.status).toBe("overtime");
  });

  it("mantém as horas extras quando o salário não é informado", () => {
    const day = calculateWorkDay({ ...settings, monthlySalary: "" }, entries, 1110);
    expect(day.overtimeSeconds).toBe(2520);
    expect(day.overtimeMoney).toBeNull();
  });

  it("congela os totais no horário de saída", () => {
    const day = calculateWorkDay(settings, { ...entries, finishedAt: "18:00" }, 22 * 60);
    expect(day.workedSeconds).toBe(9 * 3600);
    expect(day.overtimeSeconds).toBe(12 * 60);
    expect(day.overtimeMoney).toBeCloseTo(6);
    expect(day.status).toBe("finished");
  });

  it("distingue a saída antes da meta sem gerar extras negativos", () => {
    const day = calculateWorkDay(settings, { ...entries, finishedAt: "17:00" }, 1110);
    expect(day.remainingSeconds).toBe(48 * 60);
    expect(day.overtimeSeconds).toBe(0);
  });

  it("só mostra o widget depois do terceiro horário e com o recurso ativado", () => {
    expect(calculateWorkDay(settings, { ...entries, lunchIn: "" }, 755).showWidget).toBe(false);
    expect(calculateWorkDay({ ...settings, enabled: false }, entries, 984).showWidget).toBe(false);
    expect(calculateWorkDay(settings, entries, 984).showWidget).toBe(true);
    expect(calculateWorkDay(settings, emptyWorkEntries, 984).showWidget).toBe(false);
  });

  it("acompanha uma jornada que atravessa a meia-noite", () => {
    const day = calculateWorkDay(settings, { startedAt: "22:00", lunchOut: "02:00", lunchIn: "03:00", finishedAt: "" }, 6 * 60);
    expect(day.valid).toBe(true);
    expect(day.workedSeconds).toBe(7 * 3600);
    expect(day.departureMinutes).toBe(1440 + 7 * 60 + 48);
    expect(day.departureNextDay).toBe(true);
  });

  it("rejeita lacunas e sequências maiores que 24 horas", () => {
    expect(getWorkTimeline({ ...entries, lunchOut: "" }).error).toBeTruthy();
    expect(getWorkTimeline({ ...entries, lunchIn: "11:00" }).error).toBeTruthy();
  });

  it("valida o regime e impede divisões por zero", () => {
    expect(validateWorkSettings({ ...settings, daysPerWeek: 0 }).daysPerWeek).toBeTruthy();
    expect(validateWorkSettings({ ...settings, monthlyHours: 0 }).monthlyHours).toBeTruthy();
    expect(validateWorkSettings({ ...settings, weeklyHours: 100, daysPerWeek: 3 }).weeklyHours).toBeTruthy();
    expect(calculateWorkDay({ ...settings, daysPerWeek: 0 }, entries, 984).valid).toBe(false);
  });

  it("usa a base mensal e o adicional escolhidos pelo usuário", () => {
    const day = calculateWorkDay({ ...settings, monthlyHours: 200, overtimePremium: 100 }, entries, 1110);
    expect(day.overtimeRate).toBe(44);
    expect(day.overtimeMoney).toBeCloseTo(30.8);
  });

  it("usa instantes persistidos para atravessar a meia-noite sem depender da hora de entrada", () => {
    const record = {
      date: "2026-10-16", timezone: "America/Sao_Paulo", regime: settings,
      entries: { startedAt: "16:00", lunchOut: "20:00", lunchIn: "21:00", finishedAt: "" },
      instants: { startedAt: "2026-10-16T19:00:00Z", lunchOut: "2026-10-16T23:00:00Z", lunchIn: "2026-10-17T00:00:00Z", finishedAt: null },
    };
    const day = calculateRecordedWorkDay(settings, record, new Date("2026-10-17T04:30:00Z"));
    expect(day.workedSeconds).toBe(8.5 * 3600);
    expect(day.remainingSeconds).toBe(18 * 60);
    expect(day.departureMinutes).toBe(1440 + 108);
    expect(day.departureNextDay).toBe(true);
  });

  it("calcula o tempo real quando o fuso muda durante uma jornada", () => {
    const record = {
      date: "2026-03-08", timezone: "America/New_York", regime: settings,
      entries: { startedAt: "00:00", lunchOut: "04:00", lunchIn: "05:00", finishedAt: "" },
      instants: { startedAt: "2026-03-08T05:00:00Z", lunchOut: "2026-03-08T08:00:00Z", lunchIn: "2026-03-08T09:00:00Z", finishedAt: null },
    };
    const day = calculateRecordedWorkDay(settings, record, new Date("2026-03-08T13:00:00Z"));
    expect(day.workedSeconds).toBe(7 * 3600);
    expect(day.remainingSeconds).toBe(108 * 60);
    expect(day.departureMinutes).toBe(10 * 60 + 48);
  });

  it("interrompe os totais na saída salva e respeita o regime registrado para aquele dia", () => {
    const record = {
      date: "2026-10-16", timezone: "UTC", regime: settings,
      entries: { ...entries, finishedAt: "18:00" },
      instants: { startedAt: "2026-10-16T08:00:00Z", lunchOut: "2026-10-16T12:00:00Z", lunchIn: "2026-10-16T13:00:00Z", finishedAt: "2026-10-16T18:00:00Z" },
    };
    const day = calculateRecordedWorkDay({ ...settings, monthlySalary: 10000 }, record, new Date("2026-10-16T21:00:00Z"));
    expect(day.overtimeSeconds).toBe(12 * 60);
    expect(day.overtimeMoney).toBe(6);
    expect(day.finished).toBe(true);
  });

  it("mantém os segundos dos registros reais mesmo quando os horários visíveis são iguais", () => {
    const record = {
      date: "2026-10-16", timezone: "UTC", regime: settings,
      entries: { startedAt: "09:00", lunchOut: "09:00", lunchIn: "09:00", finishedAt: "09:01" },
      instants: { startedAt: "2026-10-16T09:00:05Z", lunchOut: "2026-10-16T09:00:35Z", lunchIn: "2026-10-16T09:00:50Z", finishedAt: "2026-10-16T09:01:10Z" },
    };
    const day = calculateRecordedWorkDay(settings, record, new Date("2026-10-16T18:00:00Z"));
    expect(day.valid).toBe(true);
    expect(day.workedSeconds).toBe(50);
    expect(day.finished).toBe(true);
  });
});

describe("Protótipo navegável", () => {
  function open() {
    const wrapper = mount(WorkHoursPrototype);
    wrappers.push(wrapper);
    return wrapper;
  }

  it("recolhe e reabre o widget e o mantém ao navegar", async () => {
    const wrapper = open();
    await wrapper.find('[aria-label="Abrir widget da jornada"]').trigger("click");
    expect(wrapper.find(".work-widget-duration").text()).toContain("1h 24min");
    await wrapper.find('[aria-label="Recolher widget da jornada"]').trigger("click");
    expect(wrapper.find(".work-widget").exists()).toBe(false);
    await wrapper.find('[aria-label="Abrir widget da jornada"]').trigger("click");
    expect(wrapper.find(".work-widget").exists()).toBe(true);
    await wrapper.find("nav button").trigger("click");
    expect(wrapper.find(".prototype-board-columns").exists()).toBe(true);
    expect(wrapper.find(".work-widget").exists()).toBe(true);
  });

  it("alterna extras com e sem dinheiro e encerra o contador na saída", async () => {
    const wrapper = open();
    await wrapper.find("#prototype-scenario").setValue("overtime");
    expect(wrapper.find(".work-widget-duration").text()).toContain("+42min");
    expect(wrapper.find(".work-widget-money").text()).toContain("21,00");
    await wrapper.find(".work-widget-finish").trigger("click");
    expect(wrapper.find(".work-widget-status").text()).toContain("encerrada");
    await wrapper.find("#prototype-clock").setValue("20:30");
    expect(wrapper.find(".work-widget-duration").text()).toContain("+42min");
    await wrapper.find("#prototype-scenario").setValue("no-salary");
    expect(wrapper.find(".work-widget-money").exists()).toBe(false);
    expect(wrapper.find(".work-widget-no-salary").exists()).toBe(true);
  });

  it("aguarda o retorno do almoço e respeita a desativação do recurso", async () => {
    const wrapper = open();
    await wrapper.find("#prototype-scenario").setValue("lunch");
    expect(wrapper.find(".work-widget-anchor").exists()).toBe(false);
    await wrapper.find("#work-lunchIn").setValue("12:30");
    expect(wrapper.find(".work-widget-anchor").exists()).toBe(true);
    await wrapper.find('[role="switch"]').trigger("click");
    expect(wrapper.find(".work-widget-anchor").exists()).toBe(false);
    expect(wrapper.find("fieldset").attributes("disabled")).toBeDefined();
  });
});
