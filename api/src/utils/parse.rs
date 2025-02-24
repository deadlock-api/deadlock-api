use chrono::{DateTime, FixedOffset};
use serde::{Deserialize, Deserializer};

pub fn parse_rfc2822_datetime<'de, D>(deserializer: D) -> Result<DateTime<FixedOffset>, D::Error>
where
    D: Deserializer<'de>,
{
    String::deserialize(deserializer)
        .map_err(serde::de::Error::custom)
        .and_then(|s| DateTime::parse_from_rfc2822(&s).map_err(serde::de::Error::custom))
}
