import type { CheckinFeatureBundle } from "./types";

export type CalendarMoodTone = "happy" | "anxious" | "depressed" | "sleep";

export type YearMonth = {
  year: number;
  month: number;
};

export const CALENDAR_TONE_LABEL: Record<CalendarMoodTone, string> = {
  happy: "좋음",
  anxious: "불안",
  depressed: "우울",
  sleep: "불면",
};

export const CHECKIN_CALENDAR_LEGEND: Array<{ tone: CalendarMoodTone; copy: string }> = [
  { tone: "happy", copy: "좋음" },
  { tone: "anxious", copy: "불안" },
  { tone: "depressed", copy: "우울" },
  { tone: "sleep", copy: "불면" },
];

export const CHECKIN_CALENDAR_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function getKstYearMonth(value = new Date()): YearMonth {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(value);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: getPart("year"),
    month: getPart("month"),
  };
}

export function shiftMonth(cursor: YearMonth, offset: number): YearMonth {
  const next = new Date(Date.UTC(cursor.year, cursor.month - 1 + offset, 1));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
  };
}

export function buildMonthCalendarCells(cursor: YearMonth): Array<{ date: string | null; dayLabel: string }> {
  const firstDay = new Date(Date.UTC(cursor.year, cursor.month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
  const cells: Array<{ date: string | null; dayLabel: string }> = [];

  for (let index = 0; index < firstDay; index += 1) {
    cells.push({ date: null, dayLabel: "" });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      date: `${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      dayLabel: String(day),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ date: null, dayLabel: "" });
  }

  return cells;
}

export function resolveCalendarMoodTone(feature: CheckinFeatureBundle | null | undefined): CalendarMoodTone | null {
  if (!feature) {
    return null;
  }

  const mood = feature.mood_1_5 ?? 3;
  const anxiety = feature.anxiety_1_5 ?? 3;
  const energy = feature.energy_1_5 ?? 3;
  const sleepHours = feature.sleep_total_midpoint_hours ?? 6.5;

  const scores: Record<CalendarMoodTone, number> = {
    happy:
      Math.max(0, mood - 3) * 1.5 +
      Math.max(0, energy - 3) * 0.85 +
      Math.max(0, 3 - anxiety) * 0.35 +
      Math.max(0, sleepHours - 6.5) * 0.2,
    anxious: Math.max(0, anxiety - 3) * 1.7 + Math.max(0, 3 - mood) * 0.4 + Math.max(0, 3 - energy) * 0.2,
    depressed: Math.max(0, 3 - mood) * 1.55 + Math.max(0, 3 - energy) * 1.1 + Math.max(0, anxiety - 3) * 0.15,
    sleep: Math.max(0, 6.5 - sleepHours) * 1.85 + (sleepHours <= 5.5 ? 0.7 : 0),
  };

  const [tone, score] = Object.entries(scores).sort((left, right) => right[1] - left[1])[0] as [CalendarMoodTone, number];

  if (score > 0.15) {
    return tone;
  }

  return "happy";
}
