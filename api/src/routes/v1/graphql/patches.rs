//! The `patches` root query and the `Patch`-scoped match queries.

use async_graphql::{ComplexObject, Context, InputObject, Result as GqlResult, SimpleObject};
use chrono::{DateTime, Utc};

use crate::context::AppState;
use crate::routes::v1::graphql::cost;
use crate::routes::v1::graphql::filters::{
    I64Filter, MatchHistoryWhere, MatchPlayerWhere, StringFilter,
};
use crate::routes::v1::graphql::schema::{
    OrderByMatch, OrderByMatchHistory, OrderByMatchPlayer, OrderDirection, Page,
    load_match_history, load_match_players, load_matches,
};
use crate::routes::v1::graphql::types::{Match, MatchHistoryEntry, MatchPlayer};
use crate::services::steam::patch_windows::live_windows;
use crate::services::steam::types::FeedItem;

/// One entry of the patch feed — the same data as the REST `/v2/patches`
/// endpoint.
#[derive(Clone, Debug, SimpleObject)]
#[graphql(complex, rename_fields = "snake_case")]
pub(super) struct Patch {
    /// `forum` (official forum changelog) or `steam` (Steam news feed).
    source: &'static str,
    title: String,
    /// When the patch was published, as a unix timestamp. For `forum` patches
    /// this is when the thread was last edited, often weeks after the patch.
    pub_date: i64,
    /// When the patch went live, as a unix timestamp: the `pub_date` of a
    /// `steam` post, the release build on the date in a `forum` thread's title.
    start_date: i64,
    /// When the next patch of the same `source` went live, as a unix
    /// timestamp. `null` for the patch that is currently live.
    end_date: Option<i64>,
    link: String,
    guid: String,
    /// Only set for `forum` patches.
    category: Option<String>,
    content: String,
}

impl Patch {
    /// SQL predicate selecting the matches started while this patch was live.
    fn live_scope(&self) -> Option<String> {
        I64Filter {
            gte: Some(self.start_date),
            lt: self.end_date,
            ..Default::default()
        }
        .to_start_time_sql()
    }
}

#[ComplexObject(rename_fields = "snake_case", rename_args = "snake_case")]
impl Patch {
    /// The root `matches` query, scoped to the matches started while this
    /// patch was live (`start_date` until `end_date`).
    #[graphql(
        complexity = "cost::patch_matches(where_.as_ref(), order_by, limit, offset, child_complexity)"
    )]
    async fn matches(
        &self,
        ctx: &Context<'_>,
        #[graphql(name = "where")] where_: Option<MatchPlayerWhere>,
        order_by: Option<OrderByMatch>,
        order_direction: Option<OrderDirection>,
        #[graphql(default = 100)] limit: u32,
        #[graphql(default = 0)] offset: u32,
    ) -> GqlResult<Vec<Match>> {
        let page = Page {
            order_by,
            order_direction,
            limit,
            offset,
        };
        load_matches(ctx, where_, page, self.live_scope()).await
    }

    /// The root `match_players` query, scoped to the matches started while
    /// this patch was live (`start_date` until `end_date`).
    #[graphql(
        complexity = "cost::patch_match_players(where_.as_ref(), order_by, limit, offset, child_complexity)"
    )]
    async fn match_players(
        &self,
        ctx: &Context<'_>,
        #[graphql(name = "where")] where_: Option<MatchPlayerWhere>,
        order_by: Option<OrderByMatchPlayer>,
        order_direction: Option<OrderDirection>,
        #[graphql(default = 100)] limit: u32,
        #[graphql(default = 0)] offset: u32,
    ) -> GqlResult<Vec<MatchPlayer>> {
        let page = Page {
            order_by,
            order_direction,
            limit,
            offset,
        };
        load_match_players(ctx, where_, page, self.live_scope()).await
    }

    /// The root `match_history` query, scoped to the matches started while
    /// this patch was live (`start_date` until `end_date`).
    #[graphql(complexity = "cost::match_history(where_.as_ref(), limit, child_complexity)")]
    async fn match_history(
        &self,
        ctx: &Context<'_>,
        #[graphql(name = "where")] where_: Option<MatchHistoryWhere>,
        order_by: Option<OrderByMatchHistory>,
        order_direction: Option<OrderDirection>,
        #[graphql(default = 100)] limit: u32,
        #[graphql(default = 0)] offset: u32,
    ) -> GqlResult<Vec<MatchHistoryEntry>> {
        let page = Page {
            order_by,
            order_direction,
            limit,
            offset,
        };
        load_match_history(ctx, where_, page, self.live_scope()).await
    }
}

/// Filter input for the `patches` query. Operations across fields are AND-ed.
#[derive(Clone, Debug, Default, InputObject)]
#[graphql(rename_fields = "snake_case")]
pub(super) struct PatchWhere {
    source: Option<StringFilter>,
    category: Option<StringFilter>,
    pub_date: Option<I64Filter>,
    start_date: Option<I64Filter>,
    /// `{is_null: true}` selects the patches that are currently live.
    end_date: Option<I64Filter>,
}

impl PatchWhere {
    fn matches(&self, patch: &Patch) -> bool {
        self.source
            .as_ref()
            .is_none_or(|f| f.matches(Some(patch.source)))
            && self
                .category
                .as_ref()
                .is_none_or(|f| f.matches(patch.category.as_deref()))
            && self
                .pub_date
                .as_ref()
                .is_none_or(|f| f.matches(Some(patch.pub_date)))
            && self
                .start_date
                .as_ref()
                .is_none_or(|f| f.matches(Some(patch.start_date)))
            && self
                .end_date
                .as_ref()
                .is_none_or(|f| f.matches(patch.end_date))
    }
}

/// The patch feed is an in-memory list, so its filters are evaluated here
/// instead of being compiled to SQL. `NULL` semantics follow SQL: a comparison
/// with a missing value never matches.
impl I64Filter {
    fn matches(&self, value: Option<i64>) -> bool {
        let cmp = |expected: Option<i64>, op: fn(&i64, &i64) -> bool| {
            expected.is_none_or(|e| value.is_some_and(|v| op(&v, &e)))
        };
        cmp(self.eq, i64::eq)
            && cmp(self.gt, i64::gt)
            && cmp(self.gte, i64::ge)
            && cmp(self.lt, i64::lt)
            && cmp(self.lte, i64::le)
            && self
                .r#in
                .as_ref()
                .filter(|vs| !vs.is_empty())
                .is_none_or(|vs| value.is_some_and(|v| vs.contains(&v)))
            && self.is_null.is_none_or(|b| value.is_none() == b)
    }
}

impl StringFilter {
    fn matches(&self, value: Option<&str>) -> bool {
        self.eq.as_deref().is_none_or(|e| value == Some(e))
            && self
                .r#in
                .as_ref()
                .filter(|vs| !vs.is_empty())
                .is_none_or(|vs| value.is_some_and(|v| vs.iter().any(|e| e == v)))
            && self.is_null.is_none_or(|b| value.is_none() == b)
    }
}

/// `builds` are the client build times, oldest first.
fn to_patches(feed: Vec<FeedItem>, builds: &[DateTime<Utc>]) -> Vec<Patch> {
    let windows = live_windows(&feed, builds);
    feed.into_iter()
        .zip(windows)
        .map(|(item, window)| {
            let pub_date = item.pub_date().timestamp();
            let start_date = window.start.timestamp();
            let end_date = window.end.map(|t| t.timestamp());
            match item {
                FeedItem::Forum(p) => Patch {
                    source: "forum",
                    title: p.title,
                    pub_date,
                    start_date,
                    end_date,
                    link: p.link,
                    guid: p.guid.text,
                    category: Some(p.category.text),
                    content: p.content,
                },
                FeedItem::Steam(p) => Patch {
                    source: "steam",
                    title: p.title,
                    pub_date,
                    start_date,
                    end_date,
                    link: p.link,
                    guid: p.guid.text,
                    category: None,
                    content: p.content,
                },
            }
        })
        .collect()
}

pub(super) async fn load_patches(
    state: &AppState,
    where_: Option<&PatchWhere>,
    order_direction: OrderDirection,
    limit: u32,
    offset: u32,
) -> GqlResult<Vec<Patch>> {
    let feed = state
        .steam_client
        .fetch_combined_patch_feed()
        .await
        .map_err(|e| async_graphql::Error::new(e.to_string()))?;
    let builds = state.assets_client.build_times().await;
    let mut patches = to_patches(feed, &builds);
    patches.retain(|p| where_.is_none_or(|w| w.matches(p)));
    if order_direction == OrderDirection::Asc {
        patches.reverse();
    }
    Ok(patches
        .into_iter()
        .skip(offset as usize)
        .take(limit as usize)
        .collect())
}

#[cfg(test)]
mod tests {
    use chrono::DateTime;

    use super::*;
    use crate::services::steam::types::{ForumPatch, PatchCategory, PatchGuid, SteamNews};

    fn guid() -> PatchGuid {
        PatchGuid {
            is_perma_link: false,
            text: "guid".into(),
        }
    }

    fn forum(ts: i64) -> FeedItem {
        FeedItem::Forum(ForumPatch {
            title: "forum".into(),
            pub_date: DateTime::from_timestamp(ts, 0).unwrap().fixed_offset(),
            link: String::new(),
            guid: guid(),
            category: PatchCategory {
                domain: String::new(),
                text: "Changelog".into(),
            },
            content: String::new(),
        })
    }

    fn steam(ts: i64) -> FeedItem {
        FeedItem::Steam(SteamNews {
            title: "steam".into(),
            pub_date: DateTime::from_timestamp(ts, 0).unwrap().fixed_offset(),
            link: String::new(),
            guid: guid(),
            content: String::new(),
        })
    }

    #[test]
    fn end_date_is_the_next_patch_of_the_same_source() {
        let patches = to_patches(vec![forum(400), steam(300), forum(200), steam(100)], &[]);
        let windows: Vec<_> = patches
            .iter()
            .map(|p| (p.source, p.start_date, p.end_date))
            .collect();
        assert_eq!(
            windows,
            vec![
                ("forum", 400, None),
                ("steam", 300, None),
                ("forum", 200, Some(400)),
                ("steam", 100, Some(300)),
            ]
        );
    }

    #[test]
    fn live_scope_is_open_ended_for_the_live_patch() {
        let patches = to_patches(vec![forum(400), forum(200)], &[]);
        assert_eq!(
            patches[0].live_scope().unwrap(),
            "start_time >= toDateTime(400)"
        );
        assert_eq!(
            patches[1].live_scope().unwrap(),
            "(start_time >= toDateTime(200) AND start_time < toDateTime(400))"
        );
    }

    #[test]
    fn where_filters_in_memory() {
        let patches = to_patches(vec![forum(400), steam(300), forum(200)], &[]);
        let live_forum = PatchWhere {
            source: Some(StringFilter {
                eq: Some("forum".into()),
                ..Default::default()
            }),
            end_date: Some(I64Filter {
                is_null: Some(true),
                ..Default::default()
            }),
            ..Default::default()
        };
        let hits: Vec<_> = patches.iter().filter(|p| live_forum.matches(p)).collect();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].pub_date, 400);

        // A comparison never matches a missing `end_date`.
        let ended_before = PatchWhere {
            end_date: Some(I64Filter {
                lte: Some(1_000),
                ..Default::default()
            }),
            ..Default::default()
        };
        let hits: Vec<_> = patches.iter().filter(|p| ended_before.matches(p)).collect();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].pub_date, 200);
    }
}
