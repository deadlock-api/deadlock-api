//! The damage matrix columns of a match's `match_player` rows, built as the ingest builds them.
//!
//! These are `damage_matrix.*` and `slot_hero_ids`. The metadata-packer writes them to a staging
//! table for matches ingested before those columns existed; a mutation then fills them into
//! `match_player`.

use clickhouse::Row;
use serde::Serialize;
use valveprotos::deadlock::c_msg_match_meta_data_contents::EMatchOutcome;

use crate::{build_ch_players, decompress, parse_match_data};

/// One `match_player` row's damage matrix columns, keyed like the row.
#[derive(Row, Debug, Clone, Serialize)]
pub struct DamageMatrixRow {
    pub match_id: u64,
    pub account_id: u32,
    /// `DamageMatrixStat` values (the column is an `Enum8`).
    #[serde(rename = "damage_matrix.stat_type")]
    pub stat_type: Vec<i8>,
    #[serde(rename = "damage_matrix.source")]
    pub source: Vec<String>,
    #[serde(rename = "damage_matrix.dealer_slot")]
    pub dealer_slot: Vec<u8>,
    #[serde(rename = "damage_matrix.target_slot")]
    pub target_slot: Vec<u8>,
    #[serde(rename = "damage_matrix.value")]
    pub value: Vec<u32>,
    #[serde(rename = "damage_matrix.mitigated")]
    pub mitigated: Vec<u32>,
    #[serde(rename = "damage_matrix.lethal")]
    pub lethal: Vec<u32>,
    pub slot_hero_ids: Vec<u8>,
}

/// Why a metadata file yields no rows.
#[derive(Debug, thiserror::Error)]
#[error("unreadable match metadata: {0}")]
pub struct UnreadableMatch(String);

/// The damage matrix columns of every row the ingest writes for this metadata file (compressed
/// as stored). A match with an error outcome has no rows, so it yields none.
pub fn damage_matrix_rows(data: &[u8]) -> Result<Vec<DamageMatrixRow>, UnreadableMatch> {
    let decompressed = decompress(data).map_err(|e| UnreadableMatch(e.to_string()))?;
    let match_info = parse_match_data(&decompressed).map_err(|e| UnreadableMatch(e.to_string()))?;
    if match_info.match_outcome == Some(EMatchOutcome::KEOutcomeError as i32) {
        return Ok(Vec::new());
    }
    Ok(build_ch_players(&match_info)
        .into_iter()
        .map(|row| DamageMatrixRow {
            match_id: row.match_id,
            account_id: row.account_id,
            stat_type: row
                .damage_matrix_stat_type
                .iter()
                .map(|stat| *stat as i8)
                .collect(),
            source: row.damage_matrix_source,
            dealer_slot: row.damage_matrix_dealer_slot,
            target_slot: row.damage_matrix_target_slot,
            value: row.damage_matrix_value,
            mitigated: row.damage_matrix_mitigated,
            lethal: row.damage_matrix_lethal,
            slot_hero_ids: row.slot_hero_ids,
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use prost::Message as _;
    use valveprotos::deadlock::{CMsgMatchMetaData, CMsgMatchMetaDataContents};

    use super::*;
    use crate::models::clickhouse_match_metadata::tests::damage_matrix_match;

    fn file(
        match_info: valveprotos::deadlock::c_msg_match_meta_data_contents::MatchInfo,
    ) -> Vec<u8> {
        // As Valve ships them: the contents inside CMsgMatchMetaData, zstd-compressed.
        let contents = CMsgMatchMetaDataContents {
            match_info: Some(match_info),
        };
        let file = CMsgMatchMetaData {
            match_details: Some(contents.encode_to_vec()),
            ..Default::default()
        };
        zstd::encode_all(file.encode_to_vec().as_slice(), 3).unwrap()
    }

    #[test]
    fn rows_carry_the_ingested_damage_matrix() {
        let mut match_info = damage_matrix_match();
        match_info.match_id = Some(42);
        for (player, account) in match_info.players.iter_mut().zip([100, 200, 0]) {
            player.account_id = Some(account);
        }
        let rows = damage_matrix_rows(&file(match_info)).unwrap();

        // the anonymous player (account 0) has no row, like in the ingest
        let accounts: Vec<u32> = rows.iter().map(|r| r.account_id).collect();
        assert_eq!(accounts, [100, 200]);
        let row = &rows[0];
        assert_eq!(row.match_id, 42);
        assert_eq!(row.stat_type, [0, 0, 6, 0]);
        assert_eq!(row.source, ["Bullet", "Bullet", "Stun", "Bullet"]);
        assert_eq!(row.dealer_slot, [1, 1, 1, 0]);
        assert_eq!(row.target_slot, [0, 7, 7, 1]);
        assert_eq!(row.value, [5, 50, 1500, 8]);
        assert_eq!(row.mitigated, [0, 12, 0, 0]);
        assert_eq!(row.lethal, [0, 20, 0, 0]);
        assert_eq!(row.slot_hero_ids, [0, 7, 15, 0, 0, 0, 0, 2]);
    }

    #[test]
    fn error_outcomes_and_garbage() {
        let mut match_info = damage_matrix_match();
        match_info.match_outcome = Some(EMatchOutcome::KEOutcomeError as i32);
        for player in &mut match_info.players {
            player.account_id = Some(1);
        }
        assert!(damage_matrix_rows(&file(match_info)).unwrap().is_empty());
        damage_matrix_rows(b"BZh9 not really bzip2").unwrap_err();
    }
}
