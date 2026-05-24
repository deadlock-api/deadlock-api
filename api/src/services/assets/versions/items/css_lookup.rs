//! CSS lookups for item icons and inline-attribute background images.
//! Returns intermediate panorama-style URL strings that the pipeline then
//! runs through `parse_img_path` to produce public URLs.

#![allow(clippy::doc_markdown)]

use std::collections::HashMap;

use cssparser::{Delimiter, Parser, ParserInput, Token};

/// Each CSS file is parsed once and the extracted (selector, bg, wash_color)
/// list is reused across lookups. Builds aren't cheap, but each file is at
/// most a few hundred kB so we keep the whole tree resident.
#[derive(Debug)]
pub(super) struct CssIndex {
    pub(super) rules: Vec<CssRule>,
    /// `@define <name>: <value>;` declarations encountered at the top level.
    pub(super) defines: HashMap<String, String>,
}

#[derive(Debug, Clone)]
pub(super) struct CssRule {
    pub(super) selector: String,
    pub(super) background_image: Option<String>,
    pub(super) wash_color: Option<String>,
}

impl CssIndex {
    pub(super) fn parse(css: &str) -> Self {
        let mut rules = Vec::new();
        let mut defines = HashMap::new();
        let mut input = ParserInput::new(css);
        let mut p = Parser::new(&mut input);

        while !p.is_exhausted() {
            let mut selector = String::new();
            let mut at_define: Option<String> = None;
            let block_found = loop {
                match p.next_including_whitespace_and_comments().cloned() {
                    Ok(Token::CurlyBracketBlock) => break true,
                    Ok(Token::Semicolon) => {
                        // `@define foo: bar;` at top level
                        if let Some(name) = at_define.take() {
                            let value = selector.trim().to_owned();
                            defines.insert(name, value);
                        }
                        selector.clear();
                    }
                    Ok(Token::AtKeyword(kw)) if kw.as_ref() == "define" => {
                        // capture the next identifier as the @define target
                        match p.next_including_whitespace_and_comments().cloned() {
                            Ok(Token::WhiteSpace(_)) => {
                                if let Ok(Token::Ident(name)) =
                                    p.next_including_whitespace_and_comments().cloned()
                                {
                                    at_define = Some(name.to_string());
                                    // Skip the colon.
                                    let _ = p.next_including_whitespace_and_comments();
                                }
                            }
                            Ok(Token::Ident(name)) => {
                                at_define = Some(name.to_string());
                                let _ = p.next_including_whitespace_and_comments();
                            }
                            _ => {}
                        }
                        selector.clear();
                    }
                    Ok(t) => write_token(&mut selector, &t),
                    Err(_) => break false,
                }
            };
            if !block_found {
                break;
            }

            let (bg, wash) = p
                .parse_nested_block::<_, (Option<String>, Option<String>), ()>(|inner| {
                    Ok(scan_block(inner))
                })
                .unwrap_or((None, None));

            let selector_text = selector.trim().to_owned();
            if !selector_text.is_empty() {
                rules.push(CssRule {
                    selector: selector_text,
                    background_image: bg,
                    wash_color: wash,
                });
            }
            selector.clear();
        }

        Self { rules, defines }
    }

    /// Split a selector on `.` then ` ` while preserving empty strings (some
    /// callers deliberately match the `""` artifact of leading-dot selectors).
    fn selector_classes(selector: &str) -> Vec<&str> {
        selector
            .split('.')
            .flat_map(|s| s.split(' '))
            .collect::<Vec<_>>()
    }

    pub(super) fn find_ability_icon(&self, class_name: &str) -> Option<String> {
        for rule in &self.rules {
            let classes = Self::selector_classes(&rule.selector);
            if classes.contains(&class_name)
                && let Some(bg) = &rule.background_image
            {
                return Some(to_panorama_url(bg));
            }
        }
        None
    }

    /// Property-icon lookup. An empty-string class is NOT short-circuited; it
    /// matches the first rule (typically `condition_silence.vsvg`).
    pub(super) fn find_ability_properties_icon(&self, css_class: Option<&str>) -> Option<String> {
        let needle = css_class?;
        let prefixed = format!("prop_{needle}");
        for rule in &self.rules {
            let classes = Self::selector_classes(&rule.selector);
            if classes.iter().any(|c| *c == prefixed || *c == needle)
                && let Some(bg) = &rule.background_image
            {
                return Some(to_panorama_url(bg));
            }
        }
        None
    }

    /// Returns `(background_image, wash_color)` for a selector. Matches either
    /// the full selector or any comma-separated alternative within it.
    pub(super) fn find_base_styles(&self, selector: &str) -> (Option<String>, Option<String>) {
        for rule in &self.rules {
            let matches = rule.selector == selector
                || rule
                    .selector
                    .split(',')
                    .any(|s| s.trim().eq_ignore_ascii_case(selector));
            if !matches {
                continue;
            }
            let Some(bg) = &rule.background_image else {
                continue;
            };
            let bg_val = bg
                .replace("_psd.vtex", ".psd")
                .replace("_png.vtex", ".png")
                .replace(".vsvg", ".svg");
            let after = bg_val
                .rsplit_once("panorama/")
                .map_or_else(|| bg_val.clone(), |(_, t)| t.to_owned());
            let wash = rule
                .wash_color
                .as_ref()
                .map(|w| self.defines.get(w).cloned().unwrap_or_else(|| w.clone()));
            return (Some(after), wash);
        }
        (None, None)
    }

    /// Parse style rules starting from the first line containing `anchor`
    /// (skips preamble that breaks naive CSS parsers on malformed `wash-color`
    /// rules), but keep the `@define` table from the full source so wash-color
    /// names declared earlier still resolve.
    pub(super) fn parse_from_anchor(css: &str, anchor: &str) -> Self {
        let trimmed = match css.find(anchor) {
            Some(pos) => {
                let line_start = css[..pos].rfind('\n').map_or(0, |n| n + 1);
                &css[line_start..]
            }
            None => css,
        };
        let full = Self::parse(css);
        let mut anchored = Self::parse(trimmed);
        anchored.defines = full.defines;
        anchored
    }
}

fn to_panorama_url(raw: &str) -> String {
    let cleaned = raw.replace("_psd.vtex", ".psd");
    let tail = cleaned
        .rsplit_once("images/")
        .map_or(cleaned.as_str(), |(_, t)| t);
    format!("panorama:\"file://{{images}}/{tail}\"")
}

/// Walks the declarations inside a `{ ... }` block, capturing the first
/// `background-image` and `wash-color` values.
fn scan_block(p: &mut Parser<'_, '_>) -> (Option<String>, Option<String>) {
    let mut bg: Option<String> = None;
    let mut wash: Option<String> = None;
    while !p.is_exhausted() {
        let _ = p.parse_until_after::<_, _, ()>(Delimiter::Semicolon, |inner| {
            if let Ok(name_tok) = inner.next().cloned() {
                let name = match name_tok {
                    Token::Ident(s) => s.to_string(),
                    _ => return Ok(()),
                };
                if inner.expect_colon().is_err() {
                    return Ok(());
                }
                if name == "background-image" {
                    if let Some(url) = read_url_value(inner) {
                        bg = Some(url);
                    }
                } else if name == "wash-color" {
                    let mut buf = String::new();
                    while let Ok(t) = inner.next_including_whitespace_and_comments().cloned() {
                        write_token(&mut buf, &t);
                    }
                    let trimmed = buf.trim();
                    if !trimmed.is_empty() {
                        wash = Some(trimmed.to_owned());
                    }
                }
            }
            Ok(())
        });
    }
    (bg, wash)
}

fn read_url_value(p: &mut Parser<'_, '_>) -> Option<String> {
    while let Ok(t) = p.next().cloned() {
        match t {
            Token::UnquotedUrl(u) => return Some(u.to_string()),
            Token::Function(fname) if fname.as_ref() == "url" => {
                return p
                    .parse_nested_block::<_, Option<String>, ()>(|b| {
                        Ok(match b.next().cloned() {
                            Ok(Token::QuotedString(s) | Token::UnquotedUrl(s)) => {
                                Some(s.to_string())
                            }
                            _ => None,
                        })
                    })
                    .ok()
                    .flatten();
            }
            _ => {}
        }
    }
    None
}

fn write_token(buf: &mut String, t: &Token<'_>) {
    use core::fmt::Write;
    match t {
        Token::Ident(s) => buf.push_str(s),
        Token::AtKeyword(s) => {
            buf.push('@');
            buf.push_str(s);
        }
        Token::Hash(s) | Token::IDHash(s) => {
            buf.push('#');
            buf.push_str(s);
        }
        Token::Delim(c) => buf.push(*c),
        Token::WhiteSpace(s) => buf.push_str(s),
        Token::Comma => buf.push(','),
        Token::Colon => buf.push(':'),
        Token::Number {
            int_value: Some(i), ..
        } => {
            let _ = write!(buf, "{i}");
        }
        Token::Number { value, .. } => {
            let _ = write!(buf, "{value}");
        }
        Token::QuotedString(s) => {
            buf.push('"');
            buf.push_str(s);
            buf.push('"');
        }
        _ => {}
    }
}
