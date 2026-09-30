/** Dashboard: today's numbers, quick add, focus, next events, habit streak. */
import { useEffect, useMemo, useState } from "react";
import { Panel, Stat, Empty, Chip } from "../../components/common/ui";
import { PixelProgress } from "../../components/common/PixelProgress";
import { QuickAdd } from "../../components/Dashboard/QuickAdd";
import { WolfWidget } from "../../components/WolfWidget/WolfWidget";
import {
  useTaskStore,
  selectTaskCounts,
  selectVisibleTasks,
} from "../../stores/taskStore";
import { useHabitStore } from "../../stores/habitStore";
import { useCalendarStore } from "../../stores/calendarStore";
import { useFocusStore, selectTimerView } from "../../stores/focusStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore, greeting } from "../../stores/uiStore";
import { useWolfStore } from "../../stores/wolfStore";
import { desktopService } from "../../services/desktop/desktopService";
import {
  formatDayLong,
  formatTime,
  relativeDay,
  todayKey,
} from "../../utils/date";
import { focusSummary } from "../../utils/timerLogic";
import { dayPressure } from "../../utils/taskLogic";
import type { CalendarEvent } from "../../types";

export function HomePage() {
  const tasks = useTaskStore();
  const habits = useHabitStore();
  const calendar = useCalendarStore();
  const focus = useFocusStore();
  const userName = useSettingsStore((s) => s.settings.userName);
  const companionEnabled = useSettingsStore((s) => s.settings.companionEnabled);
  const setRoute = useUiStore((s) => s.setRoute);
  const [upcoming, setUpcoming] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    void tasks.load();
    void habits.load();
    void calendar.load();
    void focus.refresh();
    void calendar
      .upcoming(5)
      .then(setUpcoming)
      .catch(() => setUpcoming([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => selectTaskCounts(tasks), [tasks]);
  const focusView = selectTimerView(focus);
  const todaysTasks = useMemo(
    () =>
      selectVisibleTasks(tasks)
        .filter((t) => !t.completed)
        .slice(0, 6),
    [tasks],
  );
  const pressure = dayPressure({
    dueToday: counts.today,
    overdue: counts.overdue,
  });

  // The resting pose tracks the real day, but never overrides a running timer.
  useEffect(() => {
    if (focusView.running) return;
    useWolfStore
      .getState()
      .push(
        pressure === "busy"
          ? "busy"
          : pressure === "all-clear"
            ? "all-clear"
            : "default",
      );
  }, [pressure, focusView.running]);

  const habitStreak = habits.habits.reduce(
    (best, habit) => Math.max(best, habit.currentStreak),
    0,
  );

  return (
    <>
      <Panel
        title={formatDayLong(todayKey())}
        actions={
          <>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => setRoute("tasks")}
            >
              All tasks
            </button>
            <button
              type="button"
              className="btn btn--small btn--primary"
              onClick={() => {
                if (focusView.running) focus.pause();
                else focus.start();
              }}
            >
              {focusView.running ? "Pause focus" : "Start focus"}
            </button>
          </>
        }
      >
        <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
          {companionEnabled ? (
            <div className="panel" style={{ padding: 8, flex: "none" }}>
              <WolfWidget
                scale={2}
                onClick={() => {
                  void desktopService.showMain();
                  setRoute("assistant");
                }}
              />
              <button
                type="button"
                className="btn btn--ghost btn--small"
                style={{ marginTop: 4 }}
                onClick={() => void desktopService.toggleCompanion()}
              >
                Hide companion
              </button>
            </div>
          ) : null}

          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <p className="muted" style={{ margin: 0 }}>
              {greeting(userName)}.{" "}
              {summaryLine(
                counts.overdue,
                counts.today,
                counts.open,
                habitStreak,
              )}
            </p>
            <QuickAdd />
            <div>
              <PixelProgress
                value={counts.done}
                max={Math.max(1, counts.total)}
                label="Tasks completed"
                tone="ok"
              />
              <p className="faint" style={{ marginTop: 4 }}>
                {counts.done} of {counts.total} tasks done
              </p>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid grid--3">
        <Stat
          label="Due today"
          value={counts.today}
          tone={counts.today > 0 ? "warn" : "ok"}
        />
        <Stat
          label="Overdue"
          value={counts.overdue}
          tone={counts.overdue > 0 ? "danger" : "ok"}
        />
        <Stat label="Open" value={counts.open} />
        <Stat
          label="Focus minutes today"
          value={focus.stats?.focusMinutesToday ?? 0}
          tone="ok"
        />
        <Stat label="Sessions today" value={focus.stats?.completedToday ?? 0} />
        <Stat label="Best habit streak" value={`${habitStreak}d`} />
      </div>

      <div className="grid grid--2">
        <Panel title="Next up">
          {tasks.loading && tasks.tasks.length === 0 ? (
            <p className="empty">Loading…</p>
          ) : todaysTasks.length === 0 ? (
            <Empty>Nothing open. Enjoy it.</Empty>
          ) : (
            <ul className="list">
              {todaysTasks.map((task) => (
                <li key={task.id} className="list__item">
                  <button
                    type="button"
                    className="btn btn--small"
                    onClick={() =>
                      void tasks
                        .setCompleted(task.id, true)
                        .then(() =>
                          useWolfStore.getState().pushShared("task-completed"),
                        )
                    }
                    aria-label={`Complete ${task.title}`}
                  >
                    ▢
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>{task.title}</div>
                    {task.dueDate ? (
                      <div className="faint">{relativeDay(task.dueDate)}</div>
                    ) : null}
                  </div>
                  {task.priority >= 2 ? (
                    <Chip tone="warn">P{task.priority}</Chip>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Coming up">
          {upcoming.length === 0 ? (
            <Empty>No events scheduled.</Empty>
          ) : (
            <ul className="list">
              {upcoming.map((event) => (
                <li key={event.id} className="list__item">
                  <div style={{ width: 62, flex: "none" }} className="faint">
                    {event.allDay ? "All day" : formatTime(event.startTime)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>{event.title}</div>
                    <div className="faint">
                      {relativeDay(event.startTime)} ·{" "}
                      {event.startTime.slice(0, 10)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => setRoute("calendar")}
          >
            Open calendar
          </button>
        </Panel>
      </div>

      <div className="grid grid--2">
        <Panel title="Focus">
          {focus.stats ? (
            <p className="muted" style={{ marginBottom: 8 }}>
              {focusSummary(focus.stats)}
            </p>
          ) : null}
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="faint">
              {focusView.running
                ? `${focusView.phase === "focus" ? "Focusing" : "On a break"} — ${Math.ceil(focusView.remaining / 60)} min left`
                : "Not running"}
            </span>
            <button
              type="button"
              className="btn btn--small"
              onClick={() => setRoute("focus")}
            >
              {focusView.running ? "Open" : "Start"}
            </button>
          </div>
        </Panel>

        <Panel
          title="Habits today"
          actions={
            <button
              type="button"
              className="btn btn--small"
              onClick={() => setRoute("habits")}
            >
              All habits
            </button>
          }
        >
          {habits.habits.length === 0 ? (
            <Empty>No habits yet.</Empty>
          ) : (
            <ul className="list">
              {habits.habits.slice(0, 5).map((habit) => (
                <li key={habit.id} className="list__item">
                  <button
                    type="button"
                    className="btn btn--small"
                    style={{
                      minWidth: 30,
                      background: habit.completedToday
                        ? "var(--success-dim)"
                        : "var(--bg-sunken)",
                      borderColor: habit.completedToday
                        ? "var(--success)"
                        : "var(--border-strong)",
                    }}
                    onClick={() => void habits.toggleToday(habit.id)}
                    aria-pressed={habit.completedToday}
                    aria-label={`Toggle ${habit.name}`}
                  >
                    {habit.completedToday ? "✓" : "▢"}
                  </button>
                  <div style={{ flex: 1 }}>{habit.name}</div>
                  <span className="faint">{habit.currentStreak}d</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function summaryLine(
  overdue: number,
  today: number,
  open: number,
  streak: number,
): string {
  const parts: string[] = [];
  if (overdue > 0) parts.push(`${overdue} overdue`);
  if (today > 0) parts.push(`${today} due today`);
  if (parts.length === 0 && open === 0) parts.push("Nothing open");
  else if (parts.length === 0) parts.push(`${open} open`);
  if (streak > 0)
    parts.push(`best habit streak ${streak} day${streak === 1 ? "" : "s"}`);
  return `${parts.join(" · ")}.`;
}
