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
