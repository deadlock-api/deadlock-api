use clickhouse::error::Error;

/// Whether the query ran into a timeout: the client's, or the server's `max_execution_time`.
#[must_use]
pub fn is_query_timeout(error: &Error) -> bool {
    match error {
        Error::TimedOut => true,
        Error::BadResponse(msg) => msg.contains("TIMEOUT_EXCEEDED") || msg.contains("timed out"),
        _ => false,
    }
}

/// Whether the query ran into a memory limit.
#[must_use]
pub fn is_memory_limit_exceeded(error: &Error) -> bool {
    matches!(error, Error::BadResponse(msg) if msg.contains("MEMORY_LIMIT_EXCEEDED"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_errors() {
        let timeout = Error::BadResponse("Code: 159. Timeout exceeded (TIMEOUT_EXCEEDED)".into());
        let memory = Error::BadResponse("Code: 241. (MEMORY_LIMIT_EXCEEDED)".into());
        let other = Error::BadResponse("Code: 47. Unknown identifier".into());
        assert!(is_query_timeout(&Error::TimedOut));
        assert!(is_query_timeout(&timeout));
        assert!(!is_query_timeout(&memory));
        assert!(is_memory_limit_exceeded(&memory));
        assert!(!is_memory_limit_exceeded(&other));
        assert!(!is_query_timeout(&other));
    }
}
