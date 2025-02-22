use utoipa::openapi::security::{ApiKey, ApiKeyValue, SecurityScheme};
use utoipa::{Modify, OpenApi};

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Deadlock API",
        version = "0.1.0",
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
