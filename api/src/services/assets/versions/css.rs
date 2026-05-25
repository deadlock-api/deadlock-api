//! Panorama CSS helpers built on `cssparser`.

use std::collections::{BTreeMap, HashMap};

use cssparser::{Delimiter, Parser, ParserInput, Token};

use crate::services::assets::versions::common::Color;

type ParseErr<'i> = cssparser::ParseError<'i, ()>;

/// Walk every `@define <ident>: #<hex>;` rule whose value is a single hex hash
/// (no trailing tokens). Calls `f(name, hex_without_hash)` for each match.
fn walk_define_hex_rules<F: FnMut(&str, &str)>(css: &str, mut f: F) {
    let mut input = ParserInput::new(css);
    let mut p = Parser::new(&mut input);
    while let Ok(tok) = p.next().cloned() {
        match tok {
            Token::AtKeyword(kw) if kw.as_ref() == "define" => {
                let _ = p.parse_until_after::<_, _, ()>(Delimiter::Semicolon, |inner| {
                    if let Some((name, hex)) = capture_define_hex(inner) {
                        f(&name, &hex);
                    }
                    Ok(())
                });
            }
            Token::CurlyBracketBlock => {
                let _ = p.parse_nested_block::<_, (), ()>(|_| Ok(()));
            }
            _ => {}
        }
    }
}

fn capture_define_hex(p: &mut Parser<'_, '_>) -> Option<(String, String)> {
    let name = match p.next().ok()?.clone() {
        Token::Ident(s) => s.to_string(),
        _ => return None,
    };
    p.expect_colon().ok()?;
    let hex = match p.next().ok()?.clone() {
        Token::IDHash(s) | Token::Hash(s) => s.to_string(),
        _ => return None,
    };
    if p.next().is_ok() {
        return None;
    }
    Some((name, hex))
}

/// `@define <name>: #RRGGBB[AA];` declarations, keyed by `snake_case` name.
/// Non-hex values (font lists, `rgb(...)`) are skipped.
pub(crate) fn parse_define_colors(css: &str) -> BTreeMap<String, Color> {
    let mut out = BTreeMap::new();
    walk_define_hex_rules(css, |name, hex| {
        if let Some(color) = Color::from_hex(hex) {
            out.insert(to_snake_case(name), color);
        }
    });
    out
}

fn to_snake_case(name: &str) -> String {
    let mut out = String::with_capacity(name.len() + 4);
    for (i, c) in name.chars().enumerate() {
        if c.is_ascii_uppercase() {
            if i > 0 {
                out.push('_');
            }
            out.push(c.to_ascii_lowercase());
        } else {
            out.push(c);
        }
    }
    out
}

/// `@define <name>Color: #hex;` declarations, keyed by `hero_<name>` matching
/// the KV3 `class_name`, with the `#` retained in the value.
pub(crate) fn parse_hero_style_colors(css: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    walk_define_hex_rules(css, |name, hex| {
        if let Some(prefix) = name.strip_suffix("Color")
            && !prefix.is_empty()
        {
            out.insert(
                format!("hero_{}", prefix.to_ascii_lowercase()),
                format!("#{hex}"),
            );
        }
    });
    out
}

/// `hero_background_default.css` rules: maps each `.hero_<name>` selector to
/// the first rule's `background-image` URL.
pub(crate) fn parse_hero_backgrounds(css: &str) -> HashMap<String, String> {
    let mut input = ParserInput::new(css);
    let mut p = Parser::new(&mut input);
    let mut out = HashMap::new();

    while !p.is_exhausted() {
        let mut selector = String::new();
        let block_found = loop {
            match p.next_including_whitespace_and_comments().cloned() {
                Ok(Token::CurlyBracketBlock) => break true,
                Ok(t) => write_token(&mut selector, &t),
                Err(_) => break false,
            }
        };
        if !block_found {
            break;
        }

        let bg = p
            .parse_nested_block::<_, Option<String>, ()>(|inner| Ok(find_background_image(inner)))
            .ok()
            .flatten();
        if let Some(bg) = bg {
            for sel in selector.split('.').flat_map(|s| s.split_ascii_whitespace()) {
                if sel.starts_with("hero_") && !out.contains_key(sel) {
                    out.insert(sel.to_owned(), bg.clone());
                }
            }
        }
    }
    out
}

fn find_background_image(p: &mut Parser<'_, '_>) -> Option<String> {
    let mut found: Option<String> = None;
    while !p.is_exhausted() {
        let _ = p.parse_until_after::<_, _, ()>(Delimiter::Semicolon, |inner| {
            if let Ok(Token::Ident(name)) = inner.next().cloned()
                && name.as_ref() == "background-image"
                && inner.expect_colon().is_ok()
            {
                while let Ok(t) = inner.next().cloned() {
                    match t {
                        Token::UnquotedUrl(u) => {
                            found = Some(u.to_string());
                            break;
                        }
                        Token::Function(fname) if fname.as_ref() == "url" => {
                            let captured = inner.parse_nested_block::<_, Option<String>, ()>(|b| {
                                match b.next().cloned() {
                                    Ok(Token::QuotedString(s)) => Ok(Some(s.to_string())),
                                    _ => Ok(None),
                                }
                            });
                            if let Ok(Some(s)) = captured {
                                found = Some(s);
                            }
                            break;
                        }
                        _ => {}
                    }
                }
            }
            Ok::<(), ParseErr<'_>>(())
        });
    }
    found
}

/// For every style rule that declares both `margin-left` and `margin-top` as
/// percentages, maps its whitespace-normalized selector text to
/// `(left_fraction, top_fraction)`. Percentages are returned as fractions, e.g.
/// `35%` -> `0.35`. Grouped selectors keep their full comma-joined text, so they
/// never collide with single-selector lookups. First occurrence of a selector
/// wins.
pub(crate) fn parse_margin_percentages(css: &str) -> HashMap<String, (f64, f64)> {
    let mut input = ParserInput::new(css);
    let mut p = Parser::new(&mut input);
    let mut out = HashMap::new();

    while !p.is_exhausted() {
        let mut selector = String::new();
        let block_found = loop {
            match p.next_including_whitespace_and_comments().cloned() {
                Ok(Token::CurlyBracketBlock) => break true,
                Ok(t) => write_token(&mut selector, &t),
                Err(_) => break false,
            }
        };
        if !block_found {
            break;
        }
        let margins = p
            .parse_nested_block::<_, (Option<f64>, Option<f64>), ()>(|inner| {
                Ok(find_margins(inner))
            })
            .unwrap_or((None, None));
        if let (Some(left), Some(top)) = margins {
            out.entry(normalize_selector(&selector))
                .or_insert((left, top));
        }
    }
    out
}

/// Scan a declaration block for `margin-left` / `margin-top` percentage values.
fn find_margins(p: &mut Parser<'_, '_>) -> (Option<f64>, Option<f64>) {
    let mut left = None;
    let mut top = None;
    while !p.is_exhausted() {
        let _ = p.parse_until_after::<_, _, ()>(Delimiter::Semicolon, |inner| {
            if let Ok(Token::Ident(name)) = inner.next().cloned() {
                let slot = match name.as_ref() {
                    "margin-left" => Some(&mut left),
                    "margin-top" => Some(&mut top),
                    _ => None,
                };
                if let Some(slot) = slot
                    && inner.expect_colon().is_ok()
                    && let Ok(Token::Percentage {
                        unit_value,
                        int_value,
                        ..
                    }) = inner.next().cloned()
                {
                    // Prefer the integer source value for an exact f64; fall
                    // back to the f32 fraction only for fractional percentages.
                    *slot = Some(
                        int_value.map_or_else(|| f64::from(unit_value), |i| f64::from(i) / 100.0),
                    );
                }
            }
            Ok::<(), ParseErr<'_>>(())
        });
    }
    (left, top)
}

/// Collapse internal whitespace runs to single spaces and trim, yielding the
/// canonical single-space selector form (e.g. `.ThreeLane #Team1Tier2_1`).
fn normalize_selector(selector: &str) -> String {
    selector.split_whitespace().collect::<Vec<_>>().join(" ")
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
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn captures_hero_define_colors() {
        let css = "@define baseText: #FFEFD7;\n\
                   @define infernoColor: #C93C26;\n\
                   @define kelvinColor: #74ABBC;\n\
                   @define foo: #112233;";
        let map = parse_hero_style_colors(css);
        assert_eq!(map.get("hero_inferno"), Some(&"#C93C26".to_owned()));
        assert_eq!(map.get("hero_kelvin"), Some(&"#74ABBC".to_owned()));
        assert!(!map.contains_key("hero_foo"));
        assert!(!map.contains_key("hero_basetext"));
    }

    #[test]
    fn captures_background_image_rules() {
        let css = ".hero_inferno #CustomHeroBackground #HeroBackground {\n  \
                   background-image: url(\"s2r://panorama/images/heroes/backgrounds/infernus_bg_psd.vtex\");\n  \
                   width: 100%;\n}\n\
                   .hero_haze #X { background-image: url(\"s2r://panorama/images/heroes/backgrounds/haze_bg_psd.vtex\"); }";
        let map = parse_hero_backgrounds(css);
        assert_eq!(
            map.get("hero_inferno").map(String::as_str),
            Some("s2r://panorama/images/heroes/backgrounds/infernus_bg_psd.vtex")
        );
        assert_eq!(
            map.get("hero_haze").map(String::as_str),
            Some("s2r://panorama/images/heroes/backgrounds/haze_bg_psd.vtex")
        );
    }
}
