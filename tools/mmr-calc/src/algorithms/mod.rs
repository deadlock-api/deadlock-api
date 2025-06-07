use crate::MMRType;
use crate::types::{MMR, Match};
use std::collections::HashMap;

pub(crate) mod basic;

pub trait Algorithm {
    fn run_regression(
        &self,
        match_: &Match,
        all_mmrs: &mut HashMap<u32, MMR>,
        mmr_type: MMRType,
    ) -> (Vec<MMR>, f32);
}
