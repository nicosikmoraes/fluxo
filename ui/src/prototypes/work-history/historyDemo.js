import { clock, timeMinutes } from "../../features/work-hours/history/history";
export { clock, timeMinutes, duration, money, dateLabel, summarizeHistory } from "../../features/work-hours/history/history";

export const demoToday = "2026-10-16";
export const demoClock = "16:24";
export const dailyTarget = 528;

export function createDemoHistory() {
  const records = [];
  const variations = [23, 0, 42, -12, 65, 18, 0, 36, -6, 52, 14, 0];
  const arrivals = [8, -4, 14, 3, -8, 11, 5, -2, 17, 0, 6, -5];
  const lunches = [62, 58, 67, 60, 55, 71, 64, 59, 63, 61, 57, 66];
  let index = 0;
  for (let stamp = Date.parse("2026-09-01T12:00:00Z"); stamp <= Date.parse(`${demoToday}T12:00:00Z`); stamp += 86400000) {
    const date = new Date(stamp);
    if ([0, 6].includes(date.getUTCDay())) continue;
    const key = date.toISOString().slice(0, 10);
    const started = 480 + arrivals[index % arrivals.length];
    const lunchOut = 720 + arrivals[(index + 2) % arrivals.length];
    const lunch = lunches[index % lunches.length];
    const worked = dailyTarget + variations[index % variations.length];
    const overtime = Math.max(0, worked - dailyTarget);
    const ongoing = key === demoToday;
    const pending = key === "2026-10-07";
    const knownMinutes = pending ? lunchOut - started : ongoing ? timeMinutes(demoClock) - started - lunch : worked;
    const extra = ongoing || pending ? Math.max(0, knownMinutes - dailyTarget) : overtime;
    const estimated = extra / 60 * 30;
    const paid = !ongoing && !pending && extra > 0 && (key < "2026-10-09");
    records.push({
      date: key, startedAt: clock(started), lunchOut: clock(lunchOut), lunchIn: clock(lunchOut + lunch),
      finishedAt: ongoing || pending ? "" : clock(started + worked + lunch),
      worked: knownMinutes, overtime: extra, lunch, target: dailyTarget, estimated,
      received: paid ? Math.round(estimated * 100) / 100 : 0,
      receivedOn: paid ? (key.startsWith("2026-09") ? "2026-10-05" : "2026-10-15") : "",
      status: pending ? "pending" : ongoing ? "ongoing" : "complete",
      overtimeRate: 30,
      regime: { weeklyHours: 44, daysPerWeek: 5 },
      today: demoToday,
    });
    index++;
  }
  return records;
}
