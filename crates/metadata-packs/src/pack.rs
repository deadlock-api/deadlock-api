use bytes::Bytes;
use futures::StreamExt as _;
use futures::stream::FuturesUnordered;
use md5::{Digest as _, Md5};
use object_store::path::Path;
use object_store::{ObjectStore, ObjectStoreExt as _, PutMode, PutOptions, PutPayload};
use sha2::Sha256;
use tracing::warn;

use crate::Codec;
use crate::Kind;
use crate::format::{self, Entry, FormatError, PackHeader};

/// A multipart part. Hetzner needs at least 5 MiB for every part but the last.
pub const PART_SIZE: usize = 64 * 1024 * 1024;
const PARTS_IN_FLIGHT: usize = 4;

/// A file to pack, already checked against its object's `ETag`.
#[derive(Debug, Clone)]
pub struct SourceFile {
    pub match_id: u64,
    pub kind: Kind,
    pub data: Bytes,
    pub md5: [u8; 16],
}

impl SourceFile {
    /// Computes the md5 of `data`.
    #[must_use]
    pub fn new(match_id: u64, kind: Kind, data: Bytes) -> Self {
        let md5 = Md5::digest(&data).into();
        Self {
            match_id,
            kind,
            data,
            md5,
        }
    }
}

/// A pack built in memory, ready to upload.
#[derive(Debug, Clone)]
pub struct BuiltPack {
    pub header: PackHeader,
    pub entries: Vec<Entry>,
    pub data: Bytes,
    /// The `ETag` S3 gives the multipart upload of `data` in [`PART_SIZE`] parts: the md5 of the
    /// parts' md5s, then `-{parts}`.
    pub multipart_etag: String,
}

/// How [`upload_pack`] checks the stored pack before committing it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verify {
    /// Compare the stored object's size and multipart `ETag` (which the server computes from the
    /// bytes it received) with the built pack's. Falls back to [`Verify::ReadBack`] when the store
    /// does not report a multipart `ETag`.
    ETag,
    /// Download the whole pack and compare its length and sha256.
    ReadBack,
}

#[derive(Debug, thiserror::Error)]
pub enum PackError {
    #[error("no files to pack")]
    Empty,
    #[error("match {0} has two files of kind {1:?}")]
    Duplicate(u64, Kind),
    #[error("a file or the pack is too large")]
    TooLarge,
    #[error(transparent)]
    Format(#[from] FormatError),
    #[error(transparent)]
    Store(#[from] object_store::Error),
    #[error(
        "read-back of {key} returned {actual_len} bytes with sha256 {actual_sha}, expected {expected_len} and {expected_sha}"
    )]
    Verify {
        key: String,
        expected_len: u64,
        actual_len: u64,
        expected_sha: String,
        actual_sha: String,
    },
}

/// Concatenates `files` sorted by `(match_id, kind)` and describes them.
pub fn build_pack(
    pack_id: u64,
    mut files: Vec<SourceFile>,
    created_unix: u64,
) -> Result<BuiltPack, PackError> {
    if files.is_empty() {
        return Err(PackError::Empty);
    }
    files.sort_unstable_by_key(|f| (f.match_id, f.kind));
    let total = files
        .iter()
        .try_fold(0usize, |acc, f| acc.checked_add(f.data.len()))
        .ok_or(PackError::TooLarge)?;
    let mut data = Vec::with_capacity(total);
    let mut entries: Vec<Entry> = Vec::with_capacity(files.len());
    for f in &files {
        if entries
            .last()
            .is_some_and(|prev| (prev.match_id, prev.kind) == (f.match_id, f.kind))
        {
            return Err(PackError::Duplicate(f.match_id, f.kind));
        }
        entries.push(Entry {
            match_id: f.match_id,
            kind: f.kind,
            offset: u64::try_from(data.len()).ok().ok_or(PackError::TooLarge)?,
            length: u32::try_from(f.data.len())
                .ok()
                .ok_or(PackError::TooLarge)?,
            crc32: crc32fast::hash(&f.data),
            codec: Codec::sniff(&f.data),
            md5: f.md5,
        });
        data.extend_from_slice(&f.data);
    }
    let pack_sha256 = Sha256::digest(&data).into();
    let multipart_etag = multipart_etag(&data);
    Ok(BuiltPack {
        header: PackHeader {
            pack_id,
            pack_len: u64::try_from(data.len()).ok().ok_or(PackError::TooLarge)?,
            pack_sha256,
            created_unix,
        },
        entries,
        data: Bytes::from(data),
        multipart_etag,
    })
}

/// The S3 `ETag` of `data` uploaded in [`PART_SIZE`] parts.
fn multipart_etag(data: &[u8]) -> String {
    let mut digests = Vec::new();
    let mut parts = 0usize;
    for part in data.chunks(PART_SIZE) {
        digests.extend_from_slice(&Md5::digest(part));
        parts = parts.saturating_add(1);
    }
    format!("{}-{parts}", format::hex(&Md5::digest(&digests)))
}

/// Uploads the pack, reads it back and checks it, then writes its sidecar, which commits it.
///
/// `mode` says how the stored pack is checked (see [`Verify`]). On a failed check the pack object
/// is deleted and no sidecar is written. The sidecar is created with `If-None-Match: *`, so an existing one is never replaced.
pub async fn upload_pack(
    store: &dyn ObjectStore,
    prefix: &str,
    pack: &BuiltPack,
    mode: Verify,
) -> Result<(), PackError> {
    let key = format::pack_key(prefix, pack.header.pack_id);
    put_multipart(store, &key, &pack.data).await?;
    if let Err(e) = verify(store, &key, pack, mode).await {
        if let Err(delete) = store.delete(&key).await {
            warn!("Could not delete unverified pack {key}: {delete}");
        }
        return Err(e);
    }
    let sidecar = format::encode_sidecar(&pack.header, &pack.entries)?;
    store
        .put_opts(
            &format::sidecar_key(prefix, pack.header.pack_id),
            PutPayload::from(sidecar),
            PutOptions {
                mode: PutMode::Create,
                ..PutOptions::default()
            },
        )
        .await?;
    Ok(())
}

async fn put_multipart(store: &dyn ObjectStore, key: &Path, data: &Bytes) -> Result<(), PackError> {
    let mut upload = store.put_multipart(key).await?;
    let mut in_flight = FuturesUnordered::new();
    let mut start = 0usize;
    let result: Result<(), object_store::Error> = async {
        while start < data.len() {
            let end = start.saturating_add(PART_SIZE).min(data.len());
            in_flight.push(upload.put_part(PutPayload::from(data.slice(start..end))));
            start = end;
            if in_flight.len() >= PARTS_IN_FLIGHT
                && let Some(done) = in_flight.next().await
            {
                done?;
            }
        }
        while let Some(done) = in_flight.next().await {
            done?;
        }
        Ok(())
    }
    .await;
    drop(in_flight);
    match result {
        Ok(()) => {
            upload.complete().await?;
            Ok(())
        }
        Err(e) => {
            if let Err(abort) = upload.abort().await {
                warn!("Could not abort the multipart upload of {key}: {abort}");
            }
            Err(e.into())
        }
    }
}

async fn verify(
    store: &dyn ObjectStore,
    key: &Path,
    pack: &BuiltPack,
    mode: Verify,
) -> Result<(), PackError> {
    let header = &pack.header;
    if mode == Verify::ETag {
        let meta = store.head(key).await?;
        let etag = meta
            .e_tag
            .as_deref()
            .map(|e| e.trim_matches('"').to_ascii_lowercase());
        if let Some(etag) = etag.filter(|e| e.contains('-')) {
            if meta.size != header.pack_len || etag != pack.multipart_etag {
                return Err(PackError::Verify {
                    key: key.to_string(),
                    expected_len: header.pack_len,
                    actual_len: meta.size,
                    expected_sha: pack.multipart_etag.clone(),
                    actual_sha: etag,
                });
            }
            return Ok(());
        }
    }
    let mut stream = store.get(key).await?.into_stream();
    let mut hasher = Sha256::new();
    let mut len = 0u64;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        hasher.update(&chunk);
        len = len.saturating_add(u64::try_from(chunk.len()).unwrap_or(u64::MAX));
    }
    let sha: [u8; 32] = hasher.finalize().into();
    if len != header.pack_len || sha != header.pack_sha256 {
        return Err(PackError::Verify {
            key: key.to_string(),
            expected_len: header.pack_len,
            actual_len: len,
            expected_sha: format::hex(&header.pack_sha256),
            actual_sha: format::hex(&sha),
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use core::assert_matches;
    use object_store::memory::InMemory;

    use super::*;

    fn file(match_id: u64, kind: Kind, body: &'static [u8]) -> SourceFile {
        SourceFile::new(match_id, kind, Bytes::from_static(body))
    }

    #[test]
    fn builds_sorted_contiguous_packs() {
        let pack = build_pack(
            3,
            vec![
                file(9, Kind::Salt, b"BZh9-nine"),
                file(2, Kind::Hltv, b"\x28\xb5\x2f\xfd-two-hltv"),
                file(2, Kind::Salt, b"two"),
            ],
            1,
        )
        .unwrap();
        let ids: Vec<_> = pack.entries.iter().map(|e| (e.match_id, e.kind)).collect();
        assert_eq!(ids, vec![(2, Kind::Salt), (2, Kind::Hltv), (9, Kind::Salt)]);
        assert_eq!(pack.entries[1].offset, 3);
        assert_eq!(pack.entries[1].codec, Codec::Zstd);
        assert_eq!(pack.entries[2].codec, Codec::Bzip2);
        assert_eq!(pack.header.pack_len, pack.data.len() as u64);
        for e in &pack.entries {
            let r = e.range().unwrap();
            let slice =
                &pack.data[usize::try_from(r.start).unwrap()..usize::try_from(r.end).unwrap()];
            assert_eq!(crc32fast::hash(slice), e.crc32);
            assert_eq!(<[u8; 16]>::from(Md5::digest(slice)), e.md5);
        }
    }

    #[test]
    fn rejects_duplicates_and_empty() {
        assert_matches!(build_pack(1, vec![], 0), Err(PackError::Empty));
        assert_matches!(
            build_pack(
                1,
                vec![file(1, Kind::Salt, b"a"), file(1, Kind::Salt, b"b")],
                0
            ),
            Err(PackError::Duplicate(1, Kind::Salt))
        );
    }

    #[tokio::test]
    async fn uploads_verifies_and_commits() {
        let store = InMemory::new();
        let body: Vec<u8> = (0..(PART_SIZE + 1000))
            .map(|i| u8::try_from(i % 251).unwrap())
            .collect();
        let files = vec![
            SourceFile::new(1, Kind::Salt, Bytes::from(body.clone())),
            file(2, Kind::Salt, b"tail"),
        ];
        let pack = build_pack(7, files, 5).unwrap();
        upload_pack(&store, "packs/v1", &pack, Verify::ETag)
            .await
            .unwrap();
        let stored = store
            .get(&format::pack_key("packs/v1", 7))
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap();
        assert_eq!(stored, pack.data);
        let sidecar = store
            .get(&format::sidecar_key("packs/v1", 7))
            .await
            .unwrap()
            .bytes()
            .await
            .unwrap();
        let (header, entries) = format::decode_sidecar(&sidecar).unwrap();
        assert_eq!(header, pack.header);
        assert_eq!(entries, pack.entries);
        // A second commit of the same id never overwrites the sidecar.
        assert!(
            upload_pack(&store, "packs/v1", &pack, Verify::ReadBack)
                .await
                .is_err()
        );
    }

    #[test]
    fn multipart_etags_follow_s3() {
        // md5 of the parts' md5s, as Hetzner returned for the probe upload.
        let one = multipart_etag(b"abc");
        let md5_abc = Md5::digest(b"abc");
        assert_eq!(one, format!("{}-1", format::hex(&Md5::digest(md5_abc))));
        let data = vec![7u8; PART_SIZE + 1];
        assert!(multipart_etag(&data).ends_with("-2"));
    }
}
