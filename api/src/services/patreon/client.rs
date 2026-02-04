use crate::services::patreon::types::{
    IdentityResponse, IdentityWithMembershipsResponse, IncludedResource, Membership, PatreonResult,
    PatronIdentity, TokenResponse,
};

const TOKEN_ENDPOINT: &str = "https://www.patreon.com/api/oauth2/token";
const IDENTITY_ENDPOINT: &str = "https://www.patreon.com/api/oauth2/v2/identity";

/// Client for interacting with the Patreon API
#[derive(Clone)]
pub(crate) struct PatreonClient {
    http_client: reqwest::Client,
    client_id: String,
    client_secret: String,
    redirect_uri: String,
}

impl PatreonClient {
    pub(crate) fn new(
        http_client: reqwest::Client,
        client_id: String,
        client_secret: String,
        redirect_uri: String,
    ) -> Self {
        Self {
            http_client,
            client_id,
            client_secret,
            redirect_uri,
        }
    }

    /// Exchange an authorization code for access and refresh tokens
    pub(crate) async fn exchange_code(&self, code: &str) -> PatreonResult<TokenResponse> {
        let params = [
            ("code", code),
            ("grant_type", "authorization_code"),
            ("client_id", &self.client_id),
            ("client_secret", &self.client_secret),
            ("redirect_uri", &self.redirect_uri),
        ];

        let response = self
            .http_client
            .post(TOKEN_ENDPOINT)
            .form(&params)
            .send()
            .await?
            .error_for_status()?
            .json::<TokenResponse>()
            .await?;

        Ok(response)
    }

    /// Refresh an expired access token using a refresh token
    pub(crate) async fn refresh_token(&self, refresh_token: &str) -> PatreonResult<TokenResponse> {
        let params = [
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("client_id", &self.client_id),
            ("client_secret", &self.client_secret),
        ];

        let response = self
            .http_client
            .post(TOKEN_ENDPOINT)
            .form(&params)
            .send()
            .await?
            .error_for_status()?
            .json::<TokenResponse>()
            .await?;

        Ok(response)
    }

    /// Fetch patron identity including email from Patreon API
    pub(crate) async fn get_identity(&self, access_token: &str) -> PatreonResult<PatronIdentity> {
        let url = format!("{IDENTITY_ENDPOINT}?fields[user]=email");
        let response = self
            .http_client
            .get(&url)
            .bearer_auth(access_token)
            .send()
            .await?
            .error_for_status()?
            .json::<IdentityResponse>()
            .await?;

        Ok(PatronIdentity {
            id: response.data.id,
            email: response.data.attributes.email,
        })
    }

    /// Fetch patron membership status for a specific campaign
    ///
    /// Returns None if the user is not a member of the campaign.
    pub(crate) async fn get_membership(
        &self,
        access_token: &str,
        campaign_id: &str,
    ) -> PatreonResult<Option<Membership>> {
        // Query identity endpoint with memberships included
        let url = format!(
            "{IDENTITY_ENDPOINT}?include=memberships&fields[member]=currently_entitled_amount_cents,patron_status"
        );

        let response = self
            .http_client
            .get(&url)
            .bearer_auth(access_token)
            .send()
            .await?
            .error_for_status()?
            .json::<IdentityWithMembershipsResponse>()
            .await?;

        // Find the membership for the specified campaign in the included resources
        for resource in response.included {
            if let IncludedResource::Member(member) = resource {
                // Check if this membership is for our campaign
                if let Some(ref campaign_ref) = member.relationships.campaign.data
                    && campaign_ref.id == campaign_id
                {
                    // Extract the first tier ID if available
                    let tier_id = member
                        .relationships
                        .currently_entitled_tiers
                        .data
                        .first()
                        .map(|tier| tier.id.clone());

                    return Ok(Some(Membership {
                        tier_id,
                        pledge_amount_cents: member
                            .attributes
                            .currently_entitled_amount_cents
                            .unwrap_or(0),
                        patron_status: member.attributes.patron_status,
                    }));
                }
            }
        }

        // User is not a member of this campaign
        Ok(None)
    }
}
