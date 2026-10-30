import { currentLocale, formatCurrency, t } from "../../../state/locale";
import {
  calculateRecordedWorkDay,
  defaultWorkSettings,
  parseWorkTime,
  workDateInTimezone
} from "../workHours";

export const timeMinutes = parseWorkTime;

export function clock(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  const minutes = (Math.round(value) % 1440 + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function duration(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value > 0 && value < 0.5) return t("menos de 1min");
  const minutes = Math.round(Math.abs(value));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${String(minutes % 60).padStart(2, "0")}min` : `${minutes}min`;
}

export function money(value) {
  return value == null ? "—" : formatCurrency(value);
}

export function dateLabel(date, options = {}) {
  if (!date) return "—";
  return new Intl.DateTimeFormat(currentLocale.value, {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    ...options
  }).format(new Date(`${date}T12:00:00Z`));
}

export function historyRecord(record, now) {
  const regime = {
    ...defaultWorkSettings,
    ...record.regime,
    overtimeEnabled: currentLocale.value === "en-US" ? false : record.regime?.overtimeEnabled ?? true
  };
  const day = calculateRecordedWorkDay({
    ...regime,
    enabled: true
  }, record, now);
  const complete = Boolean(record.instants?.startedAt && record.instants?.finishedAt);
  const ongoing = !complete && day.started && !day.stale;
  return {
    ...record,
    ...record.entries,
    regime,
    worked: day.workedSeconds / 60,
    overtime: day.overtimeSeconds / 60,
    target: day.targetSeconds == null ? null : day.targetSeconds / 60,
    overtimeRate: day.overtimeRate,
    overtimeBreakdown: day.overtimeBreakdown,
    cycle: day.cycle,
    lunch: record.entries.lunchOut ? day.lunchSeconds / 60 : null,
    estimated: day.overtimeMoney === null ? null : Math.round(day.overtimeMoney * 100) / 100,
    hourlyEarnings: day.hourlyEarnings == null ? null : Math.round(day.hourlyEarnings * 100) / 100,
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
  const withPauses = complete.filter((record) => record.lunch !== null);
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
    unvaluedHourlyDays: records.filter((record) => record.worked > 0 && record.hourlyEarnings == null).length,
    received: Math.round(sum("received") * 100) / 100,
    hourlyEarnings: records.some((record) => record.hourlyEarnings != null) ? Math.round(sum("hourlyEarnings") * 100) / 100 : null,
    averageWorked: complete.length ? sum("worked", complete) / complete.length : null,
    averageLunch: withPauses.length ? sum("lunch", withPauses) / withPauses.length : null,
    averageArrival: averageClock(complete.map((record) => record.startedAt)),
    averageDeparture: averageClock(complete.map((record) => record.finishedAt)),
    extraDays: records.filter((record) => record.overtime > 0).length,
    balance: complete.filter((record) => record.target != null).reduce((sum, record) => sum + record.worked - record.target, 0),
  };
}
