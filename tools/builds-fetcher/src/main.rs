use arl::RateLimiter;
use itertools::Itertools;
use metrics::counter;
use metrics_exporter_prometheus::PrometheusBuilder;
use once_cell::sync::Lazy;
use rand::prelude::SliceRandom;
use rand::rng;
use sqlx::postgres::{PgConnectOptions, PgPoolOptions, PgQueryResult};
use sqlx::types::time::PrimitiveDateTime;
use sqlx::{ConnectOptions, Pool, Postgres, QueryBuilder};
use std::net::SocketAddrV4;
use std::time::Duration;
use time::OffsetDateTime;
use tokio::time::sleep;
use tracing::log::LevelFilter;
use tracing::{debug, info, instrument, warn};
use tracing_subscriber::EnvFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
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
    let env_filter = EnvFilter::try_from_default_env().unwrap_or(EnvFilter::new(
        "debug,h2=warn,hyper_util=warn,reqwest=warn,rustls=warn,sqlx=warn",
    ));
    let fmt_layer = tracing_subscriber::fmt::layer();

    tracing_subscriber::registry()
        .with(fmt_layer)
        .with(env_filter)
        .init();

    let builder =
        PrometheusBuilder::new().with_http_listener("0.0.0.0:9002".parse::<SocketAddrV4>()?);
    builder
        .install()
        .expect("failed to install recorder/exporter");

    debug!("Creating HTTP client");
    let http_client = reqwest::Client::new();

    debug!("Creating PostgreSQL client");
    let pg_options = PgConnectOptions::new_without_pgpass()
        .host(&POSTGRES_HOST)
        .username(&POSTGRES_USERNAME)
        .password(&POSTGRES_PASSWORD)
        .database(&POSTGRES_DBNAME)
        .log_slow_statements(LevelFilter::Warn, Duration::from_secs(5));
    let postgres_client = PgPoolOptions::new()
        .max_connections(10)
        .connect_with(pg_options)
        .await?;

    loop {
        run_update_loop(&http_client, &postgres_client).await;
    }
}

#[instrument(skip(http_client, pg_client))]
async fn run_update_loop(http_client: &reqwest::Client, pg_client: &Pool<Postgres>) {
    let mut heroes = match common::assets::fetch_hero_ids(http_client).await {
        Ok(heroes) => {
            counter!("builds_fetcher.heroes_fetched.success").increment(1);
            debug!("Fetched hero ids: {:?}", heroes);
            heroes
        }
        Err(e) => {
            counter!("builds_fetcher.heroes_fetched.failure").increment(1);
            warn!("Failed to fetch hero ids: {}", e);
            sleep(Duration::from_secs(10)).await;
            return;
        }
    };
    heroes.shuffle(&mut rng());

    let limiter = RateLimiter::new(10, Duration::from_secs(10 * *UPDATE_INTERVAL));
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
}

#[instrument(skip(http_client, pg_client))]
async fn update_builds(
    http_client: &reqwest::Client,
    pg_client: &Pool<Postgres>,
    hero_id: u32,
    langs: &[i32],
    search: Option<String>,
) {
    let builds = match fetch_builds(http_client, hero_id, langs, &search)
        .await
        .map(|b| b.results)
    {
        Ok(builds) => {
            counter!("builds_fetcher.fetch_builds.success", "hero_id" => hero_id.to_string())
                .increment(1);
            info!("Fetched {} builds", builds.len());
            builds
        }
        Err(e) => {
            counter!("builds_fetcher.fetch_builds.failure", "hero_id" => hero_id.to_string())
                .increment(1);
            warn!("Failed to fetch builds: {}", e);
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
            warn!("Failed to insert builds: {}", e);
        }
    }
}

#[instrument(skip(pg_client, builds))]
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

#[instrument(skip(http_client))]
async fn fetch_builds(
    http_client: &reqwest::Client,
    hero_id: u32,
    langs: &[i32],
    search: &Option<String>,
) -> reqwest::Result<CMsgClientToGcFindHeroBuildsResponse> {
    let msg = CMsgClientToGcFindHeroBuilds {
        hero_id: hero_id.into(),
        language: langs.to_vec(),
        search_text: search.clone(),
        ..Default::default()
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
