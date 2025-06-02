use utoipa::openapi::security::{ApiKey, ApiKeyValue, SecurityScheme};
use utoipa::{Modify, OpenApi};

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Deadlock API",
        version = "0.1.0",
        description = r#"
## Support the Deadlock API

Whether you're building your own database, developing data science projects, or enhancing your website with game and player analytics, the Deadlock API has the data you need.

Your sponsorship helps keep this resource open, free and future-proof for everyone. By supporting the Deadlock API, you will enable continued development, new features and reliable access for developers, analysts and streamers worldwide.

Help us continue to provide the data you need - sponsor the Deadlock API today!

**-> You can Sponsor the Deadlock API on [Patreon](https://www.patreon.com/c/user?u=68961896) or [GitHub](https://github.com/sponsors/raimannma)**

## Disclaimer
_deadlock-api.com is not endorsed by Valve and does not reflect the views or opinions of Valve or anyone officially involved in producing or managing Valve properties. Valve and all associated properties are trademarks or registered trademarks of Valve Corporation_
        "#,
        contact(name = "Deadlock API - Discord", url = "https://discord.gg/XMF9Xrgfqu"),
        license(
            name = "MIT",
            url = "https://github.com/deadlock-api/deadlock-api-rust/blob/master/LICENSE"
        )
    ),
    modifiers(&SecurityAddon),
    external_docs(
        description = "Source Code",
        url = "https://github.com/deadlock-api/deadlock-api-rust"
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
