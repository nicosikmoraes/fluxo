export const defaultWorkSettings = {
  enabled: false,
  weeklyHours: 44,
  daysPerWeek: 5,
  monthlySalary: "",
  monthlyHours: 220,
  overtimePremium: 50,
  cycleClosingDay: 31,
};

export const emptyWorkEntries = {
  startedAt: "",
  lunchOut: "",
  lunchIn: "",
  finishedAt: "",
};

export const workSteps = [
  {
    key: "startedAt",
    label: "Entrada",
    description: "O começo do seu dia"
  },
  {
    key: "lunchOut",
    label: "Início da pausa",
    description: "Hora de fazer uma pausa"
  },
  {
    key: "lunchIn",
    label: "Retorno da pausa",
    description: "De volta ao seu ritmo"
  },
  {
    key: "finishedAt",
    label: "Saída do trabalho",
    description: "Seu tempo de descansar"
  },
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
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
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
  if (!Number.isInteger(Number(settings.cycleClosingDay ?? 31)) || Number(settings.cycleClosingDay ?? 31) < 1 || Number(
      settings.cycleClosingDay ?? 31) > 31) errors.cycleClosingDay = "Escolha um dia de fechamento entre 1 e 31.";
  return errors;
}

export function isWorkWeekend(date) {
  return [0, 6].includes(new Date(date + "T12:00:00Z").getUTCDay());
}

export function payrollCycle(date, closingDay = 31, offset = 0) {
  const value = new Date(date + "T12:00:00Z");
  const close = (year, month) => new Date(Date.UTC(year, month, Math.min(Number(closingDay), new Date(Date.UTC(year,
    month + 1, 0)).getUTCDate()), 12));
  let end = close(value.getUTCFullYear(), value.getUTCMonth());
  if (value > end) end = close(end.getUTCFullYear(), end.getUTCMonth() + 1);
  end = close(end.getUTCFullYear(), end.getUTCMonth() + offset);
  const start = close(end.getUTCFullYear(), end.getUTCMonth() - 1);
  start.setUTCDate(start.getUTCDate() + 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

export function overtimeValue(settings, date, seconds, context = {}) {
  const previous = Number(context.previous_seconds || 0);
  const threshold = Number(context.threshold_seconds ?? 72000);
  const sunday = new Date(date + "T12:00:00Z").getUTCDay() === 0;
  const base = Number(settings.overtimePremium);
  const first = Math.min(seconds, Math.max(0, threshold - previous));
  const parts = sunday ? [{
    seconds,
    premium: 100
  }] : [
    {
      seconds: first,
      premium: base
    },
    {
      seconds: seconds - first,
      premium: 75
    },
  ];
  const hasSalary = Number(settings.monthlySalary) > 0 && Number(settings.monthlyHours) > 0;
  const hourlyRate = hasSalary ? Number(settings.monthlySalary) / Number(settings.monthlyHours) : null;
  const premium = sunday ? 100 : previous + seconds >= threshold ? 75 : base;
  return {
    hourlyRate,
    overtimeRate: hourlyRate === null ? null : hourlyRate * (1 + premium / 100),
    overtimeMoney: hourlyRate === null ? null : parts.reduce((sum, part) => sum + part.seconds / 3600 * hourlyRate * (
      1 + part.premium / 100), 0),
    overtimeBreakdown: parts.filter((part) => part.seconds > 0),
    currentPremium: premium,
    cycleOvertimeSeconds: previous + seconds,
    cycle: context.start ? {
      start: context.start,
      end: context.end
    } : payrollCycle(date, settings.cycleClosingDay),
  };
}

export function getWorkTimeline(entries, {
  allowEqual = false,
  additionalBreaks = []
} = {}) {
  const timeline = {};
  const pauses = [];
  if (!entries.startedAt && Object.values(entries).some(Boolean)) return {
    error: "Preencha a entrada antes dos demais horários."
  };
  if (entries.lunchIn && !entries.lunchOut) return {
    error: "Informe o início da pausa."
  };
  if (additionalBreaks.length && !entries.lunchIn) return {
    error: "Complete a primeira pausa antes de adicionar outra."
  };
  const steps = [["startedAt", entries.startedAt]];
  const breaks = entries.lunchOut ? [{
    startedAt: entries.lunchOut,
    finishedAt: entries.lunchIn
  }, ...additionalBreaks] : [];
  for (const [index, pause] of breaks.entries()) {
    if (!pause.startedAt) return {
      error: "Informe o início de cada pausa."
    };
    if (!pause.finishedAt && (entries.finishedAt || index < breaks.length - 1)) return {
      error: "Informe o retorno da pausa antes de continuar."
    };
    steps.push(["pauseStart" + index, pause.startedAt], ["pauseEnd" + index, pause.finishedAt]);
  }
  steps.push(["finishedAt", entries.finishedAt]);
  let previous = null;
  let offset = 0;
  for (const [key, value] of steps) {
    if (!value) continue;
    const minutes = parseWorkTime(value);
    if (minutes === null) return {
      error: "Confira os horários informados."
    };
    let absolute = minutes + offset;
    if (previous !== null && absolute < previous) {
      offset += 1440;
      absolute += 1440;
    }
    if (!allowEqual && previous === absolute) return {
      error: "Cada registro precisa acontecer depois do anterior."
    };
    timeline[key] = absolute;
    previous = absolute;
  }
  if (previous !== null && previous - timeline.startedAt > 1440) return {
    error: "A jornada deve caber em até 24 horas."
  };
  breaks.forEach((pause, index) => pauses.push({
    start: timeline["pauseStart" + index],
    end: timeline["pauseEnd" + index] ?? null
  }));
  if (pauses.length) {
    timeline.lunchOut = pauses[0].start;
    timeline.lunchIn = pauses[0].end ?? undefined;
  }
  return {
    timeline,
    pauses,
    error: ""
  };
}

function measureWork(started, finished, pauses, current, live = true) {
  if (started === null) return {
    workedSeconds: 0,
    lunchSeconds: 0,
    paused: false
  };
  let cursor = started;
  let workedSeconds = 0;
  let lunchSeconds = 0;
  for (const pause of pauses) {
    workedSeconds += Math.max(0, pause.start - cursor);
    lunchSeconds += Math.max(0, (pause.end ?? (live ? current : pause.start)) - pause.start);
    if (pause.end === null) return {
      workedSeconds,
      lunchSeconds,
      paused: true
    };
    cursor = pause.end;
  }
  workedSeconds += Math.max(0, (finished ?? (live ? current : cursor)) - cursor);
  return {
    workedSeconds,
    lunchSeconds,
    paused: false
  };
}

function workSummary(settings, date, started, finished, pauses, current, context, live = true) {
  const weekend = isWorkWeekend(date);
  const targetSeconds = weekend ? 0 : Number(settings.weeklyHours) * 3600 / Number(settings.daysPerWeek);
  const measured = measureWork(started, finished, pauses, current, live);
  const overtimeSeconds = Math.max(0, measured.workedSeconds - targetSeconds);
  return {
    valid: true,
    error: "",
    settingsErrors: {},
    ...measured,
    targetSeconds,
    overtimeSeconds,
    weekend,
    remainingSeconds: Math.max(0, targetSeconds - measured.workedSeconds),
    progress: targetSeconds ? Math.min(100, measured.workedSeconds / targetSeconds * 100) : started === null ? 0 : 100,
    returned: started !== null && !measured.paused,
    started: started !== null,
    finished: finished !== null,
    status: finished !== null ? "finished" : started === null ? "idle" : measured.paused ? "lunch" : overtimeSeconds >
      0 ? "overtime" : "working",
    showWidget: Boolean(settings.enabled),
    ...overtimeValue(settings, date, overtimeSeconds, context),
  };
}

export function calculateWorkDay(settings, entries, nowMinutes, options = {}) {
  const settingsErrors = validateWorkSettings(settings);
  const {
    timeline = {}, pauses = [], error
  } = getWorkTimeline(entries, options);
  if (Object.keys(settingsErrors).length || error) return {
    valid: false,
    error: error || "Confira as configurações da jornada.",
    settingsErrors
  };
  const date = options.date || workDateInTimezone(new Date(), settings.timezone || "UTC");
  let current = Number.isFinite(nowMinutes) ? nowMinutes : 0;
  if (timeline.startedAt !== undefined && current < timeline.startedAt && timeline.startedAt >= 1080) current += 1440;
  const day = workSummary(settings, date, timeline.startedAt === undefined ? null : timeline.startedAt * 60, timeline
    .finishedAt === undefined ? null : timeline.finishedAt * 60, pauses.map((p) => ({
      start: p.start * 60,
      end: p.end === null ? null : p.end * 60
    })), current * 60, options.context);
  const departureMinutes = day.started && !day.paused ? timeline.startedAt + (day.targetSeconds + day.lunchSeconds) /
    60 : null;
  return {
    ...day,
    departureMinutes,
    departureNextDay: departureMinutes !== null && departureMinutes >= 1440
  };
}

export function workDateInTimezone(value, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (name) => parts.find((item) => item.type === name).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function workTimeInTimezone(value, timezone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value);
}

export function calculateRecordedWorkDay(settings, record, now = new Date()) {
  if (!record) return {
    valid: false,
    showWidget: false
  };
  const regime = {
    ...defaultWorkSettings,
    ...settings,
    ...record.regime,
    enabled: settings.enabled
  };
  const instant = (value) => value ? Date.parse(value) / 1000 : null;
  const started = instant(record.instants?.startedAt);
  const finished = instant(record.instants?.finishedAt);
  const pauses = record.breaks?.map((p) => ({
      start: instant(p.startedAt),
      end: instant(p.finishedAt)
    })) ??
    (record.instants?.lunchOut ? [{
      start: instant(record.instants.lunchOut),
      end: instant(record.instants.lunchIn)
    }] : []);
  const current = now.getTime() / 1000;
  const stale = started !== null && finished === null && current - started >= 86400;
  const day = workSummary(regime, record.date, started, finished, pauses, current, record.overtime_context, !stale);
  const expected = started === null || day.paused ? null : new Date((started + day.targetSeconds + day.lunchSeconds) *
    1000);
  const departureNextDay = expected !== null && workDateInTimezone(expected, record.timezone) > record.date;
  const departureMinutes = expected === null ? null : parseWorkTime(workTimeInTimezone(expected, record.timezone)) + (
    departureNextDay ? 1440 : 0);
  return {
    ...day,
    departureMinutes,
    departureNextDay,
    stale
  };
}
