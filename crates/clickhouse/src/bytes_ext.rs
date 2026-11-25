use bytes::{Buf, Bytes, BytesMut};
use core::cell::Cell;
use core::mem;

#[derive(Default)]
pub(crate) struct BytesExt {
    bytes: Bytes,

    // Points to the real start of the remaining slice.
    // `Cell` allows us to mutate this value while keeping references to `bytes`.
    // Also, the dedicated counter is faster than using `Bytes::advance()`.
    cursor: Cell<usize>,
}

#[expect(
    clippy::inline_always,
    reason = "hot path of row decoding and LZ4 frame decoding"
)]
impl BytesExt {
    /// Returns a remaining slice of bytes.
    #[inline(always)]
    pub(crate) fn slice(&self) -> &[u8] {
        self.bytes.get(self.cursor.get()..).unwrap_or_default()
    }

    /// Overrides the number of remaining bytes by moving the cursor.
    /// Note: it's valid to call this method while holding `slice()` reference.
    #[inline(always)]
    pub(crate) fn set_remaining(&self, n: usize) {
        self.cursor.set(self.bytes.len().saturating_sub(n));
    }

    #[cfg_attr(
        not(feature = "lz4"),
        expect(dead_code, reason = "only the LZ4 frame decoder clears the buffer")
    )]
    pub(crate) fn clear(&mut self) {
        *self.cursor.get_mut() = 0;
        self.bytes.clear();
    }

    /// Adds the provided chunk into available bytes.
    #[inline(always)]
    pub(crate) fn extend(&mut self, chunk: Bytes) {
        if self.remaining() == 0 {
            self.bytes = chunk;
            self.cursor.set(0);
        } else {
            self.extend_slow(&chunk);
        }
    }

    #[cold]
    #[inline(never)]
    fn extend_slow(&mut self, chunk: &[u8]) {
        let mut remaining = mem::take(&mut self.bytes);
        remaining.advance(self.cursor.get());

        // Try to reuse the capacity, if possible.
        let mut remaining = BytesMut::from(remaining);
        remaining.extend_from_slice(chunk);

        self.bytes = remaining.freeze();
        self.cursor.set(0);
    }
}

#[expect(
    clippy::inline_always,
    reason = "hot path of row decoding and LZ4 frame decoding"
)]
impl Buf for BytesExt {
    /// Returns the number of remaining bytes.
    #[inline(always)]
    fn remaining(&self) -> usize {
        self.bytes.len().saturating_sub(self.cursor.get())
    }

    #[inline(always)]
    fn chunk(&self) -> &[u8] {
        self.slice()
    }

    /// Advances the cursor by `cnt` bytes, but not past the end.
    #[inline(always)]
    fn advance(&mut self, cnt: usize) {
        let len = self.bytes.len();
        let cursor = self.cursor.get_mut();
        *cursor = cursor.saturating_add(cnt).min(len);
    }

    fn copy_to_bytes(&mut self, len: usize) -> Bytes {
        let start = self.cursor.get();
        self.advance(len);
        let end = self.cursor.get();

        self.bytes.slice(start..end)
    }
}

#[cfg(test)]
mod tests_miri {
    use super::*;

    #[test]
    fn smoke() {
        let mut bytes = BytesExt::default();
        assert_eq!(bytes.slice(), b"");
        assert_eq!(bytes.remaining(), 0);

        // zero cursor, fast path
        bytes.extend(Bytes::from_static(b"hello"));
        assert_eq!(bytes.slice(), b"hello");
        assert_eq!(bytes.remaining(), 5);

        bytes.advance(3);
        assert_eq!(bytes.slice(), b"lo");
        assert_eq!(bytes.remaining(), 2);

        // non-zero cursor, slow path
        bytes.extend(Bytes::from_static(b"l"));
        assert_eq!(bytes.slice(), b"lol");
        assert_eq!(bytes.remaining(), 3);

        bytes.set_remaining(1);
        assert_eq!(bytes.slice(), b"l");
        assert_eq!(bytes.remaining(), 1);

        bytes.advance(1);
        assert_eq!(bytes.remaining(), 0);
        assert_ne!(bytes.cursor.get(), 0);

        // non-zero cursor, but fast path
        bytes.extend(Bytes::from_static(b"l"));
        assert_eq!(bytes.slice(), b"l");
        assert_eq!(bytes.remaining(), 1);
    }
}
