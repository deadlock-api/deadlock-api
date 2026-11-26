use sqlx::{PgPool, Postgres, Transaction};

use crate::format::{Entry, PackHeader, hex};
use crate::{Codec, Kind};

/// Where a file lives: `length` bytes at `offset` in pack `pack_id` of bucket `bucket`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Location {
    pub pack_id: u64,
    pub bucket: u16,
    pub offset: u64,
    pub length: u32,
    pub crc32: u32,
    pub codec: Codec,
    pub kind: Kind,
}

/// Which work-queue rows a publication marks as packed.
#[derive(Debug, Clone, Copy)]
pub enum PublishSources<'a> {
    /// Exactly these `(bucket, key)` rows (the packer knows what it packed).
    Keys(&'a [(String, String)]),
    /// Pending rows whose match, kind and `ETag` equal an entry's (a pack adopted from its sidecar).
    ByMd5,
}

/// The Postgres index of packed files. It holds nothing the sidecars lack, so it can always be
/// rebuilt from the bucket.
#[derive(Debug, Clone)]
pub struct Index {
    pg: PgPool,
}

const SCHEMA: &[&str] = &[
    "CREATE SEQUENCE IF NOT EXISTS metadata_packs_pack_id_seq",
    "CREATE TABLE IF NOT EXISTS metadata_packs (
        pack_id bigint PRIMARY KEY,
        bucket smallint NOT NULL,
        size_bytes bigint NOT NULL,
        entries integer NOT NULL,
        min_match_id bigint NOT NULL,
        max_match_id bigint NOT NULL,
        sha256 bytea NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
    )",
    "CREATE TABLE IF NOT EXISTS metadata_pack_entries (
        match_id bigint NOT NULL,
        kind smallint NOT NULL,
        pack_id bigint NOT NULL,
        \"offset\" bigint NOT NULL,
        length integer NOT NULL,
        codec smallint NOT NULL,
        crc32 integer NOT NULL,
        PRIMARY KEY (match_id, kind)
    ) WITH (fillfactor = 100)",
    "CREATE TABLE IF NOT EXISTS metadata_pack_sources (
        bucket text NOT NULL,
        key text NOT NULL,
        match_id bigint NOT NULL,
        kind smallint NOT NULL,
        size bigint NOT NULL,
        etag text NOT NULL,
        last_modified timestamptz NOT NULL,
        state smallint NOT NULL DEFAULT 0,
        pack_id bigint,
        packed_at timestamptz,
        discovered_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (bucket, key)
    )",
    "CREATE INDEX IF NOT EXISTS metadata_pack_sources_pending
        ON metadata_pack_sources (match_id, kind) WHERE state = 0",
    "CREATE INDEX IF NOT EXISTS metadata_pack_sources_packed
        ON metadata_pack_sources (packed_at) WHERE state = 1",
];

/// Bit-casts between the u32 checksums and Postgres' signed `integer`.
const fn crc_to_i32(crc: u32) -> i32 {
    i32::from_ne_bytes(crc.to_ne_bytes())
}

const fn crc_from_i32(crc: i32) -> u32 {
    u32::from_ne_bytes(crc.to_ne_bytes())
}

fn i64_of(value: u64) -> sqlx::Result<i64> {
    i64::try_from(value).map_err(|e| sqlx::Error::Encode(Box::new(e)))
}

fn u64_of(value: i64) -> sqlx::Result<u64> {
    u64::try_from(value).map_err(|e| sqlx::Error::Decode(Box::new(e)))
}

fn kinds_param(kinds: &[Kind]) -> Vec<i16> {
    kinds.iter().map(|k| k.as_i16()).collect()
}

impl Index {
    #[must_use]
    pub const fn new(pg: PgPool) -> Self {
        Self { pg }
    }

    #[must_use]
    pub const fn pool(&self) -> &PgPool {
        &self.pg
    }

    /// Creates the tables if they are missing. Only adds objects, never alters them.
    pub async fn ensure_schema(&self) -> sqlx::Result<()> {
        for statement in SCHEMA {
            sqlx::query(*statement).execute(&self.pg).await?;
        }
        Ok(())
    }

    /// The location of `match_id`'s file of the first kind in `kinds` that is packed.
    pub async fn lookup(&self, match_id: u64, kinds: &[Kind]) -> sqlx::Result<Option<Location>> {
        let row: Option<(i64, i16, i64, i32, i16, i32, i16)> = sqlx::query_as(
            "SELECT e.pack_id, p.bucket, e.\"offset\", e.length, e.codec, e.crc32, e.kind
             FROM metadata_pack_entries e JOIN metadata_packs p USING (pack_id)
             WHERE e.match_id = $1 AND e.kind = ANY($2)
             ORDER BY array_position($2, e.kind)
             LIMIT 1",
        )
        .bind(i64_of(match_id)?)
        .bind(kinds_param(kinds))
        .fetch_optional(&self.pg)
        .await?;
        let Some((pack_id, bucket, offset, length, codec, crc32, kind)) = row else {
            return Ok(None);
        };
        let decode =
            |what: &str| sqlx::Error::Decode(format!("bad {what} in metadata_pack_entries").into());
        Ok(Some(Location {
            pack_id: u64_of(pack_id)?,
            bucket: u16::try_from(bucket).ok().ok_or_else(|| decode("bucket"))?,
            offset: u64_of(offset)?,
            length: u32::try_from(length).ok().ok_or_else(|| decode("length"))?,
            crc32: crc_from_i32(crc32),
            codec: Codec::from_i16(codec).ok_or_else(|| decode("codec"))?,
            kind: Kind::from_i16(kind).ok_or_else(|| decode("kind"))?,
        }))
    }

    /// Whether `match_id` has a packed file of one of `kinds`.
    pub async fn contains(&self, match_id: u64, kinds: &[Kind]) -> sqlx::Result<bool> {
        sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM metadata_pack_entries WHERE match_id = $1 AND kind = ANY($2))",
        )
        .bind(i64_of(match_id)?)
        .bind(kinds_param(kinds))
        .fetch_one(&self.pg)
        .await
    }

    /// A fresh pack id.
    pub async fn next_pack_id(&self) -> sqlx::Result<u64> {
        let id: i64 = sqlx::query_scalar("SELECT nextval('metadata_packs_pack_id_seq')")
            .fetch_one(&self.pg)
            .await?;
        u64_of(id)
    }

    /// Every published pack id.
    pub async fn pack_ids(&self) -> sqlx::Result<Vec<u64>> {
        let ids: Vec<i64> = sqlx::query_scalar("SELECT pack_id FROM metadata_packs")
            .fetch_all(&self.pg)
            .await?;
        ids.into_iter().map(u64_of).collect()
    }

    /// Publishes a pack whose sidecar is already in the bucket, in one transaction: readers see
    /// all of its entries or none. An entry replaces an existing one only from a newer pack.
    pub async fn publish(
        &self,
        bucket: u16,
        header: &PackHeader,
        entries: &[Entry],
        sources: PublishSources<'_>,
    ) -> sqlx::Result<()> {
        let pack_id = i64_of(header.pack_id)?;
        let mut tx = self.pg.begin().await?;
        let min = entries.iter().map(|e| e.match_id).min().unwrap_or_default();
        let max = entries.iter().map(|e| e.match_id).max().unwrap_or_default();
        sqlx::query(
            "INSERT INTO metadata_packs
                (pack_id, bucket, size_bytes, entries, min_match_id, max_match_id, sha256)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (pack_id) DO NOTHING",
        )
        .bind(pack_id)
        .bind(i16::try_from(bucket).map_err(|e| sqlx::Error::Encode(Box::new(e)))?)
        .bind(i64_of(header.pack_len)?)
        .bind(i32::try_from(entries.len()).map_err(|e| sqlx::Error::Encode(Box::new(e)))?)
        .bind(i64_of(min)?)
        .bind(i64_of(max)?)
        .bind(header.pack_sha256.as_slice())
        .execute(&mut *tx)
        .await?;

        let mut match_ids = Vec::with_capacity(entries.len());
        let mut kinds = Vec::with_capacity(entries.len());
        let mut offsets = Vec::with_capacity(entries.len());
        let mut lengths = Vec::with_capacity(entries.len());
        let mut codecs = Vec::with_capacity(entries.len());
        let mut crcs = Vec::with_capacity(entries.len());
        let mut etags = Vec::with_capacity(entries.len());
        for e in entries {
            match_ids.push(i64_of(e.match_id)?);
            kinds.push(e.kind.as_i16());
            offsets.push(i64_of(e.offset)?);
            lengths
                .push(i32::try_from(e.length).map_err(|err| sqlx::Error::Encode(Box::new(err)))?);
            codecs.push(e.codec.as_i16());
            crcs.push(crc_to_i32(e.crc32));
            etags.push(hex(&e.md5));
        }
        sqlx::query(
            "INSERT INTO metadata_pack_entries
                (match_id, kind, pack_id, \"offset\", length, codec, crc32)
             SELECT m, k, $3, o, l, c, r
             FROM UNNEST($1::bigint[], $2::smallint[], $4::bigint[], $5::integer[],
                         $6::smallint[], $7::integer[]) AS t(m, k, o, l, c, r)
             ON CONFLICT (match_id, kind) DO UPDATE SET
                pack_id = EXCLUDED.pack_id, \"offset\" = EXCLUDED.\"offset\",
                length = EXCLUDED.length, codec = EXCLUDED.codec, crc32 = EXCLUDED.crc32
             WHERE metadata_pack_entries.pack_id < EXCLUDED.pack_id",
        )
        .bind(&match_ids)
        .bind(&kinds)
        .bind(pack_id)
        .bind(&offsets)
        .bind(&lengths)
        .bind(&codecs)
        .bind(&crcs)
        .execute(&mut *tx)
        .await?;

        mark_sources(&mut tx, pack_id, sources, &match_ids, &kinds, &etags).await?;
        sqlx::query(
            "SELECT setval('metadata_packs_pack_id_seq',
                GREATEST($1, (SELECT last_value FROM metadata_packs_pack_id_seq)))",
        )
        .bind(pack_id)
        .execute(&mut *tx)
        .await?;
        tx.commit().await
    }
}

async fn mark_sources(
    tx: &mut Transaction<'_, Postgres>,
    pack_id: i64,
    sources: PublishSources<'_>,
    match_ids: &[i64],
    kinds: &[i16],
    etags: &[String],
) -> sqlx::Result<()> {
    match sources {
        PublishSources::Keys(keys) => {
            let (buckets, keys): (Vec<&str>, Vec<&str>) =
                keys.iter().map(|(b, k)| (b.as_str(), k.as_str())).unzip();
            sqlx::query(
                "UPDATE metadata_pack_sources s SET state = 1, pack_id = $1, packed_at = now()
                 FROM UNNEST($2::text[], $3::text[]) AS t(b, k)
                 WHERE s.bucket = t.b AND s.key = t.k",
            )
            .bind(pack_id)
            .bind(buckets)
            .bind(keys)
            .execute(&mut **tx)
            .await?;
        }
        PublishSources::ByMd5 => {
            sqlx::query(
                "UPDATE metadata_pack_sources s SET state = 1, pack_id = $1, packed_at = now()
                 FROM UNNEST($2::bigint[], $3::smallint[], $4::text[]) AS t(m, k, e)
                 WHERE s.state = 0 AND s.match_id = t.m AND s.kind = t.k AND s.etag = t.e",
            )
            .bind(pack_id)
            .bind(match_ids)
            .bind(kinds)
            .bind(etags)
            .execute(&mut **tx)
            .await?;
        }
    }
    Ok(())
}
