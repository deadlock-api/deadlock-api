use crate::MMRType;
use crate::types::{MMR, Match};
use serde_repr::{Deserialize_repr, Serialize_repr};
use std::collections::HashMap;

pub(crate) mod basic;

#[derive(
    Serialize_repr, Deserialize_repr, Copy, Clone, Debug, Default, PartialEq, Eq, clap::ValueEnum,
)]
#[repr(u8)]
pub enum AlgorithmType {
    #[default]
    Basic = 0,
}

pub trait Algorithm {
    fn run_regression(
        &self,
        match_: &Match,
        all_mmrs: &mut HashMap<u32, MMR>,
        mmr_type: MMRType,
    ) -> (Vec<MMR>, f32);
}
