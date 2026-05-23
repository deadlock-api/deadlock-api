//! Tiny CSS helpers built on top of `cssparser`.
//!
//! Two specific things are extracted from the panorama CSS files:
//!
//! 1. **Hero style colors** — `@define hero<Name>Color: #RRGGBB;` declarations
//!    in `citadel_base_styles.css` map to a per-hero accent color.
//! 2. **Hero background images** — qualified rules selected by `.hero_<name>`
//!    in `hero_background_default.css` that set `background-image: url(...)`
//!    map to a per-hero background asset.

use std::collections::HashMap;

use cssparser::{Delimiter, Parser, ParserInput, Token};

type ParseErr<'i> = cssparser::ParseError<'i, ()>;

/// Parse `@define <name>Color: #hex;` declarations.
///
/// Returns a map keyed by lower-cased `hero_<name>` (matching the KV3
/// `class_name`) to the original `#RRGGBB[AA]` string.
pub(crate) fn parse_hero_style_colors(css: &str) -> HashMap<String, String> {
    let mut input = ParserInput::new(css);
    let mut p = Parser::new(&mut input);
    let mut out = HashMap::new();

    while let Ok(tok) = p.next().cloned() {
        match tok {
            Token::AtKeyword(kw) if kw.as_ref() == "define" => {
                let captured = p.parse_until_after::<_, _, ()>(Delimiter::Semicolon, |inner| {
                    Ok(capture_hero_color_define(inner))
                });
                if let Ok(Some((cls, hex))) = captured {
                    out.insert(cls, hex);
                }
            }
            // Skip everything else — rules, other at-rules — up to the next
            // structural boundary so we don't accidentally re-parse declarations.
            Token::CurlyBracketBlock => {
                let _ = p.parse_nested_block::<_, (), ()>(|_| Ok(()));
            }
            _ => {}
        }
    }
    out
}

fn capture_hero_color_define(p: &mut Parser<'_, '_>) -> Option<(String, String)> {
    let name = match p.next().ok()?.clone() {
        Token::Ident(s) => s.to_string(),
        _ => return None,
    };
    let prefix = name.strip_suffix("Color")?;
    if prefix.is_empty() {
        return None;
    }
    p.expect_colon().ok()?;
    let hex = match p.next().ok()?.clone() {
        Token::IDHash(s) | Token::Hash(s) => format!("#{s}"),
        _ => return None,
    };
    // Source uses bare `<name>Color` (e.g. `kelvinColor`); the hero map keys
    // are `hero_<name>`. Match the python pipeline 1:1.
    let class = format!("hero_{}", prefix.to_ascii_lowercase());
    Some((class, hex))
}

/// Parse `hero_background_default.css` and produce a map from `hero_<name>`
/// class selectors to the inner URL string of each rule's `background-image`.
///
/// Mirrors the python pipeline: only the first occurrence of any `.hero_*`
/// class wins.
pub(crate) fn parse_hero_backgrounds(css: &str) -> HashMap<String, String> {
    let mut input = ParserInput::new(css);
    let mut p = Parser::new(&mut input);
    let mut out = HashMap::new();

    while !p.is_exhausted() {
        // Accumulate selector tokens until we hit the rule's block.
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
        // Each declaration ends at a semicolon (or end of block).
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

fn write_token(buf: &mut String, t: &Token<'_>) {
    use std::fmt::Write;
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
        // `<name>Color` → `hero_<name>` (matches python pipeline).
        assert_eq!(map.get("hero_inferno"), Some(&"#C93C26".to_owned()));
        assert_eq!(map.get("hero_kelvin"), Some(&"#74ABBC".to_owned()));
        // `foo` doesn't end in `Color` — ignored.
        assert!(map.get("hero_foo").is_none());
        assert!(map.get("hero_basetext").is_none());
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
