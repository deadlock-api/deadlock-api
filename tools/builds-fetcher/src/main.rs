use arl::RateLimiter;
use itertools::Itertools;
use log::{LevelFilter, debug, info, warn};
use once_cell::sync::Lazy;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions, PgQueryResult};
use sqlx::types::time::PrimitiveDateTime;
use sqlx::{ConnectOptions, Pool, Postgres, QueryBuilder};
use std::time::Duration;
use time::OffsetDateTime;
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

static UPDATE_INTERVAL: Lazy<u64> = Lazy::new(|| {
    std::env::var("UPDATE_INTERVAL")
        .ok()
        .and_then(|interval| interval.parse().ok())
        .unwrap_or(3)
});
static POSTGRES_HOST: Lazy<String> =
    Lazy::new(|| std::env::var("POSTGRES_HOST").unwrap_or("localhost".to_string()));
static POSTGRES_USERNAME: Lazy<String> =
    Lazy::new(|| std::env::var("POSTGRES_USERNAME").unwrap_or("postgres".to_string()));
static POSTGRES_DBNAME: Lazy<String> =
    Lazy::new(|| std::env::var("POSTGRES_DBNAME").unwrap_or("postgres".to_string()));
static POSTGRES_PASSWORD: Lazy<String> = Lazy::new(|| std::env::var("POSTGRES_PASSWORD").unwrap());

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    env_logger::init();

    debug!("Creating HTTP client");
    let http_client = reqwest::Client::new();

    debug!("Creating PostgreSQL client");
    let pg_options = PgConnectOptions::new_without_pgpass()
        .host(&POSTGRES_HOST)
        .username(&POSTGRES_USERNAME)
        .password(&POSTGRES_PASSWORD)
        .database(&POSTGRES_DBNAME)
        .log_slow_statements(LevelFilter::Warn, Duration::from_secs(2));
    let postgres_client = PgPoolOptions::new()
        .max_connections(10)
        .connect_with(pg_options)
        .await?;

    loop {
        match run_update_loop(&http_client, &postgres_client).await {
            Ok(_) => info!("Successfully updated builds"),
            Err(e) => info!("Failed to update builds: {:?}", e),
        }
    }
}

async fn run_update_loop(
    http_client: &reqwest::Client,
    pg_client: &Pool<Postgres>,
) -> Result<(), anyhow::Error> {
    let limiter = RateLimiter::new(10, Duration::from_secs(10 * *UPDATE_INTERVAL));
    let heroes = common::assets::fetch_hero_ids(http_client).await?;

    for hero_id in heroes {
        for langs in ALL_LANGS.chunks(2) {
            if langs.contains(&0) {
                for search in ASCII_LOWER.iter().cartesian_product(ASCII_LOWER.iter()) {
                    limiter.wait().await;
                    let search = format!("{}{}", search.0, search.1);
                    update_builds(http_client, pg_client, hero_id, langs, Some(search)).await;
                }
            } else {
                limiter.wait().await;
                update_builds(http_client, pg_client, hero_id, langs, None).await;
            }
        }
    }
    Ok(())
}

async fn update_builds(
    http_client: &reqwest::Client,
    pg_client: &Pool<Postgres>,
    hero_id: u32,
    langs: &[i32],
    search: Option<String>,
) {
    let builds = match fetch_builds(http_client, hero_id, langs, &search).await {
        Ok(builds) => builds,
        Err(e) => {
            warn!(
                "Failed to fetch builds for hero_id: {}, langs: {:?}, search: {:?}: {}",
                hero_id, langs, search, e
            );
            return;
        }
    };
    let builds = builds.results;
    info!(
        "Found {} builds for hero_id: {}, langs: {:?}, search: {:?}",
        builds.len(),
        hero_id,
        langs,
        search
    );
    if builds.is_empty() {
        return;
    }
    if let Err(e) = insert_builds(pg_client, builds).await {
        warn!("Failed to insert builds: {:?}", e);
    }
}

async fn insert_builds(
    pg_client: &Pool<Postgres>,
    builds: Vec<HeroBuildResult>,
) -> sqlx::Result<PgQueryResult> {
    let mut query = QueryBuilder::new(
        "INSERT INTO hero_builds(hero, build_id, version, author_id, weekly_favorites, favorites, ignores, reports, rollup_category, language, updated_at, data)",
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
                let offset = OffsetDateTime::from_unix_timestamp(x as i64).unwrap();
                PrimitiveDateTime::new(offset.date(), offset.time())
            }))
            .push_bind(serde_json::to_value(build).unwrap());
    });
    query.push("ON CONFLICT(hero, build_id, version) DO UPDATE SET author_id = EXCLUDED.author_id, weekly_favorites = EXCLUDED.weekly_favorites, rollup_category = EXCLUDED.rollup_category, favorites = EXCLUDED.favorites, ignores = EXCLUDED.ignores, reports = EXCLUDED.reports, language = EXCLUDED.language, updated_at = EXCLUDED.updated_at, data = EXCLUDED.data");
    let query = query.build();
    query.execute(pg_client).await
}

async fn fetch_builds(
    http_client: &reqwest::Client,
    hero_id: u32,
    langs: &[i32],
    search: &Option<String>,
) -> reqwest::Result<CMsgClientToGcFindHeroBuildsResponse> {
    let msg = CMsgClientToGcFindHeroBuilds {
        author_account_id: None,
        hero_id: hero_id.into(),
        language: langs.to_vec(),
        search_text: search.clone(),
        hero_build_id: None,
    };
    common::utils::call_steam_proxy(
        http_client,
        EgcCitadelClientMessages::KEMsgClientToGcFindHeroBuilds,
        msg,
        None,
        None,
        Duration::from_secs(10 * 60),
        Duration::from_secs(5),
    )
    .await
}
