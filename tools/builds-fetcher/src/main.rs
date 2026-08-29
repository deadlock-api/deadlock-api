#![forbid(unsafe_code)]
#![deny(clippy::all)]
#![deny(unreachable_pub)]
#![deny(clippy::correctness)]
#![deny(clippy::suspicious)]
#![deny(clippy::style)]
#![deny(clippy::complexity)]
#![deny(clippy::perf)]
#![deny(clippy::pedantic)]
#![deny(clippy::std_instead_of_core)]
#![expect(clippy::cast_possible_wrap)]

use core::time::Duration;
use std::collections::HashMap;

use itertools::Itertools;
use metrics::counter;
use rand::prelude::SliceRandom;
use rand::rng;
use sqlx::postgres::PgQueryResult;
use sqlx::types::time::PrimitiveDateTime;
use sqlx::{Pool, Postgres, QueryBuilder};
use time::OffsetDateTime;
use tokio::time::sleep;
use tracing::{debug, info, instrument, warn};
use valveprotos::deadlock::c_msg_client_to_gc_find_hero_builds_response::HeroBuildResult;
use valveprotos::deadlock::{
    CMsgClientToGcFindHeroBuilds, CMsgClientToGcFindHeroBuildsResponse, EgcCitadelClientMessages,
};

// const ALL_LANGS: &[i32] = &[
//     0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 25, 26, 27,
//     255,
// ];
const ASCII_LOWER: [char; 26] = [
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's',
    't', 'u', 'v', 'w', 'x', 'y', 'z',
];

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _otel_guard = common::init_tracing(env!("CARGO_PKG_NAME"));
    common::init_metrics()?;
    let http_client = reqwest::Client::new();
    let pg_client = common::get_pg_client().await?;
    let ch_client = common::get_ch_client()?;

    loop {
        run_update_loop(&http_client, &pg_client, &ch_client).await;
    }
}

async fn run_update_loop(
    http_client: &reqwest::Client,
    pg_client: &Pool<Postgres>,
    ch_client: &clickhouse::Client,
) {
    let mut heroes = match common::fetch_hero_ids(http_client).await {
        Ok(heroes) => {
            counter!("builds_fetcher.heroes_fetched.success").increment(1);
            debug!("Fetched hero ids: {:?}", heroes);
            heroes
        }
        Err(e) => {
            counter!("builds_fetcher.heroes_fetched.failure").increment(1);
            warn!("Failed to fetch hero ids: {e}");
            sleep(Duration::from_secs(10)).await;
            return;
        }
    };
    heroes.shuffle(&mut rng());

    // for hero_id in heroes {
    //     for langs in ALL_LANGS.chunks(2) {
    //         if langs.contains(&0) {
    //             for search in ASCII_LOWER
    //                 .iter()
    //                 .cartesian_product(ASCII_LOWER.iter())
    //                 .cartesian_product(ASCII_LOWER.iter())
    //             {
    //                 let search = format!("{}{}{}", search.0.0, search.0.1, search.1);
    //                 update_builds(http_client, pg_client, hero_id, langs, Some(search)).await;
    //             }
    //         } else {
    //             update_builds(http_client, pg_client, hero_id, langs, None).await;
    //         }
    //     }
    // }

    for ((a, b), c) in ASCII_LOWER
        .iter()
        .cartesian_product(ASCII_LOWER.iter())
        .cartesian_product(ASCII_LOWER.iter())
    {
        fetch_missing_builds(http_client, pg_client, ch_client).await;
        for &hero_id in &heroes {
            let search = format!("{a}{b}{c}");
            update_builds(http_client, pg_client, hero_id, &[0], Some(search)).await;
        }
    }
}

/// Fetches builds seen in analyzed demos that the search crawl hasn't picked up.
/// Ids the GC returns nothing for (private/deleted builds) are recorded in
/// `hero_builds_fetch_failed` and never tried again.
#[instrument(skip_all)]
async fn fetch_missing_builds(
    http_client: &reqwest::Client,
    pg_client: &Pool<Postgres>,
    ch_client: &clickhouse::Client,
) {
    let seen: Vec<(u32, u32)> = match ch_client
        .query(
            "SELECT DISTINCT hero_id, toUInt32(hero_build_id) \
             FROM match_player \
             WHERE start_time > now() - INTERVAL 7 DAY \
               AND demo_processed = 1 \
               AND hero_build_id > 0 \
             SETTINGS log_comment = 'builds_fetcher_seen_build_ids'",
        )
        .fetch_all()
        .await
    {
        Ok(seen) => seen,
        Err(e) => {
            warn!("Failed to fetch seen build ids from ClickHouse: {e}");
            return;
        }
    };
    let hero_by_build: HashMap<i32, u32> = seen
        .into_iter()
        .map(|(hero_id, build_id)| (build_id as i32, hero_id))
        .collect();
    let build_ids: Vec<i32> = hero_by_build.keys().copied().collect();

    let missing: Vec<i32> = match sqlx::query_scalar(
        "SELECT b FROM unnest($1::int[]) AS b \
         WHERE NOT EXISTS (SELECT 1 FROM hero_builds WHERE build_id = b) \
           AND NOT EXISTS (SELECT 1 FROM hero_builds_fetch_failed WHERE build_id = b)",
    )
    .bind(&build_ids)
    .fetch_all(pg_client)
    .await
    {
        Ok(missing) => missing,
        Err(e) => {
            warn!("Failed to query missing build ids: {e}");
            return;
        }
    };
    if missing.is_empty() {
        return;
    }
    info!(
        "Fetching {} builds missing from the database",
        missing.len()
    );

    for build_id in missing {
        let hero_id = hero_by_build[&build_id];
        let builds = match fetch_builds(
            http_client,
            hero_id,
            &[0],
            None,
            Some(build_id.cast_unsigned()),
        )
        .await
        .map(|(_, b)| b.results)
        {
            Ok(builds) => {
                counter!("builds_fetcher.fetch_missing_build.success").increment(1);
                builds
            }
            Err(e) => {
                counter!("builds_fetcher.fetch_missing_build.failure").increment(1);
                warn!("Failed to fetch build {build_id}: {e}");
                sleep(Duration::from_secs(10)).await;
                continue;
            }
        };
        if builds.is_empty() {
            counter!("builds_fetcher.fetch_missing_build.not_found").increment(1);
            debug!("Build {build_id} not found, marking as failed");
            if let Err(e) =
                sqlx::query("INSERT INTO hero_builds_fetch_failed(build_id, hero) VALUES ($1, $2) ON CONFLICT DO NOTHING")
                    .bind(build_id)
                    .bind(hero_id as i32)
                    .execute(pg_client)
                    .await
            {
                warn!("Failed to record failed build {build_id}: {e}");
            }
            continue;
        }
        match insert_builds(pg_client, builds).await {
            Ok(r) => info!("Inserted {} rows for build {build_id}", r.rows_affected()),
            Err(e) => warn!("Failed to insert build {build_id}: {e}"),
        }
    }
}

#[instrument(skip(http_client, pg_client))]
async fn update_builds(
    http_client: &reqwest::Client,
    pg_client: &Pool<Postgres>,
    hero_id: u32,
    langs: &[i32],
    search: Option<String>,
) {
    let builds = match fetch_builds(http_client, hero_id, langs, search.as_ref(), None)
        .await
        .map(|(_, b)| b.results)
    {
        Ok(builds) => {
            counter!("builds_fetcher.fetch_builds.success", "hero_id" => hero_id.to_string())
                .increment(1);
            debug!("Fetched {} builds", builds.len());
            builds
        }
        Err(e) => {
            counter!("builds_fetcher.fetch_builds.failure", "hero_id" => hero_id.to_string())
                .increment(1);
            warn!("Failed to fetch builds: {e}");
            sleep(Duration::from_secs(10)).await;
            return;
        }
    };
    if builds.is_empty() {
        warn!("No builds found for hero_id {hero_id}, langs {langs:?}, search {search:?}");
        return;
    }
    match insert_builds(pg_client, builds).await {
        Ok(r) => {
            counter!("builds_fetcher.insert_builds.success", "hero_id" => hero_id.to_string())
                .increment(1);
            info!("Inserted {} builds", r.rows_affected());
        }
        Err(e) => {
            counter!("builds_fetcher.insert_builds.failure", "hero_id" => hero_id.to_string())
                .increment(1);
            warn!("Failed to insert builds: {e}");
            sleep(Duration::from_secs(10)).await;
        }
    }
}

fn ts_to_pg(unix_ts: u32) -> Option<PrimitiveDateTime> {
    let offset = OffsetDateTime::from_unix_timestamp(i64::from(unix_ts)).ok()?;
    Some(PrimitiveDateTime::new(offset.date(), offset.time()))
}

#[instrument(skip(pg_client, builds))]
async fn insert_builds(
    pg_client: &Pool<Postgres>,
    builds: Vec<HeroBuildResult>,
) -> sqlx::Result<PgQueryResult> {
    let rows: Vec<_> = builds
        .into_iter()
        .filter_map(|build| {
            let data = serde_json::to_value(&build).ok()?;
            let hero_build = build.hero_build.clone()?;
            Some((build, hero_build, data))
        })
        .collect();

    let mut query = QueryBuilder::new(
        "INSERT INTO hero_builds(hero, build_id, version, author_id, weekly_favorites, favorites, \
         ignores, reports, rollup_category, language, updated_at, published_at, data)",
    );
    query.push_values(rows, |mut b, (build, hero_build, data)| {
        b.push_bind(hero_build.hero_id.map(|x| x as i32).unwrap_or_default())
            .push_bind(
                hero_build
                    .hero_build_id
                    .map(|x| x as i32)
                    .unwrap_or_default(),
            )
            .push_bind(hero_build.version.map(|x| x as i32).unwrap_or_default())
            .push_bind(hero_build.author_account_id.map(|x| x as i32))
            .push_bind(
                build
                    .num_weekly_favorites
                    .map(|x| x as i32)
                    .unwrap_or_default(),
            )
            .push_bind(build.num_favorites.map(|x| x as i32).unwrap_or_default())
            .push_bind(build.num_ignores.map(|x| x as i32).unwrap_or_default())
            .push_bind(build.num_reports.map(|x| x as i32).unwrap_or_default())
            .push_bind(build.rollup_category.map(|x| x as i32))
            .push_bind(hero_build.language.map(|x| x as i32))
            .push_bind(hero_build.last_updated_timestamp.and_then(ts_to_pg))
            .push_bind(hero_build.publish_timestamp.and_then(ts_to_pg))
            .push_bind(data);
    });
    query.push(
        "ON CONFLICT(hero, build_id, version) DO UPDATE SET author_id = EXCLUDED.author_id, \
         weekly_favorites = EXCLUDED.weekly_favorites, rollup_category = \
         EXCLUDED.rollup_category, favorites = EXCLUDED.favorites, ignores = EXCLUDED.ignores, \
         reports = EXCLUDED.reports, language = EXCLUDED.language, updated_at = \
         EXCLUDED.updated_at, published_at = EXCLUDED.published_at, data = EXCLUDED.data",
    );
    let query = query.build();
    query.execute(pg_client).await
}

#[instrument(skip(http_client))]
async fn fetch_builds(
    http_client: &reqwest::Client,
    hero_id: u32,
    langs: &[i32],
    search: Option<&String>,
    hero_build_id: Option<u32>,
) -> anyhow::Result<(String, CMsgClientToGcFindHeroBuildsResponse)> {
    let msg = CMsgClientToGcFindHeroBuilds {
        hero_id: hero_id.into(),
        language: langs.to_vec(),
        search_text: search.cloned(),
        hero_build_id,
        ..Default::default()
    };
    common::call_steam_proxy(
        http_client,
        EgcCitadelClientMessages::KEMsgClientToGcFindHeroBuilds,
        &msg,
        None,
        None,
        Duration::from_mins(20),
        None,
        Duration::from_secs(5),
        None,
    )
    .await
}
