//! Client for the public asset endpoints of api.deadlock-api.com (heroes, ranked seasons).

#![forbid(unsafe_code)]
#![cfg_attr(
    test,
    allow(
        clippy::arithmetic_side_effects,
        clippy::disallowed_macros,
        clippy::disallowed_methods,
        clippy::expect_used,
        clippy::indexing_slicing,
        clippy::panic,
        clippy::panic_in_result_fn,
        clippy::print_stderr,
        clippy::print_stdout,
        clippy::string_slice,
        clippy::unreachable,
        clippy::unwrap_in_result,
        clippy::unwrap_used,
        reason = "tests may panic"
    )
)]

use core::time::Duration;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct Hero {
    pub id: u32,
    pub in_development: Option<bool>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct SeasonInterval {
    pub interval: u32,
    pub start_timestamp: i64,
    pub end_timestamp: i64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct RankInfo {
    /// Rank points of each subrank step I to VI, when the entry sets them.
    #[serde(default)]
    pub sub_rank_xp: Vec<u32>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct RankedSeason {
    pub calibration_matches: u32,
    pub intervals: Vec<SeasonInterval>,
    #[serde(default)]
    pub rank_info: Vec<RankInfo>,
}

/// The rank ladder of a ranked interval: the points of each subrank step I to VI.
///
/// A tier spans their sum and Eternus starts after 10 tiers. The same ladder as the `rankBadge`
/// `ClickHouse` function (`db/clickhouse/_functions`), which reads it from
/// `ranked_season_intervals`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RankLadder {
    sub_rank_xp: [u32; 6],
}

/// Eternus I, the first badge whose subranks are percentile cuts rather than point spans.
const ETERNUS_MIN_BADGE: u32 = 111;

impl RankLadder {
    /// Beta Season 1 (interval 1): 1000 per subrank, 2000 for the last; a tier is 7000.
    pub const SEASON_1: Self = Self {
        sub_rank_xp: [1000, 1000, 1000, 1000, 1000, 2000],
    };
    /// Beta Season 2 (interval 2): 1000 per subrank, 1500 for the last; a tier is 6500.
    pub const SEASON_2: Self = Self {
        sub_rank_xp: [1000, 1000, 1000, 1000, 1000, 1500],
    };

    /// The ladder of `steps`, which must list one positive step per subrank.
    #[must_use]
    pub fn new(steps: &[u32]) -> Option<Self> {
        let sub_rank_xp: [u32; 6] = steps.try_into().ok()?;
        sub_rank_xp
            .iter()
            .all(|&step| step > 0)
            .then_some(Self { sub_rank_xp })
    }

    /// The ladder of `interval` when the seasons couldn't be loaded, as in the `rankSubrankXp`
    /// `ClickHouse` function: interval 1 (also when unknown) has Season 1's, later ones Season 2's.
    #[must_use]
    pub fn builtin(interval: Option<u32>) -> Self {
        if interval.unwrap_or(1) <= 1 {
            Self::SEASON_1
        } else {
            Self::SEASON_2
        }
    }

    /// The badge (`tier * 10 + subrank`) of `flat_progress`. In Eternus, where subranks are
    /// percentile cuts, the division comes from `display_rank`, and is at least Eternus I.
    #[must_use]
    pub fn badge(&self, flat_progress: u32, display_rank: u32) -> u32 {
        let tier_width = self
            .sub_rank_xp
            .iter()
            .fold(0_u32, |a, &b| a.saturating_add(b));
        if flat_progress >= tier_width.saturating_mul(10) {
            return display_rank.max(ETERNUS_MIN_BADGE);
        }
        let (Some(tier), Some(within)) = (
            flat_progress.checked_div(tier_width),
            flat_progress.checked_rem(tier_width),
        ) else {
            return display_rank;
        };
        // The subrank whose cumulative start is the last one at or below `within`.
        let mut start = 0_u32;
        let mut subrank = 0_u32;
        for &step in &self.sub_rank_xp {
            if start > within {
                break;
            }
            subrank = subrank.saturating_add(1);
            start = start.saturating_add(step);
        }
        tier.saturating_add(1)
            .saturating_mul(10)
            .saturating_add(subrank)
    }
}

/// What the ranked seasons say: the season running now and the ladder of every interval.
#[derive(Debug, Clone, Default)]
pub struct Seasons {
    /// The ranked season running right now. `None` between seasons.
    pub current: Option<CurrentSeason>,
    /// The rank ladder of each interval whose season lists one.
    pub ladders: HashMap<u32, RankLadder>,
}

impl Seasons {
    /// The ladder of `interval`, or the built-in one (see [`RankLadder::builtin`]).
    #[must_use]
    pub fn ladder(&self, interval: Option<u32>) -> RankLadder {
        interval
            .and_then(|i| self.ladders.get(&i).copied())
            .unwrap_or_else(|| RankLadder::builtin(interval))
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
pub struct CurrentSeason {
    /// Feeds the `rank_interval` field of `CMsgClientToGCGetMatchHistory`.
    pub interval: u32,
    /// How many placement matches the season runs.
    pub calibration_matches: u32,
}

/// The ranked seasons: the one running now and every interval's rank ladder.
pub async fn fetch_seasons(http_client: &reqwest::Client) -> reqwest::Result<Seasons> {
    let seasons: Vec<RankedSeason> = http_client
        .get("https://api.deadlock-api.com/v1/assets/ranked-seasons")
        .send()
        .await?
        .json()
        .await?;
    let now = i64::try_from(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or(Duration::ZERO)
            .as_secs(),
    )
    .unwrap_or(i64::MAX);
    let current = seasons.iter().find_map(|s| {
        s.intervals
            .iter()
            .find(|i| (i.start_timestamp..=i.end_timestamp).contains(&now))
            .map(|i| CurrentSeason {
                interval: i.interval,
                calibration_matches: s.calibration_matches,
            })
    });
    let ladders = seasons
        .iter()
        .filter_map(|s| {
            // As in every season so far, the first entry that lists steps covers all ranks.
            let steps = s.rank_info.iter().find(|r| !r.sub_rank_xp.is_empty())?;
            Some((s, RankLadder::new(&steps.sub_rank_xp)?))
        })
        .flat_map(|(s, ladder)| s.intervals.iter().map(move |i| (i.interval, ladder)))
        .collect();
    Ok(Seasons { current, ladders })
}

pub async fn fetch_hero_ids(http_client: &reqwest::Client) -> reqwest::Result<Vec<u32>> {
    let heroes: Vec<Hero> = http_client
        .get("https://api.deadlock-api.com/v1/assets/heroes?only_active=true")
        .send()
        .await?
        .json()
        .await?;
    Ok(heroes
        .iter()
        .filter(|h| h.in_development.is_none_or(|d| !d))
        .map(|h| h.id)
        .collect())
}

/// Calls `on_refresh` with the ranked seasons right away and then hourly, from a
/// background task. Seasons turn over on the order of months, so that is ample. A failed
/// fetch is logged and skipped.
pub fn spawn_season_refresh_task<F>(on_refresh: F) -> reqwest::Result<()>
where
    F: Fn(Seasons) + Send + 'static,
{
    let http_client = service_utils::http_client()?;
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_hours(1));
        loop {
            interval.tick().await;
            match fetch_seasons(&http_client).await {
                Ok(seasons) => on_refresh(seasons),
                Err(e) => tracing::warn!("Failed to refresh ranked season: {e:?}"),
            }
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn season_1_ladder() {
        for (progress, expected) in [
            (0, 11),
            (999, 11),
            (1_000, 12),
            (5_000, 16),
            (6_975, 16),
            (7_000, 21),
            (53_225, 85),
            (69_999, 106),
        ] {
            assert_eq!(
                RankLadder::SEASON_1.badge(progress, 84),
                expected,
                "{progress}"
            );
        }
    }

    #[test]
    fn season_2_ladder() {
        // The issue's examples: 49_900 is Oracle V on the Season 2 ladder, 81 on Season 1's.
        for (progress, expected) in [
            (0, 11),
            (4_999, 15),
            (5_000, 16),
            (6_499, 16),
            (6_500, 21),
            (49_900, 85),
            (50_250, 85),
            (64_000, 106),
            (64_999, 106),
        ] {
            assert_eq!(
                RankLadder::SEASON_2.badge(progress, 84),
                expected,
                "{progress}"
            );
        }
        assert_eq!(RankLadder::SEASON_1.badge(49_900, 85), 81);
    }

    #[test]
    fn eternus_division_comes_from_the_display_rank() {
        assert_eq!(RankLadder::SEASON_1.badge(70_000, 106), 111);
        assert_eq!(RankLadder::SEASON_1.badge(84_830, 114), 114);
        assert_eq!(RankLadder::SEASON_2.badge(65_000, 106), 111);
    }

    #[test]
    fn ladders_need_six_positive_steps_and_fall_back_by_interval() {
        assert_eq!(RankLadder::new(&[1000, 1500]), None);
        assert_eq!(RankLadder::new(&[0, 1000, 1000, 1000, 1000, 1500]), None);
        assert_eq!(
            RankLadder::new(&[1000, 1000, 1000, 1000, 1000, 1500]),
            Some(RankLadder::SEASON_2)
        );
        let seasons = Seasons::default();
        assert_eq!(seasons.ladder(None), RankLadder::SEASON_1);
        assert_eq!(seasons.ladder(Some(1)), RankLadder::SEASON_1);
        assert_eq!(seasons.ladder(Some(3)), RankLadder::SEASON_2);
    }

    #[test]
    fn parses_the_ranked_seasons_response() {
        let seasons: Vec<RankedSeason> = serde_json::from_str(
            r#"[{"calibration_matches":8,"intervals":[{"interval":2,"start_timestamp":1,"end_timestamp":2}],
                "rank_info":[{"sub_rank_xp":[1000,1000,1000,1000,1000,1500]},{"rank_end":91,"badge_shields":3}]}]"#,
        )
        .unwrap();
        assert_eq!(seasons[0].rank_info[0].sub_rank_xp.len(), 6);
        assert_eq!(seasons[0].rank_info[1].sub_rank_xp, Vec::<u32>::new());
    }
}
