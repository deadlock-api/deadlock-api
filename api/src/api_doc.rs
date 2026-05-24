use serde_json::json;
use utoipa::openapi::extensions::Extensions;
use utoipa::openapi::security::{ApiKey, ApiKeyValue, SecurityScheme};
use utoipa::{Modify, OpenApi};

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Deadlock API",
        version = "0.1.0",
        description = "
## API Clients

We have auto generated and updated clients for many languages. You can find them here: [https://github.com/deadlock-api/openapi-clients](https://github.com/deadlock-api/openapi-clients)

## Support the Deadlock API

Whether you're building your own database, developing data science projects, or enhancing your website with game and player analytics, the Deadlock API has the data you need.

Your sponsorship helps keep this resource open, free and future-proof for everyone. By supporting the Deadlock API, you will enable continued development, new features and reliable access for developers, analysts and streamers worldwide.

Help us continue to provide the data you need - sponsor the Deadlock API today!

**-> You can Sponsor the Deadlock API on [Patreon](https://www.patreon.com/c/user?u=68961896) or [GitHub](https://github.com/sponsors/raimannma)**

## Disclaimer
_deadlock-api.com is not endorsed by Valve and does not reflect the views or opinions of Valve or anyone officially involved in producing or managing Valve properties. Valve and all associated properties are trademarks or registered trademarks of Valve Corporation_
        ",
        contact(name = "Deadlock API - Discord", url = "https://discord.gg/XMF9Xrgfqu"),
        license(
            name = "MIT",
            url = "https://github.com/deadlock-api/deadlock-api/blob/master/LICENSE"
        )
    ),
    modifiers(&SecurityAddon, &TagGroupsAddon),
    external_docs(
        description = "Source Code",
        url = "https://github.com/deadlock-api/deadlock-api"
    )
)]
pub(super) struct ApiDoc;

struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        if let Some(components) = openapi.components.as_mut() {
            components.add_security_schemes_from_iter(vec![
                (
                    "api_key_header",
                    SecurityScheme::ApiKey(ApiKey::Header(ApiKeyValue::new("X-API-KEY"))),
                ),
                (
                    "api_key_query",
                    SecurityScheme::ApiKey(ApiKey::Query(ApiKeyValue::new("api_key"))),
                ),
            ]);
        }
    }
}

struct TagGroupsAddon;

const TAG_GROUPS: &[(&str, &[&str])] = &[
    (
        "Assets",
        &[
            "Accolades",
            "Build Tags",
            "Client Versions",
            "Colors",
            "Generic Data",
            "Heroes",
            "Loot Tables",
            "Misc Entities",
            "NPC Units",
            "Ranks",
            "Steam Info",
        ],
    ),
    (
        "Game Data",
        &[
            "Analytics",
            "Builds",
            "Custom Matches",
            "Info",
            "Leaderboard",
            "Matches",
            "MMR",
            "Patches",
            "Players",
            "Steam",
        ],
    ),
    (
        "Developer",
        &["Commands", "GraphQL", "Internal", "Servers", "SQL"],
    ),
];

impl Modify for TagGroupsAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let tag_groups = json!(
            TAG_GROUPS
                .iter()
                .map(|(name, tags)| json!({ "name": name, "tags": tags }))
                .collect::<Vec<_>>()
        );
        openapi
            .extensions
            .get_or_insert_with(Extensions::default)
            .insert("x-tagGroups".to_string(), tag_groups);
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;
    use std::path::Path;

    use super::TAG_GROUPS;

    /// Walks `src/` and extracts every tag name used in a `#[utoipa::path(...)]`
    /// attribute via `tags = ["X", "Y"]`. Returns the unique set.
    fn collect_source_tags() -> HashSet<String> {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let src = Path::new(manifest_dir).join("src");

        let tags_re = regex::Regex::new(r"tags\s*=\s*\[([^\]]*)\]").unwrap();
        let str_re = regex::Regex::new(r#""([^"]+)""#).unwrap();

        let mut tags = HashSet::new();
        let mut stack = vec![src];
        while let Some(dir) = stack.pop() {
            for entry in std::fs::read_dir(&dir).unwrap().flatten() {
                let path = entry.path();
                if path.is_dir() {
                    stack.push(path);
                } else if path.extension().is_some_and(|e| e == "rs")
                    && path.file_name().is_some_and(|f| f != "api_doc.rs")
                {
                    let content = std::fs::read_to_string(&path).unwrap();
                    for m in tags_re.captures_iter(&content) {
                        for s in str_re.captures_iter(&m[1]) {
                            tags.insert(s[1].to_string());
                        }
                    }
                }
            }
        }
        tags
    }

    fn collect_grouped_tags() -> HashSet<String> {
        TAG_GROUPS
            .iter()
            .flat_map(|(_, ts)| ts.iter().map(|t| (*t).to_string()))
            .collect()
    }

    #[test]
    fn every_tag_is_in_a_group() {
        let source: HashSet<String> = collect_source_tags();
        let grouped = collect_grouped_tags();
        let missing: Vec<&String> = source.difference(&grouped).collect();
        assert!(
            missing.is_empty(),
            "Tags used in #[utoipa::path] are not present in TAG_GROUPS (Scalar x-tagGroups). \
             Add them to src/api_doc.rs::TAG_GROUPS:\n  {missing:?}",
        );
    }

    #[test]
    fn no_tag_appears_in_multiple_groups() {
        let mut seen: HashSet<&str> = HashSet::new();
        let mut dupes: Vec<&str> = Vec::new();
        for (_, tags) in TAG_GROUPS {
            for t in *tags {
                if !seen.insert(t) {
                    dupes.push(t);
                }
            }
        }
        assert!(
            dupes.is_empty(),
            "TAG_GROUPS contains tags assigned to multiple groups: {dupes:?}",
        );
    }
}
