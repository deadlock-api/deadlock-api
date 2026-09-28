#![forbid(unsafe_code)]
#![deny(clippy::all)]
#![deny(unreachable_pub)]
#![deny(clippy::correctness)]
#![deny(clippy::suspicious)]
#![deny(clippy::style)]
#![deny(clippy::complexity)]
#![deny(clippy::perf)]
#![deny(clippy::pedantic)]
#![deny(clippy::std_instead_of_core)]
#![allow(clippy::should_implement_trait)]

use core::ops::Range;

/// enhanced version of [`std::str::Chars`].
#[derive(Debug, Clone)]
pub struct Charsor<'a> {
    input: &'a str,
    /// byte position relative to the beginning of the input.
    offset: usize,
}

impl<'a> Charsor<'a> {
    #[must_use]
    pub fn new(input: &'a str) -> Self {
        Self { input, offset: 0 }
    }

    /// peek returns but does not consume the next char in the input.
    #[must_use]
    pub fn peek(&self) -> Option<char> {
        self.input[self.offset..].chars().next()
    }

    /// next advances the offset and returns the next char.
    pub fn next(&mut self) -> Option<char> {
        self.peek().inspect(|ch| {
            self.offset += ch.len_utf8();
        })
    }

    /// prev returns the previous char in the input, without modifying the offset.
    #[must_use]
    pub fn prev(&self) -> Option<char> {
        self.input[..self.offset].chars().next_back()
    }

    /// `eat_while` advances the offset and skips over chars while the given closure returns true.
    /// returns the number of chars skipped.
    pub fn eat_while(&mut self, func: impl Fn(char) -> bool) -> usize {
        let mut n = 0;
        while let Some(ch) = self.peek() {
            if !func(ch) {
                break;
            }
            n += 1;
            self.offset += ch.len_utf8();
        }
        n
    }

    /// returns the byte position of the next char, relative to the beginning of the input, or the
    /// length of the underlying str if there are no more characters.
    #[must_use]
    pub fn offset(&self) -> usize {
        self.offset
    }

    /// returns the byte position of the prev char, relative to the beginning of the input.
    pub fn prev_offset(&self) -> usize {
        self.offset - self.prev().map_or(0, char::len_utf8)
    }

    /// returns a slice of the input str at the specified byte range. panics if the range extends
    /// beyond the length of the input str.
    #[must_use]
    pub fn slice_range(&self, range: Range<usize>) -> &'a str {
        &self.input[range]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const INPUT: &str = "こんにちは";
    const INPUT_CHARS: &[char] = &['こ', 'ん', 'に', 'ち', 'は'];

    #[test]
    fn test_peek() {
        let mut cc = Charsor::new(INPUT);
        assert_eq!(cc.peek(), Some(INPUT_CHARS[0]));
        assert_eq!(cc.next(), Some(INPUT_CHARS[0]));
    }

    #[test]
    fn test_next() {
        let mut cc = Charsor::new(INPUT);
        for ch in INPUT_CHARS.iter().copied() {
            assert_eq!(cc.next(), Some(ch));
        }
    }

    #[test]
    fn test_prev() {
        let mut cc = Charsor::new(INPUT);
        assert_eq!(cc.prev(), None);
        assert_eq!(cc.next(), Some(INPUT_CHARS[0]));
        assert_eq!(cc.prev(), Some(INPUT_CHARS[0]));
    }

    #[test]
    fn test_eat_while() {
        const PREFIX: &str = "    ";
        let input = format!("{PREFIX}{INPUT}");
        let mut cc = Charsor::new(&input);
        cc.eat_while(char::is_whitespace);
        assert_eq!(cc.offset(), PREFIX.len());
    }

    #[test]
    fn test_offset() {
        let mut cc = Charsor::new(INPUT);
        let _ = cc.next();
        assert_eq!(cc.offset(), INPUT_CHARS[0].len_utf8());
        let _ = cc.next();
        assert_eq!(
            cc.offset(),
            INPUT_CHARS[0].len_utf8() + INPUT_CHARS[1].len_utf8()
        );
    }

    #[test]
    fn test_prev_offset() {
        let mut cc = Charsor::new(INPUT);
        assert_eq!(cc.prev_offset(), 0);
        let _ = cc.next();
        assert_eq!(cc.prev_offset(), 0);
        let _ = cc.next();
        assert_eq!(cc.prev_offset(), INPUT_CHARS[0].len_utf8());
    }

    #[test]
    fn test_slice_range() {
        let cc = Charsor::new(INPUT);
        let range = Range {
            start: 0,
            end: INPUT_CHARS[0].len_utf8(),
        };
        assert_eq!(cc.slice_range(range), INPUT_CHARS[0].to_string());
    }
}
