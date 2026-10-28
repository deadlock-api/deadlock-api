use core::str::FromStr;

use tracing::warn;

/// Reads an environment variable and parses it, falling back to `default` on missing or unparsable values.
/// Logs a warning if the variable is set but cannot be parsed.
pub fn env_or<T: FromStr>(name: &str, default: T) -> T
where
    T::Err: core::fmt::Display,
{
    match std::env::var(name) {
        Ok(raw) => raw.parse().unwrap_or_else(|e| {
            warn!("Failed to parse env {name}: {e}, using default");
            default
        }),
        Err(_) => default,
    }
}

/// Displays an error with its whole source chain, `outer: inner: ...`.
pub struct ErrorChain<'a>(pub &'a dyn core::error::Error);

impl core::fmt::Display for ErrorChain<'_> {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        write!(f, "{}", self.0)?;
        let mut source = self.0.source();
        while let Some(e) = source {
            write!(f, ": {e}")?;
            source = e.source();
        }
        Ok(())
    }
}
