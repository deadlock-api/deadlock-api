use utoipa::openapi::security::{ApiKey, ApiKeyValue, SecurityScheme};
use utoipa::{Modify, OpenApi};

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Deadlock API",
        version = "0.1.0",
        description = r#"
API for the Game [Deadlock](https://store.steampowered.com/app/1422450)

deadlock-api.com is not endorsed by Valve and does not reflect the views or opinions of Valve or anyone officially involved in producing or managing Valve properties. Valve and all associated properties are trademarks or registered trademarks of Valve Corporation
        "#,
        contact(name = "Deadlock API  - Discord", url = "https://discord.gg/XMF9Xrgfqu"),
    ),
    modifiers(&SecurityAddon),
)]
pub struct ApiDoc;

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
