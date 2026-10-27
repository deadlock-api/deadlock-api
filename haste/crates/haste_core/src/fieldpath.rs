use core::cmp::Ordering;
use core::fmt::Debug;
use dungers::bitbuf::BitError;
use std::collections::BinaryHeap;
use std::sync::LazyLock;

use crate::bitreader::BitReader;

#[derive(thiserror::Error, Debug)]
pub enum FieldPathError {
    #[error(transparent)]
    Bit(#[from] BitError),
    #[error("field path is deeper than {} components", FIELD_PATH_MAX_LEN)]
    TooDeep,
    #[error("field path op refers to a component that does not exist")]
    Underflow,
    #[error("more than {0} field paths in one entity update")]
    TooMany(usize),
    #[error("field op huffman tree is malformed")]
    MalformedOpTree,
}

const FIELD_PATH_MAX_LEN: usize = 7;

// NOTE: credit for figuring out field path encoding goes to invokr (github.com/dotabuff/manta) and
// spheenik (github.com/skadistats/clarity).

// NOTE: clarity's encodes all components into u64; see impl [1], and tech explanation [2].
//
// pretty cool stuff! but won't bring really any benefits / speedups to rust implemtnation; only
// cause extra overhead. unless i'm missing something, am i?
//
// [1] https://github.com/skadistats/clarity/blob/6dcdad4abe94a519b0c797576517461401adedee/src/main/java/skadistats/clarity/model/s2/S2LongFieldPathFormat.java
// [2] https://github.com/skadistats/clarity/commit/212eaddf7dc8b716c22faaec37952236f521a804#commitcomment-86037653

#[derive(Debug, Clone)]
pub struct FieldPath {
    pub(crate) data: [u8; FIELD_PATH_MAX_LEN],
    pub(crate) last: usize,
    pub(crate) finished: bool,
}

impl Default for FieldPath {
    fn default() -> Self {
        Self {
            data: [255, 0, 0, 0, 0, 0, 0],
            last: 0,
            finished: false,
        }
    }
}

impl FieldPath {
    // ops

    fn inc_at(&mut self, i: usize, delta: u8) -> Result<(), FieldPathError> {
        let component = self.data.get_mut(i).ok_or(FieldPathError::TooDeep)?;
        *component = component.wrapping_add(delta);
        Ok(())
    }

    fn inc_last(&mut self, delta: u8) -> Result<(), FieldPathError> {
        self.inc_at(self.last, delta)
    }

    fn inc_penultimate(&mut self, delta: u8) -> Result<(), FieldPathError> {
        let i = self.last.checked_sub(1).ok_or(FieldPathError::Underflow)?;
        self.inc_at(i, delta)
    }

    fn push(&mut self, v: u8) -> Result<(), FieldPathError> {
        let next = self.last.saturating_add(1);
        let slot = self.data.get_mut(next).ok_or(FieldPathError::TooDeep)?;
        *slot = v;
        self.last = next;
        Ok(())
    }

    fn pop(&mut self, n: usize) -> Result<(), FieldPathError> {
        let new_last = self.last.checked_sub(n).ok_or(FieldPathError::Underflow)?;
        let components = self
            .data
            .get_mut(new_last..=self.last)
            .ok_or(FieldPathError::TooDeep)?;
        if let Some((_, popped)) = components.split_first_mut() {
            popped.fill(0);
        }
        self.last = new_last;
        Ok(())
    }

    // public api

    #[must_use]
    pub fn get(&self, index: usize) -> Option<usize> {
        self.data
            .get(index)
            .map(|component| usize::from(*component))
    }

    #[must_use]
    pub const fn last(&self) -> usize {
        self.last
    }

    pub fn iter(&self) -> impl Iterator<Item = &u8> {
        self.data.iter().take(self.last.saturating_add(1))
    }
}

/// field path components are bytes: deltas and pushed values wrap at 256, i.e. only the low byte
/// of a value read from the stream matters (the `& 0xFF` of the reference implementations).
trait Component: Copy {
    fn component(self) -> u8;
}

impl Component for u32 {
    #[inline]
    fn component(self) -> u8 {
        let [low, ..] = self.to_le_bytes();
        low
    }
}

impl Component for u64 {
    #[inline]
    fn component(self) -> u8 {
        let [low, ..] = self.to_le_bytes();
        low
    }
}

impl Component for i32 {
    #[inline]
    fn component(self) -> u8 {
        let [low, ..] = self.to_le_bytes();
        low
    }
}

/// a pop count too large for `usize` can't be popped either; saturate so that `pop` reports the
/// underflow.
fn pop_count(n: u32) -> usize {
    usize::try_from(n).unwrap_or(usize::MAX)
}

type FieldOp = fn(&mut FieldPath, &mut BitReader) -> Result<(), FieldPathError>;

// PlusOne
fn plus_one(fp: &mut FieldPath, _br: &mut BitReader) -> Result<(), FieldPathError> {
    fp.inc_last(1)?;
    Ok(())
}

// PlusTwo
fn plus_two(fp: &mut FieldPath, _br: &mut BitReader) -> Result<(), FieldPathError> {
    fp.inc_last(2)?;
    Ok(())
}

// PlusThree
fn plus_three(fp: &mut FieldPath, _br: &mut BitReader) -> Result<(), FieldPathError> {
    fp.inc_last(3)?;
    Ok(())
}

// PlusFour
fn plus_four(fp: &mut FieldPath, _br: &mut BitReader) -> Result<(), FieldPathError> {
    fp.inc_last(4)?;
    Ok(())
}

// PlusN
fn plus_n(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), FieldPathError> {
    fp.inc_last(br.read_ubitvarfp()?.component().wrapping_add(5))?;
    Ok(())
}

// PushOneLeftDeltaZeroRightZero
fn push_one_left_delta_zero_right_zero(
    fp: &mut FieldPath,
    _br: &mut BitReader,
) -> Result<(), FieldPathError> {
    fp.push(0)?;
    Ok(())
}

// PushOneLeftDeltaZeroRightNonZero
fn push_one_left_delta_zero_right_non_zero(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), FieldPathError> {
    fp.push(br.read_ubitvarfp()?.component())?;
    Ok(())
}

// PushOneLeftDeltaOneRightZero
fn push_one_left_delta_one_right_zero(
    fp: &mut FieldPath,
    _br: &mut BitReader,
) -> Result<(), FieldPathError> {
    fp.inc_last(1)?;
    fp.push(0)?;
    Ok(())
}

// PushOneLeftDeltaOneRightNonZero
fn push_one_left_delta_one_right_non_zero(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), FieldPathError> {
    fp.inc_last(1)?;
    fp.push(br.read_ubitvarfp()?.component())?;
    Ok(())
}

// PushOneLeftDeltaNRightZero
fn push_one_left_delta_n_right_zero(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), FieldPathError> {
    fp.inc_last(br.read_ubitvarfp()?.component())?;
    fp.push(0)?;
    Ok(())
}

// PushOneLeftDeltaNRightNonZero
fn push_one_left_delta_n_right_non_zero(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), FieldPathError> {
    fp.inc_last(br.read_ubitvarfp()?.component().wrapping_add(2))?;
    fp.push(br.read_ubitvarfp()?.component().wrapping_add(1))?;
    Ok(())
}

// PushOneLeftDeltaNRightNonZeroPack6Bits
fn push_one_left_delta_n_right_non_zero_pack6_bits(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), FieldPathError> {
    fp.inc_last(br.read_ubit64(3)?.component().wrapping_add(2))?;
    fp.push(br.read_ubit64(3)?.component().wrapping_add(1))?;
    Ok(())
}

// PushOneLeftDeltaNRightNonZeroPack8Bits
fn push_one_left_delta_n_right_non_zero_pack8_bits(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), FieldPathError> {
    fp.inc_last(br.read_ubit64(4)?.component().wrapping_add(2))?;
    fp.push(br.read_ubit64(4)?.component().wrapping_add(1))?;
    Ok(())
}

// PushTwoLeftDeltaZero
fn push_two_left_delta_zero(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), FieldPathError> {
    fp.push(br.read_ubitvarfp()?.component())?;
    fp.push(br.read_ubitvarfp()?.component())?;
    Ok(())
}

// PushTwoLeftDeltaOne
fn push_two_left_delta_one(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), FieldPathError> {
    fp.inc_last(1)?;
    fp.push(br.read_ubitvarfp()?.component())?;
    fp.push(br.read_ubitvarfp()?.component())?;
    Ok(())
}

// PushTwoLeftDeltaN
fn push_two_left_delta_n(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), FieldPathError> {
    fp.inc_last(br.read_ubitvar()?.component().wrapping_add(2))?;
    fp.push(br.read_ubitvarfp()?.component())?;
    fp.push(br.read_ubitvarfp()?.component())?;
    Ok(())
}

// PushTwoPack5LeftDeltaZero
fn push_two_pack5_left_delta_zero(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), FieldPathError> {
    fp.push(br.read_ubit64(5)?.component())?;
    fp.push(br.read_ubit64(5)?.component())?;
    Ok(())
}

// PushTwoPack5LeftDeltaOne
fn push_two_pack5_left_delta_one(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), FieldPathError> {
    fp.inc_last(1)?;
    fp.push(br.read_ubit64(5)?.component())?;
    fp.push(br.read_ubit64(5)?.component())?;
    Ok(())
}

// PushTwoPack5LeftDeltaN
fn push_two_pack5_left_delta_n(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), FieldPathError> {
    fp.inc_last(br.read_ubitvar()?.component().wrapping_add(2))?;
    fp.push(br.read_ubit64(5)?.component())?;
    fp.push(br.read_ubit64(5)?.component())?;
    Ok(())
}

// PushThreeLeftDeltaZero
fn push_three_left_delta_zero(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), FieldPathError> {
    fp.push(br.read_ubitvarfp()?.component())?;
    fp.push(br.read_ubitvarfp()?.component())?;
    fp.push(br.read_ubitvarfp()?.component())?;
    Ok(())
}

// PushThreeLeftDeltaOne
fn push_three_left_delta_one(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), FieldPathError> {
    fp.inc_last(1)?;
    fp.push(br.read_ubitvarfp()?.component())?;
    fp.push(br.read_ubitvarfp()?.component())?;
    fp.push(br.read_ubitvarfp()?.component())?;
    Ok(())
}

// PushThreeLeftDeltaN
fn push_three_left_delta_n(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), FieldPathError> {
    fp.inc_last(br.read_ubitvar()?.component().wrapping_add(2))?;
    fp.push(br.read_ubitvarfp()?.component())?;
    fp.push(br.read_ubitvarfp()?.component())?;
    fp.push(br.read_ubitvarfp()?.component())?;
    Ok(())
}

// PushThreePack5LeftDeltaZero
fn push_three_pack5_left_delta_zero(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), FieldPathError> {
    fp.push(br.read_ubit64(5)?.component())?;
    fp.push(br.read_ubit64(5)?.component())?;
    fp.push(br.read_ubit64(5)?.component())?;
    Ok(())
}

// PushThreePack5LeftDeltaOne
fn push_three_pack5_left_delta_one(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), FieldPathError> {
    fp.inc_last(1)?;
    fp.push(br.read_ubit64(5)?.component())?;
    fp.push(br.read_ubit64(5)?.component())?;
    fp.push(br.read_ubit64(5)?.component())?;
    Ok(())
}

// PushThreePack5LeftDeltaN
fn push_three_pack5_left_delta_n(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), FieldPathError> {
    fp.inc_last(br.read_ubitvar()?.component().wrapping_add(2))?;
    fp.push(br.read_ubit64(5)?.component())?;
    fp.push(br.read_ubit64(5)?.component())?;
    fp.push(br.read_ubit64(5)?.component())?;
    Ok(())
}

// PushN
fn push_n(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), FieldPathError> {
    let n = br.read_ubitvar()?;
    fp.inc_last(br.read_ubitvar()?.component())?;
    for _ in 0..n {
        fp.push(br.read_ubitvarfp()?.component())?;
    }
    Ok(())
}

// PushNAndNonTopographical
fn push_n_and_non_topographical(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), FieldPathError> {
    for i in 0..=fp.last {
        if br.read_bool()? {
            fp.inc_at(i, br.read_varint32()?.component().wrapping_add(1))?;
        }
    }
    let n = br.read_ubitvar()?;
    for _ in 0..n {
        fp.push(br.read_ubitvarfp()?.component())?;
    }
    Ok(())
}

// PopOnePlusOne
fn pop_one_plus_one(fp: &mut FieldPath, _br: &mut BitReader) -> Result<(), FieldPathError> {
    fp.pop(1)?;
    fp.inc_last(1)?;
    Ok(())
}

// PopOnePlusN
fn pop_one_plus_n(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), FieldPathError> {
    fp.pop(1)?;
    fp.inc_last(br.read_ubitvarfp()?.component().wrapping_add(1))?;
    Ok(())
}

// PopAllButOnePlusOne
fn pop_all_but_one_plus_one(fp: &mut FieldPath, _br: &mut BitReader) -> Result<(), FieldPathError> {
    fp.pop(fp.last)?;
    fp.inc_last(1)?;
    Ok(())
}

// PopAllButOnePlusN
fn pop_all_but_one_plus_n(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), FieldPathError> {
    fp.pop(fp.last)?;
    fp.inc_last(br.read_ubitvarfp()?.component().wrapping_add(1))?;
    Ok(())
}

// PopAllButOnePlusNPack3Bits
fn pop_all_but_one_plus_n_pack3_bits(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), FieldPathError> {
    fp.pop(fp.last)?;
    fp.inc_last(br.read_ubit64(3)?.component().wrapping_add(1))?;
    Ok(())
}

// PopAllButOnePlusNPack6Bits
fn pop_all_but_one_plus_n_pack6_bits(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), FieldPathError> {
    fp.pop(fp.last)?;
    fp.inc_last(br.read_ubit64(6)?.component().wrapping_add(1))?;
    Ok(())
}

// PopNPlusOne
fn pop_n_plus_one(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), FieldPathError> {
    fp.pop(pop_count(br.read_ubitvarfp()?))?;
    fp.inc_last(1)?;
    Ok(())
}

// PopNPlusN
fn pop_n_plus_n(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), FieldPathError> {
    fp.pop(pop_count(br.read_ubitvarfp()?))?;
    fp.inc_last(br.read_varint32()?.component())?;
    Ok(())
}

// PopNAndNonTopographical
fn pop_n_and_non_topographical(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), FieldPathError> {
    fp.pop(pop_count(br.read_ubitvarfp()?))?;
    for i in 0..=fp.last {
        if br.read_bool()? {
            fp.inc_at(i, br.read_varint32()?.component())?;
        }
    }
    Ok(())
}

// NonTopoComplex
fn non_topo_complex(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), FieldPathError> {
    for i in 0..=fp.last {
        if br.read_bool()? {
            fp.inc_at(i, br.read_varint32()?.component())?;
        }
    }
    Ok(())
}

// NonTopoPenultimatePluseOne
fn non_topo_penultimate_pluse_one(
    fp: &mut FieldPath,
    _br: &mut BitReader,
) -> Result<(), FieldPathError> {
    fp.inc_penultimate(1)?;
    Ok(())
}

// NonTopoComplexPack4Bits
fn non_topo_complex_pack4_bits(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), FieldPathError> {
    for i in 0..=fp.last {
        if br.read_bool()? {
            fp.inc_at(i, br.read_ubit64(4)?.component().wrapping_sub(7))?;
        }
    }
    Ok(())
}

// FieldPathEncodeFinish
#[expect(
    clippy::unnecessary_wraps,
    reason = "every op has the `FieldOp` signature"
)]
const fn field_path_encode_finish(
    fp: &mut FieldPath,
    _br: &mut BitReader,
) -> Result<(), FieldPathError> {
    // NOCOMMIT
    fp.finished = true;
    Ok(())
}

// NOTE: for some random reference, manual rust vtable impls:
// - https://doc.rust-lang.org/std/task/struct.RawWakerVTable.html
// - https://github.com/tokio-rs/tokio/blob/67bf9c36f347031ca05872d102a7f9abc8b465f0/tokio/src/task/raw.rs#L12-L42

#[derive(Debug)]
struct FieldOpDescriptor {
    weight: usize,
    op: FieldOp,
}

const FIELDOP_DESCRIPTORS: &[FieldOpDescriptor] = &[
    FieldOpDescriptor {
        weight: 36271,
        op: plus_one,
    },
    FieldOpDescriptor {
        weight: 10334,
        op: plus_two,
    },
    FieldOpDescriptor {
        weight: 1375,
        op: plus_three,
    },
    FieldOpDescriptor {
        weight: 646,
        op: plus_four,
    },
    FieldOpDescriptor {
        weight: 4128,
        op: plus_n,
    },
    FieldOpDescriptor {
        weight: 35,
        op: push_one_left_delta_zero_right_zero,
    },
    FieldOpDescriptor {
        weight: 3,
        op: push_one_left_delta_zero_right_non_zero,
    },
    FieldOpDescriptor {
        weight: 521,
        op: push_one_left_delta_one_right_zero,
    },
    FieldOpDescriptor {
        weight: 2942,
        op: push_one_left_delta_one_right_non_zero,
    },
    FieldOpDescriptor {
        weight: 560,
        op: push_one_left_delta_n_right_zero,
    },
    FieldOpDescriptor {
        weight: 471,
        op: push_one_left_delta_n_right_non_zero,
    },
    FieldOpDescriptor {
        weight: 10530,
        op: push_one_left_delta_n_right_non_zero_pack6_bits,
    },
    FieldOpDescriptor {
        weight: 251,
        op: push_one_left_delta_n_right_non_zero_pack8_bits,
    },
    FieldOpDescriptor {
        weight: 1,
        op: push_two_left_delta_zero,
    },
    FieldOpDescriptor {
        weight: 1,
        op: push_two_pack5_left_delta_zero,
    },
    FieldOpDescriptor {
        weight: 1,
        op: push_three_left_delta_zero,
    },
    FieldOpDescriptor {
        weight: 1,
        op: push_three_pack5_left_delta_zero,
    },
    FieldOpDescriptor {
        weight: 1,
        op: push_two_left_delta_one,
    },
    FieldOpDescriptor {
        weight: 1,
        op: push_two_pack5_left_delta_one,
    },
    FieldOpDescriptor {
        weight: 1,
        op: push_three_left_delta_one,
    },
    FieldOpDescriptor {
        weight: 1,
        op: push_three_pack5_left_delta_one,
    },
    FieldOpDescriptor {
        weight: 1,
        op: push_two_left_delta_n,
    },
    FieldOpDescriptor {
        weight: 1,
        op: push_two_pack5_left_delta_n,
    },
    FieldOpDescriptor {
        weight: 1,
        op: push_three_left_delta_n,
    },
    FieldOpDescriptor {
        weight: 1,
        op: push_three_pack5_left_delta_n,
    },
    FieldOpDescriptor {
        weight: 1,
        op: push_n,
    },
    FieldOpDescriptor {
        weight: 310,
        op: push_n_and_non_topographical,
    },
    FieldOpDescriptor {
        weight: 2,
        op: pop_one_plus_one,
    },
    FieldOpDescriptor {
        weight: 1,
        op: pop_one_plus_n,
    },
    FieldOpDescriptor {
        weight: 1837,
        op: pop_all_but_one_plus_one,
    },
    FieldOpDescriptor {
        weight: 149,
        op: pop_all_but_one_plus_n,
    },
    FieldOpDescriptor {
        weight: 300,
        op: pop_all_but_one_plus_n_pack3_bits,
    },
    FieldOpDescriptor {
        weight: 634,
        op: pop_all_but_one_plus_n_pack6_bits,
    },
    FieldOpDescriptor {
        weight: 1,
        op: pop_n_plus_one,
    },
    FieldOpDescriptor {
        weight: 1,
        op: pop_n_plus_n,
    },
    FieldOpDescriptor {
        weight: 1,
        op: pop_n_and_non_topographical,
    },
    FieldOpDescriptor {
        weight: 76,
        op: non_topo_complex,
    },
    FieldOpDescriptor {
        weight: 271,
        op: non_topo_penultimate_pluse_one,
    },
    FieldOpDescriptor {
        weight: 99,
        op: non_topo_complex_pack4_bits,
    },
    FieldOpDescriptor {
        weight: 25474,
        op: field_path_encode_finish,
    },
];

#[derive(Debug)]
enum Node<T: Debug> {
    Leaf {
        weight: usize,
        num: usize,
        value: T,
    },
    Branch {
        weight: usize,
        num: usize,
        left: Box<Self>,
        right: Box<Self>,
    },
}

impl<T: Debug> Node<T> {
    const fn weight(&self) -> usize {
        match self {
            Self::Leaf { weight, .. } | Self::Branch { weight, .. } => *weight,
        }
    }

    const fn num(&self) -> usize {
        match self {
            Self::Leaf { num, .. } | Self::Branch { num, .. } => *num,
        }
    }
}

impl<T: Debug> Ord for Node<T> {
    fn cmp(&self, other: &Self) -> Ordering {
        if self.weight() == other.weight() {
            self.num().cmp(&other.num())
        } else {
            other.weight().cmp(&self.weight())
        }
    }
}

impl<T: Debug> PartialOrd for Node<T> {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl<T: Debug> PartialEq for Node<T> {
    fn eq(&self, other: &Self) -> bool {
        self.weight() == other.weight() && self.num() == other.num()
    }
}

impl<T: Debug> Eq for Node<T> {}

/// returns `None` only if there are no field ops at all.
fn build_fieldop_hierarchy() -> Option<Node<FieldOp>> {
    // valve's huffman-tree uses a variation which takes the node number into account
    let mut bh: BinaryHeap<_> = (0..)
        .zip(FIELDOP_DESCRIPTORS)
        .map(|(num, fod)| Node::Leaf {
            weight: fod.weight,
            num,
            value: fod.op,
        })
        .collect();
    let mut num = FIELDOP_DESCRIPTORS.len();

    loop {
        let left = bh.pop()?;
        let Some(right) = bh.pop() else {
            return Some(left);
        };
        bh.push(Node::Branch {
            weight: left.weight().saturating_add(right.weight()),
            num,
            left: Box::new(left),
            right: Box::new(right),
        });
        num = num.saturating_add(1);
    }
}

/// A branch child in the flattened huffman tree: either a terminal op, or the
/// index of another branch node.
enum FlatChild {
    Leaf(FieldOp),
    Branch(u32),
}

/// One internal node of the flattened huffman tree. Branch children are embedded
/// inline, so walking the tree is a single contiguous-array load per bit with no
/// pointer chasing — the whole tree (~40 nodes) fits in L1.
struct FlatBranch {
    left: FlatChild,
    right: FlatChild,
}

/// number of bits resolved by a single [`FlatTree::lookup`] probe.
const LOOKUP_BITS: usize = 8;

/// entry of the first-level lookup table, indexed by the next [`LOOKUP_BITS`] bits of the stream
/// (in stream order: the first bit is the least significant one).
#[derive(Clone, Copy)]
enum Lookup {
    /// the code is complete within the peeked bits; it is `len` bits long.
    Leaf { op: FieldOp, len: u8 },
    /// the code is longer than [`LOOKUP_BITS`]; the walk continues bit by bit at this branch.
    Branch(u32),
}

struct FlatTree {
    nodes: Vec<FlatBranch>,
    /// the frequent ops have codes of a few bits, so nearly every op is resolved by one probe of
    /// this table instead of a bit-by-bit walk.
    lookup: [Lookup; 1 << LOOKUP_BITS],
}

fn flatten_child(node: &Node<FieldOp>, out: &mut Vec<FlatBranch>) -> Option<FlatChild> {
    match node {
        Node::Leaf { value, .. } => Some(FlatChild::Leaf(*value)),
        Node::Branch { left, right, .. } => flatten_branch(left, right, out).map(FlatChild::Branch),
    }
}

/// returns `None` if the tree has more than `u32::MAX` branches.
fn flatten_branch(
    left: &Node<FieldOp>,
    right: &Node<FieldOp>,
    out: &mut Vec<FlatBranch>,
) -> Option<u32> {
    let left = flatten_child(left, out)?;
    let right = flatten_child(right, out)?;
    let idx = u32::try_from(out.len()).ok()?;
    out.push(FlatBranch { left, right });
    Some(idx)
}

/// resolves `bits` (in stream order) against the tree starting at branch `root`.
fn build_lookup_entry(nodes: &[FlatBranch], root: u32, bits: usize) -> Option<Lookup> {
    let mut idx = root;
    for (i, len) in (0..LOOKUP_BITS).zip(1_u8..) {
        let node = nodes.get(idx as usize)?;
        let child = if (bits >> i) & 1 == 1 {
            &node.right
        } else {
            &node.left
        };
        match child {
            FlatChild::Leaf(op) => return Some(Lookup::Leaf { op: *op, len }),
            FlatChild::Branch(next) => idx = *next,
        }
    }
    Some(Lookup::Branch(idx))
}

fn build_fieldop_tree() -> Option<FlatTree> {
    let Node::Branch { left, right, .. } = build_fieldop_hierarchy()? else {
        return None;
    };
    let mut nodes = Vec::new();
    let root = flatten_branch(&left, &right, &mut nodes)?;
    let mut lookup = [Lookup::Branch(root); 1 << LOOKUP_BITS];
    for (bits, entry) in lookup.iter_mut().enumerate() {
        *entry = build_lookup_entry(&nodes, root, bits)?;
    }
    Some(FlatTree { nodes, lookup })
}

/// `None` if the (constant) op table can't form a huffman tree, which it always does.
static FIELDOP_TREE: LazyLock<Option<FlatTree>> = LazyLock::new(build_fieldop_tree);

/// reads the next field op: one table probe for codes of up to [`LOOKUP_BITS`] bits, then a
/// bit-by-bit walk of the flattened tree for the (rare) longer ones.
#[inline]
fn read_field_op(tree: &FlatTree, br: &mut BitReader) -> Result<FieldOp, FieldPathError> {
    // bits past the end of the buffer peek as zero; `skip_bits` fails if the code needs more bits
    // than there are left, exactly where a bit-by-bit walk would have run out.
    let [peeked, ..] = br.peek_ubit64_zero_extended(LOOKUP_BITS).to_le_bytes();
    // the table has an entry for every byte, so this lookup can't fail.
    let entry = tree
        .lookup
        .get(usize::from(peeked))
        .ok_or(FieldPathError::MalformedOpTree)?;
    let mut node = match *entry {
        Lookup::Leaf { op, len } => {
            br.skip_bits(usize::from(len))?;
            return Ok(op);
        }
        Lookup::Branch(idx) => {
            br.skip_bits(LOOKUP_BITS)?;
            tree.nodes
                .get(idx as usize)
                .ok_or(FieldPathError::MalformedOpTree)?
        }
    };
    loop {
        let child = if br.read_bool()? {
            &node.right
        } else {
            &node.left
        };
        match child {
            FlatChild::Leaf(op) => return Ok(*op),
            FlatChild::Branch(idx) => {
                node = tree
                    .nodes
                    .get(*idx as usize)
                    .ok_or(FieldPathError::MalformedOpTree)?;
            }
        }
    }
}

pub(crate) fn read_field_paths(
    br: &mut BitReader,
    fps: &mut [FieldPath],
) -> Result<usize, FieldPathError> {
    // NOTE: majority of field path reads are shorter then 32 (but some are beyond thousand).

    // Ops are huffman coded. Rather than accumulating bits and matching on them (like butterfly
    // does [1]) or walking the tree one bit at a time, the next few bits are peeked and resolved
    // with a single lookup (see `read_field_op`); the tree is flattened into a contiguous array
    // (`FlatTree`) for the rare codes that are longer.
    //
    // [1] https://github.com/ButterflyStats/butterfly/blob/339e91a882cadc1a8f72446616f7d7f1480c3791/src/butterfly/private/entity.cpp#L93

    let tree = FIELDOP_TREE
        .as_ref()
        .ok_or(FieldPathError::MalformedOpTree)?;

    let mut fp = FieldPath::default();
    let mut i: usize = 0;

    loop {
        let op = read_field_op(tree, br)?;
        op(&mut fp, br)?;
        if fp.finished {
            return Ok(i);
        }
        let max = fps.len();
        *fps.get_mut(i).ok_or(FieldPathError::TooMany(max))? = fp.clone();
        i = i.saturating_add(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_push_pop_bounds() {
        let mut fp = FieldPath::default();
        for i in 1..FIELD_PATH_MAX_LEN {
            fp.push(u8::try_from(i).unwrap()).unwrap();
        }
        assert_eq!(fp.last(), FIELD_PATH_MAX_LEN - 1);
        assert!(matches!(fp.push(0), Err(FieldPathError::TooDeep)));

        fp.pop(2).unwrap();
        assert_eq!(fp.last(), FIELD_PATH_MAX_LEN - 3);
        assert_eq!(fp.data[FIELD_PATH_MAX_LEN - 2..], [0, 0]);
        assert!(matches!(
            fp.pop(FIELD_PATH_MAX_LEN),
            Err(FieldPathError::Underflow)
        ));

        let mut fp = FieldPath::default();
        assert!(matches!(
            fp.inc_penultimate(1),
            Err(FieldPathError::Underflow)
        ));
    }

    /// the original bit-by-bit tree walk, as a reference for the table driven `read_field_op`.
    fn read_field_paths_bitwise(
        br: &mut BitReader,
        fps: &mut [FieldPath],
    ) -> Result<usize, FieldPathError> {
        let mut nodes = Vec::new();
        let Some(Node::Branch { left, right, .. }) = build_fieldop_hierarchy() else {
            panic!("no field op tree");
        };
        let root = flatten_branch(&left, &right, &mut nodes).unwrap();
        let mut fp = FieldPath::default();
        let mut i = 0;
        let mut node = &nodes[root as usize];
        loop {
            let child = if br.read_bool()? {
                &node.right
            } else {
                &node.left
            };
            match child {
                FlatChild::Leaf(op) => {
                    op(&mut fp, br)?;
                    if fp.finished {
                        return Ok(i);
                    }
                    let max = fps.len();
                    *fps.get_mut(i).ok_or(FieldPathError::TooMany(max))? = fp.clone();
                    i += 1;
                    node = &nodes[root as usize];
                }
                FlatChild::Branch(idx) => node = &nodes[*idx as usize],
            }
        }
    }

    #[test]
    fn test_read_field_paths_matches_bitwise_walk() {
        let mut state = 0x2545_f491_4f6c_dd1du64;
        let mut fps = vec![FieldPath::default(); 64];
        let mut want_fps = vec![FieldPath::default(); 64];
        let mut num_ok = 0;
        for len in (0..4096).map(|i| i % 48) {
            let buf: Vec<u8> = (0..len)
                .map(|_| {
                    state ^= state << 13;
                    state ^= state >> 7;
                    state ^= state << 17;
                    // bias towards zero bits, which make the frequent short codes (and the
                    // finishing op) likely, so that many inputs decode successfully.
                    let [b0, b1, ..] = state.to_le_bytes();
                    b0 & b1
                })
                .collect();

            let mut br = BitReader::new(&buf);
            let got = read_field_paths(&mut br, &mut fps);
            let mut want_br = BitReader::new(&buf);
            let want = read_field_paths_bitwise(&mut want_br, &mut want_fps);

            match (got, want) {
                (Ok(n), Ok(want_n)) => {
                    num_ok += 1;
                    assert_eq!(n, want_n);
                    assert_eq!(br.num_bits_read(), want_br.num_bits_read());
                    for (fp, want_fp) in fps[..n].iter().zip(&want_fps[..n]) {
                        assert_eq!(fp.data, want_fp.data);
                        assert_eq!(fp.last, want_fp.last);
                    }
                }
                (Err(_), Err(_)) => {}
                (got, want) => panic!("got {got:?}, want {want:?} for {buf:?}"),
            }
        }
        assert!(num_ok > 100, "only {num_ok} inputs decoded");
    }

    #[test]
    fn test_read_field_paths_never_panics_on_garbage() {
        // xorshift; deterministic garbage.
        let mut state = 0x9e37_79b9_7f4a_7c15u64;
        let mut fps = vec![FieldPath::default(); 16];
        for _ in 0..4096 {
            let buf: Vec<u8> = (0..64)
                .map(|_| {
                    state ^= state << 13;
                    state ^= state >> 7;
                    state ^= state << 17;
                    let [b0, ..] = state.to_le_bytes();
                    b0
                })
                .collect();
            let mut br = BitReader::new(&buf);
            let _result = read_field_paths(&mut br, &mut fps);
        }
    }
}
