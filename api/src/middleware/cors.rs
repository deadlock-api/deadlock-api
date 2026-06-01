use axum::http::HeaderName;
use tower_http::cors::{AllowHeaders, Any, CorsLayer};

/// Wildcard-origin CORS with no `Vary` header, so public responses stay
/// CDN-cacheable. Request headers are mirrored so header-based auth keeps
/// working; cookies are not allowed.
pub(crate) fn public() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(AllowHeaders::mirror_request())
        .expose_headers(Any)
        .vary(Vec::<HeaderName>::new())
}

/// Origin-reflecting CORS that allows credentials (cookies). Forces
/// `Vary: origin`, so only use it on routes that send `private`/`no-store`.
pub(crate) fn credentialed() -> CorsLayer {
    CorsLayer::very_permissive()
}
