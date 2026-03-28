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
#![allow(clippy::cast_precision_loss)]
#![allow(clippy::cast_possible_wrap)]

use core::time::Duration;

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

const ALL_LANGS: &[i32] = &[
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 25, 26, 27,
    255,
];
const ASCII_LOWER: [char; 26] = [
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's',
    't', 'u', 'v', 'w', 'x', 'y', 'z',
];

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    common::init_tracing();
    common::init_metrics()?;
    let http_client = reqwest::Client::new();
    let pg_client = common::get_pg_client().await?;

    loop {
        run_update_loop(&http_client, &pg_client).await;
    }
}

async fn run_update_loop(http_client: &reqwest::Client, pg_client: &Pool<Postgres>) {
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

    for hero_id in heroes {
        for langs in ALL_LANGS.chunks(2) {
            if langs.contains(&0) {
                for search in ASCII_LOWER.iter().cartesian_product(ASCII_LOWER.iter()) {
                    let search = format!("{}{}", search.0, search.1);
                    update_builds(http_client, pg_client, hero_id, langs, Some(search)).await;
                }
            } else {
                update_builds(http_client, pg_client, hero_id, langs, None).await;
            }
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
    let builds = match fetch_builds(http_client, hero_id, langs, search.as_ref())
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

#[instrument(skip(pg_client, builds))]
async fn insert_builds(
    pg_client: &Pool<Postgres>,
    builds: Vec<HeroBuildResult>,
) -> sqlx::Result<PgQueryResult> {
    let mut query = QueryBuilder::new(
        "INSERT INTO hero_builds(hero, build_id, version, author_id, weekly_favorites, favorites, \
         ignores, reports, rollup_category, language, updated_at, published_at, data)",
    );
    query.push_values(builds.into_iter(), |mut b, build| {
        let hero_build = build.hero_build.as_ref().unwrap();
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
            .push_bind(hero_build.last_updated_timestamp.map(|x| {
                let offset = OffsetDateTime::from_unix_timestamp(i64::from(x)).unwrap();
                PrimitiveDateTime::new(offset.date(), offset.time())
            }))
            .push_bind(hero_build.publish_timestamp.map(|x| {
                let offset = OffsetDateTime::from_unix_timestamp(i64::from(x)).unwrap();
                PrimitiveDateTime::new(offset.date(), offset.time())
            }))
            .push_bind(serde_json::to_value(build).unwrap());
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
) -> anyhow::Result<(String, CMsgClientToGcFindHeroBuildsResponse)> {
    let msg = CMsgClientToGcFindHeroBuilds {
        hero_id: hero_id.into(),
        language: langs.to_vec(),
        search_text: search.cloned(),
        ..Default::default()
    };
    loop {
        let result = common::call_steam_proxy(
            http_client,
            EgcCitadelClientMessages::KEMsgClientToGcFindHeroBuilds,
            &msg,
            None,
            None,
            Duration::from_mins(20),
            None,
            Duration::from_secs(5),
        )
        .await;

        if let Ok(r) = result {
            return Ok(r);
        }
        warn!("Got proxy rate limit, waiting 10s before retrying");
        sleep(Duration::from_secs(10)).await;
    }
}
