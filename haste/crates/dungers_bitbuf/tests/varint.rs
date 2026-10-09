use dungers_bitbuf::{BitReader, BitWriter};

// NOTE: tests are stolen from
// https://github.com/rust-lang/rust/blob/e5b3e68abf170556b9d56c6f9028318e53c9f06b/compiler/rustc_serialize/tests/leb128.rs

#[test]
fn test_varuint64() {
    // test 256 evenly spaced values of integer range, integer max value, and some
    // "random" numbers.
    let mut values = Vec::new();

    let increment = 1 << (u64::BITS - 8);
    values.extend((0..256).map(|i| i * increment));

    values.push(u64::MAX);

    values.extend((-500..500).map(|i| (i as u64).wrapping_mul(0x12345789abcdefu64)));

    let mut buf = [0u8; 1 << 20];

    let mut bw = BitWriter::new(&mut buf);
    for x in &values {
        bw.write_uvarint64(*x).unwrap();
    }

    let mut br = BitReader::new(&buf);
    for want in &values {
        let got: u64 = br.read_uvarint().unwrap();
        assert_eq!(got, *want);
    }
}

#[test]
fn test_varint64() {
    // test 256 evenly spaced values of integer range, integer max value, and some
    // "random" numbers.
    let mut values = Vec::new();

    let mut value = i64::MIN;
    let increment = 1 << (i64::BITS - 8);

    for _ in 0..256 {
        values.push(value);
        // the addition in the last loop iteration overflows.
        value = value.wrapping_add(increment);
    }

    values.push(i64::MAX);

    values.extend((-500..500).map(|i| (i as i64).wrapping_mul(0x12345789abcdefi64)));

    let mut buf = [0u8; 1 << 20];

    let mut bw = BitWriter::new(&mut buf);
    for x in &values {
        bw.write_varint64(*x).unwrap();
    }

    let mut br = BitReader::new(&buf);
    for want in &values {
        let got = br.read_varint64().unwrap();
        assert_eq!(got, *want);
    }
}

#[test]
fn test_uvarint32_rejects_overlong() {
    // 5 bytes is the max for a u32; a continuation bit on the 5th byte is malformed and the
    // reader must not consume a 6th byte.
    let buf = [0xff, 0xff, 0xff, 0xff, 0xff, 0x01];
    let mut br = BitReader::new(&buf);
    assert!(br.read_uvarint32().is_err());
    assert_eq!(br.num_bits_read(), 5 * 8);

    let buf = [0xff, 0xff, 0xff, 0xff, 0x0f];
    let mut br = BitReader::new(&buf);
    assert_eq!(br.read_uvarint32().unwrap(), u32::MAX);
}

#[test]
fn test_varuint_unaligned_and_truncated() {
    let values: Vec<u64> = (0..64)
        .map(|i| (1u64 << i) - 1)
        .chain([u64::MAX, 0, 1])
        .collect();
    for offset in 0..8 {
        let mut buf = vec![0u8; 1024];
        let mut bw = BitWriter::new(&mut buf);
        bw.write_ubit64(0x55, offset).unwrap();
        for x in &values {
            bw.write_uvarint64(*x).unwrap();
        }

        let mut br = BitReader::new(&buf);
        br.read_ubit64(offset).unwrap();
        for want in &values {
            let got: u64 = br.read_uvarint().unwrap();
            assert_eq!(got, *want);
        }
    }

    // a varint that runs past the end of the buffer is an overflow, even if the missing bytes
    // would have ended it.
    for len in 1..=10usize {
        let mut buf = vec![0xffu8; len];
        let mut br = BitReader::new(&buf);
        assert!(br.read_uvarint::<u64>().is_err(), "{len}");
        assert_eq!(br.num_bits_read() % 8, 0);

        // ... while the same bytes followed by a terminating byte decode fine.
        buf.push(0x01);
        let mut br = BitReader::new(&buf);
        let got = br.read_uvarint::<u64>();
        if len < 10 {
            assert!(got.is_ok(), "{len}");
            assert_eq!(br.num_bits_read(), (len + 1) * 8);
        } else {
            assert!(got.is_err(), "{len}");
        }
    }

    // too many continuation bytes for a u32.
    let buf = [0xffu8; 16];
    let mut br = BitReader::new(&buf);
    assert!(br.read_uvarint::<u32>().is_err());
}
