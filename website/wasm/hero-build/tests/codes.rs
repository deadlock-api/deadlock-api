#![cfg_attr(
    test,
    allow(
        clippy::arithmetic_side_effects,
        clippy::disallowed_macros,
        clippy::disallowed_methods,
        clippy::expect_used,
        clippy::indexing_slicing,
        clippy::panic,
        clippy::panic_in_result_fn,
        clippy::print_stderr,
        clippy::print_stdout,
        clippy::string_slice,
        clippy::unreachable,
        clippy::unwrap_in_result,
        clippy::unwrap_used,
        reason = "tests may panic"
    )
)]
use hero_build::{decode, decode_json, encode, encode_json};

/// Copied in game from "Copy of [Default Nurse Harrow Build]".
const NURSE_HARROW: &str = include_str!("fixtures/nurse-harrow.txt");

#[test]
fn decodes_a_code_copied_in_game() {
    let build = decode(NURSE_HARROW).unwrap();
    assert_eq!(build.hero_id, Some(87));
    assert_eq!(
        build.name.as_deref(),
        Some("Copy of [Default Nurse Harrow Build]")
    );
    let details = build.details.unwrap();
    let categories: Vec<_> = details
        .mod_categories
        .iter()
        .map(|c| (c.name.as_deref().unwrap(), c.mods.len()))
        .collect();
    assert_eq!(
        categories,
        [
            ("#Citadel_HeroBuilds_EarlyGame", 10),
            ("#Citadel_HeroBuilds_MidGame", 8),
            ("#Citadel_HeroBuilds_LateGame", 7),
        ]
    );
    let early = &details.mod_categories[0].mods;
    assert_eq!(early[0].ability_id, Some(2_829_638_276));
    assert_eq!(early[8].imbue_target_ability_id, Some(267_712_790));
    assert_ne!(
        details.ability_order.unwrap().currency_changes,
        [] as [valveprotos::deadlock::c_msg_hero_build::CurrencyChange; 0]
    );
}

#[test]
fn tolerates_wrapped_and_unpadded_pastes() {
    let wrapped: String = NURSE_HARROW
        .trim()
        .trim_end_matches('=')
        .as_bytes()
        .chunks(60)
        .flat_map(|line| [core::str::from_utf8(line).unwrap(), "\n"])
        .collect();
    assert_eq!(decode(&wrapped).unwrap(), decode(NURSE_HARROW).unwrap());
}

#[test]
fn encoded_builds_decode_to_themselves() {
    let build = decode(NURSE_HARROW).unwrap();
    assert_eq!(decode(&encode(&build)).unwrap(), build);
}

#[test]
fn json_round_trips() {
    let json = decode_json(NURSE_HARROW).unwrap();
    assert_eq!(decode_json(&encode_json(&json).unwrap()).unwrap(), json);
}

#[test]
fn encoded_frames_carry_their_content_size() {
    // The game's own codes declare the decompressed size in the frame header; ours do too, so a
    // reader that sizes its buffer from it accepts them.
    use base64::Engine as _;
    let code = encode(&decode(NURSE_HARROW).unwrap());
    let frame = base64::engine::general_purpose::STANDARD
        .decode(code)
        .unwrap();
    // Frame_Header_Descriptor, after the 4-byte magic: a size flag or the single-segment bit means
    // a size field.
    let descriptor = frame[4];
    assert!(
        descriptor >> 6 != 0 || descriptor & 0b0010_0000 != 0,
        "descriptor {descriptor:#010b}"
    );
}

#[test]
fn rejects_what_is_not_a_code() {
    decode("hello world").unwrap_err();
    decode("aGVsbG8gd29ybGQ=").unwrap_err();
    encode_json("{}").unwrap_err();
}
