import { defaultWorkSettings, parseWorkTime, workDateInTimezone } from "../workHours";

export const timeMinutes = parseWorkTime;

export function clock(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  const minutes = (Math.round(value) % 1440 + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function duration(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value > 0 && value < 0.5) return "menos de 1min";
  const minutes = Math.round(Math.abs(value));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${String(minutes % 60).padStart(2, "0")}min` : `${minutes}min`;
}

export function money(value) {
  return value == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function dateLabel(date, options = {}) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "short", ...options }).format(new Date(`${date}T12:00:00Z`));
}

export function historyRecord(record, now) {
  const regime = { ...defaultWorkSettings, ...record.regime };
  const instant = (key) => record.instants?.[key] ? Date.parse(record.instants[key]) : null;
  const started = instant("startedAt");
  const lunchOut = instant("lunchOut");
  const lunchIn = instant("lunchIn");
  const finished = instant("finishedAt");
  const current = now.getTime();
  const complete = [started, lunchOut, lunchIn, finished].every((value) => value !== null && Number.isFinite(value));
  const ongoing = !complete && started !== null && started <= current && current - started < 86400000;
  const interval = (start, end) => start === null || end === null ? 0 : Math.max(0, end - start) / 60000;
  const worked = interval(started, lunchOut ?? (ongoing ? current : null))
    + interval(lunchIn, finished ?? (ongoing ? current : null));
  const target = Number(regime.weeklyHours) * 60 / Number(regime.daysPerWeek);
  const overtime = Math.max(0, worked - target);
  const hasSalary = regime.monthlySalary !== "" && regime.monthlySalary != null && Number(regime.monthlySalary) > 0;
  const overtimeRate = hasSalary ? Number(regime.monthlySalary) / Number(regime.monthlyHours) * (1 + Number(regime.overtimePremium) / 100) : null;
  return {
    ...record,
    ...record.entries,
    regime,
    worked,
    overtime,
    target,
    overtimeRate,
    lunch: lunchOut !== null && lunchIn !== null ? interval(lunchOut, lunchIn) : null,
    estimated: overtimeRate === null ? null : Math.round(overtime / 60 * overtimeRate * 100) / 100,
    received: record.receipt?.amount ?? 0,
    receivedOn: record.receipt?.received_on || "",
    receiptVersion: record.receipt?.version ?? 0,
    status: complete ? "complete" : ongoing ? "ongoing" : "pending",
    today: workDateInTimezone(now, record.timezone),
  };
}

function averageClock(values) {
  if (!values.length) return null;
  const radians = values.map((value) => timeMinutes(value) / 1440 * Math.PI * 2);
  const sine = radians.reduce((sum, value) => sum + Math.sin(value), 0);
  const cosine = radians.reduce((sum, value) => sum + Math.cos(value), 0);
  if (Math.hypot(sine, cosine) < 1e-8) return null;
  return (Math.atan2(sine, cosine) / (Math.PI * 2) * 1440 + 1440) % 1440;
}

export function summarizeHistory(records) {
  const complete = records.filter((record) => record.status === "complete");
  const sum = (key, source = records) => source.reduce((total, record) => total + (record[key] ?? 0), 0);
  const unvaluedDays = records.filter((record) => record.overtime > 0 && record.estimated == null).length;
  const valuedExtras = records.some((record) => record.overtime > 0 && record.estimated != null);
  return {
    days: records.length,
    complete: complete.length,
    pending: records.filter((record) => record.status === "pending").length,
    worked: sum("worked"),
    overtime: sum("overtime"),
    estimated: unvaluedDays && !valuedExtras ? null : Math.round(sum("estimated") * 100) / 100,
    unvaluedDays,
    received: Math.round(sum("received") * 100) / 100,
    averageWorked: complete.length ? sum("worked", complete) / complete.length : null,
    averageLunch: complete.length ? sum("lunch", complete) / complete.length : null,
    averageArrival: averageClock(complete.map((record) => record.startedAt)),
    averageDeparture: averageClock(complete.map((record) => record.finishedAt)),
    extraDays: records.filter((record) => record.overtime > 0).length,
    balance: complete.reduce((sum, record) => sum + record.worked - record.target, 0),
  };
}
