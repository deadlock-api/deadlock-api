//! Extracts the per-tier item price list from `generic_data.vdata` by
//! recursively searching for the `m_nItemPricePerTier` array.

use serde_json::Value;

pub(super) fn extract_item_price_per_tier(root: &Value) -> Vec<u32> {
    fn walk(node: &Value) -> Option<&Value> {
        match node {
            Value::Object(m) => {
                if let Some(v) = m.get("m_nItemPricePerTier") {
                    return Some(v);
                }
                for v in m.values() {
                    if let Some(found) = walk(v) {
                        return Some(found);
                    }
                }
                None
            }
            Value::Array(a) => {
                for v in a {
                    if let Some(found) = walk(v) {
                        return Some(found);
                    }
                }
                None
            }
            _ => None,
        }
    }

    walk(root)
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_u64().map(|n| n as u32))
                .collect()
        })
        .unwrap_or_default()
}
