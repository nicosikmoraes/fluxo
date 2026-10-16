export const defaultWorkSettings = {
  enabled: false,
  weeklyHours: 44,
  daysPerWeek: 5,
  monthlySalary: "",
  monthlyHours: 220,
  overtimePremium: 50,
};

export const emptyWorkEntries = {
  startedAt: "",
  lunchOut: "",
  lunchIn: "",
  finishedAt: "",
};

export const workSteps = [
  { key: "startedAt", label: "Entrada", description: "O começo do seu dia" },
  { key: "lunchOut", label: "Saída para o almoço", description: "Hora de fazer uma pausa" },
  { key: "lunchIn", label: "Retorno do almoço", description: "De volta ao seu ritmo" },
  { key: "finishedAt", label: "Saída do trabalho", description: "Seu tempo de descansar" },
];

export function parseWorkTime(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || "")) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatWorkTime(minutes) {
  if (!Number.isFinite(minutes)) return "—";
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function formatWorkDuration(seconds) {
  if (seconds > 0 && seconds < 60) return "menos de 1min";
  const totalMinutes = Math.round(Math.max(0, seconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}min`;
  return minutes ? `${hours}h ${String(minutes).padStart(2, "0")}min` : `${hours}h`;
}

export function formatWorkMoney(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function validateWorkSettings(settings) {
  const errors = {};
  const weeklyHours = Number(settings.weeklyHours);
  const days = Number(settings.daysPerWeek);
  if (!Number.isFinite(weeklyHours) || weeklyHours <= 0 || weeklyHours > 168) {
    errors.weeklyHours = "Informe uma jornada semanal maior que zero e de até 168 horas.";
  }
  if (!Number.isInteger(days) || days < 1 || days > 7) {
    errors.daysPerWeek = "Escolha de 1 a 7 dias por semana.";
  }
  if (!errors.weeklyHours && !errors.daysPerWeek && weeklyHours / days > 24) {
    errors.weeklyHours = "A jornada diária não pode ultrapassar 24 horas.";
  }
  if (settings.monthlySalary !== "" && settings.monthlySalary != null) {
    if (!Number.isFinite(Number(settings.monthlySalary)) || Number(settings.monthlySalary) <= 0) {
      errors.monthlySalary = "Informe um salário maior que zero ou deixe em branco.";
    }
    if (!Number.isFinite(Number(settings.monthlyHours)) || Number(settings.monthlyHours) <= 0) {
      errors.monthlyHours = "Informe a base de horas mensais do seu contrato.";
    }
    if (!Number.isFinite(Number(settings.overtimePremium)) || Number(settings.overtimePremium) < 0) {
      errors.overtimePremium = "Informe um adicional igual ou maior que zero.";
    }
  }
  return errors;
}

export function getWorkTimeline(entries, { allowEqual = false } = {}) {
  const timeline = {};
  let previous = null;
  let dayOffset = 0;
  let missingPrevious = false;

  for (const { key } of workSteps) {
    const value = entries[key];
    if (!value) {
      missingPrevious = true;
      continue;
    }
    if (missingPrevious) return { error: "Preencha os horários na ordem, começando pela entrada." };
    const minutes = parseWorkTime(value);
    if (minutes === null) return { error: "Confira os horários informados." };
    let absoluteMinutes = minutes + dayOffset;
    if (previous !== null && absoluteMinutes < previous) {
      dayOffset += 1440;
      absoluteMinutes += 1440;
    }
    if (!allowEqual && previous !== null && absoluteMinutes === previous) {
      return { error: "Cada registro precisa acontecer depois do anterior." };
    }
    timeline[key] = absoluteMinutes;
    previous = absoluteMinutes;
  }

  if (previous !== null && previous - timeline.startedAt > 1440) {
    return { error: "Confira a sequência: os registros devem caber em uma jornada de até 24 horas." };
  }
  return { timeline, error: "" };
}

export function calculateWorkDay(settings, entries, nowMinutes, options = {}) {
  const settingsErrors = validateWorkSettings(settings);
  const { timeline = {}, error = "" } = getWorkTimeline(entries, options);
  if (Object.keys(settingsErrors).length || error) {
    return { valid: false, error: error || "Confira as configurações da jornada.", settingsErrors };
  }

  const targetSeconds = Number(settings.weeklyHours) * 3600 / Number(settings.daysPerWeek);
  const returned = timeline.lunchIn !== undefined;
  const finished = timeline.finishedAt !== undefined;
  let currentMinutes = Number.isFinite(nowMinutes) ? nowMinutes : 0;
  if (timeline.startedAt !== undefined && currentMinutes < timeline.startedAt && timeline.startedAt >= 18 * 60) {
    currentMinutes += 1440;
  }

  let workedSeconds = 0;
  if (timeline.startedAt !== undefined) {
    const firstEnd = timeline.lunchOut ?? currentMinutes;
    workedSeconds = Math.max(0, firstEnd - timeline.startedAt) * 60;
    if (returned) {
      workedSeconds += Math.max(0, (timeline.finishedAt ?? currentMinutes) - timeline.lunchIn) * 60;
    }
  }

  const lunchSeconds = returned ? (timeline.lunchIn - timeline.lunchOut) * 60 : 0;
  const departureMinutes = returned ? timeline.startedAt + (targetSeconds + lunchSeconds) / 60 : null;
  const overtimeSeconds = Math.max(0, workedSeconds - targetSeconds);
  const hasSalary = settings.monthlySalary !== "" && settings.monthlySalary != null;
  const hourlyRate = hasSalary ? Number(settings.monthlySalary) / Number(settings.monthlyHours) : null;
  const overtimeRate = hasSalary ? hourlyRate * (1 + Number(settings.overtimePremium) / 100) : null;

  return {
    valid: true,
    error: "",
    settingsErrors,
    targetSeconds,
    workedSeconds,
    lunchSeconds,
    remainingSeconds: Math.max(0, targetSeconds - workedSeconds),
    overtimeSeconds,
    departureMinutes,
    departureNextDay: departureMinutes !== null && departureMinutes >= 1440,
    progress: Math.min(100, workedSeconds / targetSeconds * 100),
    returned,
    finished,
    hourlyRate,
    overtimeRate,
    overtimeMoney: overtimeRate === null ? null : overtimeSeconds / 3600 * overtimeRate,
    status: finished ? "finished" : overtimeSeconds > 0 ? "overtime" : returned ? "working" : timeline.lunchOut !== undefined ? "lunch" : timeline.startedAt !== undefined ? "morning" : "idle",
    showWidget: Boolean(settings.enabled && returned),
  };
}

export function workDateInTimezone(value, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(value);
  const part = (name) => parts.find((item) => item.type === name).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function workTimeInTimezone(value, timezone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(value);
}

export function calculateRecordedWorkDay(settings, record, now = new Date()) {
  if (!record) return { valid: false, showWidget: false };
  const regime = { ...defaultWorkSettings, ...record.regime, enabled: settings.enabled };
  const day = calculateWorkDay(regime, record.entries, 0, { allowEqual: true });
  if (!day.valid) return day;
  const instant = (key) => record.instants?.[key] ? Date.parse(record.instants[key]) : null;
  const started = instant("startedAt");
  if (started === null) return { ...day, showWidget: false };
  const lunchOut = instant("lunchOut");
  const lunchIn = instant("lunchIn");
  const finished = instant("finishedAt");
  const current = now.getTime();
  const workedSeconds = Math.max(0, (lunchOut ?? current) - started) / 1000
    + (lunchIn === null ? 0 : Math.max(0, (finished ?? current) - lunchIn) / 1000);
  const lunchSeconds = lunchIn === null ? 0 : (lunchIn - lunchOut) / 1000;
  const overtimeSeconds = Math.max(0, workedSeconds - day.targetSeconds);
  const expected = new Date(started + (day.targetSeconds + lunchSeconds) * 1000);
  const departureDate = workDateInTimezone(expected, record.timezone);
  const departureNextDay = departureDate > record.date;
  const departureMinutes = parseWorkTime(workTimeInTimezone(expected, record.timezone)) + (departureNextDay ? 1440 : 0);
  const stale = finished === null && current - started >= 86400000;

  return {
    ...day,
    workedSeconds,
    lunchSeconds,
    remainingSeconds: Math.max(0, day.targetSeconds - workedSeconds),
    overtimeSeconds,
    overtimeMoney: day.overtimeRate === null ? null : overtimeSeconds / 3600 * day.overtimeRate,
    departureMinutes: lunchIn === null ? null : departureMinutes,
    departureNextDay,
    progress: Math.min(100, workedSeconds / day.targetSeconds * 100),
    status: finished !== null ? "finished" : overtimeSeconds > 0 ? "overtime" : day.status,
    showWidget: Boolean(settings.enabled && day.returned && !stale),
    stale,
  };
}
