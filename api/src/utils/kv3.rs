//! KV3 (Valve KeyValues3) text format parser.
//!
//! Parses KV3 text into a borrowed [`Kv3Value`] and exposes [`from_str`] for
//! deserializing directly into any `serde::Deserialize` type. A
//! [`parse_to_json`] helper converts to [`serde_json::Value`] when needed.
//!
//! Ported from the Python parser in `src/utils/kv3.py`. Behaviour mirrors that
//! implementation: flagged values (`key:flag = value`) wrap as
//! `{"value": v, "flag": "<flag>"}` and `value = subclass: {...}` wraps as
//! `{"subclass": {...}}`.

use std::borrow::Cow;

use memchr::memchr2;
use serde::de::{
    self, DeserializeOwned, Deserializer, IntoDeserializer, MapAccess, SeqAccess, Visitor,
};
use serde_json::{Map, Number, Value};

const FLAGS: &[&str] = &[
    "resource",
    "resourcename",
    "panorama",
    "soundevent",
    "subclass",
];

#[derive(Debug, thiserror::Error)]
pub enum Kv3Error {
    #[error("KV3 parse error at line {line}, column {col}: {msg}")]
    Parse {
        msg: String,
        line: usize,
        col: usize,
    },
    #[error("{0}")]
    Custom(String),
}

impl de::Error for Kv3Error {
    fn custom<T: std::fmt::Display>(msg: T) -> Self {
        Self::Custom(msg.to_string())
    }
}

/// Parsed KV3 value. Borrows from the input source where possible.
#[derive(Debug, Clone, PartialEq)]
pub enum Kv3Value<'a> {
    Null,
    Bool(bool),
    Int(i64),
    Float(f64),
    Str(Cow<'a, str>),
    Array(Vec<Kv3Value<'a>>),
    Object(Vec<(Cow<'a, str>, Kv3Value<'a>)>),
}

/// Parse a KV3 document, borrowing from `content` where possible.
pub fn parse_borrowed(content: &str) -> Result<Kv3Value<'_>, Kv3Error> {
    let mut p = Parser::new(content);
    p.skip_header();
    let v = p.parse_value()?;
    p.skip_whitespace();
    Ok(v)
}

/// Deserialize a KV3 document into any `T: Deserialize`.
pub fn from_str<T: DeserializeOwned>(content: &str) -> Result<T, Kv3Error> {
    let v = parse_borrowed(content)?;
    T::deserialize(&v)
}

/// Parse and convert to [`serde_json::Value`] (allocates owned copies of all
/// string data).
pub fn parse_to_json(content: &str) -> Result<Value, Kv3Error> {
    Ok(parse_borrowed(content)?.into())
}

impl<'a> From<Kv3Value<'a>> for Value {
    fn from(v: Kv3Value<'a>) -> Self {
        match v {
            Kv3Value::Null => Self::Null,
            Kv3Value::Bool(b) => Self::Bool(b),
            Kv3Value::Int(i) => Self::Number(i.into()),
            Kv3Value::Float(f) => Number::from_f64(f).map_or(Self::Null, Self::Number),
            Kv3Value::Str(s) => Self::String(s.into_owned()),
            Kv3Value::Array(arr) => Self::Array(arr.into_iter().map(Into::into).collect()),
            Kv3Value::Object(obj) => {
                let mut m = Map::with_capacity(obj.len());
                for (k, v) in obj {
                    m.insert(k.into_owned(), v.into());
                }
                Self::Object(m)
            }
        }
    }
}

// ---------- serde Deserializer ----------

impl<'de> Deserializer<'de> for &'de Kv3Value<'de> {
    type Error = Kv3Error;

    fn deserialize_any<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, Self::Error> {
        match self {
            Kv3Value::Null => visitor.visit_unit(),
            Kv3Value::Bool(b) => visitor.visit_bool(*b),
            Kv3Value::Int(i) => visitor.visit_i64(*i),
            Kv3Value::Float(f) => visitor.visit_f64(*f),
            Kv3Value::Str(s) => match s {
                Cow::Borrowed(s) => visitor.visit_borrowed_str(s),
                Cow::Owned(s) => visitor.visit_str(s),
            },
            Kv3Value::Array(arr) => visitor.visit_seq(SeqVisitor { iter: arr.iter() }),
            Kv3Value::Object(obj) => visitor.visit_map(MapVisitor {
                iter: obj.iter(),
                value: None,
            }),
        }
    }

    fn deserialize_option<V: Visitor<'de>>(self, visitor: V) -> Result<V::Value, Self::Error> {
        match self {
            Kv3Value::Null => visitor.visit_none(),
            _ => visitor.visit_some(self),
        }
    }

    fn deserialize_enum<V: Visitor<'de>>(
        self,
        _name: &'static str,
        _variants: &'static [&'static str],
        visitor: V,
    ) -> Result<V::Value, Self::Error> {
        // Strings -> unit variant; single-entry objects -> { variant: data }.
        let access = match self {
            Kv3Value::Str(s) => VariantEnum {
                tag: s.as_ref(),
                value: None,
            },
            Kv3Value::Object(obj) if obj.len() == 1 => {
                let (k, v) = &obj[0];
                VariantEnum {
                    tag: k.as_ref(),
                    value: Some(v),
                }
            }
            _ => {
                return Err(de::Error::custom(
                    "expected string or single-key object for enum",
                ));
            }
        };
        visitor.visit_enum(access)
    }

    serde::forward_to_deserialize_any! {
        bool i8 i16 i32 i64 i128 u8 u16 u32 u64 u128 f32 f64 char str string
        bytes byte_buf unit unit_struct newtype_struct seq tuple
        tuple_struct map struct identifier ignored_any
    }
}

struct SeqVisitor<'de> {
    iter: std::slice::Iter<'de, Kv3Value<'de>>,
}
impl<'de> SeqAccess<'de> for SeqVisitor<'de> {
    type Error = Kv3Error;
    fn next_element_seed<T: de::DeserializeSeed<'de>>(
        &mut self,
        seed: T,
    ) -> Result<Option<T::Value>, Self::Error> {
        self.iter.next().map(|v| seed.deserialize(v)).transpose()
    }
    fn size_hint(&self) -> Option<usize> {
        Some(self.iter.len())
    }
}

struct MapVisitor<'de> {
    iter: std::slice::Iter<'de, (Cow<'de, str>, Kv3Value<'de>)>,
    value: Option<&'de Kv3Value<'de>>,
}
impl<'de> MapAccess<'de> for MapVisitor<'de> {
    type Error = Kv3Error;
    fn next_key_seed<K: de::DeserializeSeed<'de>>(
        &mut self,
        seed: K,
    ) -> Result<Option<K::Value>, Self::Error> {
        match self.iter.next() {
            Some((k, v)) => {
                self.value = Some(v);
                // Use serde's built-in &str deserializer; preserves the borrow
                // lifetime so derived structs can use `&str` fields.
                seed.deserialize(k.as_ref().into_deserializer()).map(Some)
            }
            None => Ok(None),
        }
    }
    fn next_value_seed<V: de::DeserializeSeed<'de>>(
        &mut self,
        seed: V,
    ) -> Result<V::Value, Self::Error> {
        let v = self
            .value
            .take()
            .ok_or_else(|| de::Error::custom("value before key"))?;
        seed.deserialize(v)
    }
    fn size_hint(&self) -> Option<usize> {
        Some(self.iter.len())
    }
}

struct VariantEnum<'de> {
    tag: &'de str,
    /// `None` for the string-as-unit-variant case, `Some` for `{variant: data}`.
    value: Option<&'de Kv3Value<'de>>,
}
impl<'de> de::EnumAccess<'de> for VariantEnum<'de> {
    type Error = Kv3Error;
    type Variant = Self;
    fn variant_seed<V: de::DeserializeSeed<'de>>(
        self,
        seed: V,
    ) -> Result<(V::Value, Self::Variant), Self::Error> {
        let tag: Result<_, Self::Error> = seed.deserialize(self.tag.into_deserializer());
        Ok((tag?, self))
    }
}
impl<'de> de::VariantAccess<'de> for VariantEnum<'de> {
    type Error = Kv3Error;
    fn unit_variant(self) -> Result<(), Self::Error> {
        Ok(())
    }
    fn newtype_variant_seed<T: de::DeserializeSeed<'de>>(
        self,
        seed: T,
    ) -> Result<T::Value, Self::Error> {
        match self.value {
            Some(v) => seed.deserialize(v),
            None => Err(de::Error::custom("expected newtype variant payload")),
        }
    }
    fn tuple_variant<V: Visitor<'de>>(
        self,
        _len: usize,
        visitor: V,
    ) -> Result<V::Value, Self::Error> {
        match self.value {
            Some(v) => v.deserialize_any(visitor),
            None => Err(de::Error::custom("expected tuple variant payload")),
        }
    }
    fn struct_variant<V: Visitor<'de>>(
        self,
        _fields: &'static [&'static str],
        visitor: V,
    ) -> Result<V::Value, Self::Error> {
        match self.value {
            Some(v) => v.deserialize_any(visitor),
            None => Err(de::Error::custom("expected struct variant payload")),
        }
    }
}

// ---------- Parser ----------

struct Parser<'a> {
    src: &'a str,
    idx: usize,
}

impl<'a> Parser<'a> {
    fn new(src: &'a str) -> Self {
        Self { src, idx: 0 }
    }

    #[inline]
    fn bytes(&self) -> &'a [u8] {
        self.src.as_bytes()
    }

    fn err(&self, msg: impl Into<String>) -> Kv3Error {
        let prefix = &self.src[..self.idx.min(self.src.len())];
        let line = prefix.bytes().filter(|b| *b == b'\n').count() + 1;
        let col = prefix.rsplit('\n').next().map(str::len).unwrap_or(0) + 1;
        Kv3Error::Parse {
            msg: msg.into(),
            line,
            col,
        }
    }

    fn peek(&self) -> Option<u8> {
        self.bytes().get(self.idx).copied()
    }

    fn starts_with(&self, s: &str) -> bool {
        self.bytes()[self.idx..].starts_with(s.as_bytes())
    }

    fn skip_header(&mut self) {
        if self.starts_with("<!--")
            && let Some(end) = self.src[self.idx..].find("-->")
        {
            self.idx += end + 3;
        }
        self.skip_whitespace();
    }

    #[inline]
    fn skip_whitespace(&mut self) {
        let bytes = self.bytes();
        let len = bytes.len();
        loop {
            while self.idx < len && matches!(bytes[self.idx], b' ' | b'\t' | b'\n' | b'\r') {
                self.idx += 1;
            }
            if self.idx >= len {
                return;
            }
            let b = bytes[self.idx];
            if b == b'/' && self.idx + 1 < len {
                match bytes[self.idx + 1] {
                    b'/' => match memchr::memchr(b'\n', &bytes[self.idx + 2..]) {
                        Some(n) => self.idx += n + 3,
                        None => self.idx = len,
                    },
                    b'*' => match memchr::memmem::find(&bytes[self.idx + 2..], b"*/") {
                        Some(n) => self.idx += n + 4,
                        None => self.idx = len,
                    },
                    _ => return,
                }
            } else if b.is_ascii_whitespace() {
                self.idx += 1;
            } else {
                return;
            }
        }
    }

    fn parse_value(&mut self) -> Result<Kv3Value<'a>, Kv3Error> {
        self.skip_whitespace();
        let bytes = self.bytes();
        if self.idx >= bytes.len() {
            return Err(self.err("unexpected end of input"));
        }
        if self.starts_with("subclass") {
            return self.parse_subclass();
        }
        match bytes[self.idx] {
            b'{' => self.parse_object(),
            b'[' => self.parse_array(),
            b'"' => self.parse_string().map(Kv3Value::Str),
            b'-' | b'0'..=b'9' => self.parse_number(),
            _ => self.parse_keyword_or_resource(),
        }
    }

    fn parse_subclass(&mut self) -> Result<Kv3Value<'a>, Kv3Error> {
        self.idx += "subclass".len();
        self.skip_whitespace();
        if self.peek() != Some(b':') {
            return Err(self.err("expected ':' after 'subclass'"));
        }
        self.idx += 1;
        self.skip_whitespace();
        if self.peek() != Some(b'{') {
            return Err(self.err("expected '{' after 'subclass:'"));
        }
        let obj = self.parse_object()?;
        Ok(Kv3Value::Object(vec![(Cow::Borrowed("subclass"), obj)]))
    }

    fn parse_object(&mut self) -> Result<Kv3Value<'a>, Kv3Error> {
        let mut out: Vec<(Cow<'a, str>, Kv3Value<'a>)> = Vec::new();
        self.idx += 1; // skip '{'
        loop {
            self.skip_whitespace();
            let bytes = self.bytes();
            if self.idx >= bytes.len() {
                return Err(self.err("unexpected end of input in object"));
            }
            if bytes[self.idx] == b'}' {
                self.idx += 1;
                return Ok(Kv3Value::Object(out));
            }

            let (key, flag) = self.parse_key()?;
            self.skip_whitespace();

            let value = match self.peek() {
                Some(b'=') => {
                    self.idx += 1;
                    self.parse_value()?
                }
                Some(b'{') => self.parse_object()?,
                Some(_) => Kv3Value::Str(self.parse_string()?),
                None => return Err(self.err("unexpected end of input in object")),
            };

            let value = if let Some(flag) = flag {
                Kv3Value::Object(vec![
                    (Cow::Borrowed("value"), value),
                    (Cow::Borrowed("flag"), Kv3Value::Str(Cow::Borrowed(flag))),
                ])
            } else {
                value
            };
            out.push((key, value));

            self.skip_whitespace();
            if self.peek() == Some(b',') {
                self.idx += 1;
            }
        }
    }

    fn parse_array(&mut self) -> Result<Kv3Value<'a>, Kv3Error> {
        let mut out = Vec::new();
        self.idx += 1; // skip '['
        loop {
            self.skip_whitespace();
            let bytes = self.bytes();
            if self.idx >= bytes.len() {
                return Err(self.err("unexpected end of input in array"));
            }
            if bytes[self.idx] == b']' {
                self.idx += 1;
                return Ok(Kv3Value::Array(out));
            }
            out.push(self.parse_value()?);
            self.skip_whitespace();
            if self.peek() == Some(b',') {
                self.idx += 1;
            }
        }
    }

    fn parse_string(&mut self) -> Result<Cow<'a, str>, Kv3Error> {
        if self.starts_with("\"\"\"") {
            return self.parse_multiline_string();
        }
        self.idx += 1; // skip opening "

        // Fast path: scan ahead for the closing quote or first backslash.
        // If we hit a quote with no backslash before it, return a borrowed slice.
        let bytes = self.bytes();
        let tail = &bytes[self.idx..];
        match memchr2(b'"', b'\\', tail) {
            None => return Err(self.err("unterminated string")),
            Some(rel) if tail[rel] == b'"' => {
                let s = &self.src[self.idx..self.idx + rel];
                self.idx += rel + 1;
                return Ok(Cow::Borrowed(s));
            }
            Some(_) => { /* backslash found; fall through to slow path */ }
        }

        // Slow path: at least one escape. Copy unescaped runs between
        // escapes via slice append, then handle each escape.
        let mut out = String::new();
        loop {
            let bytes = self.bytes();
            let tail = &bytes[self.idx..];
            let Some(rel) = memchr2(b'"', b'\\', tail) else {
                return Err(self.err("unterminated string"));
            };
            out.push_str(&self.src[self.idx..self.idx + rel]);
            self.idx += rel;
            if bytes[self.idx] == b'"' {
                self.idx += 1;
                return Ok(Cow::Owned(out));
            }
            self.idx += 1;
            let Some(&esc) = bytes.get(self.idx) else {
                return Err(self.err("unexpected end of input in string"));
            };
            match esc {
                b'n' => out.push('\n'),
                b't' => out.push('\t'),
                b'r' => out.push('\r'),
                other => out.push(other as char),
            }
            self.idx += 1;
        }
    }

    fn parse_multiline_string(&mut self) -> Result<Cow<'a, str>, Kv3Error> {
        self.idx += 3;
        if self.peek() == Some(b'\n') {
            self.idx += 1;
        }
        let bytes = self.bytes();
        let start = self.idx;
        while self.idx < bytes.len() && !bytes[self.idx..].starts_with(b"\n\"\"\"") {
            self.idx += 1;
        }
        if self.idx >= bytes.len() {
            return Err(self.err("unterminated multi-line string"));
        }
        let s = &self.src[start..self.idx];
        self.idx += 4;
        Ok(Cow::Borrowed(s))
    }

    fn parse_number(&mut self) -> Result<Kv3Value<'a>, Kv3Error> {
        let bytes = self.bytes();
        let start = self.idx;
        let mut is_float = false;
        while self.idx < bytes.len() {
            let b = bytes[self.idx];
            if b.is_ascii_digit() || b == b'-' || b == b'+' {
                self.idx += 1;
            } else if matches!(b, b'.' | b'e' | b'E') {
                is_float = true;
                self.idx += 1;
            } else {
                break;
            }
        }
        let text = &self.src[start..self.idx];
        if !is_float && let Ok(i) = text.parse::<i64>() {
            return Ok(Kv3Value::Int(i));
        }
        if let Ok(f) = text.parse::<f64>() {
            return Ok(Kv3Value::Float(f));
        }
        Err(self.err(format!("invalid number: {text}")))
    }

    fn parse_keyword_or_resource(&mut self) -> Result<Kv3Value<'a>, Kv3Error> {
        let bytes = self.bytes();
        let start = self.idx;
        let mut in_quotes = false;
        while self.idx < bytes.len() {
            let b = bytes[self.idx];
            if b == b'"' {
                in_quotes = !in_quotes;
            } else if b.is_ascii_whitespace() {
                break;
            } else if !in_quotes && matches!(b, b'{' | b'}' | b'[' | b']') {
                break;
            }
            self.idx += 1;
        }
        // Loop breaks on whitespace before advancing, so the slice never has
        // leading/trailing whitespace — no trim needed.
        let kw = &self.src[start..self.idx];
        Ok(match kw {
            "true" => Kv3Value::Bool(true),
            "false" => Kv3Value::Bool(false),
            "null" => Kv3Value::Null,
            other => Kv3Value::Str(Cow::Borrowed(other)),
        })
    }

    fn parse_key(&mut self) -> Result<(Cow<'a, str>, Option<&'a str>), Kv3Error> {
        self.skip_whitespace();
        let bytes = self.bytes();
        if self.idx >= bytes.len() {
            return Err(self.err("unexpected end of input in key"));
        }
        let key = if bytes[self.idx] == b'"' {
            self.parse_string()?
        } else {
            let start = self.idx;
            while self.idx < bytes.len() {
                let b = bytes[self.idx];
                if b.is_ascii_alphanumeric() || b == b'_' {
                    self.idx += 1;
                } else {
                    break;
                }
            }
            if start == self.idx {
                return Err(self.err("invalid key"));
            }
            Cow::Borrowed(&self.src[start..self.idx])
        };

        self.skip_whitespace();
        let flag = if self.peek() == Some(b':') {
            self.idx += 1;
            let fstart = self.idx;
            while self.idx < self.bytes().len() && self.bytes()[self.idx].is_ascii_alphabetic() {
                self.idx += 1;
            }
            let f = &self.src[fstart..self.idx];
            if !FLAGS.contains(&f) {
                return Err(self.err(format!("invalid flag: {f}")));
            }
            Some(f)
        } else {
            None
        };

        Ok((key, flag))
    }
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use super::*;

    fn fixture(file: &str) -> String {
        std::fs::read_to_string(format!(
            "{}/src/utils/kv3_fixtures/{file}",
            env!("CARGO_MANIFEST_DIR")
        ))
        .expect("fixture present")
    }

    fn snap(name: &str, file: &str) {
        let value = parse_to_json(&fixture(file)).expect("parses");
        insta::with_settings!({ snapshot_path => "kv3_snapshots", prepend_module_to_snapshot => false }, {
            insta::assert_json_snapshot!(name, value);
        });
    }

    #[test]
    fn parses_minimal() {
        let v: Value = from_str(
            "<!-- kv3 encoding:text:version{x} format:generic:version{y} -->\n\
             { a = 1 b = \"hi\" c = [1, 2, 3] d = true e = null }",
        )
        .expect("ok");
        assert_eq!(v["a"], 1);
        assert_eq!(v["b"], "hi");
        assert_eq!(v["c"], serde_json::json!([1, 2, 3]));
        assert_eq!(v["d"], true);
        assert_eq!(v["e"], Value::Null);
    }

    #[test]
    fn parses_flag_and_subclass() {
        let v: Value =
            from_str("{ icon:panorama = \"file://x\" sub = subclass:{ _name = \"foo\" } }")
                .expect("ok");
        assert_eq!(v["icon"]["flag"], "panorama");
        assert_eq!(v["icon"]["value"], "file://x");
        assert_eq!(v["sub"]["subclass"]["_name"], "foo");
    }

    #[test]
    fn deserialize_into_struct() {
        #[derive(serde::Deserialize)]
        struct S {
            n: i32,
            s: String,
        }
        let s: S = from_str("{ n = 42 s = \"hi\" }").expect("ok");
        assert_eq!(s.n, 42);
        assert_eq!(s.s, "hi");
    }

    #[test]
    fn snap_accolades() {
        snap("accolades", "accolades.vdata");
    }
    #[test]
    fn snap_generic_data() {
        snap("generic_data", "generic_data.vdata");
    }
    #[test]
    fn snap_loot_tables() {
        snap("loot_tables", "loot_tables.vdata");
    }
    #[test]
    fn snap_misc() {
        snap("misc", "misc.vdata");
    }
    #[test]
    fn snap_npc_units() {
        snap("npc_units", "npc_units.vdata");
    }

    fn parse_only(file: &str) {
        parse_borrowed(&fixture(file)).expect("parses");
    }

    #[test]
    fn parses_abilities() {
        parse_only("abilities.vdata");
    }
    #[test]
    fn parses_heroes() {
        parse_only("heroes.vdata");
    }

    #[test]
    #[ignore = "benchmark; run with --ignored --nocapture"]
    fn bench_parse() {
        fn time(label: &str, len: usize, n: u32, mut f: impl FnMut()) {
            // warm-up
            for _ in 0..2 {
                f();
            }
            let t0 = Instant::now();
            for _ in 0..n {
                f();
            }
            let avg: Duration = t0.elapsed() / n;
            let mb = (len as f64) / avg.as_secs_f64() / 1024.0 / 1024.0;
            println!("{label:>32}: {len} bytes, avg {avg:?}, {mb:.1} MB/s");
        }

        for file in ["abilities.vdata", "heroes.vdata", "misc.vdata"] {
            let s = fixture(file);
            time(&format!("{file} borrowed"), s.len(), 5, || {
                let _ = parse_borrowed(&s).expect("ok");
            });
            time(&format!("{file} json"), s.len(), 5, || {
                let _ = parse_to_json(&s).expect("ok");
            });
        }
    }
}
