use serde::{Deserialize, Serialize};
use strum::IntoStaticStr;
use utoipa::ToSchema;

use crate::error::{APIError, APIResult};

const MAX_COMMENT_LEN: usize = 2000;
const MAX_TARGETS: usize = 20;
const MAX_NICKNAME_LEN: usize = 40;
const MAX_URL_LEN: usize = 500;
const MAX_BUILD_ID_LEN: usize = 100;
const MAX_SOURCE_FILE_LEN: usize = 300;
const MAX_COMPONENT_LEN: usize = 120;
const MAX_COMPONENT_CHAIN_LEN: usize = 10;
const MAX_SELECTOR_LEN: usize = 500;
const MAX_ELEMENT_TEXT_LEN: usize = 500;
const MAX_USER_AGENT_LEN: usize = 500;

const ALLOWED_HOSTS: &[&str] = &["deadlock-api.com", "www.deadlock-api.com"];

#[derive(Debug, Clone, Copy, Deserialize, IntoStaticStr, ToSchema)]
#[serde(rename_all = "snake_case")]
#[strum(serialize_all = "snake_case")]
pub(super) enum FeedbackKind {
    /// Attached to a specific component in the page.
    Annotation,
    /// Free-form feedback with no element attached.
    General,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
pub(super) struct SourceLocation {
    pub(super) file: String,
    pub(super) line: i32,
    pub(super) column: i32,
    pub(super) component: Option<String>,
    #[serde(default)]
    pub(super) chain: Vec<String>,
}

/// One annotated element. A submission carries several when the visitor picked
/// more than one.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
pub(super) struct FeedbackTarget {
    pub(super) source: Option<SourceLocation>,
    pub(super) selector: Option<String>,
    pub(super) element_text: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize, ToSchema)]
pub(super) struct Viewport {
    pub(super) width: i32,
    pub(super) height: i32,
    pub(super) device_pixel_ratio: f32,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub(super) struct FeedbackSubmission {
    pub(super) kind: FeedbackKind,
    pub(super) comment: String,
    pub(super) nickname: Option<String>,
    pub(super) page_url: String,
    pub(super) build_id: Option<String>,
    /// The annotated elements. Left empty for general feedback.
    #[serde(default)]
    pub(super) targets: Vec<FeedbackTarget>,
    /// Superseded by `targets`; still accepted so pages cached from an older
    /// build keep submitting successfully.
    pub(super) source: Option<SourceLocation>,
    pub(super) selector: Option<String>,
    pub(super) element_text: Option<String>,
    pub(super) viewport: Option<Viewport>,
}

fn check_len(field: &str, value: &str, max: usize) -> APIResult<()> {
    if value.chars().count() > max {
        return Err(APIError::status_msg(
            reqwest::StatusCode::BAD_REQUEST,
            format!("`{field}` must be at most {max} characters"),
        ));
    }
    Ok(())
}

fn bad_request(message: impl Into<String>) -> APIError {
    APIError::status_msg(reqwest::StatusCode::BAD_REQUEST, message)
}

impl FeedbackSubmission {
    /// Returns the page path parsed out of `page_url`.
    pub(super) fn validate(&mut self) -> APIResult<String> {
        self.comment = self.comment.trim().to_owned();
        if self.comment.is_empty() {
            return Err(bad_request("`comment` must not be empty"));
        }
        check_len("comment", &self.comment, MAX_COMMENT_LEN)?;

        if let Some(nickname) = &mut self.nickname {
            *nickname = nickname.trim().to_owned();
            check_len("nickname", nickname, MAX_NICKNAME_LEN)?;
            if nickname.is_empty() {
                self.nickname = None;
            }
        }

        check_len("page_url", &self.page_url, MAX_URL_LEN)?;
        let url = url::Url::parse(&self.page_url)
            .map_err(|_| bad_request("`page_url` is not a valid URL"))?;
        let host = url.host_str().unwrap_or_default();
        let host_allowed =
            ALLOWED_HOSTS.contains(&host) || (cfg!(debug_assertions) && host == "localhost");
        if !host_allowed {
            return Err(bad_request("`page_url` must point at deadlock-api.com"));
        }

        if let Some(build_id) = &self.build_id {
            check_len("build_id", build_id, MAX_BUILD_ID_LEN)?;
        }

        if self.targets.is_empty()
            && (self.source.is_some() || self.selector.is_some() || self.element_text.is_some())
        {
            self.targets.push(FeedbackTarget {
                source: self.source.take(),
                selector: self.selector.take(),
                element_text: self.element_text.take(),
            });
        }
        if self.targets.len() > MAX_TARGETS {
            return Err(bad_request(format!(
                "`targets` must have at most {MAX_TARGETS} entries"
            )));
        }
        for target in &mut self.targets {
            target.validate()?;
        }

        Ok(url.path().to_owned())
    }
}

impl FeedbackTarget {
    fn validate(&mut self) -> APIResult<()> {
        if let Some(selector) = &self.selector {
            check_len("selector", selector, MAX_SELECTOR_LEN)?;
        }
        if let Some(element_text) = &mut self.element_text {
            *element_text = element_text.trim().to_owned();
            check_len("element_text", element_text, MAX_ELEMENT_TEXT_LEN)?;
        }
        if let Some(source) = &self.source {
            check_len("source.file", &source.file, MAX_SOURCE_FILE_LEN)?;
            if let Some(component) = &source.component {
                check_len("source.component", component, MAX_COMPONENT_LEN)?;
            }
            if source.chain.len() > MAX_COMPONENT_CHAIN_LEN {
                return Err(bad_request(format!(
                    "`source.chain` must have at most {MAX_COMPONENT_CHAIN_LEN} entries"
                )));
            }
            for component in &source.chain {
                check_len("source.chain", component, MAX_COMPONENT_LEN)?;
            }
        }
        Ok(())
    }
}

pub(super) fn truncate_user_agent(user_agent: &str) -> String {
    user_agent.chars().take(MAX_USER_AGENT_LEN).collect()
}

#[cfg(test)]
mod tests {
    use rstest::rstest;

    use super::*;

    fn submission(comment: &str, page_url: &str) -> FeedbackSubmission {
        FeedbackSubmission {
            kind: FeedbackKind::General,
            comment: comment.to_owned(),
            nickname: None,
            page_url: page_url.to_owned(),
            build_id: None,
            targets: Vec::new(),
            source: None,
            selector: None,
            element_text: None,
            viewport: None,
        }
    }

    #[test]
    fn validate_returns_page_path() {
        let mut s = submission("  looks off  ", "https://deadlock-api.com/heroes?x=1");
        assert_eq!(s.validate().unwrap(), "/heroes");
        assert_eq!(s.comment, "looks off");
    }

    #[rstest]
    #[case("", "https://deadlock-api.com/")]
    #[case("hi", "https://evil.example.com/")]
    #[case("hi", "not-a-url")]
    fn validate_rejects_bad_input(#[case] comment: &str, #[case] page_url: &str) {
        assert!(submission(comment, page_url).validate().is_err());
    }

    #[test]
    fn validate_rejects_oversized_comment() {
        let mut s = submission(
            &"a".repeat(MAX_COMMENT_LEN + 1),
            "https://deadlock-api.com/",
        );
        assert!(s.validate().is_err());
    }

    #[test]
    fn validate_folds_legacy_single_target() {
        let mut s = submission("hi", "https://deadlock-api.com/");
        s.selector = Some("div > span".to_owned());
        s.element_text = Some("  hello  ".to_owned());
        s.validate().unwrap();

        assert!(s.selector.is_none());
        assert_eq!(s.targets.len(), 1);
        assert_eq!(s.targets[0].selector.as_deref(), Some("div > span"));
        assert_eq!(s.targets[0].element_text.as_deref(), Some("hello"));
    }

    #[test]
    fn validate_rejects_too_many_targets() {
        let mut s = submission("hi", "https://deadlock-api.com/");
        s.targets = (0..=MAX_TARGETS)
            .map(|_| FeedbackTarget {
                source: None,
                selector: Some("div".to_owned()),
                element_text: None,
            })
            .collect();
        assert!(s.validate().is_err());
    }

    #[test]
    fn validate_drops_blank_nickname() {
        let mut s = submission("hi", "https://deadlock-api.com/");
        s.nickname = Some("   ".to_owned());
        s.validate().unwrap();
        assert!(s.nickname.is_none());
    }
}
