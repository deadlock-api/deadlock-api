//! When each patch of the combined forum + Steam feed was live.

use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use chrono_tz::America::Los_Angeles;

use crate::services::steam::types::FeedItem;

/// The time a patch was live: from `start` until the next patch of the same source started,
/// open-ended for the live patch.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct LiveWindow {
    pub(crate) start: DateTime<Utc>,
    pub(crate) end: Option<DateTime<Utc>>,
}

/// One window per feed item, in feed order. `builds` are the client build times, oldest first.
///
/// A Steam post goes up within minutes of its patch. A forum thread's `pubDate` is when it was
/// last edited, often weeks after the patch (three threads at once on 2026-09-16), so a thread
/// starts with the release build on the date in its title instead.
pub(crate) fn live_windows(feed: &[FeedItem], builds: &[DateTime<Utc>]) -> Vec<LiveWindow> {
    let starts: Vec<_> = feed
        .iter()
        .map(|item| match item {
            FeedItem::Forum(p) => forum_start(&p.title, p.pub_date.to_utc(), builds),
            FeedItem::Steam(p) => p.pub_date.to_utc(),
        })
        .collect();
    feed.iter()
        .zip(&starts)
        .map(|(item, &start)| LiveWindow {
            start,
            end: feed
                .iter()
                .zip(&starts)
                .filter(|&(other, &s)| {
                    core::mem::discriminant(item) == core::mem::discriminant(other) && s > start
                })
                .map(|(_, &s)| s)
                .min(),
        })
        .collect()
}

/// The release build on the thread's title date (Pacific, Valve's time zone). A thread posted
/// that day went up right after its release build; any later build that day is a hotfix. A
/// thread edited on a later day only narrows it down to the day's first build. Without a build
/// that day, the day's start; without a title date, `pub_date`.
fn forum_start(title: &str, pub_date: DateTime<Utc>, builds: &[DateTime<Utc>]) -> DateTime<Utc> {
    let Some(day) = title_date(title) else {
        return pub_date;
    };
    let (Some(from), Some(until)) = (
        pacific_midnight(day),
        day.succ_opt().and_then(pacific_midnight),
    ) else {
        return pub_date;
    };
    let on_day =
        &builds[builds.partition_point(|&b| b < from)..builds.partition_point(|&b| b < until)];
    let release = if (from..until).contains(&pub_date) {
        on_day.iter().rev().find(|&&b| b <= pub_date)
    } else {
        None
    };
    release.or(on_day.first()).copied().unwrap_or(from)
}

fn pacific_midnight(day: NaiveDate) -> Option<DateTime<Utc>> {
    day.and_time(NaiveTime::MIN)
        .and_local_timezone(Los_Angeles)
        .earliest()
        .map(|t| t.to_utc())
}

/// The first `MM-DD-YYYY` date in a thread title, e.g. `08-12-2026 Update`.
fn title_date(title: &str) -> Option<NaiveDate> {
    title.as_bytes().windows(10).find_map(|w| {
        let shape = w.iter().enumerate().all(|(i, &c)| {
            if i == 2 || i == 5 {
                c == b'-'
            } else {
                c.is_ascii_digit()
            }
        });
        // Checked first: `%Y` alone would also take a 3-digit year after a leading space.
        let date = core::str::from_utf8(w).ok().filter(|_| shape)?;
        NaiveDate::parse_from_str(date, "%m-%d-%Y").ok()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::steam::types::{ForumPatch, PatchCategory, PatchGuid, SteamNews};

    fn utc(s: &str) -> DateTime<Utc> {
        s.parse().unwrap()
    }

    fn guid() -> PatchGuid {
        PatchGuid {
            is_perma_link: false,
            text: String::new(),
        }
    }

    fn forum(title: &str, pub_date: &str) -> FeedItem {
        FeedItem::Forum(ForumPatch {
            title: title.into(),
            pub_date: utc(pub_date).fixed_offset(),
            link: String::new(),
            guid: guid(),
            category: PatchCategory {
                domain: String::new(),
                text: "Changelog".into(),
            },
            content: String::new(),
        })
    }

    fn steam(pub_date: &str) -> FeedItem {
        FeedItem::Steam(SteamNews {
            title: "Minor Update".into(),
            pub_date: utc(pub_date).fixed_offset(),
            link: String::new(),
            guid: guid(),
            content: String::new(),
        })
    }

    #[test]
    fn title_date_is_found_anywhere() {
        assert_eq!(
            title_date("08-12-2026 Update"),
            NaiveDate::from_ymd_opt(2026, 8, 12)
        );
        assert_eq!(
            title_date("09-29-2026"),
            NaiveDate::from_ymd_opt(2026, 9, 29)
        );
        assert_eq!(
            title_date("Update – 01-30-2026"),
            NaiveDate::from_ymd_opt(2026, 1, 30)
        );
        assert_eq!(title_date("Hotfix 1-30-2026"), None);
    }

    /// The forum feed of 2026-10-20: three threads edited together on 09-16, the latest one
    /// edited on 10-15 for the 10-14 update.
    #[test]
    fn forum_threads_start_with_the_release_build_of_their_title_date() {
        let feed = [
            forum("09-29-2026", "2026-10-15T03:12:00Z"),
            forum("09-16-2026 Update", "2026-09-16T22:41:46Z"),
            forum("08-22-2026 Update", "2026-09-16T22:41:28Z"),
            forum("08-12-2026 Update", "2026-09-16T22:41:13Z"),
        ];
        let builds = [
            utc("2026-08-12T22:52:00Z"),
            utc("2026-08-22T17:38:00Z"),
            utc("2026-09-16T20:11:00Z"),
            utc("2026-09-16T23:30:00Z"),
            utc("2026-09-29T20:26:28Z"),
            utc("2026-09-29T22:55:11Z"),
        ];
        let windows: Vec<_> = live_windows(&feed, &builds)
            .into_iter()
            .map(|w| (w.start, w.end))
            .collect();
        assert_eq!(
            windows,
            [
                (utc("2026-09-29T20:26:28Z"), None),
                // Posted that day, so not the 23:30 hotfix built after the post.
                (
                    utc("2026-09-16T20:11:00Z"),
                    Some(utc("2026-09-29T20:26:28Z"))
                ),
                (
                    utc("2026-08-22T17:38:00Z"),
                    Some(utc("2026-09-16T20:11:00Z"))
                ),
                (
                    utc("2026-08-12T22:52:00Z"),
                    Some(utc("2026-08-22T17:38:00Z"))
                ),
            ]
        );
    }

    #[test]
    fn forum_thread_without_a_build_starts_at_pacific_midnight() {
        let feed = [forum("03-21-2026 Update", "2026-03-31T01:35:20Z")];
        // PDT (UTC-7) since 2026-03-08.
        assert_eq!(
            live_windows(&feed, &[])[0].start,
            utc("2026-03-21T07:00:00Z")
        );
    }

    #[test]
    fn steam_posts_start_at_their_pub_date_and_end_per_source() {
        let feed = [
            steam("2026-10-15T03:11:58Z"),
            forum("Patch", "2026-10-10T00:00:00Z"),
            steam("2026-10-05T23:05:32Z"),
        ];
        let windows = live_windows(&feed, &[]);
        assert_eq!(
            windows,
            [
                LiveWindow {
                    start: utc("2026-10-15T03:11:58Z"),
                    end: None,
                },
                LiveWindow {
                    start: utc("2026-10-10T00:00:00Z"),
                    end: None,
                },
                LiveWindow {
                    start: utc("2026-10-05T23:05:32Z"),
                    end: Some(utc("2026-10-15T03:11:58Z")),
                },
            ]
        );
    }
}
