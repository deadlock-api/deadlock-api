use core::num::ParseIntError;
use std::sync::Arc;

use sync_unsafe_cell::SyncUnsafeCell;

use crate::stringtables::StringTable;

pub(crate) const INSTANCE_BASELINE_TABLE_NAME: &str = "instancebaseline";

#[derive(Default)]
pub(crate) struct InstanceBaseline {
    data: Vec<Option<Arc<SyncUnsafeCell<Vec<u8>>>>>,
}

impl InstanceBaseline {
    pub(crate) fn update(
        &mut self,
        string_table: &StringTable,
        classes: usize,
    ) -> Result<(), ParseIntError> {
        if self.data.len() < classes {
            self.data.resize(classes, None);
        }

        for (_entity_index, item) in string_table.items() {
            let data = item.string.as_ref();
            if let Some(data) = data
                && let Ok(string) = core::str::from_utf8(data)
            {
                let class_id = string.parse::<i32>()?;
                self.data[class_id as usize].clone_from(&item.user_data);
            }
        }
        Ok(())
    }

    /// Baseline bytes for `class_id`, or an empty slice if no baseline has been registered for it.
    ///
    /// Never reads out of bounds or dereferences a missing entry. A missing baseline yields an
    /// empty slice, which decodes to an all-default entity — correct when the create delta that
    /// follows restates every live field (as a full-packet snapshot does). This matters when a
    /// parse begins at a full packet whose class set was baselined at a different point than a
    /// from-the-start parse would have cached.
    #[allow(unsafe_code)]
    #[inline]
    pub(crate) fn by_id(&self, class_id: i32) -> &[u8] {
        match self.data.get(class_id as usize).and_then(Option::as_ref) {
            // SAFETY: the cell is only mutated through `update`, which holds `&mut self`; no other
            // reference can be live while we borrow it here.
            Some(cell) => unsafe { &*cell.get() },
            None => &[],
        }
    }

    /// clear clears underlying storage, but this has no effect on the allocated capacity.
    // Only used by the blocking `Parser::reset`, which is not compiled under the `async` feature.
    #[cfg_attr(feature = "async", allow(dead_code))]
    pub(crate) fn clear(&mut self) {
        self.data.clear();
    }
}
