use haste::broadcast::BroadcastFile;
use haste::demostream::DemoStream;
use metrics::counter;
use reqwest::{Client, StatusCode};
use serde::Deserialize;
use std::thread::sleep;
use std::time::{Duration, Instant};
use std::{io::Cursor, sync::Arc};
use thiserror::Error;
use tokio::sync::mpsc::{channel, Receiver, Sender};
use tracing::{error, trace};
use valveprotos::common::EDemoCommands;

use crate::hltv::{hltv_extract_meta::extract_meta_from_fragment, FragmentType};

#[allow(unused)]
#[derive(Debug)]
pub struct HltvFragment {
    pub match_id: u64,
    pub fragment_n: u64,
    pub fragment_contents: Arc<[u8]>,
    pub fragment_type: FragmentType,
    pub is_confirmed_last_fragment: bool,
    pub has_match_meta: bool,
}

#[derive(Error, Debug)]
pub enum DownloadError {
    #[error("Network error: {0}")]
    NetworkError(#[from] reqwest::Error),
    #[error("JSON parsing error: {0}")]
    JsonError(#[from] serde_json::Error),
    #[error("Failed to get /sync after leniency period")]
    SyncNotAvailable(#[source] Option<reqwest::Error>),
    #[error("Fragment not found")]
    FragmentNotFound,
    #[error("Temporary error")]
    TemporaryError,
    #[error("Unexpected status code: {0}")]
    UnexpectedStatusCode(reqwest::StatusCode),
    #[error("Receiver dropped")]
    ReceiverDropped,
}

#[allow(unused)]
#[derive(Deserialize)]
struct SyncResponse {
    tick: u64,
    endtick: u64,
    maxtick: u64,
    rtdelay: f64,
    rcvage: f64,
    fragment: u64,
    signup_fragment: u64,
    tps: u64,
    keyframe_interval: u64,
    map: String,
    protocol: u64,
}

/// Downloads a match id, starting at the first `/full` fragment that the first `/sync` call says,
/// then /delta's afterwards.
///
/// The stream ends once either:
/// 1. A fragment with the `end` command chunk is identified
/// 2. `/sync` continues to 404 after at least 5 seconds of retries.
///
/// 404s of `/sync` are retried for at least 5 seconds. At the start of the download, they instead
/// have a 30s leniency to have a chance to startup.
///
/// 404s of fragments (`/<fragment>/full` and `/<fragment>/delta`) are continuously retried for as
/// long as the `/sync` endpoint stays alive.
///
/// General logic:
///
/// 1. Get `/sync` once with the leniency period. If the leniency period ends without a valid
///    `/sync`, return Err. Otherwise, return the receiver.
/// 2. Get the `/<fragment>/full` fragment at whatever starting fragment `/sync` responded with.
/// 3. Get the `/<fragment>/delta` fragment counting up from the first fragment. The first fragment
///    number should be called for *both* `/full` and `/delta`. Retry fragment
///    requests when they 404 with 1s in between calls.
/// 4. Stop once `check_fragment_has_end_command` returns true for a given fragment, or once `/sync` is confirmed to be gone as specified above.
/// 5. `is_confirmed_last_fragment` is only set if `check_fragment_has_end_command` was actually confirmed.
///
/// Fragment contents are the entire HTTP Get body of them.
///
/// Here are some sample valid urls of the /sync and fragments:
/// https://dist1-ord1.steamcontent.com/tv/17915135/sync
/// https://dist1-ord1.steamcontent.com/tv/17915135/48/full
/// https://dist1-ord1.steamcontent.com/tv/17915135/48/delta
/// https://dist1-ord1.steamcontent.com/tv/17915135/49/delta
/// ...
pub async fn download_match_mpsc(
    client: Client,
    prefix_url: String,
    match_id: u64,
) -> Result<Receiver<HltvFragment>, DownloadError> {
    let (sender, receiver) = channel::<HltvFragment>(100);

    let sync_url = format!("{}/{}/sync", prefix_url, match_id);

    let sync_response: SyncResponse = get_initial_sync(&client, &sync_url).await?;

    let fragment_start = sync_response.fragment;

    let prefix_url_clone = prefix_url.clone();
    let sync_url_clone = sync_url.clone();
    let sender_clone = sender.clone();

    tokio::spawn(async move {
        if let Err(e) = fragment_fetching_loop(
            &client,
            prefix_url_clone,
            match_id,
            fragment_start,
            sender_clone,
            sync_url_clone,
        )
        .await
        {
            error!("Error in fragment fetching loop: {:?}", e);
        }
    });

    Ok(receiver)
}

/// Helper function to get the initial `/sync` with a 30s leniency period.
async fn get_initial_sync(client: &Client, sync_url: &str) -> Result<SyncResponse, DownloadError> {
    let start_time = Instant::now();

    loop {
        match client.get(sync_url).send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    counter!("hltv.initial_sync.http.2xx").increment(1);
                    let sync_response = resp.json::<SyncResponse>().await?;
                    trace!("Got successful /sync response {sync_url}");
                    return Ok(sync_response);
                } else if resp.status() == reqwest::StatusCode::NOT_FOUND
                    || resp.status() == StatusCode::METHOD_NOT_ALLOWED
                {
                    counter!(format!("hltv.initial_sync.http.{}", resp.status().as_u16()))
                        .increment(1);
                    if Instant::now() - start_time >= Duration::from_secs(120) {
                        return Err(DownloadError::SyncNotAvailable(
                            resp.error_for_status().err(),
                        ));
                    }
                    sleep(Duration::from_secs(10));
                    continue;
                } else {
                    return Err(DownloadError::UnexpectedStatusCode(resp.status()));
                }
            }
            Err(_) => {
                if Instant::now() - start_time >= Duration::from_secs(30) {
                    return Err(DownloadError::SyncNotAvailable(None));
                }
                sleep(Duration::from_secs(1));
                continue;
            }
        }
    }
}

/// Main loop to fetch fragments and send them via the channel.
async fn fragment_fetching_loop(
    client: &Client,
    prefix_url: String,
    match_id: u64,
    first_fragment_n: u64,
    sender: Sender<HltvFragment>,
    sync_url: String,
) -> Result<(), DownloadError> {
    let mut sync_available = true;

    let mut fragment_n = first_fragment_n;

    let mut hard_retry = false;
    while sync_available {
        if hard_retry {
            let sync_response: SyncResponse = get_initial_sync(client, &sync_url).await?;
            if sync_response.fragment > fragment_n {
                fragment_n = sync_response.fragment;
            }
        } else {
            // Check if /sync is still available
            sync_available = check_sync_availability(client, &sync_url).await;
            if !sync_available {
                break;
            }
        }

        let is_first_fragment = fragment_n == first_fragment_n;

        let fragment_types = if is_first_fragment {
            vec![FragmentType::Full, FragmentType::Delta]
        } else {
            vec![FragmentType::Delta]
        };

        for fragment_type in fragment_types {
            let mut retry_count = 0;
            loop {
                match download_match_fragment(
                    prefix_url.clone(),
                    match_id,
                    fragment_n,
                    fragment_type,
                )
                .await
                {
                    Ok(fragment_contents) => {
                        let contents: Arc<[u8]> = fragment_contents.into();
                        counter!("hltv.fragment.success").increment(1);
                        retry_count = 0;
                        let is_confirmed_last_fragment =
                            check_fragment_has_end_command(contents.clone()).await;

                        let has_meta = extract_meta_from_fragment(contents.clone())
                            .await
                            .map(|x| x.is_some())
                            .unwrap_or(false);

                        let hltv_fragment = HltvFragment {
                            match_id,
                            fragment_n,
                            fragment_contents: contents,
                            fragment_type,
                            is_confirmed_last_fragment,
                            has_match_meta: has_meta,
                        };

                        sender
                            .send(hltv_fragment)
                            .await
                            .map_err(|_| DownloadError::ReceiverDropped)?;

                        if is_confirmed_last_fragment || has_meta {
                            return Ok(());
                        }

                        break;
                    }
                    Err(e) => match e {
                        DownloadError::FragmentNotFound => {
                            counter!("hltv.fragment.error.not_found").increment(1);
                            // warn!("[{match_id} {fragment_n}] Got 404");
                            retry_count += 1;

                            // minimum 4 sec wait time
                            sleep(Duration::from_secs((2 * retry_count).max(4)));

                            if retry_count > 1 {
                                trace!("Retry #{retry_count} - checking sync availability...");
                                // Check if /sync is still available
                                sync_available = check_sync_availability(client, &sync_url).await;
                                if !sync_available {
                                    break;
                                } else if retry_count > 5 {
                                    counter!("hltv.fragment.error.many_retries_failed")
                                        .increment(1);
                                    error!("[{match_id} {fragment_n}] still 404 after 5 retries");
                                    hard_retry = true;
                                    break;
                                }
                            }
                            continue;
                        }
                        DownloadError::NetworkError(e) => {
                            counter!("hltv.fragment.error.network_error").increment(1);
                            error!("[{match_id} {fragment_n}] Network error: {e:?}");
                            sleep(Duration::from_secs(1));
                            continue;
                        }
                        _ => {
                            return Err(e);
                        }
                    },
                }
            }

            if !sync_available {
                break;
            }
        }

        fragment_n += 1;
    }

    Ok(())
}

/// Checks if `/sync` is still available with a 5s retry period.
async fn check_sync_availability(client: &Client, sync_url: &str) -> bool {
    let start_time = Instant::now();

    loop {
        match client.get(sync_url).send().await {
            Ok(resp) => {
                if resp.status().is_success() {
                    return true;
                } else if resp.status() == reqwest::StatusCode::NOT_FOUND {
                    counter!("hltv.sync.http.404").increment(1);
                    if Instant::now() - start_time >= Duration::from_secs(20) {
                        return false;
                    }
                    sleep(Duration::from_secs(2));
                    continue;
                } else if resp.status() == reqwest::StatusCode::METHOD_NOT_ALLOWED {
                    counter!("hltv.sync.http.405").increment(1);
                    if Instant::now() - start_time >= Duration::from_secs(45) {
                        return false;
                    }
                    sleep(Duration::from_secs(20));
                    continue;
                } else {
                    return false;
                }
            }
            Err(_) => {
                if Instant::now() - start_time >= Duration::from_secs(5) {
                    return false;
                }
                sleep(Duration::from_secs(2));
                continue;
            }
        }
    }
}

/// Download a specific fragment from a match
///
/// Returns an error in case of a 404.
pub async fn download_match_fragment(
    prefix_url: String,
    match_id: u64,
    fragment_n: u64,
    fragment_type: FragmentType,
) -> Result<Vec<u8>, DownloadError> {
    let client = Client::new();
    let fragment_url = format!(
        "{}/{}/{}/{}",
        prefix_url,
        match_id,
        fragment_n,
        fragment_type.as_str()
    );

    trace!("Downloading match fragment: {fragment_url}");
    let resp = client.get(&fragment_url).send().await?;

    if resp.status().is_success() {
        counter!("hltv.fragment.http.2xx").increment(1);
        let bytes = resp.bytes().await?;
        Ok(bytes.to_vec())
    } else if resp.status() == reqwest::StatusCode::NOT_FOUND {
        counter!("hltv.fragment.http.404").increment(1);
        Err(DownloadError::FragmentNotFound)
    } else if resp.status() == reqwest::StatusCode::METHOD_NOT_ALLOWED {
        counter!("hltv.fragment.http.405").increment(1);
        Err(DownloadError::TemporaryError)
    } else {
        Err(DownloadError::UnexpectedStatusCode(resp.status()))
    }
}

pub async fn check_fragment_has_end_command(fragment_contents: Arc<[u8]>) -> bool {
    tokio::task::spawn_blocking(move || check_fragment_has_end_command_sync(fragment_contents))
        .await
        .expect("Should not fail")
}
fn check_fragment_has_end_command_sync(fragment_contents: Arc<[u8]>) -> bool {
    let cursor = Cursor::new(&fragment_contents[..]);

    let mut demo_file = BroadcastFile::start_reading(cursor);

    let mut count = 0;
    loop {
        match demo_file.read_cmd_header() {
            Ok(cmd_header) => {
                count += 1;
                if cmd_header.cmd == EDemoCommands::DemStop {
                    return true;
                }
                // cmd_header.cmd
                if let Err(e) = demo_file.skip_cmd(&cmd_header) {
                    error!(
                        "Got error skipping cmd body #{}, cmd type {:?}: {:?}",
                        count, cmd_header.cmd, e
                    );
                    return false;
                };
            }
            Err(err) => {
                if demo_file.is_at_eof().unwrap_or_default() {
                    // Tick rate is 60, so a delta file which has count < 60
                    // if count < 60 && fragment_type == FragmentType::Delta {
                    //     return true;
                    // }

                    return false;
                }
                error!("Got error processing fragmemt cmd #{}: {:?}", count, err);
                return false;
            }
        }
    }
}
