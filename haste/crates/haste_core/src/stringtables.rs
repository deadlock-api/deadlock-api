use core::hash::BuildHasherDefault;
use std::sync::Arc;

use dungers::bitbuf::BitError;
use hashbrown::HashMap;
use nohash::NoHashHasher;
use sync_unsafe_cell::SyncUnsafeCell;
use thiserror::Error;
use valveprotos::common::{CDemoStringTables, c_demo_string_tables};

use crate::bitreader::BitReader;

// NOTE: some info about string tables is available at
// https://developer.valvesoftware.com/wiki/Networking_Events_%26_Messages#String_Tables

const HISTORY_SIZE: usize = 32;
const HISTORY_BITMASK: usize = HISTORY_SIZE - 1;

const MAX_STRING_BITS: usize = 5;
const MAX_STRING_SIZE: usize = 1 << MAX_STRING_BITS;

#[derive(Debug, Clone)]
struct StringHistoryEntry {
    string: [u8; MAX_STRING_SIZE],
}

impl StringHistoryEntry {
    fn new() -> Self {
        Self {
            string: [0; MAX_STRING_SIZE],
        }
    }
}

impl Default for StringHistoryEntry {
    fn default() -> Self {
        Self::new()
    }
}

const MAX_USERDATA_BITS: usize = 17;
const MAX_USERDATA_SIZE: usize = 1 << MAX_USERDATA_BITS;

#[derive(Error, Debug)]
pub enum StringTableError {
    #[error(transparent)]
    Decompress(#[from] snap::Error),
    #[error(transparent)]
    BitReader(#[from] BitError),
}

pub struct StringTableItem {
    pub string: Option<Vec<u8>>,
    pub user_data: Option<Arc<SyncUnsafeCell<Vec<u8>>>>,
}

impl StringTableItem {
    #[must_use]
    pub fn get_string(&self) -> Option<&[u8]> {
        self.string.as_deref()
    }

    #[must_use]
    pub fn get_user_data(&self) -> Option<Vec<u8>> {
        self.user_data.as_ref().map(|arc_cell| {
            // This is an unsafe block because we are accessing the inner data
            // through a raw pointer. We must ensure that this access is
            // sound (e.g., no other thread is writing to it at the same time).
            #[allow(unsafe_code)]
            unsafe {
                // Get the raw pointer to the inner Vec<u8>
                let ptr = arc_cell.get();
                // Dereference the pointer to get a reference to the Vec<u8>
                let vec_ref = &*ptr;
                // Clone the Vec<u8> to create a new, owned copy
                vec_ref.clone()
            }
        })
    }
}

pub struct StringTable {
    name: Box<str>,
    user_data_fixed_size: bool,
    user_data_size: i32,
    user_data_size_bits: i32,
    flags: i32,
    using_varint_bitcounts: bool,

    items: HashMap<i32, StringTableItem, BuildHasherDefault<NoHashHasher<i32>>>,

    history: Vec<StringHistoryEntry>,
    string_buf: Vec<u8>,
    user_data_buf: Vec<u8>,
    user_data_uncompressed_buf: Vec<u8>,
}

impl StringTable {
    #[must_use]
    pub fn new(
        name: &str,
        user_data_fixed_size: bool,
        user_data_size: i32,
        user_data_size_bits: i32,
        flags: i32,
        using_varint_bitcounts: bool,
    ) -> Self {
        fn make_vec<T: Default + Clone>(size: usize) -> Vec<T> {
            vec![T::default(); size]
        }

        Self {
            name: name.into(),
            user_data_fixed_size,
            user_data_size,
            user_data_size_bits,
            flags,
            using_varint_bitcounts,
            items: HashMap::with_capacity_and_hasher(1024, BuildHasherDefault::default()),

            history: make_vec(HISTORY_SIZE),
            string_buf: make_vec(1024),
            user_data_buf: make_vec(MAX_USERDATA_SIZE),
            user_data_uncompressed_buf: make_vec(MAX_USERDATA_SIZE),
        }
    }

    // void ParseUpdate( bf_read &buf, int entries );
    //
    // some pieces are ported from csgo, some are stolen from butterfly, some
    // comments are stolen from manta.
    pub fn parse_update(
        &mut self,
        br: &mut BitReader,
        num_entries: i32,
    ) -> Result<(), StringTableError> {
        let mut entry_index: i32 = -1;

        // TODO: feature flag or something for a static allocation of history,
        // string_buf and user_data_buf in single threaded environment (similar
        // to what butterfly does).
        // NOTE: making thing static wins us 10ms

        // > cost of zero-initializing a buffer of 1024 bytes on the stack can
        // be disproportionately high
        // https://www.reddit.com/r/rust/comments/9ozddb/comment/e7z2qi1/?utm_source=share&utm_medium=web2x&context=3

        let history = &mut self.history;
        let mut history_delta_index: usize = 0;

        let string_buf = &mut self.string_buf;
        let user_data_buf = &mut self.user_data_buf;
        let user_data_uncompressed_buf = &mut self.user_data_uncompressed_buf;

        // Loop through entries in the data structure
        //
        // Each entry is a tuple consisting of {index, key, value}
        //
        // Index can either be incremented from the previous position or
        // overwritten with a given entry.
        //
        // Key may be omitted (will be represented here as "")
        //
        // Value may be omitted
        for _ in 0..num_entries as usize {
            // Read a boolean to determine whether the operation is an increment
            // or has a fixed index position. A fixed index position of zero
            // should be the last data in the buffer, and indicates that all
            // data has been read.
            entry_index = if br.read_bool()? {
                entry_index + 1
            } else {
                br.read_uvarint32()? as i32 + 1
            };

            let has_string = br.read_bool()?;
            let string = if has_string {
                let mut size: usize = 0;

                // Some entries use reference a position in the key history for
                // part of the key. If referencing the history, read the
                // position and size from the buffer, then use those to build
                // the string combined with an extra string read (null
                // terminated). Alternatively, just read the string.
                if br.read_bool()? {
                    // NOTE: valve uses their CUtlVector which shifts elements
                    // to the left on delete. they maintain max len of 32. they
                    // don't allow history to grow beyond 32 elements, once it
                    // reaches len of 32 they remove item at index 0. i'm
                    // stealing following approach from butterfly, even thought
                    // rust's Vec has remove method which does exactly same
                    // thing, butterfly's way is more efficient, thanks!
                    let mut history_delta_zero = 0;
                    if history_delta_index > HISTORY_SIZE {
                        history_delta_zero = history_delta_index & HISTORY_BITMASK;
                    }

                    let index =
                        (history_delta_zero + br.read_ubit64(5)? as usize) & HISTORY_BITMASK;
                    let bytestocopy = br.read_ubit64(MAX_STRING_BITS)? as usize;
                    size += bytestocopy;

                    string_buf[..bytestocopy]
                        .copy_from_slice(&history[index].string[..bytestocopy]);
                    size += br.read_string(&mut string_buf[bytestocopy..], false)?;
                } else {
                    size += br.read_string(string_buf, false)?;
                }

                let mut she = StringHistoryEntry::default();
                she.string.copy_from_slice(&string_buf[..MAX_STRING_SIZE]);

                history[history_delta_index & HISTORY_BITMASK] = she;
                history_delta_index += 1;

                Some(&string_buf[..size])
            } else {
                None
            };

            let has_user_data = br.read_bool()?;
            let user_data = if has_user_data {
                if self.user_data_fixed_size {
                    // Don't need to read length, it's fixed length and the length was networked down already.
                    br.read_bits(user_data_buf, self.user_data_size_bits as usize)?;
                    Some(&user_data_buf[..self.user_data_size as usize])
                } else {
                    let mut is_compressed = false;
                    if (self.flags & 0x1) != 0 {
                        is_compressed = br.read_bool()?;
                    }

                    // NOTE: using_varint_bitcounts bool was introduced in the
                    // new frontiers update on smaypril twemmieth of 2023,
                    // https://github.com/SteamDatabase/GameTracking-Dota2/commit/8851e24f0e3ef0b618e3a60d276a3b0baf88568c#diff-79c9dd229c77c85f462d6d85e29a65f5daf6bf31f199554438d42bd643e89448R405
                    let size = if self.using_varint_bitcounts {
                        br.read_ubitvar()? as usize
                    } else {
                        br.read_ubit64(MAX_USERDATA_BITS)? as usize
                    };

                    br.read_bytes(&mut user_data_buf[..size])?;

                    if is_compressed {
                        snap::raw::Decoder::new()
                            .decompress(&user_data_buf[..size], user_data_uncompressed_buf)?;
                        let size = snap::raw::decompress_len(user_data_buf)?;
                        Some(&user_data_uncompressed_buf[..size])
                    } else {
                        Some(&user_data_buf[..size])
                    }
                }
            } else {
                None
            };

            self.items
                .entry(entry_index)
                .and_modify(|entry| {
                    if let Some(dst_container) = entry.user_data.as_ref() {
                        if let Some(src) = user_data {
                            #[allow(unsafe_code)]
                            let dst = unsafe { dst_container.get().as_mut().unwrap_unchecked() };
                            dst.resize(src.len(), 0);
                            dst.clone_from_slice(src);
                        }
                    } else {
                        entry.user_data =
                            user_data.map(|v| Arc::new(SyncUnsafeCell::new(v.to_vec())));
                    }
                })
                .or_insert_with(|| StringTableItem {
                    string: string.map(|src| {
                        let mut dst = Vec::with_capacity(src.len());
                        dst.extend_from_slice(src);
                        dst
                    }),
                    user_data: user_data.map(|v| Arc::new(SyncUnsafeCell::new(v.to_vec()))),
                });
        }

        Ok(())
    }

    pub fn do_full_update(&mut self, table: &c_demo_string_tables::TableT) {
        debug_assert!(
            self.name.as_ref().eq(table.table_name()),
            "trying to do a full update on the wrong table"
        );
        // copying clarity's behaviour
        // src/main/java/skadistats/clarity/processor/stringtables/BaseStringTableEmitter.java
        debug_assert!(
            table.items.len() >= self.items.len(),
            "removing entries is not supported"
        );

        for (i, incoming) in table.items.iter().enumerate() {
            self.items
                .entry(i as i32)
                .and_modify(|existing| {
                    existing.user_data = incoming
                        .data
                        .as_ref()
                        .map(|data| Arc::new(SyncUnsafeCell::new(data.clone())));
                })
                .or_insert_with(|| StringTableItem {
                    string: incoming.str.as_ref().map(|v| v.as_bytes().to_vec()),
                    user_data: incoming
                        .data
                        .as_ref()
                        .map(|data| Arc::new(SyncUnsafeCell::new(data.clone()))),
                });
        }
    }

    // NOTE: might need those for fast seeks
    // // HLTV change history & rollback
    // void EnableRollback();
    // void RestoreTick(int tick);

    #[must_use]
    pub fn name(&self) -> &str {
        self.name.as_ref()
    }

    pub fn items(&self) -> impl Iterator<Item = (&i32, &StringTableItem)> {
        self.items.iter()
    }

    #[must_use]
    pub fn get_item(&self, entry_index: &i32) -> Option<&StringTableItem> {
        self.items.get(entry_index)
    }
}

// NOTE: this is modelled after CNetworkStringTableContainer
#[derive(Default)]
pub struct StringTableContainer {
    tables: Vec<StringTable>,
}

impl StringTableContainer {
    // INetworkStringTable *CreateStringTable( const char *tableName, int maxentries, int userdatafixedsize = 0, int userdatanetworkbits = 0, int flags = NSF_NONE );
    pub fn create_string_table_mut(
        &mut self,
        name: &str,
        user_data_fixed_size: bool,
        user_data_size: i32,
        user_data_size_bits: i32,
        flags: i32,
        using_varint_bitcounts: bool,
    ) -> &mut StringTable {
        debug_assert!(
            self.find_table(name).is_none(),
            "tried to create string table '{name}' twice",
        );

        let table = StringTable::new(
            name,
            user_data_fixed_size,
            user_data_size,
            user_data_size_bits,
            flags,
            using_varint_bitcounts,
        );

        let len = self.tables.len();
        self.tables.push(table);
        &mut self.tables[len]
    }

    pub fn do_full_update(&mut self, cmd: &CDemoStringTables) {
        for incoming in &cmd.tables {
            if let Some(existing) = self.find_table_mut(incoming.table_name()) {
                existing.do_full_update(incoming);
            }
        }
    }

    // INetworkStringTable *FindTable( const char *tableName ) const ;
    #[must_use]
    pub fn find_table(&self, name: &str) -> Option<&StringTable> {
        self.tables
            .iter()
            // TODO: this used to be |&table| .., does this affect performance?
            .find(|table| table.name.as_ref().eq(name))
    }

    pub fn find_table_mut(&mut self, name: &str) -> Option<&mut StringTable> {
        self.tables
            .iter_mut()
            .find(|table| table.name.as_ref().eq(name))
    }

    // INetworkStringTable	*GetTable( TABLEID stringTable ) const;
    #[must_use]
    pub fn get_table(&self, id: usize) -> Option<&StringTable> {
        self.tables.get(id)
    }

    pub fn get_table_mut(&mut self, id: usize) -> Option<&mut StringTable> {
        self.tables.get_mut(id)
    }

    #[must_use]
    pub fn has_table(&self, id: usize) -> bool {
        self.get_table(id).is_some()
    }

    // clear clears underlying storage, but this has no effect on the allocated
    // capacity.
    //
    // NOTE: it seems like valve's name `RemoveAllTables` has relation to or
    // based on name of CUtlVector's `Remove` method, which does not de-allocate
    // memory; - rust's variant would be `clear`.
    //
    // void             RemoveAllTables( void );
    pub fn clear(&mut self) {
        self.tables.clear();
    }

    // NOTE: the goal is to check if there are any string tables,
    // CNetworkStringTableContainer has `GetNumTables` method which would be
    // equivalent to `len` in idiomatic rust, but doing .len() == 0 is not
    // idiomatic xd - `is_empty` is.
    //
    // int                  GetNumTables( void ) const;
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.tables.is_empty()
    }

    // TODO: add support for change list (m_pChangeList) and rollbacks
    // NOTE: might need those for fast seeks
    // void EnableRollback( bool bState );
    // void RestoreTick( int tick );

    // TODO: rename to iter?
    pub fn tables(&self) -> impl Iterator<Item = &StringTable> {
        self.tables.iter()
    }
}
