use serde::Deserialize;

/// Patreon webhook event types parsed from the `X-Patreon-Event` header.
#[derive(Debug, Clone, PartialEq, Eq)]
#[allow(clippy::enum_variant_names)]
pub(crate) enum PatreonWebhookEvent {
    MembersCreate,
    MembersUpdate,
    MembersDelete,
    MembersPledgeCreate,
    MembersPledgeUpdate,
    MembersPledgeDelete,
}

impl PatreonWebhookEvent {
    pub(crate) fn from_header(value: &str) -> Option<Self> {
        match value {
            "members:create" => Some(Self::MembersCreate),
            "members:update" => Some(Self::MembersUpdate),
            "members:delete" => Some(Self::MembersDelete),
            "members:pledge:create" => Some(Self::MembersPledgeCreate),
            "members:pledge:update" => Some(Self::MembersPledgeUpdate),
            "members:pledge:delete" => Some(Self::MembersPledgeDelete),
            _ => None,
        }
    }
}

/// Top-level JSON:API webhook payload from Patreon.
/// In webhook payloads, `data` is the member resource (not the user).
#[derive(Debug, Deserialize)]
pub(crate) struct WebhookPayload {
    pub(crate) data: WebhookMemberData,
}

/// Member resource in the webhook payload (the primary `data` object).
#[derive(Debug, Deserialize)]
pub(crate) struct WebhookMemberData {
    pub(crate) attributes: WebhookMemberAttributes,
    #[serde(default)]
    pub(crate) relationships: WebhookMemberRelationships,
}

/// Member attributes from the webhook payload.
#[derive(Debug, Deserialize)]
pub(crate) struct WebhookMemberAttributes {
    pub(crate) patron_status: Option<String>,
    pub(crate) currently_entitled_amount_cents: Option<i32>,
    pub(crate) pledge_amount_cents: Option<i32>,
}

/// Member relationships from the webhook payload.
#[derive(Debug, Default, Deserialize)]
pub(crate) struct WebhookMemberRelationships {
    #[serde(default)]
    pub(crate) user: WebhookUserRelationship,
    #[serde(default)]
    pub(crate) currently_entitled_tiers: WebhookTierRelationship,
    #[serde(default)]
    pub(crate) campaign: WebhookCampaignRelationship,
}

/// User relationship data (contains the Patreon user ID).
#[derive(Debug, Default, Deserialize)]
pub(crate) struct WebhookUserRelationship {
    pub(crate) data: Option<WebhookResourceRef>,
}

/// Tier relationship data.
#[derive(Debug, Default, Deserialize)]
pub(crate) struct WebhookTierRelationship {
    #[serde(default)]
    pub(crate) data: Vec<WebhookResourceRef>,
}

/// Campaign relationship data.
#[derive(Debug, Default, Deserialize)]
pub(crate) struct WebhookCampaignRelationship {
    pub(crate) data: Option<WebhookResourceRef>,
}

/// Generic JSON:API resource reference (id + type).
#[derive(Debug, Deserialize)]
pub(crate) struct WebhookResourceRef {
    pub(crate) id: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_webhook_event() {
        assert_eq!(
            PatreonWebhookEvent::from_header("members:create"),
            Some(PatreonWebhookEvent::MembersCreate)
        );
        assert_eq!(
            PatreonWebhookEvent::from_header("members:update"),
            Some(PatreonWebhookEvent::MembersUpdate)
        );
        assert_eq!(
            PatreonWebhookEvent::from_header("members:delete"),
            Some(PatreonWebhookEvent::MembersDelete)
        );
        assert_eq!(
            PatreonWebhookEvent::from_header("members:pledge:create"),
            Some(PatreonWebhookEvent::MembersPledgeCreate)
        );
        assert_eq!(
            PatreonWebhookEvent::from_header("members:pledge:update"),
            Some(PatreonWebhookEvent::MembersPledgeUpdate)
        );
        assert_eq!(
            PatreonWebhookEvent::from_header("members:pledge:delete"),
            Some(PatreonWebhookEvent::MembersPledgeDelete)
        );
        assert_eq!(PatreonWebhookEvent::from_header("unknown:event"), None);
    }
}
