"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AppShell,
  Badge,
  Banner,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Input,
  LoadingSkeleton,
  PageContainer,
  SectionContainer,
  Textarea,
} from "../../src/components/ui";
import { AuthRouteGuard, useAuthContext } from "../../src/features/auth";
import {
  listCheckinFeatures,
  CoreApiError,
  createJournalEntry,
  deleteJournalEntry,
  getJournalEntry,
  listJournalCategoryOptions,
  listJournalEntries,
  type CheckinFeatureBundle,
  type JournalEntry,
  type JournalListItem,
} from "../../src/features/core-inputs";
import {
  CALENDAR_TONE_LABEL,
  CHECKIN_CALENDAR_LEGEND,
  CHECKIN_CALENDAR_WEEKDAYS,
  getKstYearMonth,
  resolveCalendarMoodTone,
  shiftMonth,
  type YearMonth,
} from "../../src/features/core-inputs/checkin-calendar";

function parseError(error: unknown): string {
  if (error instanceof CoreApiError) {
    if (error.message === "email_verification_required") {
      return "이메일 확인 후 이용할 수 있습니다.";
    }
    if (error.message === "journal_not_found") {
      return "선택한 한줄일기를 찾을 수 없습니다.";
    }
    if (error.message === "Failed to fetch") {
      return "서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.";
    }
    return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  if (error instanceof Error) {
    if (error.message === "Failed to fetch") {
      return "서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.";
    }
    return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  return "알 수 없는 오류가 발생했습니다.";
}

function renderTagTitle(tags: string[]): string {
  if (tags.length === 0) {
    return "카테고리 없음";
  }
  return tags.map((tag) => `#${tag}`).join(" ");
}

function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function filterTagsByActive(source: string[], activeTags: string[]): string[] {
  const next = source.filter((tag) => activeTags.includes(tag));
  return sameStringArray(source, next) ? source : next;
}

function monthRange(cursor: YearMonth): { start_date: string; end_date: string } {
  const start = `${cursor.year}-${String(cursor.month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();
  return {
    start_date: start,
    end_date: `${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`,
  };
}

function buildCalendarCells(cursor: YearMonth): Array<{ date: string | null; dayLabel: string }> {
  const firstDay = new Date(Date.UTC(cursor.year, cursor.month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate();

  const cells: Array<{ date: string | null; dayLabel: string }> = [];
  for (let i = 0; i < firstDay; i += 1) {
    cells.push({ date: null, dayLabel: "" });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${cursor.year}-${String(cursor.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ date, dayLabel: String(day) });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, dayLabel: "" });
  }
  return cells;
}

export default function JournalWorkbenchPage() {
  const router = useRouter();
  const { firebaseUser } = useAuthContext();

  const [entries, setEntries] = useState<JournalListItem[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [inactiveUsedTags, setInactiveUsedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const [searchKeywordInput, setSearchKeywordInput] = useState("");
  const [searchDateInput, setSearchDateInput] = useState("");
  const [searchTagsInput, setSearchTagsInput] = useState<string[]>([]);
  const [appliedSearchKeyword, setAppliedSearchKeyword] = useState("");
  const [appliedSearchDate, setAppliedSearchDate] = useState("");
  const [appliedSearchTags, setAppliedSearchTags] = useState<string[]>([]);
  const [calendarMonth, setCalendarMonth] = useState<YearMonth>(getKstYearMonth());
  const [calendarEntriesByDate, setCalendarEntriesByDate] = useState<Record<string, number>>({});
  const [monthCheckinFeatures, setMonthCheckinFeatures] = useState<CheckinFeatureBundle[]>([]);

  const [composerBody, setComposerBody] = useState("");
  const [composerTags, setComposerTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [loadingEntryId, setLoadingEntryId] = useState<string | null>(null);

  const calendarRange = useMemo(() => monthRange(calendarMonth), [calendarMonth]);
  const calendarCells = useMemo(() => buildCalendarCells(calendarMonth), [calendarMonth]);
  const monthCheckinFeatureMap = useMemo(() => {
    const map = new Map<string, CheckinFeatureBundle>();
    for (const feature of monthCheckinFeatures) {
      map.set(feature.date, feature);
    }
    return map;
  }, [monthCheckinFeatures]);

  const queryOptions = useMemo(
    () => ({
      q: appliedSearchKeyword.trim() || undefined,
      start_date: appliedSearchDate || undefined,
      end_date: appliedSearchDate || undefined,
      category_tags: appliedSearchTags,
    }),
    [appliedSearchDate, appliedSearchKeyword, appliedSearchTags],
  );

  const loadWorkbench = useCallback(async () => {
    if (!firebaseUser) {
      return;
    }
    try {
      setLoading(true);
      setErrorMessage(null);

      const [rows, categories, calendarRows, checkinFeatures] = await Promise.all([
        listJournalEntries(firebaseUser, queryOptions),
        listJournalCategoryOptions(firebaseUser),
        listJournalEntries(firebaseUser, {
          start_date: calendarRange.start_date,
          end_date: calendarRange.end_date,
        }),
        listCheckinFeatures(firebaseUser, {
          start_date: calendarRange.start_date,
          end_date: calendarRange.end_date,
        }),
      ]);

      setEntries(rows);
      setActiveTags((previous) => (sameStringArray(previous, categories.active_tags) ? previous : categories.active_tags));
      setInactiveUsedTags((previous) =>
        sameStringArray(previous, categories.inactive_used_tags) ? previous : categories.inactive_used_tags,
      );
      setSearchTagsInput((previous) => filterTagsByActive(previous, categories.active_tags));
      setAppliedSearchTags((previous) => filterTagsByActive(previous, categories.active_tags));
      setComposerTags((previous) => filterTagsByActive(previous, categories.active_tags));
      setCalendarEntriesByDate(() => {
        const next: Record<string, number> = {};
        for (const row of calendarRows) {
          next[row.entry_date] = (next[row.entry_date] ?? 0) + 1;
        }
        return next;
      });
      setMonthCheckinFeatures(checkinFeatures);
      setSelectedEntry((previous) => {
        if (!previous) {
          return previous;
        }
        const exists = rows.some((entry) => entry.journal_id === previous.journal_id);
        return exists ? previous : null;
      });
    } catch (error) {
      setErrorMessage(parseError(error));
      setEntries([]);
      setActiveTags([]);
      setInactiveUsedTags([]);
      setCalendarEntriesByDate({});
      setMonthCheckinFeatures([]);
    } finally {
      setLoading(false);
    }
  }, [calendarRange.end_date, calendarRange.start_date, firebaseUser, queryOptions]);

  useEffect(() => {
    void loadWorkbench();
  }, [loadWorkbench]);

  const onSearchApply = () => {
    setAppliedSearchKeyword(searchKeywordInput.trim());
    setAppliedSearchDate(searchDateInput);
    setAppliedSearchTags(searchTagsInput);
  };

  const toggleSearchTag = (tag: string) => {
    setSearchTagsInput((previous) =>
      previous.includes(tag) ? previous.filter((item) => item !== tag) : [...previous, tag],
    );
  };

  const toggleComposerTag = (tag: string) => {
    setComposerTags((previous) =>
      previous.includes(tag) ? previous.filter((item) => item !== tag) : [...previous, tag],
    );
  };

  const openEntry = async (journalId: string) => {
    if (!firebaseUser) {
      return;
    }
    try {
      setLoadingEntryId(journalId);
      setErrorMessage(null);
      const detail = await getJournalEntry(firebaseUser, journalId);
      setSelectedEntry(detail);
      setNoticeMessage(null);
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setLoadingEntryId(null);
    }
  };

  const onSave = async () => {
    if (!firebaseUser || saving || !composerBody.trim()) {
      return;
    }
    try {
      setSaving(true);
      setErrorMessage(null);
      const created = await createJournalEntry(firebaseUser, {
        category_tags: composerTags,
        body: composerBody.trim(),
      });
      setComposerBody("");
      setSelectedEntry(created);
      setNoticeMessage("한줄일기를 저장했습니다.");
      await loadWorkbench();
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!firebaseUser || !selectedEntry || deleting) {
      return;
    }
    const confirmed = window.confirm("이 한줄일기를 삭제하시겠습니까?");
    if (!confirmed) {
      return;
    }
    try {
      setDeleting(true);
      setErrorMessage(null);
      await deleteJournalEntry(firebaseUser, selectedEntry.journal_id);
      setSelectedEntry(null);
      setNoticeMessage("한줄일기를 삭제했습니다.");
      await loadWorkbench();
    } catch (error) {
      setErrorMessage(parseError(error));
    } finally {
      setDeleting(false);
    }
  };

  const bodyLengthHint = `${composerBody.length} / 5000`;

  return (
    <AuthRouteGuard policy="require-active">
      <AppShell
        headerAction={
          <div className="ms-row">
            <Badge variant="brand">한줄일기</Badge>
          </div>
        }
      >
        <PageContainer size="lg">
          <SectionContainer title="한줄일기">
            {noticeMessage ? <Banner variant="success" title="안내" description={noticeMessage} /> : null}
            {errorMessage ? <Banner variant="danger" title="오류" description={errorMessage} /> : null}

            <div className="ms-journal-workbench">
              <Card className="ms-journal-workbench__pane ms-journal-workbench__pane--left" title="한줄일기">
                {selectedEntry ? (
                  <div className="ms-journal-viewer">
                    <div className="ms-row">
                      <Badge variant="neutral">작성일 {selectedEntry.entry_date}</Badge>
                      <Badge variant="neutral">수정일 {selectedEntry.updated_at.slice(0, 10)}</Badge>
                    </div>
                    <div className="ms-row">
                      {selectedEntry.category_tags.length === 0 ? (
                        <Badge variant="neutral">태그 없음</Badge>
                      ) : (
                        selectedEntry.category_tags.map((tag) => (
                          <Badge
                            key={`${selectedEntry.journal_id}-${tag}`}
                            variant={selectedEntry.searchable_category_tags.includes(tag) ? "brand" : "neutral"}
                          >
                            {tag}
                            {selectedEntry.searchable_category_tags.includes(tag) ? "" : " (비활성)"}
                          </Badge>
                        ))
                      )}
                    </div>
                    <div className="ms-journal-detail-body ms-journal-detail-body--workspace">{selectedEntry.body}</div>
                    <div className="ms-row">
                      <Button size="sm" variant="secondary" onClick={() => setSelectedEntry(null)}>
                        새로 작성
                      </Button>
                      <Button
                        size="sm"
                        variant="soft"
                        onClick={() => router.push(`/journal/${selectedEntry.journal_id}/edit`)}
                      >
                        수정
                      </Button>
                      <Button size="sm" variant="danger" onClick={onDelete} loading={deleting}>
                        삭제
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="ms-journal-composer">
                    <div className="ms-field">
                      <span className="ms-field__label">카테고리 (복수 선택)</span>
                      <div className="ms-row">
                        {activeTags.map((tag) => (
                          <Chip key={`compose-${tag}`} selected={composerTags.includes(tag)} onClick={() => toggleComposerTag(tag)}>
                            {tag}
                          </Chip>
                        ))}
                        {activeTags.length === 0 ? <Badge variant="neutral">활성 태그 없음</Badge> : null}
                      </div>
                    </div>

                    <Textarea
                      label="내용"
                      placeholder="오늘의 마음을 한 줄로 남겨보세요."
                      value={composerBody}
                      onChange={(event) => setComposerBody(event.target.value)}
                      maxLength={5000}
                      maxLengthHint={bodyLengthHint}
                      required
                    />

                    <Button onClick={onSave} loading={saving} fullWidth disabled={!composerBody.trim()}>
                      저장
                    </Button>
                  </div>
                )}
              </Card>

              <Card className="ms-journal-workbench__pane ms-journal-workbench__pane--right" title="일기 꺼내기">
                <div className="ms-journal-calendar-box">
                  <div className="ms-journal-calendar-box__nav">
                    <Button size="sm" variant="secondary" onClick={() => setCalendarMonth((previous) => shiftMonth(previous, -1))}>
                      이전
                    </Button>
                    <p className="ms-journal-calendar-box__month">
                      {calendarMonth.year}년 {calendarMonth.month}월
                    </p>
                    <Button size="sm" variant="secondary" onClick={() => setCalendarMonth((previous) => shiftMonth(previous, 1))}>
                      다음
                    </Button>
                  </div>
                  <div className="ms-home-calendar-weekdays">
                    {CHECKIN_CALENDAR_WEEKDAYS.map((weekday) => (
                      <span key={weekday}>{weekday}</span>
                    ))}
                  </div>
                  <div className="ms-home-calendar-grid">
                    {calendarCells.map((cell, index) => {
                      if (!cell.date) {
                        return <div key={`journal-empty-${index}`} className="ms-home-calendar-cell ms-home-calendar-cell--empty" aria-hidden="true" />;
                      }

                      const entryCount = calendarEntriesByDate[cell.date] ?? 0;
                      const isSelected = appliedSearchDate === cell.date;
                      const selectedDate = cell.date;
                      const tone = resolveCalendarMoodTone(monthCheckinFeatureMap.get(cell.date));
                      const hasCheckin = Boolean(tone);

                      return (
                        <button
                          key={cell.date}
                          type="button"
                          className={`ms-home-calendar-cell${hasCheckin ? " ms-home-calendar-cell--active" : ""}${
                            tone ? ` ms-home-calendar-cell--tone-${tone}` : ""
                          }${isSelected ? " ms-home-calendar-cell--selected" : ""}`}
                          title={`${cell.date} · 한줄일기 ${entryCount}개${tone ? ` · 체크인 ${CALENDAR_TONE_LABEL[tone]}` : ""}`}
                          aria-label={`${cell.date} 한줄일기 ${entryCount}개${tone ? `, 체크인 ${CALENDAR_TONE_LABEL[tone]}` : ""}`}
                          onClick={() => {
                            setSearchDateInput(selectedDate);
                            setAppliedSearchDate(selectedDate);
                          }}
                        >
                          {cell.dayLabel}
                        </button>
                      );
                    })}
                  </div>
                  <div className="ms-home-calendar-legend" aria-label="한줄일기 캘린더 색상 설명">
                    {CHECKIN_CALENDAR_LEGEND.map((item) => (
                      <div key={item.tone} className="ms-home-calendar-legend__item">
                        <span className={`ms-home-calendar-legend__dot ms-home-calendar-legend__dot--${item.tone}`} aria-hidden="true" />
                        <span className="ms-home-calendar-legend__text">{item.copy}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="ms-journal-search-box">
                  <Input
                    label="검색하기"
                    placeholder="내용 검색"
                    value={searchKeywordInput}
                    onChange={(event) => setSearchKeywordInput(event.target.value)}
                  />
                  <Input
                    label="일자"
                    type="date"
                    value={searchDateInput}
                    onChange={(event) => setSearchDateInput(event.target.value)}
                  />
                  <div className="ms-field">
                    <span className="ms-field__label">카테고리</span>
                    <div className="ms-row">
                      {activeTags.map((tag) => (
                        <Chip key={`search-${tag}`} selected={searchTagsInput.includes(tag)} onClick={() => toggleSearchTag(tag)}>
                          {tag}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  <div className="ms-row">
                    <Button size="sm" onClick={onSearchApply}>
                      검색
                    </Button>
                  </div>
                  {inactiveUsedTags.length > 0 ? (
                    <p className="ms-field__helper">
                      비활성 태그는 기존 기록에 표시되지만 검색에서는 제외됩니다.
                    </p>
                  ) : null}
                </div>

                <div className="ms-journal-list-box">
                  <h3 className="ms-journal-list-box__title">일기 목록</h3>
                  {loading ? (
                    <LoadingSkeleton lines={6} />
                  ) : errorMessage ? (
                    <ErrorState
                      title="한줄일기 목록을 불러오지 못했습니다"
                      description="잠시 후 다시 시도해 주세요."
                      retryAction={<Button size="sm" onClick={() => void loadWorkbench()}>다시 시도</Button>}
                    />
                  ) : entries.length === 0 ? (
                    <EmptyState title="표시할 한줄일기가 없습니다" description="검색 조건을 변경해보세요." />
                  ) : (
                    <div className="ms-journal-list">
                      {entries.map((entry) => (
                        <button
                          key={entry.journal_id}
                          type="button"
                          className={`ms-journal-list-item${
                            selectedEntry?.journal_id === entry.journal_id ? " ms-journal-list-item--active" : ""
                          }`}
                          onClick={() => void openEntry(entry.journal_id)}
                        >
                          <div className="ms-journal-list-item__head">
                            <span className="ms-journal-list-item__date">{entry.entry_date}</span>
                            <span className="ms-journal-list-item__id">{entry.journal_id.slice(0, 10)}</span>
                          </div>
                          <p className="ms-journal-list-item__title">{renderTagTitle(entry.category_tags)}</p>
                          <p className="ms-journal-list-item__preview">{entry.preview_text || "(내용 없음)"}</p>
                          {loadingEntryId === entry.journal_id ? (
                            <span className="ms-journal-list-item__meta">불러오는 중...</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </SectionContainer>
        </PageContainer>
      </AppShell>
    </AuthRouteGuard>
  );
}
