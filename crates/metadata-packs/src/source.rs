use crate::Kind;

/// The bucket prefixes that hold loose metadata files, packed by the packer.
pub const SOURCE_PREFIXES: &[&str] = &["processed/metadata/", "failed/metadata/"];

/// The match id and kind of a loose metadata object, from its key
/// (`processed/metadata/{id}.meta.bz2`, `.meta_hltv.bz2`, `.meta`, or the same under `failed/`).
/// `None` for anything else.
#[must_use]
pub fn parse_source_key(key: &str) -> Option<(u64, Kind)> {
    let key = key.strip_prefix('/').unwrap_or(key);
    let (folder, name) = key.rsplit_once('/')?;
    let failed = match folder {
        "processed/metadata" => false,
        "failed/metadata" => true,
        _ => return None,
    };
    let (id, hltv) = if let Some(id) = name.strip_suffix(".meta_hltv.bz2") {
        (id, true)
    } else if let Some(id) = name.strip_suffix(".meta.bz2") {
        (id, false)
    } else {
        (name.strip_suffix(".meta")?, false)
    };
    if id.is_empty() || !id.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let match_id = id.parse().ok()?;
    let kind = match (failed, hltv) {
        (false, false) => Kind::Salt,
        (false, true) => Kind::Hltv,
        (true, false) => Kind::FailedSalt,
        (true, true) => Kind::FailedHltv,
    };
    Some((match_id, kind))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_known_keys() {
        assert_eq!(
            parse_source_key("processed/metadata/123.meta.bz2"),
            Some((123, Kind::Salt))
        );
        assert_eq!(
            parse_source_key("/processed/metadata/9.meta_hltv.bz2"),
            Some((9, Kind::Hltv))
        );
        assert_eq!(
            parse_source_key("failed/metadata/77.meta.bz2"),
            Some((77, Kind::FailedSalt))
        );
        assert_eq!(
            parse_source_key("failed/metadata/77.meta_hltv.bz2"),
            Some((77, Kind::FailedHltv))
        );
        assert_eq!(
            parse_source_key("processed/metadata/5.meta"),
            Some((5, Kind::Salt))
        );
    }

    #[test]
    fn rejects_other_keys() {
        for key in [
            "ingest/metadata/1.meta.bz2",
            "processed/metadata/+1.meta.bz2",
            "processed/metadata/.meta.bz2",
            "processed/metadata/1.dem.bz2",
            "processed/metadata/sub/1.meta.bz2",
            "processed/metadata/99999999999999999999999.meta.bz2",
        ] {
            assert_eq!(parse_source_key(key), None, "{key}");
        }
    }
}
