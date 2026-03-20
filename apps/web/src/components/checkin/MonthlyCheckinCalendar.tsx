import type { CheckinFeatureBundle } from "../../features/core-inputs";
import {
  buildMonthCalendarCells,
  CALENDAR_TONE_LABEL,
  CHECKIN_CALENDAR_LEGEND,
  CHECKIN_CALENDAR_WEEKDAYS,
  resolveCalendarMoodTone,
  type YearMonth,
} from "../../features/core-inputs/checkin-calendar";

type MonthlyCheckinCalendarProps = {
  month: YearMonth;
  checkedDateSet: Set<string>;
  featureMap: Map<string, CheckinFeatureBundle>;
  todayDate?: string | null;
  showLegend?: boolean;
  ariaLabel?: string;
};

export function MonthlyCheckinCalendar({
  month,
  checkedDateSet,
  featureMap,
  todayDate = null,
  showLegend = true,
  ariaLabel = "월간 체크인 캘린더",
}: MonthlyCheckinCalendarProps) {
  const cells = buildMonthCalendarCells(month);

  return (
    <>
      <div className="ms-home-calendar-weekdays" aria-hidden="true">
        {CHECKIN_CALENDAR_WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="ms-home-calendar-grid" role="grid" aria-label={ariaLabel}>
        {cells.map((cell, index) => {
          if (!cell.date) {
            return <span key={`empty-${index}`} className="ms-home-calendar-cell ms-home-calendar-cell--empty" aria-hidden="true" />;
          }

          const hasFeatureForDate = featureMap.has(cell.date);
          const isActiveCell = checkedDateSet.has(cell.date) || hasFeatureForDate;
          const moodTone = isActiveCell ? resolveCalendarMoodTone(featureMap.get(cell.date)) : null;
          const isToday = todayDate === cell.date;

          return (
            <span
              key={cell.date}
              className={`ms-home-calendar-cell${isActiveCell ? " ms-home-calendar-cell--active" : ""}${
                moodTone ? ` ms-home-calendar-cell--tone-${moodTone}` : ""
              }${isToday ? " ms-home-calendar-cell--today" : ""}${isToday && isActiveCell ? " ms-home-calendar-cell--today-active" : ""}`}
              role="gridcell"
              aria-label={`${cell.date}${isActiveCell ? " 체크인 완료" : ""}${moodTone ? ` (${CALENDAR_TONE_LABEL[moodTone]})` : ""}`}
            >
              {cell.dayLabel}
            </span>
          );
        })}
      </div>
      {showLegend ? (
        <div className="ms-home-calendar-legend" aria-label="월간 출석 캘린더 색상 설명">
          {CHECKIN_CALENDAR_LEGEND.map((item) => (
            <div key={item.tone} className="ms-home-calendar-legend__item">
              <span className={`ms-home-calendar-legend__dot ms-home-calendar-legend__dot--${item.tone}`} aria-hidden="true" />
              <span className="ms-home-calendar-legend__text">{item.copy}</span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
