use core::cmp::Ordering;
use core::fmt::Debug;
use dungers::bitbuf::BitError;
use std::collections::BinaryHeap;
use std::sync::LazyLock;

use crate::bitreader::BitReader;

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
    pub(crate) data: [u8; 7],
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

    fn inc_at(&mut self, i: usize, v: i32) {
        self.data[i] = ((i32::from(self.data[i]) + v) & 0xFF) as u8;
    }

    fn inc_last(&mut self, v: i32) {
        self.inc_at(self.last, v);
    }

    fn push(&mut self, v: i32) {
        self.last += 1;
        self.data[self.last] = (v & 0xFF) as u8;
    }

    fn pop(&mut self, n: usize) {
        for _ in 0..n {
            self.data[self.last] = 0;
            self.last -= 1;
        }
    }

    // public api

    // NOTE: using this method can hurt performance when used in critical code paths. use the
    // unsafe [`Self::get_unchecked`] instead.
    #[must_use]
    pub fn get(&self, index: usize) -> Option<usize> {
        self.data.get(index).map(|component| *component as usize)
    }

    #[must_use]
    pub fn last(&self) -> usize {
        self.last
    }

    pub fn iter(&self) -> impl Iterator<Item = &u8> {
        self.data.iter().take(self.last + 1)
    }
}

type FieldOp = fn(&mut FieldPath, &mut BitReader) -> Result<(), BitError>;

// PlusOne
#[allow(clippy::unnecessary_wraps)]
fn plus_one(fp: &mut FieldPath, _br: &mut BitReader) -> Result<(), BitError> {
    fp.inc_last(1);
    Ok(())
}

// PlusTwo
#[allow(clippy::unnecessary_wraps)]
fn plus_two(fp: &mut FieldPath, _br: &mut BitReader) -> Result<(), BitError> {
    fp.inc_last(2);
    Ok(())
}

// PlusThree
#[allow(clippy::unnecessary_wraps)]
fn plus_three(fp: &mut FieldPath, _br: &mut BitReader) -> Result<(), BitError> {
    fp.inc_last(3);
    Ok(())
}

// PlusFour
#[allow(clippy::unnecessary_wraps)]
fn plus_four(fp: &mut FieldPath, _br: &mut BitReader) -> Result<(), BitError> {
    fp.inc_last(4);
    Ok(())
}

// PlusN
fn plus_n(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    fp.inc_last(br.read_ubitvarfp()? as i32 + 5);
    Ok(())
}

// PushOneLeftDeltaZeroRightZero
#[allow(clippy::unnecessary_wraps)]
fn push_one_left_delta_zero_right_zero(
    fp: &mut FieldPath,
    _br: &mut BitReader,
) -> Result<(), BitError> {
    fp.push(0);
    Ok(())
}

// PushOneLeftDeltaZeroRightNonZero
fn push_one_left_delta_zero_right_non_zero(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), BitError> {
    fp.push(br.read_ubitvarfp()? as i32);
    Ok(())
}

// PushOneLeftDeltaOneRightZero
#[allow(clippy::unnecessary_wraps)]
fn push_one_left_delta_one_right_zero(
    fp: &mut FieldPath,
    _br: &mut BitReader,
) -> Result<(), BitError> {
    fp.inc_last(1);
    fp.push(0);
    Ok(())
}

// PushOneLeftDeltaOneRightNonZero
fn push_one_left_delta_one_right_non_zero(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), BitError> {
    fp.inc_last(1);
    fp.push(br.read_ubitvarfp()? as i32);
    Ok(())
}

// PushOneLeftDeltaNRightZero
fn push_one_left_delta_n_right_zero(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), BitError> {
    fp.inc_last(br.read_ubitvarfp()? as i32);
    fp.push(0);
    Ok(())
}

// PushOneLeftDeltaNRightNonZero
fn push_one_left_delta_n_right_non_zero(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), BitError> {
    fp.inc_last(br.read_ubitvarfp()? as i32 + 2);
    fp.push(br.read_ubitvarfp()? as i32 + 1);
    Ok(())
}

// PushOneLeftDeltaNRightNonZeroPack6Bits
fn push_one_left_delta_n_right_non_zero_pack6_bits(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), BitError> {
    fp.inc_last(br.read_ubit64(3)? as i32 + 2);
    fp.push(br.read_ubit64(3)? as i32 + 1);
    Ok(())
}

// PushOneLeftDeltaNRightNonZeroPack8Bits
fn push_one_left_delta_n_right_non_zero_pack8_bits(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), BitError> {
    fp.inc_last(br.read_ubit64(4)? as i32 + 2);
    fp.push(br.read_ubit64(4)? as i32 + 1);
    Ok(())
}

// PushTwoLeftDeltaZero
fn push_two_left_delta_zero(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    fp.push(br.read_ubitvarfp()? as i32);
    fp.push(br.read_ubitvarfp()? as i32);
    Ok(())
}

// PushTwoLeftDeltaOne
fn push_two_left_delta_one(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    fp.inc_last(1);
    fp.push(br.read_ubitvarfp()? as i32);
    fp.push(br.read_ubitvarfp()? as i32);
    Ok(())
}

// PushTwoLeftDeltaN
fn push_two_left_delta_n(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    fp.inc_last(br.read_ubitvar()? as i32 + 2);
    fp.push(br.read_ubitvarfp()? as i32);
    fp.push(br.read_ubitvarfp()? as i32);
    Ok(())
}

// PushTwoPack5LeftDeltaZero
fn push_two_pack5_left_delta_zero(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    fp.push(br.read_ubit64(5)? as i32);
    fp.push(br.read_ubit64(5)? as i32);
    Ok(())
}

// PushTwoPack5LeftDeltaOne
fn push_two_pack5_left_delta_one(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    fp.inc_last(1);
    fp.push(br.read_ubit64(5)? as i32);
    fp.push(br.read_ubit64(5)? as i32);
    Ok(())
}

// PushTwoPack5LeftDeltaN
fn push_two_pack5_left_delta_n(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    fp.inc_last(br.read_ubitvar()? as i32 + 2);
    fp.push(br.read_ubit64(5)? as i32);
    fp.push(br.read_ubit64(5)? as i32);
    Ok(())
}

// PushThreeLeftDeltaZero
fn push_three_left_delta_zero(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    fp.push(br.read_ubitvarfp()? as i32);
    fp.push(br.read_ubitvarfp()? as i32);
    fp.push(br.read_ubitvarfp()? as i32);
    Ok(())
}

// PushThreeLeftDeltaOne
fn push_three_left_delta_one(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    fp.inc_last(1);
    fp.push(br.read_ubitvarfp()? as i32);
    fp.push(br.read_ubitvarfp()? as i32);
    fp.push(br.read_ubitvarfp()? as i32);
    Ok(())
}

// PushThreeLeftDeltaN
fn push_three_left_delta_n(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    fp.inc_last(br.read_ubitvar()? as i32 + 2);
    fp.push(br.read_ubitvarfp()? as i32);
    fp.push(br.read_ubitvarfp()? as i32);
    fp.push(br.read_ubitvarfp()? as i32);
    Ok(())
}

// PushThreePack5LeftDeltaZero
fn push_three_pack5_left_delta_zero(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), BitError> {
    fp.push(br.read_ubit64(5)? as i32);
    fp.push(br.read_ubit64(5)? as i32);
    fp.push(br.read_ubit64(5)? as i32);
    Ok(())
}

// PushThreePack5LeftDeltaOne
fn push_three_pack5_left_delta_one(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    fp.inc_last(1);
    fp.push(br.read_ubit64(5)? as i32);
    fp.push(br.read_ubit64(5)? as i32);
    fp.push(br.read_ubit64(5)? as i32);
    Ok(())
}

// PushThreePack5LeftDeltaN
fn push_three_pack5_left_delta_n(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    fp.inc_last(br.read_ubitvar()? as i32 + 2);
    fp.push(br.read_ubit64(5)? as i32);
    fp.push(br.read_ubit64(5)? as i32);
    fp.push(br.read_ubit64(5)? as i32);
    Ok(())
}

// PushN
fn push_n(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    let n = br.read_ubitvar()? as usize;
    fp.inc_last(br.read_ubitvar()? as i32);
    for _ in 0..n {
        fp.push(br.read_ubitvarfp()? as i32);
    }
    Ok(())
}

// PushNAndNonTopographical
fn push_n_and_non_topographical(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    for i in 0..=fp.last {
        if br.read_bool()? {
            fp.inc_at(i, br.read_varint32()? + 1);
        }
    }
    let n = br.read_ubitvar()? as usize;
    for _ in 0..n {
        fp.push(br.read_ubitvarfp()? as i32);
    }
    Ok(())
}

// PopOnePlusOne
#[allow(clippy::unnecessary_wraps)]
fn pop_one_plus_one(fp: &mut FieldPath, _br: &mut BitReader) -> Result<(), BitError> {
    fp.pop(1);
    fp.inc_last(1);
    Ok(())
}

// PopOnePlusN
fn pop_one_plus_n(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    fp.pop(1);
    fp.inc_last(br.read_ubitvarfp()? as i32 + 1);
    Ok(())
}

// PopAllButOnePlusOne
#[allow(clippy::unnecessary_wraps)]
fn pop_all_but_one_plus_one(fp: &mut FieldPath, _br: &mut BitReader) -> Result<(), BitError> {
    fp.pop(fp.last);
    fp.inc_last(1);
    Ok(())
}

// PopAllButOnePlusN
fn pop_all_but_one_plus_n(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    fp.pop(fp.last);
    fp.inc_last(br.read_ubitvarfp()? as i32 + 1);
    Ok(())
}

// PopAllButOnePlusNPack3Bits
fn pop_all_but_one_plus_n_pack3_bits(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), BitError> {
    fp.pop(fp.last);
    fp.inc_last(br.read_ubit64(3)? as i32 + 1);
    Ok(())
}

// PopAllButOnePlusNPack6Bits
fn pop_all_but_one_plus_n_pack6_bits(
    fp: &mut FieldPath,
    br: &mut BitReader,
) -> Result<(), BitError> {
    fp.pop(fp.last);
    fp.inc_last(br.read_ubit64(6)? as i32 + 1);
    Ok(())
}

// PopNPlusOne
fn pop_n_plus_one(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    fp.pop(br.read_ubitvarfp()? as usize);
    fp.inc_last(1);
    Ok(())
}

// PopNPlusN
fn pop_n_plus_n(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    fp.pop(br.read_ubitvarfp()? as usize);
    fp.inc_last(br.read_varint32()?);
    Ok(())
}

// PopNAndNonTopographical
fn pop_n_and_non_topographical(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    fp.pop(br.read_ubitvarfp()? as usize);
    for i in 0..=fp.last {
        if br.read_bool()? {
            fp.inc_at(i, br.read_varint32()?);
        }
    }
    Ok(())
}

// NonTopoComplex
fn non_topo_complex(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    for i in 0..=fp.last {
        if br.read_bool()? {
            fp.inc_at(i, br.read_varint32()?);
        }
    }
    Ok(())
}

// NonTopoPenultimatePluseOne
#[allow(clippy::unnecessary_wraps)]
fn non_topo_penultimate_pluse_one(fp: &mut FieldPath, _br: &mut BitReader) -> Result<(), BitError> {
    fp.inc_at(fp.last - 1, 1);
    Ok(())
}

// NonTopoComplexPack4Bits
fn non_topo_complex_pack4_bits(fp: &mut FieldPath, br: &mut BitReader) -> Result<(), BitError> {
    for i in 0..=fp.last {
        if br.read_bool()? {
            fp.inc_at(i, br.read_ubit64(4)? as i32 - 7);
        }
    }
    Ok(())
}

// FieldPathEncodeFinish
#[allow(clippy::unnecessary_wraps)]
fn field_path_encode_finish(fp: &mut FieldPath, _br: &mut BitReader) -> Result<(), BitError> {
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
        left: Box<Node<T>>,
        right: Box<Node<T>>,
    },
}

impl<T: Debug> Node<T> {
    fn weight(&self) -> usize {
        match self {
            Self::Leaf { weight, .. } | Self::Branch { weight, .. } => *weight,
        }
    }

    fn num(&self) -> usize {
        match self {
            Self::Leaf { num, .. } | Self::Branch { num, .. } => *num,
        }
    }

    fn unwrap_left_branch(&self) -> &Self {
        match self {
            Self::Branch { left, .. } => left,
            _ => unreachable!(),
        }
    }

    fn unwrap_right_branch(&self) -> &Self {
        match self {
            Self::Branch { right, .. } => right,
            _ => unreachable!(),
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

fn build_fieldop_hierarchy() -> Node<FieldOp> {
    let mut bh = BinaryHeap::with_capacity(FIELDOP_DESCRIPTORS.len());

    // valve's huffman-tree uses a variation which takes the node number into account
    let mut num = 0;

    for fod in FIELDOP_DESCRIPTORS {
        bh.push(Node::Leaf {
            weight: fod.weight,
            num,
            value: fod.op,
        });
        num += 1;
    }

    while bh.len() > 1 {
        let left = bh.pop().unwrap();
        let right = bh.pop().unwrap();
        bh.push(Node::Branch {
            weight: left.weight() + right.weight(),
            num,
            left: Box::new(left),
            right: Box::new(right),
        });
        num += 1;
    }

    bh.pop().unwrap()
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

struct FlatTree {
    nodes: Vec<FlatBranch>,
    root: u32,
}

fn flatten_child(node: &Node<FieldOp>, out: &mut Vec<FlatBranch>) -> FlatChild {
    match node {
        Node::Leaf { value, .. } => FlatChild::Leaf(*value),
        Node::Branch { .. } => FlatChild::Branch(flatten_branch(node, out)),
    }
}

fn flatten_branch(node: &Node<FieldOp>, out: &mut Vec<FlatBranch>) -> u32 {
    let left = flatten_child(node.unwrap_left_branch(), out);
    let right = flatten_child(node.unwrap_right_branch(), out);
    let idx = out.len() as u32;
    out.push(FlatBranch { left, right });
    idx
}

static FIELDOP_TREE: LazyLock<FlatTree> = LazyLock::new(|| {
    let hierarchy = build_fieldop_hierarchy();
    let mut nodes = Vec::new();
    let root = flatten_branch(&hierarchy, &mut nodes);
    FlatTree { nodes, root }
});

pub(crate) fn read_field_paths(
    br: &mut BitReader,
    fps: &mut [FieldPath],
) -> Result<usize, BitError> {
    // NOTE: majority of field path reads are shorter then 32 (but some are beyond thousand).

    // Walking the huffman tree beats accumulating all the bits and doing a static lookup (like
    // butterfly does [1]): the hierarchical structure makes decisions on variable values, cutting
    // branch misses of the otherwise ~40-arm match.
    //
    // The tree is flattened into a contiguous array (`FlatTree`) with leaf children embedded in
    // their parent branch, so each bit costs a single array load instead of chasing a boxed-node
    // pointer — far friendlier to the cache than the original `Box<Node>` hierarchy.
    //
    // [1] https://github.com/ButterflyStats/butterfly/blob/339e91a882cadc1a8f72446616f7d7f1480c3791/src/butterfly/private/entity.cpp#L93

    let tree = &*FIELDOP_TREE;
    let nodes = tree.nodes.as_slice();
    let root = tree.root as usize;

    let mut fp = FieldPath::default();
    let mut i: usize = 0;

    let mut node = &nodes[root];

    loop {
        let child = if br.read_bool()? {
            &node.right
        } else {
            &node.left
        };

        match child {
            FlatChild::Leaf(op) => {
                (op)(&mut fp, br)?;
                if fp.finished {
                    return Ok(i);
                }
                fps[i] = fp.clone();

                i += 1;
                assert!(i <= fps.len());

                node = &nodes[root];
            }
            FlatChild::Branch(idx) => {
                node = &nodes[*idx as usize];
            }
        }
    }
}
