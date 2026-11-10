//! Where a match's game server ran, read from the demo header's server name, e.g.
//! `Valve Deadlock eu_west Server (srcds1010-fra2.271.27)` or
//! `Valve Deadlock dpkt-frankfurt Server (srcds1010-fra-dpkt.429.27)`.

/// The region and datacenter in a demo's server name.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct ServerLocation {
    /// Region of the server, e.g. `eu_west`, `us_north_central` or `dpkt-frankfurt`.
    pub region: String,
    /// Datacenter of the server host: the host name after `srcds<n>-`, e.g. `fra2`, `ord1`,
    /// `fra-dpkt` or `fsn-hetz`.
    pub datacenter: String,
}

/// Parses `Valve Deadlock <region> Server (srcds<n>-<datacenter>.<cluster>.<instance>)`.
/// Returns `None` for any other shape, so a renamed format is skipped rather than stored wrong.
pub(crate) fn parse_server_name(server_name: &str) -> Option<ServerLocation> {
    let rest = server_name
        .trim_end_matches('\0')
        .strip_prefix("Valve Deadlock ")?;
    let (region, host) = rest.split_once(" Server (")?;
    let host = host.strip_suffix(')')?;
    let (host_name, _) = host.split_once('.')?;
    let (_, datacenter) = host_name.split_once('-')?;
    let valid = |s: &str| {
        !s.is_empty()
            && s.chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    };
    (valid(region) && valid(datacenter)).then(|| ServerLocation {
        region: region.to_owned(),
        datacenter: datacenter.to_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn location(region: &str, datacenter: &str) -> ServerLocation {
        ServerLocation {
            region: region.to_owned(),
            datacenter: datacenter.to_owned(),
        }
    }

    #[test]
    fn parses_valve_and_partner_server_names() {
        assert_eq!(
            parse_server_name("Valve Deadlock eu_west Server (srcds1010-fra2.271.27)"),
            Some(location("eu_west", "fra2"))
        );
        assert_eq!(
            parse_server_name("Valve Deadlock us_north_central Server (srcds1013-ord2.129.65)"),
            Some(location("us_north_central", "ord2"))
        );
        assert_eq!(
            parse_server_name("Valve Deadlock dpkt-frankfurt Server (srcds1010-fra-dpkt.429.27)"),
            Some(location("dpkt-frankfurt", "fra-dpkt"))
        );
        assert_eq!(
            parse_server_name("Valve Deadlock falkenstein Server (srcds1001-fsn-hetz.421.3)\0"),
            Some(location("falkenstein", "fsn-hetz"))
        );
    }

    #[test]
    fn rejects_other_shapes() {
        assert_eq!(parse_server_name(""), None);
        assert_eq!(
            parse_server_name("Valve Deadlock Server (srcds1010-fra2.271.27)"),
            None
        );
        assert_eq!(
            parse_server_name("Valve Deadlock eu_west Server (srcds1010.271.27)"),
            None
        );
        assert_eq!(
            parse_server_name("Valve Deadlock eu_west Server (srcds1010-fra2.271.27"),
            None
        );
        assert_eq!(
            parse_server_name("Valve Deadlock eu west Server (srcds1010-fra2.271.27)"),
            None
        );
        assert_eq!(
            parse_server_name("Some Other Game eu_west Server (srcds1010-fra2.1.2)"),
            None
        );
    }
}
