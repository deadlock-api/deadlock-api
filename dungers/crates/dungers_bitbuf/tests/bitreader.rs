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
