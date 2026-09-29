//! Shared cached loader for the per-version localization JSON.

use std::collections::HashMap;
use std::sync::Arc;

use cached::macros::cached;
use object_store::aws::AmazonS3;

use crate::services::assets::versions::error::AssetsError;
use crate::services::assets::versions::store;

/// Look up a localization token, stripping the leading `#` if present. Tries
/// the exact key, then the `:n` (noun) variant, then a case-insensitive match
/// (vdata tokens don't always match the localization key's casing, e.g.
/// `#ability_doorman_bomb_explosion` vs `ability_doorman_bomb_Explosion`).
pub(crate) fn lookup<'a>(loc: &'a HashMap<String, String>, token: &str) -> Option<&'a String> {
    let key = token.trim_start_matches('#');
    if key.is_empty() {
        return None;
    }
    loc.get(key)
        .or_else(|| loc.get(&format!("{key}:n")))
        .or_else(|| {
            loc.iter()
                .find(|(k, _)| k.eq_ignore_ascii_case(key))
                .map(|(_, v)| v)
        })
}

/// [`lookup`], returning the raw token unchanged if no entry exists.
pub(crate) fn localize(loc: &HashMap<String, String>, token: &str) -> String {
    lookup(loc, token)
        .cloned()
        .unwrap_or_else(|| token.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn localize_tries_noun_and_case_insensitive_variants() {
        let loc: HashMap<String, String> = [
            ("Citadel_Graph_PermanentBuff_FireRate", "Fire Rate"),
            ("hero_atlas:n", "Abrams"),
            ("ability_doorman_bomb_Explosion", "Explosion"),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_owned(), v.to_owned()))
        .collect();
        assert_eq!(
            localize(&loc, "#Citadel_Graph_PermanentBuff_FireRate"),
            "Fire Rate"
        );
        assert_eq!(localize(&loc, "hero_atlas"), "Abrams");
        assert_eq!(
            localize(&loc, "#ability_doorman_bomb_explosion"),
            "Explosion"
        );
        assert_eq!(localize(&loc, "#missing_token"), "#missing_token");
        assert_eq!(localize(&loc, "#"), "#");
    }
}

/// Falls back to english when the requested language is missing.
#[cached(
    max_size = 64,
    ttl_secs = 86400,
    convert = r#"{ (version, language.to_owned()) }"#,
    key = "(u32, String)"
)]
pub(crate) async fn fetch_localization(
    r2: &AmazonS3,
    version: u32,
    language: &str,
) -> Result<Arc<HashMap<String, String>>, AssetsError> {
    match store::fetch_text(r2, version, &format!("localization/{language}.json")).await {
        Ok(json) => Ok(Arc::new(serde_json::from_str(&json)?)),
        Err(store::VersionStoreError::ObjectStore(object_store::Error::NotFound { .. }))
            if language != "english" =>
        {
            tracing::warn!(
                "localization/{language}.json missing for v{version}; falling back to english"
            );
            let json = store::fetch_text(r2, version, "localization/english.json").await?;
            Ok(Arc::new(serde_json::from_str(&json)?))
        }
        Err(e) => Err(e.into()),
    }
}
