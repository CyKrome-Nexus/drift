//! The things that pause a running wallpaper: battery power, a fullscreen app, a busy CPU.
//!
//! The OS-specific reads (`on_battery`, `cpu_ticks`, `FullscreenProbe`) live in each OS file;
//! this file turns them into one [`Conditions`] per tick.

use super::{os, Display, Playback};

/// What the monitor saw on its last tick.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Conditions {
    pub on_battery: bool,
    /// Ids of the displays an app is fullscreen on.
    pub fullscreen: Vec<String>,
    /// Above 80% for a few seconds, and not yet back below 70%.
    pub cpu_busy: bool,
}

/// A rectangle in whatever space the OS reports windows in.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Rect {
    /// Whether `self` covers all of `other`, give or take a couple of pixels of rounding.
    fn covers(&self, other: &Rect) -> bool {
        const SLACK: f64 = 2.0;
        self.x <= other.x + SLACK
            && self.y <= other.y + SLACK
            && self.x + self.w >= other.x + other.w - SLACK
            && self.y + self.h >= other.y + other.h - SLACK
    }
}

/// The displays (id and rect, in the same space as `windows`) that some window covers entirely.
pub fn displays_covered(windows: &[Rect], displays: &[(String, Rect)]) -> Vec<String> {
    displays.iter().filter(|(_, d)| windows.iter().any(|w| w.covers(d))).map(|(id, _)| id.clone()).collect()
}

const BUSY_ABOVE: f64 = 80.0;
const CALM_BELOW: f64 = 70.0;
/// Consecutive samples (two-second ticks) needed to change state, so a short spike — opening
/// an app — doesn't flicker the wallpaper.
const STREAK: u32 = 2;

/// "Pause above 80% CPU", with hysteresis: busy after a few seconds above 80%, calm again only
/// after a few seconds below 70%, so the wallpaper's own load can't make it toggle.
#[derive(Debug, Default)]
pub struct Busy {
    busy: bool,
    streak: u32,
}

impl Busy {
    pub fn update(&mut self, usage: f64) -> bool {
        let crossing = if self.busy { usage < CALM_BELOW } else { usage > BUSY_ABOVE };
        self.streak = if crossing { self.streak + 1 } else { 0 };
        if self.streak >= STREAK {
            self.busy = !self.busy;
            self.streak = 0;
        }
        self.busy
    }
}

/// Whole-machine CPU use between two reads of the OS's (idle, total) tick counters.
#[derive(Default)]
struct CpuMeter {
    last: Option<(u64, u64)>,
}

impl CpuMeter {
    fn sample(&mut self) -> Option<f64> {
        let now = os::cpu_ticks()?;
        let usage = self.last.and_then(|last| usage_between(last, now));
        self.last = Some(now);
        usage
    }
}

/// Percent busy between two (idle, total) readings.
fn usage_between((idle0, total0): (u64, u64), (idle1, total1): (u64, u64)) -> Option<f64> {
    let total = total1.checked_sub(total0)?;
    let idle = idle1.checked_sub(idle0)?;
    (total > 0).then(|| 100.0 * (total.saturating_sub(idle)) as f64 / total as f64)
}

pub struct Sampler {
    cpu: CpuMeter,
    busy: Busy,
    fullscreen: os::FullscreenProbe,
}

impl Sampler {
    pub fn new() -> Self {
        Self { cpu: CpuMeter::default(), busy: Busy::default(), fullscreen: os::FullscreenProbe::new() }
    }

    /// Forget the CPU history (nothing is running, so the next wallpaper starts fresh).
    pub fn reset(&mut self) {
        self.cpu = CpuMeter::default();
        self.busy = Busy::default();
    }

    /// Read only what the switched-on settings need.
    pub fn sample(&mut self, playback: &Playback, displays: &[Display]) -> Conditions {
        let on_battery = playback.pause_on_battery && os::on_battery();
        let fullscreen = if playback.pause_fullscreen { self.fullscreen.covered(displays) } else { vec![] };
        let cpu_busy = if playback.pause_high_cpu {
            match self.cpu.sample() {
                Some(usage) => self.busy.update(usage),
                None => false,
            }
        } else {
            self.reset();
            false
        };
        Conditions { on_battery, fullscreen, cpu_busy }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn busy_needs_a_streak_to_change_and_has_hysteresis() {
        let mut b = Busy::default();
        assert!(!b.update(95.0), "one spike is not enough");
        assert!(!b.update(50.0));
        assert!(!b.update(95.0));
        assert!(b.update(95.0), "two in a row is");
        assert!(b.update(75.0), "between 70 and 80 stays busy");
        assert!(b.update(75.0));
        assert!(b.update(60.0));
        assert!(!b.update(60.0), "two calm samples clear it");
    }

    #[test]
    fn cpu_usage_is_the_busy_share_of_elapsed_ticks() {
        assert_eq!(usage_between((100, 1000), (150, 1100)), Some(50.0));
        assert_eq!(usage_between((100, 1000), (100, 1000)), None);
        // Counters that went backwards (a wrap or a reset) are not a reading.
        assert_eq!(usage_between((100, 1000), (50, 900)), None);
    }

    #[test]
    fn a_display_counts_as_fullscreen_only_when_a_window_covers_all_of_it() {
        let displays = vec![
            ("main".to_string(), Rect { x: 0.0, y: 0.0, w: 1440.0, h: 900.0 }),
            ("side".to_string(), Rect { x: 1440.0, y: 0.0, w: 1920.0, h: 1080.0 }),
        ];
        let fullscreen = Rect { x: 1440.0, y: 0.0, w: 1920.0, h: 1080.0 };
        let maximised = Rect { x: 0.0, y: 25.0, w: 1440.0, h: 875.0 };
        assert_eq!(displays_covered(&[fullscreen, maximised], &displays), ["side"]);
        assert!(displays_covered(&[], &displays).is_empty());
    }
}
