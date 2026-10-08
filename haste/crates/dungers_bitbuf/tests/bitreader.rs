use dungers_bitbuf::BitReader;

#[test]
fn test_read_ubit64_overflow() {
    let buf = [0xffu8; 8];
    let mut br = BitReader::new(&buf);

    assert!(br.read_ubit64(u64::BITS as usize).is_ok());
    assert!(br.read_ubit64(1).is_err());
}

#[test]
fn test_read_ubit64_multiple_reads() {
    let mut buf = [0u8; 8];
    buf[0] = 0b110_0101;
    let mut br = BitReader::new(&buf);

    assert_eq!(br.read_ubit64(3).unwrap(), 0b101);
    assert_eq!(br.read_ubit64(4).unwrap(), 0b1100);
}

#[test]
fn test_read_ubit64_spanning_blocks() {
    let mut buf = [0xff; 16];
    buf[8] = 0xaa;
    let mut br = BitReader::new(&buf);

    br.read_ubit64(60).unwrap();

    // read 8 bits that span across the first and second block
    let result = br.read_ubit64(8).unwrap();
    // the result should be 4 bits from the end of the first block and 4 bits from the
    // start of the second block
    assert_eq!(result, 0xaf);
}

#[test]
fn test_read_bits() {
    let buf = [
        0b10110011, 0b01011100, 0b11001010, 0b00110101, 0xff, 0xff, 0xff, 0xff,
    ];
    let mut br = BitReader::new(&buf);

    let mut out = [0u8; 4];

    // read 3 bits
    br.read_bits(&mut out[0..1], 3).unwrap();
    assert_eq!(out[0], 0b011);

    // read 5 bits
    br.read_bits(&mut out[0..1], 5).unwrap();
    assert_eq!(out[0], 0b10110);

    // read 8 bits
    br.read_bits(&mut out[0..1], 8).unwrap();
    assert_eq!(out[0], 0b01011100);

    // read 16 bits
    br.read_bits(&mut out[0..2], 16).unwrap();
    assert_eq!(out[0], 0b11001010);
    assert_eq!(out[1], 0b00110101);

    // test reading more bits than available
    assert!(br.read_bits(&mut out, 33).is_err());
}

#[test]
fn test_read_bytes() {
    let buf = [0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x11, 0x22];
    let mut br = BitReader::new(&buf);

    let mut out = [0u8; 8];

    // read 4 bytes
    br.read_bytes(&mut out[0..4]).unwrap();
    assert_eq!(out[0..4], [0xaa, 0xbb, 0xcc, 0xdd]);

    // read 2 more bytes
    br.read_bytes(&mut out[0..2]).unwrap();
    assert_eq!(out[0..2], [0xee, 0xff]);

    // try to read more bytes than available
    assert!(br.read_bytes(&mut out).is_err());

    // read remaining bytes
    br.read_bytes(&mut out[0..2]).unwrap();
    assert_eq!(out[0..2], [0x11, 0x22]);

    // try to read when no more bytes are available
    assert!(br.read_bytes(&mut out[0..1]).is_err());
}

/// reference implementation: reads bits one at a time.
fn naive_read(buf: &[u8], bit: usize, num_bits: usize) -> u64 {
    (0..num_bits).fold(0u64, |acc, i| {
        let b = bit + i;
        acc | (u64::from((buf[b >> 3] >> (b & 7)) & 1) << i)
    })
}

#[test]
fn test_read_ubit64_matches_reference_at_every_offset() {
    // odd-sized buffers make sure that reads near the tail do not touch bytes past the end.
    for len in [1usize, 3, 7, 8, 9, 13, 17] {
        let buf: Vec<u8> = (0..len)
            .map(|i| (i as u8).wrapping_mul(0x9d).wrapping_add(0x5b))
            .collect();
        let total_bits = len * 8;
        for start in 0..total_bits {
            for num_bits in 0..=64.min(total_bits - start) {
                let mut br = BitReader::new(&buf);
                br.seek(start).unwrap();
                assert_eq!(
                    br.read_ubit64(num_bits).unwrap(),
                    naive_read(&buf, start, num_bits),
                    "len={len} start={start} num_bits={num_bits}"
                );
                assert_eq!(br.num_bits_read(), start + num_bits);
            }
            let mut br = BitReader::new(&buf);
            br.seek(start).unwrap();
            assert!(br.read_ubit64(total_bits - start + 1).is_err());
        }
    }
}

#[test]
fn test_read_bool_at_end() {
    let buf = [0b1000_0000u8];
    let mut br = BitReader::new(&buf);
    br.seek(7).unwrap();
    assert!(br.read_bool().unwrap());
    assert!(br.read_bool().is_err());
}

#[test]
fn test_read_bits_matches_reference() {
    let buf: Vec<u8> = (0..23u8).map(|i| i.wrapping_mul(0x3b) ^ 0xa5).collect();
    for start in 0..16 {
        for num_bits in 0..(buf.len() * 8 - start) {
            let mut br = BitReader::new(&buf);
            br.seek(start).unwrap();
            let mut out = vec![0u8; num_bits.div_ceil(8)];
            br.read_bits(&mut out, num_bits).unwrap();
            for (i, byte) in out.iter().enumerate() {
                let n = 8.min(num_bits - i * 8);
                assert_eq!(u64::from(*byte), naive_read(&buf, start + i * 8, n));
            }
            assert_eq!(br.num_bits_read(), start + num_bits);
        }
    }
}
