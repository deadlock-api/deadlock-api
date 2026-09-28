use dungers_bitbuf::BitWriter;

#[test]
fn test_write_ubit64_extra_bits_erasure() {
    let mut buf = [0u8; 8];
    let mut bw = BitWriter::new(&mut buf);

    // write 4 bits, but provide a value with more than 4 bits set
    bw.write_ubit64(0b11111111, 4).unwrap();
    assert_eq!(buf[0], 0b1111);
}

#[test]
fn test_write_ubit64_overflow() {
    let mut buf = [0u8; 8];
    let mut bw = BitWriter::new(&mut buf);

    assert!(bw.write_ubit64(u64::MAX, u64::BITS as usize).is_ok());
    assert!(bw.write_ubit64(0b1, 1).is_err());
}

#[test]
fn test_write_ubit64_multiple_writes() {
    let mut buf = [0u8; 8];
    let mut bw = BitWriter::new(&mut buf);

    bw.write_ubit64(0b101, 3).unwrap();
    bw.write_ubit64(0b1100, 4).unwrap();
    assert_eq!(buf[0], 0b110_0101);
}

#[test]
fn test_write_ubit64_spanning_blocks() {
    let mut buf = [0u8; 16];
    let mut bw = BitWriter::new(&mut buf);

    // write 60 bits to nearly fill the first block
    bw.write_ubit64(0xfffffffffffffff, 60).unwrap();

    // write 8 more bits that will span across the first and second block
    bw.write_ubit64(0xaa, 8).unwrap();

    // check the first block (64 bits)
    let block1 = u64::from_le_bytes(buf[0..8].try_into().unwrap());
    assert_eq!(block1, 0xafffffffffffffff);

    // check the second block (should have 0xa in the lowest 2 bits)
    let block2 = u64::from_le_bytes(buf[8..16].try_into().unwrap());
    assert_eq!(block2, 0xa);
}
