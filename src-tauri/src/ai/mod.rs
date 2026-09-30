//! Wolf's internal assistant prompt and local-context selection.
//!
//! The assistant is powered by a small local model. Small models hallucinate
//! happily, so the prompt is explicit: only trust the `<local_context>` block,
//! say so when the block is empty, and never invent tasks or appointments.

use crate::database::Database;
use crate::error::WolfResult;
use crate::models::{TaskFilter, TaskListQuery, TaskSort};
use chrono::NaiveDate;

/// Maximum characters any single section may contribute, so the whole context
/// block stays small enough for a 2B model to reason over.
const SECTION_LIMIT: usize = 1_200;
/// Hard ceiling on the assembled context block.
const TOTAL_LIMIT: usize = 3_500;
const MAX_EVENTS: usize = 12;
const MAX_TASKS: usize = 25;

pub fn system_prompt() -> String {
    concat!(
        "You are Wolf, a small pixel-art wolf who lives on the user's Linux desktop. ",
        "You are a concise local productivity companion.\n\n",
        "Rules you must follow:\n",
        "1. Answer only from the <local_context> block. It is the authoritative snapshot ",
        "of the user's tasks, calendar, habits and focus history.\n",
        "2. Never invent tasks, events, deadlines, or times. If the context does not contain ",
        "the answer, say what is missing and suggest how to add it.\n",
        "3. If <local_context> is empty, tell the user you have no data yet and point them ",
        "at the Tasks, Calendar and Habits screens.\n",
        "4. Keep answers short: a short paragraph or a few bullets. No preamble, no filler, ",
        "no restating the question.\n",
        "5. When several tasks compete for attention, recommend one and say why in one clause.\n",
        "6. Use plain text. Do not use markdown headings, tables, or code blocks.\n",
        "7. You are running entirely on this machine. Do not suggest sending the user's data ",
        "anywhere, and do not claim to access anything not present in the context.\n",
    )
    .to_string()
}

/// What the user asked about. Determines which slices of local data are sent.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Intent {
    Today,
    Overdue,
    Upcoming,
    Tomorrow,
    Habits,
    Focus,
    Summary,
    General,
}

impl Intent {
    pub fn label(self) -> &'static str {
        match self {
            Intent::Today => "today",
            Intent::Overdue => "overdue tasks",
            Intent::Upcoming => "upcoming events",
            Intent::Tomorrow => "tomorrow's calendar",
            Intent::Habits => "habits",
            Intent::Focus => "focus sessions",
            Intent::Summary => "day summary",
            Intent::General => "general",
        }
    }
}

/// Very small keyword classifier. Kept deliberately simple and testable: it
/// only decides *which* data to include, never what the answer is.
pub fn classify_intent(query: &str) -> Intent {
    let q = query.to_lowercase();
    let has = |needles: &[&str]| needles.iter().any(|n| q.contains(n));

    if has(&[
        "summar",
        "how was my day",
        "recap",
        "catch me up",
        "brief me",
        "status of my day",
    ]) {
        return Intent::Summary;
    }
    if has(&["overdue", "late", "behind", "missed"]) {
        return Intent::Overdue;
    }
    if has(&["habit", "streak", "routine"]) {
        return Intent::Habits;
    }
    if has(&["focus", "pomodoro", "session", "deep work", "concentrat"]) {
        return Intent::Focus;
    }
    if has(&["tomorrow", "next day"]) {
        return Intent::Tomorrow;
    }
    if has(&[
        "next meeting",
        "upcoming",
        "next event",
        "schedule",
        "agenda",
        "calendar",
    ]) {
        return Intent::Upcoming;
    }
    if has(&[
        "today",
        "this morning",
        "this afternoon",
        "this evening",
        "right now",
        "now",
    ]) {
        return Intent::Today;
    }
    Intent::General
}

fn cap(text: String) -> String {
    if text.chars().count() <= SECTION_LIMIT {
        return text;
    }
    let truncated: String = text.chars().take(SECTION_LIMIT).collect();
    format!("{truncated}… (truncated)")
}

fn bullet(line: String) -> String {
    format!("- {line}")
}

/// Build the `<local_context>` block for a user question.
pub fn build_context(db: &Database, query: &str, today: NaiveDate) -> WolfResult<String> {
    let intent = classify_intent(query);
    let today_str = today.format("%Y-%m-%d").to_string();
    let tomorrow = (today + chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();
    let now_local = chrono::Local::now().format("%Y-%m-%dT%H:%M").to_string();

    let mut sections: Vec<String> = Vec::new();

    if intent != Intent::Habits && intent != Intent::Focus {
        sections.push(tasks_section(db, intent, &today_str)?);
    }
    if intent != Intent::Overdue && intent != Intent::Habits && intent != Intent::Focus {
        sections.push(events_section(
            db, intent, &now_local, &today_str, &tomorrow,
        )?);
    }
    if intent == Intent::Habits || intent == Intent::Summary || intent == Intent::General {
        sections.push(habits_section(db, today)?);
    }
    if intent == Intent::Focus || intent == Intent::Summary || intent == Intent::General {
        sections.push(focus_section(db, &today_str)?);
    }

    let mut context = String::new();
    context.push_str(&format!(
        "Local date: {today_str} (local time {now_local}).\n"
    ));
    context.push_str(&format!("Question intent: {}.\n", intent.label()));
    for section in sections {
        if section.trim().is_empty() {
            continue;
        }
        if context.len() + section.len() > TOTAL_LIMIT {
            break;
        }
        context.push('\n');
        context.push_str(&cap(section));
    }

    Ok(context)
}

fn tasks_section(db: &Database, intent: Intent, today: &str) -> WolfResult<String> {
    let filter = match intent {
        Intent::Overdue => TaskFilter::Overdue,
        Intent::Today | Intent::Summary => TaskFilter::Today,
        _ => TaskFilter::Active,
    };

    let mut tasks = db.list_tasks(
        &TaskListQuery {
            filter: Some(filter),
            sort: Some(TaskSort::Default),
            search: None,
        },
        today,
    )?;

    if tasks.is_empty() {
        // "Today" questions still benefit from seeing what else is open.
        if filter != TaskFilter::Active {
            tasks = db.list_tasks(
                &TaskListQuery {
                    filter: Some(TaskFilter::Active),
                    sort: Some(TaskSort::Default),
                    search: None,
                },
                today,
            )?;
        }
    }

    let total_open = db
        .list_tasks(
            &TaskListQuery {
                filter: Some(TaskFilter::Active),
                sort: Some(TaskSort::Default),
                search: None,
            },
            today,
        )?
        .len();

    let mut out = format!("Tasks ({total_open} open in total):\n");
    if tasks.is_empty() {
        out.push_str("- none\n");
        return Ok(out);
    }
    for task in tasks.iter().take(MAX_TASKS) {
        let priority = match task.priority {
            0 => "low",
            1 => "normal",
            2 => "high",
            _ => "urgent",
        };
        let due = match &task.due_date {
            Some(d) if d.as_str() == today => "due today".to_string(),
            Some(d) => format!("due {d}"),
            None => "no due date".to_string(),
        };
        out.push_str(&bullet(format!("{} [{}] ({due})", task.title, priority)));
        out.push('\n');
    }
    if tasks.len() > MAX_TASKS {
        out.push_str(&format!("- …and {} more\n", tasks.len() - MAX_TASKS));
    }
    Ok(out)
}

fn events_section(
    db: &Database,
    intent: Intent,
    now_local: &str,
    today: &str,
    tomorrow: &str,
) -> WolfResult<String> {
    let events = match intent {
        Intent::Tomorrow => db
            .upcoming_events(now_local, 40)?
            .into_iter()
            .filter(|e| e.start_time.as_str() > today)
            .filter(|e| e.start_time.as_str() < tomorrow || e.start_time.starts_with(tomorrow))
            .take(MAX_EVENTS)
            .collect::<Vec<_>>(),
        _ => db.upcoming_events(now_local, MAX_EVENTS as u32)?,
    };

    let mut out = String::from("Calendar (from now):\n");
    if events.is_empty() {
        out.push_str("- no upcoming events\n");
        return Ok(out);
    }
    for event in events {
        let when = if event.all_day {
            format!("all day {}", &event.start_time[..10])
        } else {
            event.start_time.replacen('T', " ", 1)
        };
        out.push_str(&bullet(format!("{when} — {}", event.title)));
        out.push('\n');
    }
    Ok(out)
}

fn habits_section(db: &Database, today: NaiveDate) -> WolfResult<String> {
    let habits = db.habit_summaries(today, false)?;
    if habits.is_empty() {
        return Ok("Habits:\n- none tracked yet\n".to_string());
    }
    let mut out = String::from("Habits:\n");
    for habit in habits.iter().take(10) {
        let state = if habit.completed_today {
            "done today"
        } else {
            "not done today"
        };
        out.push_str(&bullet(format!(
            "{} — {} (streak {}, best {})",
            habit.habit.name, state, habit.current_streak, habit.longest_streak
        )));
        out.push('\n');
    }
    Ok(out)
}

fn focus_section(db: &Database, today: &str) -> WolfResult<String> {
    let week_start = (chrono::NaiveDate::parse_from_str(today, "%Y-%m-%d")
        .unwrap_or_else(|_| chrono::Local::now().date_naive())
        - chrono::Duration::days(6))
    .format("%Y-%m-%d")
    .to_string();
    let stats = db.focus_stats(today, &week_start)?;

    let mut out = format!(
        "Focus sessions: {} completed today, {} this week, {} all time ({} minutes focused today).\n",
        stats.completed_today, stats.completed_week, stats.total_completed, stats.focus_minutes_today
    );
    let busy: Vec<String> = stats
        .daily_minutes
        .iter()
        .filter(|d| d.minutes > 0)
        .map(|d| format!("{}: {}m", &d.date[5..], d.minutes))
        .collect();
    if busy.is_empty() {
        out.push_str("No focus time logged in the last 7 days.\n");
    } else {
        out.push_str(&format!("Last 7 days — {}\n", busy.join(", ")));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::test_support::test_db;
    use crate::models::calendar::NewCalendarEvent;
    use crate::models::habit::NewHabit;

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 9, 28).unwrap()
    }

    #[test]
    fn classifies_common_questions() {
        assert_eq!(classify_intent("What do I have today?"), Intent::Today);
        assert_eq!(classify_intent("what tasks are overdue"), Intent::Overdue);
        assert_eq!(
            classify_intent("When is my next meeting?"),
            Intent::Upcoming
        );
        assert_eq!(
            classify_intent("what's on my calendar tomorrow"),
            Intent::Tomorrow
        );
        assert_eq!(classify_intent("how are my habits"), Intent::Habits);
        assert_eq!(
            classify_intent("how many focus sessions did I complete"),
            Intent::Focus
        );
        assert_eq!(classify_intent("summarize my day"), Intent::Summary);
        assert_eq!(classify_intent("explain rust ownership"), Intent::General);
    }

    #[test]
    fn context_reports_empty_state_honestly() {
        let db = test_db();
        let context = build_context(&db, "what do I have today", today()).unwrap();
        assert!(context.contains("none"));
        assert!(context.contains("Local date: 2026-09-28"));
    }

    #[test]
    fn today_question_includes_due_tasks() {
        let db = test_db();
        db.create_task("Ship the build", None, Some(3), Some("2026-09-28"))
            .unwrap();
        db.create_task("Later thing", None, None, Some("2026-10-01"))
            .unwrap();

        let context = build_context(&db, "what do I have today", today()).unwrap();
        assert!(context.contains("Ship the build"));
        assert!(context.contains("due today"));
        assert!(context.contains("urgent"));
    }

    #[test]
    fn overdue_question_only_lists_overdue_tasks() {
        let db = test_db();
        db.create_task("Late report", None, Some(2), Some("2026-09-20"))
            .unwrap();
        db.create_task("On time", None, None, Some("2026-09-30"))
            .unwrap();

        let context = build_context(&db, "what tasks are overdue", today()).unwrap();
        assert!(context.contains("Late report"));
        assert!(!context.contains("On time"));
    }

    #[test]
    fn upcoming_question_includes_events() {
        let db = test_db();
        // `upcoming_events` filters from the real wall clock, so anchor the
        // event to it instead of the fixture date to keep the test time-stable.
        let start = chrono::Local::now() + chrono::Duration::hours(1);
        let start = start.format("%Y-%m-%dT%H:%M").to_string();
        let end = (chrono::Local::now() + chrono::Duration::hours(2))
            .format("%Y-%m-%dT%H:%M")
            .to_string();
        db.create_event(&NewCalendarEvent {
            title: "Team sync".into(),
            start_time: start,
            end_time: end,
            ..Default::default()
        })
        .unwrap();

        let context = build_context(&db, "when is my next meeting", today()).unwrap();
        assert!(context.contains("Team sync"));
    }

    #[test]
    fn habit_question_includes_streaks() {
        let db = test_db();
        let habit = db
            .create_habit(&NewHabit {
                name: "Meditate".into(),
                ..Default::default()
            })
            .unwrap();
        db.complete_habit(&habit.id, "2026-09-27").unwrap();
        db.complete_habit(&habit.id, "2026-09-28").unwrap();

        let context = build_context(&db, "how are my habits", today()).unwrap();
        assert!(context.contains("Meditate"));
        assert!(context.contains("streak 2"));
        assert!(context.contains("done today"));
    }

    #[test]
    fn focus_question_includes_counts() {
        let db = test_db();
        let context =
            build_context(&db, "how many focus sessions did I complete", today()).unwrap();
        assert!(context.contains("Focus sessions"));
        assert!(context.contains("No focus time logged"));
    }

    #[test]
    fn context_stays_within_the_total_budget() {
        let db = test_db();
        for i in 0..200 {
            db.create_task(
                &format!("Task number {i}"),
                Some("a".repeat(400).as_str()),
                None,
                None,
            )
            .unwrap();
        }
        let context = build_context(&db, "summarize my day", today()).unwrap();
        assert!(
            context.len() <= TOTAL_LIMIT + SECTION_LIMIT,
            "context was {} chars",
            context.len()
        );
    }

    #[test]
    fn system_prompt_forbids_inventing_data() {
        let prompt = system_prompt();
        assert!(prompt.contains("Never invent"));
        assert!(prompt.contains("<local_context>"));
        assert!(prompt.contains("this machine"));
    }
}
