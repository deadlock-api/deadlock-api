use std::io::Cursor;
use std::sync::Arc;

use anyhow::bail;
use haste::broadcast::BroadcastFile;
use haste::demostream::DemoStream;
use prost::Message;
use valveprotos::common::EDemoCommands;
use valveprotos::deadlock::{CCitadelUserMsgPostMatchDetails, CitadelUserMessageIds};

fn process_post_match(details_buf: &[u8]) -> anyhow::Result<Vec<u8>> {
    let details = CCitadelUserMsgPostMatchDetails::decode(details_buf)?;

    let Some(meta_content) = details.match_details else {
        bail!("details doesn't have metadata content in it");
    };

    Ok(meta_content)
}

pub(crate) struct FragmentAnalysis {
    pub meta: Option<Vec<u8>>,
    pub has_end_command: bool,
}

pub(crate) async fn analyze_fragment(fragment_buf: Arc<[u8]>) -> anyhow::Result<FragmentAnalysis> {
    tokio::task::spawn_blocking(move || analyze_fragment_sync(fragment_buf)).await?
}

fn analyze_fragment_sync(fragment_buf: Arc<[u8]>) -> anyhow::Result<FragmentAnalysis> {
    let cursor = Cursor::new(fragment_buf);
    let mut demo_file = BroadcastFile::start_reading(cursor);
    let mut has_end_command = false;

    // let mut demo_file = haste::demofile::DemoFile::from_reader(cursor);
    loop {
        match demo_file.read_cmd_header() {
            Ok(cmd_header) => {
                if cmd_header.cmd == EDemoCommands::DemStop {
                    has_end_command = true;
                    break;
                }
                if cmd_header.cmd != EDemoCommands::DemPacket {
                    demo_file.skip_cmd(&cmd_header)?;
                    continue;
                }

                let d = demo_file.read_cmd(&cmd_header)?;

                let mut br = haste::bitreader::BitReader::new(d);

                let mut shared_msg_vec: Vec<u8> = vec![0u8; 2097152];
                while br.num_bits_left() > 8 {
                    let msg_type = br.read_ubitvar()?;

                    let size = br.read_uvarint32()? as usize;

                    if msg_type == 0 {
                        continue;
                    }

                    let msg_buf = &mut shared_msg_vec[..size];
                    br.read_bytes(msg_buf)?;
                    if msg_type == CitadelUserMessageIds::KEUserMsgPostMatchDetails as u32 {
                        let meta_content = process_post_match(msg_buf)?;
                        return Ok(FragmentAnalysis {
                            meta: Some(meta_content),
                            has_end_command,
                        });
                    }
                }
            }
            Err(err) => {
                if demo_file.is_at_eof().unwrap_or_default() {
                    break;
                }
                eprintln!("Got err: {err:?}");
                break;
            }
        }
    }

    Ok(FragmentAnalysis {
        meta: None,
        has_end_command,
    })
}
