//! Makes room in the pack bucket, which sits at Hetzner's 50M-object cap: moves loose files to
//! the main bucket (GET, conditional PUT, md5 check, DELETE). Readers look in the main bucket
//! first, so a moved file stays readable throughout. Its queue row is dropped; the next main
//! bucket inventory lists it there.

use futures::{StreamExt as _, TryStreamExt as _};
use md5::{Digest as _, Md5};
use metadata_packs::format::parse_md5_etag;
use metadata_packs::parse_source_key;
use object_store::path::Path;
use object_store::{ObjectStoreExt as _, PutMode, PutOptions, PutPayload};
use tracing::{info, warn};

use crate::{Ctx, Error};

pub(crate) async fn make_room(ctx: &Ctx, count: usize) -> Result<usize, Error> {
    let keys: Vec<Path> = ctx
        .packs
        .store
        .list(Some(&Path::from("processed/metadata")))
        .try_filter(|meta| {
            futures::future::ready(parse_source_key(meta.location.as_ref()).is_some())
        })
        .map_ok(|meta| meta.location)
        .take(count)
        .try_collect()
        .await?;
    info!("Moving {} files", keys.len());
    let moved: Vec<bool> = futures::stream::iter(keys)
        .map(|key| async move {
            match move_one(ctx, &key).await {
                Ok(()) => true,
                Err(e) => {
                    warn!("Could not move {key}: {e}");
                    false
                }
            }
        })
        .buffer_unordered(16)
        .collect()
        .await;
    Ok(moved.into_iter().filter(|ok| *ok).count())
}

async fn move_one(ctx: &Ctx, key: &Path) -> Result<(), Error> {
    ctx.limiter.acquire().await;
    let get = ctx.packs.store.get(key).await?;
    let etag = get.meta.e_tag.clone();
    let data = get.bytes().await?;
    let md5: [u8; 16] = Md5::digest(&data).into();
    if etag
        .as_deref()
        .and_then(parse_md5_etag)
        .is_some_and(|e| e != md5)
    {
        return Err(Error::Failed(format!("{key}: md5 does not match its ETag")));
    }
    ctx.limiter.acquire().await;
    let put = ctx
        .main
        .store
        .put_opts(
            key,
            PutPayload::from(data),
            PutOptions {
                mode: PutMode::Create,
                ..PutOptions::default()
            },
        )
        .await;
    match put {
        Ok(_) => {}
        Err(object_store::Error::AlreadyExists { .. }) => {
            ctx.limiter.acquire().await;
            let existing = ctx.main.store.head(key).await?;
            if existing.e_tag.as_deref().and_then(parse_md5_etag) != Some(md5) {
                return Err(Error::Failed(format!(
                    "{key} exists in {} with other bytes, leaving both",
                    ctx.main.name
                )));
            }
        }
        Err(e) => return Err(e.into()),
    }
    ctx.limiter.acquire().await;
    let copy = ctx.main.store.head(key).await?;
    if copy.e_tag.as_deref().and_then(parse_md5_etag) != Some(md5) {
        return Err(Error::Failed(format!(
            "{key}: the copy's ETag does not match"
        )));
    }
    ctx.limiter.acquire().await;
    ctx.packs.store.delete(key).await?;
    sqlx::query("DELETE FROM metadata_pack_sources WHERE bucket = $1 AND key = $2")
        .bind(&ctx.packs.name)
        .bind(key.as_ref())
        .execute(ctx.pg())
        .await?;
    Ok(())
}
