use std::collections::HashMap;

use haste_core::fxhash::{add_u64_to_hash, hash_bytes};

pub(crate) struct SymbolTable {
    symbols: Vec<String>,
    hash_to_index: HashMap<u64, usize>,
}

impl SymbolTable {
    pub(crate) fn new(symbols: Vec<String>) -> Self {
        let hash_to_index = symbols
            .iter()
            .enumerate()
            .map(|(i, s)| (hash_bytes(s.as_bytes()), i))
            .collect();

        Self {
            symbols,
            hash_to_index,
        }
    }

    pub(crate) fn resolve(&self, hash: u64) -> Option<&str> {
        self.hash_to_index
            .get(&hash)
            .and_then(|&i| self.symbols.get(i))
            .map(String::as_str)
    }
}

pub(super) fn build_field_name(send_node: Option<&str>, var_name: &str) -> String {
    match send_node {
        Some(sn) if !sn.is_empty() => {
            format!("{}__{}", sn.replace('.', "__"), var_name)
        }
        _ => var_name.to_string(),
    }
}

pub(crate) fn compute_field_key(send_node: Option<&str>, var_name: &str) -> u64 {
    let var_name_hash = hash_bytes(var_name.as_bytes());

    match send_node {
        Some(sn) if !sn.is_empty() => {
            let mut parts = sn.split('.');
            let mut hash = hash_bytes(parts.next().unwrap().as_bytes());
            for part in parts {
                hash = add_u64_to_hash(hash, hash_bytes(part.as_bytes()));
            }
            add_u64_to_hash(hash, var_name_hash)
        }
        _ => var_name_hash,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_symbol_table_resolve() {
        let symbols = vec![
            "m_iHealth".to_string(),
            "m_vecOrigin".to_string(),
            "CCitadelPlayerPawn".to_string(),
        ];
        let table = SymbolTable::new(symbols);

        let health_hash = hash_bytes(b"m_iHealth");
        assert_eq!(table.resolve(health_hash), Some("m_iHealth"));

        let origin_hash = hash_bytes(b"m_vecOrigin");
        assert_eq!(table.resolve(origin_hash), Some("m_vecOrigin"));

        assert_eq!(table.resolve(12345), None);
    }

    #[test]
    fn test_build_field_name() {
        assert_eq!(build_field_name(None, "m_iHealth"), "m_iHealth");
        assert_eq!(build_field_name(Some(""), "m_iHealth"), "m_iHealth");
        assert_eq!(
            build_field_name(Some("CBodyComponent"), "m_vecX"),
            "CBodyComponent__m_vecX"
        );
        assert_eq!(
            build_field_name(Some("m_CCitadelHeroComponent.m_loadingHero"), "m_nHeroID"),
            "m_CCitadelHeroComponent__m_loadingHero__m_nHeroID"
        );
    }

    #[test]
    fn test_compute_field_key_matches_haste() {
        let simple_key = compute_field_key(None, "m_iHealth");
        assert_eq!(simple_key, hash_bytes(b"m_iHealth"));
    }
}
