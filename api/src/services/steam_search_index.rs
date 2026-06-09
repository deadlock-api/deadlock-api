// Casts in this module either round-trip u32 through Tantivy's u64 FAST fields
// (safe by construction) or feed jaro-winkler math that doesn't care about
// sub-f64 precision on tiny strings.
#![allow(
    clippy::cast_precision_loss,
    clippy::cast_possible_truncation,
    clippy::cast_possible_wrap
)]

use core::fmt::Display;
use core::ops::Bound;
use core::sync::atomic::{AtomicU32, Ordering};
use core::time::Duration;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use arc_swap::ArcSwapOption;
use chrono::{DateTime, Utc};
use clickhouse::Row;
use serde::Deserialize;
use tantivy::collector::TopDocs;
use tantivy::columnar::StrColumn;
use tantivy::directory::MmapDirectory;
use tantivy::query::{BooleanQuery, FuzzyTermQuery, Occur, Query, RangeQuery, TermQuery};
use tantivy::schema::{
    BytesOptions, FAST, Field, INDEXED, STORED, STRING, Schema, TEXT, TextOptions, Value,
};
use tantivy::store::{Compressor, ZstdCompressor};
use tantivy::tokenizer::{LowerCaser, SimpleTokenizer, TextAnalyzer};
use tantivy::{
    DocAddress, Index, IndexReader, IndexSettings, Order, ReloadPolicy, TantivyDocument, Term,
};
use tokio::time::interval;
use tracing::{error, info, warn};

const INCREMENTAL_INTERVAL_SECS: u64 = 2 * 60;
const FULL_REBUILD_INTERVAL_SECS: u64 = 60 * 60;
const WRITER_HEAP_MB: usize = 200;
const MAX_PROFILES_PER_REBUILD: usize = 10_000_000;
/// Minimum candidate pool size handed to the JW reranker — large enough that
/// weight=0 (pure-similarity ranking) finds low-activity profiles, and that
/// space-variant matches ("Average Jonas" vs "`AverageJonas`") survive the
/// matches_played-ordered first pass.
const MIN_OVERSAMPLE: usize = 5_000;
const RERANK_OVERSAMPLE_MULT: usize = 50;
const WATERMARK_FILENAME: &str = "watermark";
/// Per-instance subdirectory prefix. Each replica writes its index under
/// `<root>/inst_<id>/` so replicas sharing one volume never delete each other's
/// dirs (the historical cause of a full-rebuild storm).
const INSTANCE_DIR_PREFIX: &str = "inst_";
/// Sibling instance dirs whose newest index commit is older than this are
/// assumed abandoned (their replica was redeployed/removed) and GC'd to reclaim
/// disk. A live replica commits an incremental every `INCREMENTAL_INTERVAL_SECS`,
/// keeping its dir well within this window.
const STALE_INSTANCE_GRACE_SECS: u64 = 60 * 60;
/// Offset applied to `account_id` to produce a Steam ID64.
const STEAM_ID64_OFFSET: u64 = 76_561_197_960_265_728;
/// Subdirectory prefix for the on-disk index. Bump whenever the Tantivy
/// schema changes — old `v*_` dirs that don't match are GC'd at next
/// successful rebuild.
const VERSION_PREFIX: &str = "v4_";
/// Older prefixes still recognized by cleanup so they get removed on upgrade.
const LEGACY_PREFIXES: &[&str] = &["v_", "v2_", "v3_"];

#[derive(Clone)]
pub(crate) struct SteamSearchIndex {
    inner: Arc<Inner>,
}

struct Inner {
    /// Shared volume root (may be shared by sibling replicas).
    root_path: PathBuf,
    /// This replica's private subdir under `root_path`; all index dirs live here.
    base_path: PathBuf,
    fields: SearchFields,
    reader: ArcSwapOption<IndexReader>,
    current_dir: ArcSwapOption<PathBuf>,
    watermark: AtomicU32,
}

#[derive(Clone, Copy)]
struct SearchFields {
    account_id: Field,
    personaname_search: Field,
    personaname_exact: Field,
    personaname_nospace: Field,
    matches_played: Field,
    personaname: Field,
    profileurl: Field,
    avatar: Field,
    avatarmedium: Field,
    avatarfull: Field,
    realname: Field,
    countrycode: Field,
    last_updated: Field,
    last_team_avg_badge: Field,
    friends_blob: Field,
}

#[derive(Row, Deserialize)]
struct ProfileRow {
    account_id: u32,
    personaname: String,
    personaname_lc: String,
    profileurl: String,
    avatar: String,
    avatarmedium: String,
    avatarfull: String,
    realname: Option<String>,
    countrycode: Option<String>,
    #[serde(rename = "last_updated_ts")]
    last_updated_ts: u32,
    #[serde(rename = "friends.account_id", default)]
    friends_account_id: Vec<u32>,
    #[serde(rename = "friends.friend_since", default)]
    friends_friend_since: Vec<u32>,
    matches_played: u64,
    last_team_avg_badge: u32,
}

#[derive(Debug, Clone)]
pub(crate) struct IndexedProfile {
    pub account_id: u32,
    pub personaname: String,
    pub profileurl: String,
    pub avatar: String,
    pub avatarmedium: String,
    pub avatarfull: String,
    pub realname: Option<String>,
    pub countrycode: Option<String>,
    pub last_updated: DateTime<Utc>,
    pub friends: Vec<(u32, u32)>,
    pub matches_played: u64,
    pub last_team_avg_badge: Option<u32>,
}

impl SteamSearchIndex {
    pub(crate) fn new(root_path: PathBuf) -> Self {
        let schema = build_schema();
        let fields = lookup_fields(&schema);
        let base_path = root_path.join(format!("{INSTANCE_DIR_PREFIX}{}", instance_id()));
        Self {
            inner: Arc::new(Inner {
                root_path,
                base_path,
                fields,
                reader: ArcSwapOption::empty(),
                current_dir: ArcSwapOption::empty(),
                watermark: AtomicU32::new(0),
            }),
        }
    }

    /// Load the newest persisted `v_*` index, if any. Returns whether one was loaded.
    pub(crate) fn try_load_persisted(&self) -> bool {
        let Ok(entries) = std::fs::read_dir(&self.inner.base_path) else {
            return false;
        };
        let mut subdirs: Vec<(u64, PathBuf)> = entries
            .filter_map(Result::ok)
            .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
            .filter_map(|e| {
                let name = e.file_name().into_string().ok()?;
                let ts = name.strip_prefix(VERSION_PREFIX)?.parse::<u64>().ok()?;
                Some((ts, e.path()))
            })
            .collect();
        subdirs.sort_by_key(|(ts, _)| *ts);
        for (_, path) in subdirs.iter().rev() {
            match open_persisted_reader(path) {
                Ok(reader) => {
                    let watermark = read_watermark(path).unwrap_or(0);
                    info!("steam search index loaded {path:?} (watermark={watermark})");
                    self.inner.reader.store(Some(Arc::new(reader)));
                    self.inner.current_dir.store(Some(Arc::new(path.clone())));
                    self.inner.watermark.store(watermark, Ordering::Relaxed);
                    cleanup_old_dirs(&self.inner.base_path, Some(path));
                    return true;
                }
                Err(e) => warn!("steam search index: cannot open {path:?}: {e}"),
            }
        }
        false
    }

    /// Full rebuild into a fresh `v_<ts>/` dir, atomic swap, GC old dirs.
    pub(crate) async fn rebuild_full(
        &self,
        ch_client: &clickhouse::Client,
    ) -> Result<usize, RebuildError> {
        let started = std::time::Instant::now();
        // Eagerly remove any incompatible-format dirs (legacy prefix or
        // half-written v2_ dirs from a previous failed run) before building.
        // The currently-live dir, if any, is preserved so existing readers
        // keep serving until we swap.
        let current = self.inner.current_dir.load_full();
        cleanup_old_dirs(
            &self.inner.base_path,
            current.as_deref().map(PathBuf::as_path),
        );

        let query = format!(
            "{SELECT_PROFILES_COMMON}
            FROM steam_profiles sp FINAL
            INNER JOIN player_match_counts30d mp ON sp.account_id = mp.account_id
            WHERE sp.personaname IS NOT NULL AND not empty(sp.personaname)
            LIMIT ?
            SETTINGS
                log_comment = 'steam_search_index_build_full',
                do_not_merge_across_partitions_select_final = 1,
                max_execution_time = 180"
        );
        let rows = ch_client
            .query(&query)
            .bind(MAX_PROFILES_PER_REBUILD as u64)
            .fetch_all::<ProfileRow>()
            .await?;
        let fetched = rows.len();

        let ts = unix_now();
        let new_dir = self.inner.base_path.join(format!("{VERSION_PREFIX}{ts}"));
        std::fs::create_dir_all(&new_dir)?;

        let index = open_index_at(&new_dir, true)?;
        let mut writer = index
            .writer(WRITER_HEAP_MB * 1024 * 1024)
            .map_err(tantivy_err)?;
        let max_ts = write_rows(&mut writer, self.inner.fields, &rows)?;
        writer.commit().map_err(tantivy_err)?;
        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::Manual)
            .try_into()
            .map_err(tantivy_err)?;

        // Persist watermark before swapping reader so on-crash recovery never
        // sees a reader at a newer state than the persisted watermark.
        write_watermark(&new_dir, max_ts);
        self.inner.watermark.store(max_ts, Ordering::Relaxed);
        self.inner.reader.store(Some(Arc::new(reader)));
        self.inner
            .current_dir
            .store(Some(Arc::new(new_dir.clone())));
        cleanup_old_dirs(&self.inner.base_path, Some(&new_dir));

        info!(
            "steam search index full rebuild: {fetched} docs, watermark={max_ts}, took {:?}",
            started.elapsed()
        );
        Ok(fetched)
    }

    /// Apply changes since the watermark in-place. Falls back to full if no
    /// live index/watermark yet.
    pub(crate) async fn rebuild_incremental(
        &self,
        ch_client: &clickhouse::Client,
    ) -> Result<usize, RebuildError> {
        let watermark = self.inner.watermark.load(Ordering::Relaxed);
        let Some(current_dir) = self.inner.current_dir.load_full() else {
            return self.rebuild_full(ch_client).await;
        };
        if watermark == 0 {
            return self.rebuild_full(ch_client).await;
        }
        if !current_dir.exists() {
            warn!(
                "steam search index: current dir {current_dir:?} vanished (concurrent GC?); falling back to full rebuild"
            );
            return self.rebuild_full(ch_client).await;
        }
        let started = std::time::Instant::now();

        // `>=` (not `>`) so writes landing in the same second as the previous
        // snapshot's high-water mark aren't lost. The delete_term below dedups
        // any rows we re-fetch as a result.
        // No FINAL: with FINAL, ClickHouse must read every row's wide `friends.*`
        // arrays to run the replacing merge before the `last_updated` filter
        // applies (~4 GiB / 1.2s per run). Without FINAL it joins via the
        // account_id primary key and column-prunes the filtered scan (~7 MiB /
        // 25ms — ~600x less, measured equivalent result). `LIMIT 1 BY account_id`
        // (latest wins) dedups the rare case of an account with multiple
        // unmerged versions both newer than the watermark, so we never emit two
        // tantivy docs for one account.
        let query = format!(
            "{SELECT_PROFILES_COMMON}
            FROM steam_profiles sp
            INNER JOIN player_match_counts30d mp ON sp.account_id = mp.account_id
            WHERE sp.personaname IS NOT NULL AND not empty(sp.personaname)
              AND sp.last_updated >= toDateTime(?)
            ORDER BY sp.last_updated DESC
            LIMIT 1 BY sp.account_id
            SETTINGS
                log_comment = 'steam_search_index_build_incremental',
                max_execution_time = 60"
        );
        let rows = ch_client
            .query(&query)
            .bind(watermark)
            .fetch_all::<ProfileRow>()
            .await?;
        if rows.is_empty() {
            return Ok(0);
        }
        let fetched = rows.len();

        let index = open_index_at(&current_dir, false)?;
        let mut writer = index
            .writer(WRITER_HEAP_MB * 1024 * 1024)
            .map_err(tantivy_err)?;
        let f = self.inner.fields;
        for row in &rows {
            let term = Term::from_field_u64(f.account_id, u64::from(row.account_id));
            writer.delete_term(term);
        }
        let max_ts = write_rows(&mut writer, f, &rows)?;
        writer.commit().map_err(tantivy_err)?;

        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::Manual)
            .try_into()
            .map_err(tantivy_err)?;
        write_watermark(&current_dir, max_ts);
        self.inner.watermark.store(max_ts, Ordering::Relaxed);
        self.inner.reader.store(Some(Arc::new(reader)));

        info!(
            "steam search index incremental: {fetched} docs, watermark={max_ts}, took {:?}",
            started.elapsed()
        );
        Ok(fetched)
    }

    /// Search the index. Returns up to `limit` profiles ranked by
    /// `jaro_winkler(personaname_lc, query) + matches_played_weight * log1p(matches)`.
    #[allow(clippy::too_many_lines)]
    pub(crate) fn search(
        &self,
        query: &str,
        min_matches: u64,
        min_badge: u32,
        limit: usize,
        matches_played_weight: f64,
    ) -> Result<Option<Vec<IndexedProfile>>, SearchError> {
        let Some(reader) = self.inner.reader.load_full() else {
            return Ok(None);
        };
        let searcher = reader.searcher();
        let f = self.inner.fields;
        let q_lc = query.to_lowercase();
        let q_nospace = strip_whitespace(&q_lc);

        // If the user typed an account_id (u32) or steam_id64, pin that
        // profile at the front of the results.
        let pinned_id = parse_id_query(&q_lc);

        // Fuzzy match on every token (no prefix variant — too expensive on
        // short queries; the JW reranker handles partial matches via the
        // oversampled candidate pool).
        let mut clauses: Vec<(Occur, Box<dyn Query>)> = Vec::new();
        clauses.push((
            Occur::Should,
            Box::new(TermQuery::new(
                Term::from_field_text(f.personaname_exact, &q_lc),
                tantivy::schema::IndexRecordOption::Basic,
            )),
        ));
        // Bridge whitespace asymmetry: "Average Jonas" must match
        // "AverageJonas" and vice versa. Match the whitespace-stripped query
        // against the indexed whitespace-stripped form (exact + fuzzy).
        if !q_nospace.is_empty() && q_nospace != q_lc {
            clauses.push((
                Occur::Should,
                Box::new(TermQuery::new(
                    Term::from_field_text(f.personaname_nospace, &q_nospace),
                    tantivy::schema::IndexRecordOption::Basic,
                )),
            ));
        }
        if !q_nospace.is_empty() {
            let distance: u8 = match q_nospace.chars().count() {
                0..=2 => 0,
                3..=5 => 1,
                _ => 2,
            };
            clauses.push((
                Occur::Should,
                Box::new(FuzzyTermQuery::new(
                    Term::from_field_text(f.personaname_nospace, &q_nospace),
                    distance,
                    true,
                )),
            ));
        }
        for token in q_lc.split_whitespace() {
            if token.is_empty() {
                continue;
            }
            let term = Term::from_field_text(f.personaname_search, token);
            let distance: u8 = match token.chars().count() {
                0..=2 => 0,
                3..=5 => 1,
                _ => 2,
            };
            clauses.push((
                Occur::Should,
                Box::new(FuzzyTermQuery::new(term, distance, true)),
            ));
        }

        let text_query: Box<dyn Query> = Box::new(BooleanQuery::new(clauses));
        let mut musts: Vec<(Occur, Box<dyn Query>)> = vec![
            (Occur::Must, text_query),
            (
                Occur::Must,
                Box::new(RangeQuery::new(
                    Bound::Included(Term::from_field_u64(f.matches_played, min_matches)),
                    Bound::Unbounded,
                )),
            ),
        ];
        if min_badge > 0 {
            musts.push((
                Occur::Must,
                Box::new(RangeQuery::new(
                    Bound::Included(Term::from_field_u64(
                        f.last_team_avg_badge,
                        u64::from(min_badge),
                    )),
                    Bound::Unbounded,
                )),
            ));
        }
        let final_query: Box<dyn Query> = Box::new(BooleanQuery::new(musts));

        let oversample = limit
            .saturating_mul(RERANK_OVERSAMPLE_MULT)
            .max(MIN_OVERSAMPLE);
        let collector =
            TopDocs::with_limit(oversample).order_by_u64_field("matches_played", Order::Desc);
        let top = searcher
            .search(&final_query, &collector)
            .map_err(tantivy_se)?;

        let name_cols: Vec<Option<StrColumn>> = searcher
            .segment_readers()
            .iter()
            .map(|sr| sr.fast_fields().str("personaname_exact").ok().flatten())
            .collect();

        let mut scored: Vec<(f64, DocAddress, u64)> = Vec::with_capacity(top.len());
        let mut name = String::new();
        for (matches_played, doc_address) in top {
            name.clear();
            if let Some(col) = name_cols
                .get(doc_address.segment_ord as usize)
                .and_then(Option::as_ref)
                && let Some(ord) = col.term_ords(doc_address.doc_id).next()
            {
                let _ = col.ord_to_str(ord, &mut name);
            }
            let mp = matches_played.unwrap_or(0);
            // Score against both the raw lowercase form and the
            // whitespace-stripped form, so "Average Jonas" can still rank
            // highly against "AverageJonas" and vice versa.
            let sim_raw = jaro_winkler(&name, &q_lc);
            let sim_nospace = if q_nospace.is_empty() {
                0.0
            } else {
                let name_nospace = strip_whitespace(&name);
                if name_nospace.is_empty() {
                    0.0
                } else {
                    jaro_winkler(&name_nospace, &q_nospace)
                }
            };
            let score = sim_raw.max(sim_nospace) + matches_played_weight * (1.0 + mp as f64).ln();
            scored.push((score, doc_address, mp));
        }
        scored.sort_unstable_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(core::cmp::Ordering::Equal));
        scored.truncate(limit);

        // Pin the ID-match profile (if any) at the front, removing it from
        // its current position if also in the scored list.
        let mut hits: Vec<IndexedProfile> = Vec::with_capacity(scored.len() + 1);
        let pinned =
            pinned_id.and_then(|id| self.lookup_by_account_id(&searcher, id).ok().flatten());
        let pinned_account = pinned.as_ref().map(|p| u64::from(p.account_id));
        if let Some(profile) = pinned {
            hits.push(profile);
        }
        for (_, doc_address, mp) in scored {
            let doc: TantivyDocument = searcher.doc(doc_address).map_err(tantivy_se)?;
            if pinned_account.is_some()
                && doc.get_first(f.account_id).and_then(|v| v.as_u64()) == pinned_account
            {
                continue;
            }
            hits.push(profile_from_doc(&doc, f, mp));
        }
        hits.truncate(limit);
        Ok(Some(hits))
    }

    fn lookup_by_account_id(
        &self,
        searcher: &tantivy::Searcher,
        account_id: u32,
    ) -> Result<Option<IndexedProfile>, SearchError> {
        let f = self.inner.fields;
        let q: Box<dyn Query> = Box::new(TermQuery::new(
            Term::from_field_u64(f.account_id, u64::from(account_id)),
            tantivy::schema::IndexRecordOption::Basic,
        ));
        // TopDocs needs an explicit ordering in tantivy 0.26 — account_id is
        // unique so the chosen order is irrelevant for a 1-result query.
        let top = searcher
            .search(
                &q,
                &TopDocs::with_limit(1).order_by_u64_field("account_id", Order::Desc),
            )
            .map_err(tantivy_se)?;
        let Some((_, addr)) = top.into_iter().next() else {
            return Ok(None);
        };
        let doc: TantivyDocument = searcher.doc(addr).map_err(tantivy_se)?;
        let mp = doc
            .get_first(f.matches_played)
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        Ok(Some(profile_from_doc(&doc, f, mp)))
    }

    /// Spawn a single refresh task that ticks incrementals every
    /// `INCREMENTAL_INTERVAL_SECS` and falls back to a full rebuild every
    /// `FULL_REBUILD_INTERVAL_SECS`. A single task means incremental and full
    /// rebuilds never overlap, so no Mutex is needed.
    pub(crate) fn spawn_refresh_loop(&self, ch_client: clickhouse::Client) {
        let loaded = self.try_load_persisted();
        info!(
            "steam search index: dir={:?}, incremental every {INCREMENTAL_INTERVAL_SECS}s, full every {FULL_REBUILD_INTERVAL_SECS}s, loaded_persisted={loaded}",
            self.inner.base_path,
        );
        let this = self.clone();
        tokio::spawn(async move {
            if !loaded && let Err(e) = this.rebuild_full(&ch_client).await {
                warn!("steam search index initial full build failed: {e}");
            }
            gc_stale_instance_dirs(&this.inner.root_path, &this.inner.base_path);
            let mut inc = interval(Duration::from_secs(INCREMENTAL_INTERVAL_SECS));
            let mut full = interval(Duration::from_secs(FULL_REBUILD_INTERVAL_SECS));
            inc.tick().await;
            full.tick().await;
            loop {
                tokio::select! {
                    _ = inc.tick() => {
                        if let Err(e) = this.rebuild_incremental(&ch_client).await {
                            error!("steam search index incremental failed: {e}");
                        }
                    }
                    _ = full.tick() => {
                        if let Err(e) = this.rebuild_full(&ch_client).await {
                            error!("steam search index periodic full rebuild failed: {e}");
                        }
                        gc_stale_instance_dirs(&this.inner.root_path, &this.inner.base_path);
                    }
                }
            }
        });
    }
}

fn parse_id_query(q: &str) -> Option<u32> {
    let q = q.trim();
    if let Ok(account_id) = q.parse::<u32>() {
        return Some(account_id);
    }
    if let Ok(sid64) = q.parse::<u64>()
        && let Some(account_id) = sid64.checked_sub(STEAM_ID64_OFFSET)
        && let Ok(account_id) = u32::try_from(account_id)
    {
        return Some(account_id);
    }
    None
}

fn profile_from_doc(doc: &TantivyDocument, f: SearchFields, matches_played: u64) -> IndexedProfile {
    let account_id = doc
        .get_first(f.account_id)
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    let last_updated_ts = doc
        .get_first(f.last_updated)
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let last_updated = DateTime::<Utc>::from_timestamp(last_updated_ts.cast_signed(), 0)
        .unwrap_or(DateTime::<Utc>::UNIX_EPOCH);
    let badge = doc
        .get_first(f.last_team_avg_badge)
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .filter(|&v| v != 0);
    let friends = doc
        .get_first(f.friends_blob)
        .and_then(|v| v.as_bytes())
        .map(decode_friends)
        .unwrap_or_default();
    IndexedProfile {
        account_id,
        personaname: read_str(doc, f.personaname),
        profileurl: read_str(doc, f.profileurl),
        avatar: read_str(doc, f.avatar),
        avatarmedium: read_str(doc, f.avatarmedium),
        avatarfull: read_str(doc, f.avatarfull),
        realname: read_opt_str(doc, f.realname),
        countrycode: read_opt_str(doc, f.countrycode),
        last_updated,
        friends,
        matches_played,
        last_team_avg_badge: badge,
    }
}

fn build_schema() -> Schema {
    let mut sb = Schema::builder();
    sb.add_u64_field("account_id", STORED | FAST | INDEXED);
    sb.add_text_field("personaname_search", TEXT);
    sb.add_text_field("personaname_exact", STRING.set_fast(None));
    sb.add_text_field("personaname_nospace", STRING);
    sb.add_u64_field("matches_played", STORED | FAST | INDEXED);
    let stored_text = TextOptions::default().set_stored();
    sb.add_text_field("personaname", stored_text.clone());
    sb.add_text_field("profileurl", stored_text.clone());
    sb.add_text_field("avatar", stored_text.clone());
    sb.add_text_field("avatarmedium", stored_text.clone());
    sb.add_text_field("avatarfull", stored_text.clone());
    sb.add_text_field("realname", stored_text.clone());
    sb.add_text_field("countrycode", stored_text);
    sb.add_u64_field("last_updated", STORED | FAST);
    sb.add_u64_field("last_team_avg_badge", STORED | FAST | INDEXED);
    sb.add_bytes_field("friends_blob", BytesOptions::default().set_stored());
    sb.build()
}

fn lookup_fields(schema: &Schema) -> SearchFields {
    let f = |name: &str| schema.get_field(name).expect(name);
    SearchFields {
        account_id: f("account_id"),
        personaname_search: f("personaname_search"),
        personaname_exact: f("personaname_exact"),
        personaname_nospace: f("personaname_nospace"),
        matches_played: f("matches_played"),
        personaname: f("personaname"),
        profileurl: f("profileurl"),
        avatar: f("avatar"),
        avatarmedium: f("avatarmedium"),
        avatarfull: f("avatarfull"),
        realname: f("realname"),
        countrycode: f("countrycode"),
        last_updated: f("last_updated"),
        last_team_avg_badge: f("last_team_avg_badge"),
        friends_blob: f("friends_blob"),
    }
}

fn encode_friends(account_ids: &[u32], friend_since: &[u32]) -> Vec<u8> {
    let count = account_ids.len().min(friend_since.len());
    let mut buf = Vec::with_capacity(4 + count * 8);
    buf.extend_from_slice(&(count as u32).to_le_bytes());
    for i in 0..count {
        buf.extend_from_slice(&account_ids[i].to_le_bytes());
        buf.extend_from_slice(&friend_since[i].to_le_bytes());
    }
    buf
}

fn decode_friends(bytes: &[u8]) -> Vec<(u32, u32)> {
    if bytes.len() < 4 {
        return Vec::new();
    }
    let count = u32::from_le_bytes(bytes[..4].try_into().unwrap_or([0; 4])) as usize;
    let body = &bytes[4..];
    if body.len() < count * 8 {
        return Vec::new();
    }
    let mut out = Vec::with_capacity(count);
    for chunk in body.chunks_exact(8).take(count) {
        let aid = u32::from_le_bytes(chunk[..4].try_into().unwrap_or([0; 4]));
        let ts = u32::from_le_bytes(chunk[4..8].try_into().unwrap_or([0; 4]));
        out.push((aid, ts));
    }
    out
}

fn strip_whitespace(s: &str) -> String {
    s.chars().filter(|c| !c.is_whitespace()).collect()
}

/// Jaro-Winkler similarity in [0, 1] — matches CH `jaroWinklerSimilarity`.
fn jaro_winkler(s1: &str, s2: &str) -> f64 {
    let j = jaro(s1, s2);
    if j == 0.0 {
        return 0.0;
    }
    let prefix = s1
        .chars()
        .zip(s2.chars())
        .take(4)
        .take_while(|(a, b)| a == b)
        .count();
    j + (prefix as f64) * 0.1 * (1.0 - j)
}

fn jaro(s1: &str, s2: &str) -> f64 {
    let s1: Vec<char> = s1.chars().collect();
    let s2: Vec<char> = s2.chars().collect();
    let len1 = s1.len();
    let len2 = s2.len();
    if len1 == 0 || len2 == 0 {
        return 0.0;
    }
    if s1 == s2 {
        return 1.0;
    }
    let match_distance = (len1.max(len2) / 2).saturating_sub(1);
    let mut s1_matches = vec![false; len1];
    let mut s2_matches = vec![false; len2];
    let mut matches = 0usize;
    for i in 0..len1 {
        let start = i.saturating_sub(match_distance);
        let end = (i + match_distance + 1).min(len2);
        for j in start..end {
            if s2_matches[j] || s1[i] != s2[j] {
                continue;
            }
            s1_matches[i] = true;
            s2_matches[j] = true;
            matches += 1;
            break;
        }
    }
    if matches == 0 {
        return 0.0;
    }
    let mut transpositions = 0usize;
    let mut k = 0usize;
    for i in 0..len1 {
        if !s1_matches[i] {
            continue;
        }
        while !s2_matches[k] {
            k += 1;
        }
        if s1[i] != s2[k] {
            transpositions += 1;
        }
        k += 1;
    }
    let m = matches as f64;
    let t = (transpositions as f64) / 2.0;
    (m / len1 as f64 + m / len2 as f64 + (m - t) / m) / 3.0
}

fn read_str(doc: &TantivyDocument, field: Field) -> String {
    doc.get_first(field)
        .and_then(|v| v.as_str())
        .map(str::to_owned)
        .unwrap_or_default()
}

fn read_opt_str(doc: &TantivyDocument, field: Field) -> Option<String> {
    doc.get_first(field)
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

/// `lowerUTF8` (not `lower`) so the indexed `personaname_lc` matches Rust's
/// full-Unicode `to_lowercase()` at query time — otherwise non-ASCII names
/// (Müller, café) never hit the exact-match boost.
const SELECT_PROFILES_COMMON: &str = "
SELECT sp.account_id AS account_id,
       sp.personaname AS personaname,
       lowerUTF8(sp.personaname) AS personaname_lc,
       sp.profileurl AS profileurl,
       sp.avatar AS avatar,
       sp.avatarmedium AS avatarmedium,
       sp.avatarfull AS avatarfull,
       sp.realname AS realname,
       sp.countrycode AS countrycode,
       toUInt32(toUnixTimestamp(sp.last_updated)) AS last_updated_ts,
       sp.`friends.account_id` AS `friends.account_id`,
       arrayMap(d -> toUInt32(toUnixTimestamp(d)), sp.`friends.friend_since`) AS `friends.friend_since`,
       mp.matches_played AS matches_played,
       ifNull(mp.last_team_avg_badge, toUInt32(0)) AS last_team_avg_badge";

fn open_index_at(path: &Path, create_if_missing: bool) -> Result<Index, RebuildError> {
    let schema = build_schema();
    let settings = IndexSettings {
        docstore_compression: Compressor::Zstd(ZstdCompressor::default()),
        ..Default::default()
    };
    let directory = MmapDirectory::open(path).map_err(tantivy_err)?;
    let builder = Index::builder().schema(schema).settings(settings);
    let index = if create_if_missing {
        builder.open_or_create(directory).map_err(tantivy_err)?
    } else {
        Index::open(directory).map_err(tantivy_err)?
    };
    register_default_tokenizer(&index);
    Ok(index)
}

fn open_persisted_reader(path: &Path) -> Result<IndexReader, String> {
    let directory = MmapDirectory::open(path).map_err(|e| e.to_string())?;
    let index = Index::open(directory).map_err(|e| e.to_string())?;
    register_default_tokenizer(&index);
    index
        .reader_builder()
        .reload_policy(ReloadPolicy::Manual)
        .try_into()
        .map_err(|e| e.to_string())
}

fn register_default_tokenizer(index: &Index) {
    let analyzer = TextAnalyzer::builder(SimpleTokenizer::default())
        .filter(LowerCaser)
        .build();
    index.tokenizers().register("default", analyzer);
}

fn write_rows(
    writer: &mut tantivy::IndexWriter,
    f: SearchFields,
    rows: &[ProfileRow],
) -> Result<u32, RebuildError> {
    let mut max_ts: u32 = 0;
    for row in rows {
        let mut doc = TantivyDocument::default();
        doc.add_u64(f.account_id, u64::from(row.account_id));
        doc.add_text(f.personaname_search, &row.personaname_lc);
        doc.add_text(f.personaname_exact, &row.personaname_lc);
        let personaname_nospace = strip_whitespace(&row.personaname_lc);
        if !personaname_nospace.is_empty() {
            doc.add_text(f.personaname_nospace, &personaname_nospace);
        }
        doc.add_text(f.personaname, &row.personaname);
        doc.add_text(f.profileurl, &row.profileurl);
        doc.add_text(f.avatar, &row.avatar);
        doc.add_text(f.avatarmedium, &row.avatarmedium);
        doc.add_text(f.avatarfull, &row.avatarfull);
        if let Some(name) = row.realname.as_deref().filter(|s| !s.is_empty()) {
            doc.add_text(f.realname, name);
        }
        if let Some(cc) = row.countrycode.as_deref().filter(|s| !s.is_empty()) {
            doc.add_text(f.countrycode, cc);
        }
        doc.add_u64(f.last_updated, u64::from(row.last_updated_ts));
        doc.add_u64(f.matches_played, row.matches_played);
        doc.add_u64(f.last_team_avg_badge, u64::from(row.last_team_avg_badge));
        let friends_buf = encode_friends(&row.friends_account_id, &row.friends_friend_since);
        doc.add_bytes(f.friends_blob, &friends_buf);
        writer.add_document(doc).map_err(tantivy_err)?;
        max_ts = max_ts.max(row.last_updated_ts);
    }
    Ok(max_ts)
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default()
}

/// Stable-per-replica identifier for namespacing the on-disk index. In Docker
/// `HOSTNAME` is the container id (unique per replica, stable for the
/// container's life); falls back to the PID when unset.
fn instance_id() -> String {
    let raw = std::env::var("HOSTNAME")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| std::process::id().to_string());
    let sanitized: String = raw
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .take(64)
        .collect();
    if sanitized.is_empty() {
        std::process::id().to_string()
    } else {
        sanitized
    }
}

/// Remove sibling `inst_*` dirs not touched within `STALE_INSTANCE_GRACE_SECS`,
/// reclaiming disk from replicas that were redeployed or removed. Never touches
/// `own_dir`. "Touched" = newest mtime among an instance dir's `v*_` children
/// (incremental commits bump those, not the parent dir's own mtime).
fn gc_stale_instance_dirs(root_path: &Path, own_dir: &Path) {
    let Ok(entries) = std::fs::read_dir(root_path) else {
        return;
    };
    let now = SystemTime::now();
    for entry in entries.flatten() {
        let path = entry.path();
        if path == own_dir {
            continue;
        }
        let is_instance_dir = entry
            .file_name()
            .to_str()
            .is_some_and(|n| n.starts_with(INSTANCE_DIR_PREFIX));
        if !is_instance_dir || !entry.file_type().is_ok_and(|t| t.is_dir()) {
            continue;
        }
        if newest_child_age(&path, now).is_some_and(|age| age.as_secs() < STALE_INSTANCE_GRACE_SECS)
        {
            continue;
        }
        if let Err(e) = std::fs::remove_dir_all(&path) {
            warn!("steam search index: failed to GC stale instance dir {path:?}: {e}");
        } else {
            info!("steam search index: GC'd stale instance dir {path:?}");
        }
    }
}

/// Age of the most recently modified immediate child of `dir`, or `None` if it
/// has no readable children (treated as removable).
fn newest_child_age(dir: &Path, now: SystemTime) -> Option<Duration> {
    let entries = std::fs::read_dir(dir).ok()?;
    let newest = entries
        .flatten()
        .filter_map(|e| e.metadata().ok()?.modified().ok())
        .max()?;
    now.duration_since(newest).ok()
}

fn read_watermark(dir: &Path) -> Option<u32> {
    std::fs::read_to_string(dir.join(WATERMARK_FILENAME))
        .ok()
        .and_then(|s| s.trim().parse().ok())
}

fn write_watermark(dir: &Path, ts: u32) {
    let path = dir.join(WATERMARK_FILENAME);
    if let Err(e) = std::fs::write(&path, ts.to_string()) {
        warn!("steam search index: failed to persist watermark to {path:?}: {e}");
    }
}

fn cleanup_old_dirs(base_path: &Path, keep: Option<&Path>) {
    let Ok(entries) = std::fs::read_dir(base_path) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if Some(path.as_path()) == keep {
            continue;
        }
        let is_versioned = entry.file_name().to_str().is_some_and(|n| {
            n.starts_with(VERSION_PREFIX) || LEGACY_PREFIXES.iter().any(|p| n.starts_with(p))
        });
        if !is_versioned || !entry.file_type().is_ok_and(|t| t.is_dir()) {
            continue;
        }
        if let Err(e) = std::fs::remove_dir_all(&path) {
            warn!("steam search index: failed to remove {path:?}: {e}");
        }
    }
}

fn tantivy_err(e: impl Display) -> RebuildError {
    RebuildError::Tantivy(e.to_string())
}

fn tantivy_se(e: impl Display) -> SearchError {
    SearchError::Tantivy(e.to_string())
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum RebuildError {
    #[error("clickhouse: {0}")]
    Clickhouse(#[from] clickhouse::error::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("tantivy: {0}")]
    Tantivy(String),
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum SearchError {
    #[error("tantivy: {0}")]
    Tantivy(String),
}

#[cfg(test)]
mod tests {
    use super::{STEAM_ID64_OFFSET, jaro, jaro_winkler, parse_id_query};

    fn approx(a: f64, b: f64) {
        assert!((a - b).abs() < 1e-3, "expected {b} ± 1e-3, got {a}");
    }

    #[test]
    fn jaro_known_pairs() {
        approx(jaro("MARTHA", "MARHTA"), 0.9444);
        approx(jaro("DWAYNE", "DUANE"), 0.8222);
        approx(jaro("DIXON", "DICKSONX"), 0.7666);
        approx(jaro("", "abc"), 0.0);
        approx(jaro("abc", "abc"), 1.0);
    }

    #[test]
    fn jaro_winkler_prefix_bonus() {
        approx(jaro_winkler("MARTHA", "MARHTA"), 0.9611);
        approx(jaro_winkler("DWAYNE", "DUANE"), 0.84);
        approx(jaro_winkler("DIXON", "DICKSONX"), 0.8133);
        approx(jaro_winkler("abc", "xbc"), jaro("abc", "xbc"));
    }

    #[test]
    fn parses_account_id() {
        assert_eq!(parse_id_query("12345"), Some(12345));
        assert_eq!(parse_id_query("  12345 "), Some(12345));
    }

    #[test]
    fn parses_steam_id64() {
        let acc: u32 = 84_032_457;
        let sid64 = STEAM_ID64_OFFSET + u64::from(acc);
        assert_eq!(parse_id_query(&sid64.to_string()), Some(acc));
    }

    #[test]
    fn rejects_non_numeric() {
        assert_eq!(parse_id_query("raimann"), None);
        assert_eq!(parse_id_query("123abc"), None);
    }
}
