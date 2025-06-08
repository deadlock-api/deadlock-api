use crate::MMRType;
use crate::types::{MMR, Match};
use serde_repr::{Deserialize_repr, Serialize_repr};
use std::collections::HashMap;
use crate::algorithms::linear_regression::LinearRegression;

pub(crate) mod linear_regression;

#[derive(
    Serialize_repr, Deserialize_repr, Copy, Clone, Debug, Default, PartialEq, Eq, clap::ValueEnum,
)]
#[repr(u8)]
pub enum AlgorithmType {
    #[default]
    LinearRegression = 0,
}

impl AlgorithmType {
    pub fn get_algorithm(&self) -> impl Algorithm {
        match self {
            Self::LinearRegression => LinearRegression,
        }
    }
}

pub trait Algorithm: Default {
    fn run_regression(
        &self,
        match_: &Match,
        all_mmrs: &mut HashMap<u32, MMR>,
        mmr_type: MMRType,
    ) -> (Vec<MMR>, f64);
}
