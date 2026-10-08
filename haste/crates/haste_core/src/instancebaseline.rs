use core::num::ParseIntError;
use std::sync::Arc;

use crate::stringtables::StringTable;

pub(crate) const INSTANCE_BASELINE_TABLE_NAME: &str = "instancebaseline";

#[derive(thiserror::Error, Debug)]
pub(crate) enum InstanceBaselineError {
    #[error(transparent)]
    ParseInt(#[from] ParseIntError),
    #[error("instance baseline for class id {class_id}, but there are only {classes} classes")]
    ClassIdOutOfRange { class_id: i32, classes: usize },
}

#[derive(Default)]
pub(crate) struct InstanceBaseline {
    data: Vec<Option<Arc<[u8]>>>,
}

impl InstanceBaseline {
    /// syncs baselines with the `instancebaseline` string table. `on_change` is called with the
    /// class id of every baseline whose bytes differ from what was stored before, so that caches
    /// derived from the old bytes can be dropped.
    pub(crate) fn update(
        &mut self,
        string_table: &StringTable,
        classes: usize,
        mut on_change: impl FnMut(i32),
    ) -> Result<(), InstanceBaselineError> {
        if self.data.len() < classes {
            self.data.resize(classes, None);
        }

        for (_entity_index, item) in string_table.items() {
            let data = item.string.as_ref();
            if let Some(data) = data
                && let Ok(string) = core::str::from_utf8(data)
            {
                let class_id = string.parse::<i32>()?;
                let slot = usize::try_from(class_id)
                    .ok()
                    .and_then(|i| self.data.get_mut(i))
                    .ok_or(InstanceBaselineError::ClassIdOutOfRange { class_id, classes })?;
                let unchanged = match (slot.as_ref(), item.user_data.as_ref()) {
                    (Some(old), Some(new)) => Arc::ptr_eq(old, new) || old == new,
                    (None, None) => true,
                    _ => false,
                };
                if !unchanged {
                    slot.clone_from(&item.user_data);
                    on_change(class_id);
                }
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
    #[inline]
    pub(crate) fn by_id(&self, class_id: i32) -> &[u8] {
        self.data
            .get(class_id as usize)
            .and_then(Option::as_deref)
            .unwrap_or_default()
    }

    /// clear clears underlying storage, but this has no effect on the allocated capacity.
    pub(crate) fn clear(&mut self) {
        self.data.clear();
    }
}

#[cfg(test)]
mod tests {
    use valveprotos::common::c_demo_string_tables::{ItemsT, TableT};

    use super::*;

    fn table(items: &[(&str, &[u8])]) -> TableT {
        TableT {
            table_name: Some(INSTANCE_BASELINE_TABLE_NAME.to_owned()),
            items: items
                .iter()
                .map(|(s, data)| ItemsT {
                    str: Some((*s).to_owned()),
                    data: Some(data.to_vec()),
                })
                .collect(),
            ..Default::default()
        }
    }

    fn sync(ib: &mut InstanceBaseline, st: &StringTable) -> Vec<i32> {
        let mut changed = Vec::new();
        ib.update(st, 4, |class_id| changed.push(class_id)).unwrap();
        changed.sort_unstable();
        changed
    }

    #[test]
    fn test_update_reports_changed_classes() {
        let mut st = StringTable::new(INSTANCE_BASELINE_TABLE_NAME, false, 0, 0, 0, false);
        let mut ib = InstanceBaseline::default();

        st.do_full_update(&table(&[("1", &[1]), ("3", &[3])]));
        assert_eq!(sync(&mut ib, &st), [1, 3]);
        assert_eq!(ib.by_id(3), &[3]);

        // same bytes in fresh allocations (as every full packet brings): no change.
        st.do_full_update(&table(&[("1", &[1]), ("3", &[3])]));
        assert_eq!(sync(&mut ib, &st), [] as [i32; 0]);

        st.do_full_update(&table(&[("1", &[1]), ("3", &[3, 3])]));
        assert_eq!(sync(&mut ib, &st), [3]);
        assert_eq!(ib.by_id(3), &[3, 3]);
    }

    #[test]
    fn test_update_rejects_out_of_range_class() {
        let mut st = StringTable::new(INSTANCE_BASELINE_TABLE_NAME, false, 0, 0, 0, false);
        st.do_full_update(&table(&[("9", &[9])]));
        let mut ib = InstanceBaseline::default();
        assert!(matches!(
            ib.update(&st, 4, |_| {}),
            Err(InstanceBaselineError::ClassIdOutOfRange { class_id: 9, .. })
        ));
    }
}
