//! Valve `KeyValues` (KV1) localization file parser.
//!
//! Parses Valve's text-format localization files (e.g. `accolades_english.txt`,
//! `citadel_main_english.txt`) into a typed [`Localization`] struct with
//! zero-copy [`Cow`] strings where the source contains no escape sequences.
//!
//! Two on-disk shapes are supported and normalized into the same struct:
//!
//! ```text
//! "lang" { "Language" "English"  "Tokens" { "k" "v" ... } }
//! "accolades.vdata" { "k" "v" ... }
//! ```

use std::borrow::Cow;

use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum LocError {
    #[error("localization parse error at line {line}, column {col}: {msg}")]
    Parse {
        msg: String,
        line: usize,
        col: usize,
    },
}

/// A parsed localization file. Strings borrow from the input where possible.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Localization<'a> {
    /// Top-level section name (e.g. `"lang"` or `"accolades.vdata"`).
    #[serde(borrow)]
    pub name: Cow<'a, str>,
    /// Value of the `"Language"` key, if present.
    #[serde(borrow, skip_serializing_if = "Option::is_none", default)]
    pub language: Option<Cow<'a, str>>,
    /// Key/value pairs from the root block and from any nested `Tokens` block.
    /// Other nested blocks (if present) are skipped without contributing pairs.
    #[serde(borrow)]
    pub tokens: Vec<(Cow<'a, str>, Cow<'a, str>)>,
}

/// Parse a Valve KV1 localization document.
pub fn parse(src: &str) -> Result<Localization<'_>, LocError> {
    let mut p = Parser::new(src);
    p.skip_ws_and_comments();
    let name = p.read_string()?;
    p.skip_ws_and_comments();
    p.expect(b'{')?;

    let mut out = Localization {
        name,
        language: None,
        tokens: Vec::new(),
    };
    p.parse_block_into(&mut out)?;
    p.skip_ws_and_comments();
    if p.peek().is_some() {
        return Err(p.err("unexpected trailing content after closing '}'"));
    }
    Ok(out)
}

struct Parser<'a> {
    src: &'a str,
    bytes: &'a [u8],
    idx: usize,
}

impl<'a> Parser<'a> {
    fn new(src: &'a str) -> Self {
        // Skip UTF-8 BOM if present.
        let bytes = src.as_bytes();
        let idx = if bytes.starts_with(b"\xEF\xBB\xBF") {
            3
        } else {
            0
        };
        Self { src, bytes, idx }
    }

    #[inline]
    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.idx).copied()
    }

    fn err(&self, msg: impl Into<String>) -> LocError {
        let (line, col) = self.line_col();
        LocError::Parse {
            msg: msg.into(),
            line,
            col,
        }
    }

    fn line_col(&self) -> (usize, usize) {
        let upto = &self.bytes[..self.idx.min(self.bytes.len())];
        let line = 1 + memchr::memchr_iter(b'\n', upto).count();
        let col = upto
            .iter()
            .rposition(|&b| b == b'\n')
            .map_or(self.idx, |p| self.idx - p - 1)
            + 1;
        (line, col)
    }

    fn skip_ws_and_comments(&mut self) {
        loop {
            while let Some(b) = self.bytes.get(self.idx) {
                if b.is_ascii_whitespace() {
                    self.idx += 1;
                } else {
                    break;
                }
            }
            if self.bytes.get(self.idx..self.idx + 2) == Some(b"//") {
                self.idx += 2;
                while let Some(&b) = self.bytes.get(self.idx) {
                    self.idx += 1;
                    if b == b'\n' {
                        break;
                    }
                }
            } else {
                return;
            }
        }
    }

    fn expect(&mut self, b: u8) -> Result<(), LocError> {
        if self.peek() == Some(b) {
            self.idx += 1;
            Ok(())
        } else {
            Err(self.err(format!("expected '{}'", b as char)))
        }
    }

    /// Parse a quoted or unquoted token. Quoted strings honor `\"`, `\\`,
    /// `\n`, `\t` escapes. Unquoted tokens run until the next whitespace or
    /// structural character.
    fn read_string(&mut self) -> Result<Cow<'a, str>, LocError> {
        let Some(b) = self.peek() else {
            return Err(self.err("unexpected end of input"));
        };

        if b == b'"' {
            self.idx += 1;
            let start = self.idx;
            // Fast path: scan for `"` or `\\`.
            let bytes = self.bytes;
            match memchr::memchr2(b'"', b'\\', &bytes[self.idx..]) {
                None => return Err(self.err("unterminated string")),
                Some(off) => {
                    let pos = self.idx + off;
                    if bytes[pos] == b'"' {
                        let s = &self.src[start..pos];
                        self.idx = pos + 1;
                        return Ok(Cow::Borrowed(s));
                    }
                    // Escape found — switch to the slow path that allocates.
                    return self.read_quoted_with_escapes(start, pos);
                }
            }
        }

        // Unquoted bareword.
        let start = self.idx;
        while let Some(&b) = self.bytes.get(self.idx) {
            if b.is_ascii_whitespace() || matches!(b, b'{' | b'}' | b'"') {
                break;
            }
            self.idx += 1;
        }
        if self.idx == start {
            return Err(self.err("expected token"));
        }
        Ok(Cow::Borrowed(&self.src[start..self.idx]))
    }

    /// Slow path for escaped strings: copy the borrowed prefix up to
    /// `escape_pos`, then process escapes until the closing quote.
    fn read_quoted_with_escapes(
        &mut self,
        start: usize,
        escape_pos: usize,
    ) -> Result<Cow<'a, str>, LocError> {
        let mut out = String::with_capacity(escape_pos - start + 16);
        out.push_str(&self.src[start..escape_pos]);
        self.idx = escape_pos;
        while let Some(&b) = self.bytes.get(self.idx) {
            match b {
                b'"' => {
                    self.idx += 1;
                    return Ok(Cow::Owned(out));
                }
                b'\\' => {
                    self.idx += 1;
                    let Some(&esc) = self.bytes.get(self.idx) else {
                        return Err(self.err("trailing backslash"));
                    };
                    self.idx += 1;
                    match esc {
                        b'n' => out.push('\n'),
                        b't' => out.push('\t'),
                        b'r' => out.push('\r'),
                        b'"' => out.push('"'),
                        b'\\' => out.push('\\'),
                        // Unknown escape: keep both bytes literally — matches Valve's lenient
                        // tools and avoids losing data for sequences like `\u`.
                        _ => {
                            out.push('\\');
                            out.push(esc as char);
                        }
                    }
                }
                _ => {
                    // Copy a run of plain bytes in one shot.
                    let run_start = self.idx;
                    let rest = &self.bytes[self.idx..];
                    let next = memchr::memchr2(b'"', b'\\', rest)
                        .ok_or_else(|| self.err("unterminated string"))?;
                    self.idx += next;
                    out.push_str(&self.src[run_start..self.idx]);
                }
            }
        }
        Err(self.err("unterminated string"))
    }

    /// Consume a `{ ... }` block body without recording any pairs. Used for
    /// nested blocks other than `Tokens`. Consumes the closing `}`.
    fn skip_block(&mut self) -> Result<(), LocError> {
        loop {
            self.skip_ws_and_comments();
            match self.peek() {
                Some(b'}') => {
                    self.idx += 1;
                    return Ok(());
                }
                None => return Err(self.err("unterminated block")),
                _ => {}
            }
            // Read key.
            let _ = self.read_string()?;
            self.skip_ws_and_comments();
            match self.peek() {
                Some(b'{') => {
                    self.idx += 1;
                    self.skip_block()?;
                }
                _ => {
                    let _ = self.read_string()?;
                }
            }
        }
    }

    /// Parse the contents of a `{ ... }` block, populating `out`.
    /// Consumes the closing `}`.
    fn parse_block_into(&mut self, out: &mut Localization<'a>) -> Result<(), LocError> {
        loop {
            self.skip_ws_and_comments();
            match self.peek() {
                Some(b'}') => {
                    self.idx += 1;
                    return Ok(());
                }
                None => return Err(self.err("unterminated block")),
                _ => {}
            }

            let key = self.read_string()?;
            self.skip_ws_and_comments();

            if let Some(b'{') = self.peek() {
                self.idx += 1;
                if key.eq_ignore_ascii_case("Tokens") {
                    self.parse_block_into(out)?;
                } else {
                    self.skip_block()?;
                }
            } else {
                let value = self.read_string()?;
                if key.eq_ignore_ascii_case("Language") && out.language.is_none() {
                    out.language = Some(value);
                } else {
                    out.tokens.push((key, value));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snap(name: &str, file: &str) {
        let path = format!(
            "{}/src/utils/localization_fixtures/{file}",
            env!("CARGO_MANIFEST_DIR")
        );
        let content = std::fs::read_to_string(&path).expect("fixture present");
        let parsed = parse(&content).expect("parses");
        insta::with_settings!(
            { snapshot_path => "localization_snapshots", prepend_module_to_snapshot => false },
            { insta::assert_json_snapshot!(name, parsed); }
        );
    }

    #[test]
    fn parses_flat_accolades() {
        let src = "\"accolades.vdata\"\n{\n\t\"K1\" \"V1\"\n\t\"K2\" \"V2\\nwith newline\"\n}\n";
        let p = parse(src).expect("ok");
        assert_eq!(p.name, "accolades.vdata");
        assert_eq!(p.language, None);
        assert_eq!(p.tokens.len(), 2);
        assert_eq!(p.tokens[0], (Cow::Borrowed("K1"), Cow::Borrowed("V1")));
        assert_eq!(p.tokens[1].1, "V2\nwith newline");
        // Borrowed for the no-escape value.
        assert!(matches!(p.tokens[0].1, Cow::Borrowed(_)));
        // Owned because of the escape.
        assert!(matches!(p.tokens[1].1, Cow::Owned(_)));
    }

    #[test]
    fn parses_lang_with_tokens_and_comments() {
        let src = "\u{FEFF}\"lang\"\n{\n  \"Language\" \"English\"\n  // a comment\n  \"Tokens\"\n  {\n    \"OK\" \"OK\"  // inline\n    \"Quote\" \"He said \\\"hi\\\"\"\n  }\n}\n";
        let p = parse(src).expect("ok");
        assert_eq!(p.name, "lang");
        assert_eq!(p.language.as_deref(), Some("English"));
        assert_eq!(p.tokens.len(), 2);
        assert_eq!(p.tokens[0], (Cow::Borrowed("OK"), Cow::Borrowed("OK")));
        assert_eq!(p.tokens[1].1, "He said \"hi\"");
    }

    #[test]
    fn rejects_trailing_content() {
        let src = "\"lang\" { \"Language\" \"English\" } garbage";
        assert!(parse(src).is_err());
    }

    #[test]
    fn skips_non_tokens_nested_block() {
        let src = "\"lang\" { \"Meta\" { \"author\" \"x\" } \"Tokens\" { \"OK\" \"OK\" } }";
        let p = parse(src).expect("ok");
        assert_eq!(p.tokens.len(), 1);
        assert_eq!(p.tokens[0], (Cow::Borrowed("OK"), Cow::Borrowed("OK")));
    }

    #[test]
    fn snapshot_accolades_english() {
        snap("accolades_english", "accolades_english.txt");
    }

    #[test]
    fn snapshot_citadel_main_english() {
        snap("citadel_main_english", "citadel_main_english.txt");
    }

    #[test]
    fn snapshot_citadel_gc_english() {
        snap("citadel_gc_english", "citadel_gc_english.txt");
    }

    #[test]
    fn snapshot_citadel_main_russian() {
        snap("citadel_main_russian", "citadel_main_russian.txt");
    }
}
