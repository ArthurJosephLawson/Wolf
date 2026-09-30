use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HabitFrequency {
    Daily,
    Weekdays,
    Weekly,
}

impl HabitFrequency {
    pub fn as_str(self) -> &'static str {
        match self {
            HabitFrequency::Daily => "daily",
            HabitFrequency::Weekdays => "weekdays",
            HabitFrequency::Weekly => "weekly",
        }
    }

    pub fn parse(raw: &str) -> Self {
        match raw {
            "weekdays" => HabitFrequency::Weekdays,
            "weekly" => HabitFrequency::Weekly,
            _ => HabitFrequency::Daily,
        }
    }

    /// Is `weekday` (0 = Monday .. 6 = Sunday) a scheduled day?
    pub fn is_due_on(self, weekday: chrono::Weekday) -> bool {
        match self {
            HabitFrequency::Daily => true,
            HabitFrequency::Weekdays => {
                !matches!(weekday, chrono::Weekday::Sat | chrono::Weekday::Sun)
            }
            HabitFrequency::Weekly => weekday == chrono::Weekday::Mon,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Habit {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub frequency: HabitFrequency,
    pub target_per_period: u32,
    pub color: String,
    pub created_at: String,
    pub archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NewHabit {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub frequency: Option<HabitFrequency>,
    #[serde(default)]
    pub target_per_period: Option<u32>,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HabitUpdate {
    pub name: Option<String>,
    pub description: Option<String>,
    pub frequency: Option<HabitFrequency>,
    pub target_per_period: Option<u32>,
    pub color: Option<String>,
    pub archived: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HabitCompletion {
    pub id: String,
    pub habit_id: String,
    /// Local calendar date, `YYYY-MM-DD`.
    pub completed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HabitWithProgress {
    #[serde(flatten)]
    pub habit: Habit,
    /// Local date the UI should render as "today".
    pub today: String,
    pub completed_today: bool,
    /// Consecutive scheduled days completed, counting today backwards.
    pub current_streak: u32,
    /// Longest streak ever recorded for this habit.
    pub longest_streak: u32,
    /// Days completed out of the last 28 days, oldest first.
    pub recent: Vec<HabitDay>,
    pub completions_30d: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HabitDay {
    pub date: String,
    pub completed: bool,
    pub scheduled: bool,
}
