//! Extracts the per-tier item price list from `generic_data.vdata` by
//! recursively searching for the `m_nItemPricePerTier` array.

use serde_json::Value;

pub(super) fn extract_item_price_per_tier(root: &Value) -> Vec<u32> {
    fn walk(node: &Value) -> Option<&Value> {
        match node {
            Value::Object(m) => m
                .get("m_nItemPricePerTier")
                .or_else(|| m.values().find_map(walk)),
            Value::Array(a) => a.iter().find_map(walk),
            _ => None,
        }
    }

    walk(root).and_then(Value::as_array).map_or_default(|arr| {
        arr.iter()
            .filter_map(|v| v.as_u64().map(|n| n as u32))
            .collect()
    })
}
