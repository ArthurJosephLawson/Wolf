/**
 * Domain types shared by the UI. These mirror the Rust models in
 * `src-tauri/src/models/` — keep the two in sync.
 */

export type TaskPriority = 0 | 1 | 2 | 3;

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  0: "Low",
  1: "Normal",
  2: "High",
  3: "Urgent",
};

export interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  priority: TaskPriority;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface NewTask {
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string | null;
}

export interface TaskUpdate {
  title?: string;
  description?: string;
  completed?: boolean;
  priority?: TaskPriority;
  dueDate?: string | null;
}

export type TaskFilter = "all" | "active" | "completed" | "today" | "overdue";
export type TaskSort =
  "default" | "dueDate" | "priority" | "alphabetical" | "created";

export interface TaskListQuery {
  filter: TaskFilter;
  sort: TaskSort;
  search?: string;
}

export interface TaskStats {
  total: number;
  completed: number;
  open: number;
  dueToday: number;
  overdue: number;
}

export interface TaskOverview {
  stats: TaskStats;
  today: Task[];
  overdue: Task[];
}

/* ------------------------------------------------------------------ habits -- */

export type HabitFrequency = "daily" | "weekdays" | "weekly";

export const FREQUENCY_LABELS: Record<HabitFrequency, string> = {
  daily: "Every day",
  weekdays: "Weekdays",
  weekly: "Weekly",
};

export interface Habit {
  id: string;
  name: string;
  description: string;
  frequency: HabitFrequency;
  targetPerPeriod: number;
  color: string;
  createdAt: string;
  archived: boolean;
}

export interface NewHabit {
  name: string;
  description?: string;
  frequency?: HabitFrequency;
  targetPerPeriod?: number;
  color?: string;
}

export interface HabitUpdate {
  name?: string;
  description?: string;
  frequency?: HabitFrequency;
  targetPerPeriod?: number;
  color?: string;
  archived?: boolean;
}

export interface HabitCompletion {
  id: string;
  habitId: string;
  completedAt: string;
}

export interface HabitDay {
  date: string;
  completed: boolean;
  scheduled: boolean;
}

export interface HabitWithProgress {
  id: string;
  name: string;
  description: string;
  frequency: HabitFrequency;
  targetPerPeriod: number;
  color: string;
  createdAt: string;
  archived: boolean;
  today: string;
  completedToday: boolean;
  currentStreak: number;
  longestStreak: number;
  recent: HabitDay[];
  completions30d: number;
}

/* ---------------------------------------------------------------- calendar -- */

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  /** Naive local datetime, `YYYY-MM-DDTHH:MM`. */
  startTime: string;
  endTime: string;
  allDay: boolean;
  reminderMinutes: number | null;
  notifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewCalendarEvent {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  allDay?: boolean;
  reminderMinutes?: number | null;
}

export interface CalendarEventUpdate {
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  reminderMinutes?: number | null;
}

export interface EventListQuery {
  from?: string;
  to?: string;
}

export interface DaySummary {
  date: string;
  events: CalendarEvent[];
  taskCount: number;
  completedTaskCount: number;
}

export interface CalendarOverview {
  todayEvents: CalendarEvent[];
  upcoming: CalendarEvent[];
}

/* ------------------------------------------------------------------- focus -- */

export type FocusSessionKind = "focus" | "short_break" | "long_break";

export interface FocusSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  completed: boolean;
  kind: FocusSessionKind;
}

export interface NewFocusSession {
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number;
  completed?: boolean;
  kind?: FocusSessionKind;
}

export interface DailyFocus {
  date: string;
  minutes: number;
}

export interface FocusStats {
  completedToday: number;
  completedWeek: number;
  totalCompleted: number;
  focusMinutesToday: number;
  focusMinutesWeek: number;
  dailyMinutes: DailyFocus[];
}

/** Timer phases, mirroring the Rust session kinds plus the transient states. */
export type FocusPhase = "idle" | "focus" | "short_break" | "long_break";

export type TimerStatus =
  "IDLE" | "FOCUSING" | "BREAK" | "PAUSED" | "COMPLETED";

/* ---------------------------------------------------------------- settings -- */

export interface Settings {
  ollamaUrl: string;
  ollamaModel: string;
  fallbackModel: string;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  sessionsBeforeLongBreak: number;
  notificationsEnabled: boolean;
  habitRemindersEnabled: boolean;
  eventRemindersEnabled: boolean;
  companionEnabled: boolean;
  companionAlwaysOnTop: boolean;
  companionScale: number;
  companionX: number | null;
  companionY: number | null;
  startMinimized: boolean;
  closeToTray: boolean;
  autoCheckOllama: boolean;
  theme: string;
  userName: string;
}

/* ------------------------------------------------------------------- ai ---- */

export type OllamaState = "ready" | "no_models" | "model_missing" | "offline";

export interface OllamaModel {
  name: string;
  size: number;
  family: string | null;
  parameterSize: string | null;
  quantization: string | null;
  modifiedAt: string | null;
}

export interface OllamaStatus {
  state: OllamaState;
  url: string;
  model: string | null;
  models: OllamaModel[];
  version: string | null;
  detail: string;
  checkedAt: string;
}

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  totalDurationMs: number | null;
  evalCount: number | null;
}

export type StreamEvent =
  | { type: "token"; requestId: string; text: string }
  | {
      type: "done";
      requestId: string;
      summary: {
        requestId: string;
        model: string;
        totalDurationMs: number | null;
        evalCount: number | null;
      };
    }
  | { type: "failed"; requestId: string; message: string; kind: string };

export interface AskRequest {
  model?: string | null;
  messages: ChatMessage[];
  /** Pre-resolved `<local_context>` block; rebuilt natively when absent. */
  context?: string | null;
  systemPrompt?: string | null;
  temperature?: number | null;
  numPredict?: number | null;
}

export interface AskAck {
  requestId: string;
}

export interface AssistantContext {
  query: string;
  intent: string;
  context: string;
  systemPrompt: string;
}

/* --------------------------------------------------------------- desktop --- */

export interface EnvironmentInfo {
  sessionType: string;
  desktop: string;
  appVersion: string;
  dataDir: string;
  notificationsAvailable: boolean;
}

export type TrayAction =
  | "open"
  | "showCompanion"
  | "hideCompanion"
  | "startFocus"
  | "pauseFocus"
  | "toggleCompanion"
  | "todayTasks"
  | "settings"
  | "quit";

export interface TrayPayload {
  route?: "tasks" | "settings";
  focus?: "start" | "pause";
}

export type Route =
  "home" | "tasks" | "calendar" | "habits" | "focus" | "assistant" | "settings";

/** Error shape produced by the Rust `WolfError` serialiser. */
export interface WolfErrorShape {
  kind: string;
  message: string;
}
