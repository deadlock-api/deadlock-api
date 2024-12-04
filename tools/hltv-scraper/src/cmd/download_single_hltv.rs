use std::time::Instant;

use anyhow::Context;
use metrics::{counter, histogram};
use reqwest::blocking::Client;
use tracing::{debug, info, warn};
use valveprotos::deadlock::CMsgMatchMetaData;

use crate::{
    cmd::run_spectate_bot::SpectatedMatchType,
    hltv::{hltv_download, hltv_extract_meta::extract_meta_from_fragment},
};

pub fn download_single_hltv_meta(
    match_type: SpectatedMatchType,
    match_id: u64,
) -> anyhow::Result<Option<CMsgMatchMetaData>> {
    let start = Instant::now();
    let label = match_type.label();

    let client = Client::new();
    let recv = hltv_download::download_match_mpsc(
        client,
        "https://dist1-ord1.steamcontent.com/tv".to_string(),
        match_id,
    )
    .context("Error downloading match initialization")?;

    let mut fragment_count = 0;
    let mut did_receive_last_fragment = false;

    let mut total_byte_size = 0;

    let mut seen_first_fragment = false;

    let mut match_meta: Option<CMsgMatchMetaData> = None;
    for fragment in recv {
        let byte_size = fragment.fragment_contents.len();

        if fragment.fragment_n % 10 == 0 {
            debug!(
                "[{label} {match_id}] Got fragment {} {:?}",
                fragment.fragment_n, fragment.fragment_type
            );
        }

        if !seen_first_fragment {
            seen_first_fragment = true;
            histogram!("hltv.fragment.first_fragment_n").record(fragment.fragment_n as f64);
        }

        counter!("hltv.fragment.persisted").increment(1);
        if (fragment.has_match_meta || fragment.is_confirmed_last_fragment)
            && !did_receive_last_fragment
        {
            counter!("hltv.fragment.persisted_end").increment(1);
            histogram!("hltv.fragment.end_fragment_n").record(fragment.fragment_n as f64);
            did_receive_last_fragment = true;
        }
        if fragment.has_match_meta {
            counter!("hltv.fragment.persisted_meta").increment(1);
            histogram!("hltv.fragment.meta_fragment_n").record(fragment.fragment_n as f64);

            let match_meta_buf = extract_meta_from_fragment(&fragment.fragment_contents)
                .ok()
                .flatten();
            if let Some(match_meta_buf) = match_meta_buf {
                match_meta = Some(CMsgMatchMetaData {
                    version: Some(1),
                    match_details: Some(match_meta_buf),
                    match_id: Some(match_id),
                });
            }
        }
        fragment_count += 1;
        total_byte_size += byte_size;
    }
    let diff_secs = (Instant::now() - start).as_secs();
    let dur = format_duration(diff_secs);
    info!("[{label} {match_id}] Finished downloading! Took {dur}, {fragment_count} fragments.");

    histogram!("hltv.done.fragment_count").record(fragment_count);
    histogram!("hltv.done.duration_s").record(diff_secs as f64);
    histogram!("hltv.done.total_byte_size").record(total_byte_size as f64);

    counter!("hltv.done.success").increment(1);

    if !did_receive_last_fragment {
        warn!(
            "[{label} {match_id}] Download did not receive the last fragment, it expired before we got it."
        );
        counter!("hltv.done.incomplete").increment(1);
    }

    Ok(match_meta)
}

fn format_duration(seconds: u64) -> String {
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    let secs = seconds % 60;

    let mut result = String::new();

    if hours > 0 {
        result.push_str(&format!("{}h", hours));
    }
    if minutes > 0 {
        result.push_str(&format!("{}m", minutes));
    }
    if secs > 0 || result.is_empty() {
        result.push_str(&format!("{}s", secs));
    }

    result
}
