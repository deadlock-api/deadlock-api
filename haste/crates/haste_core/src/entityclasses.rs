use valveprotos::common::CDemoClassInfo;

use crate::fxhash;

#[derive(Clone)]
pub struct ClassInfo {
    pub network_name_hash: u64,
}

pub struct EntityClasses {
    pub classes: usize,
    pub bits: usize,
    class_infos: Vec<ClassInfo>,
}

impl EntityClasses {
    #[must_use]
    pub fn parse(cmd: &CDemoClassInfo) -> Self {
        let class_count = cmd.classes.len();

        // bits is the number of bits to read for entity classes. stolen from
        // butterfly's entity_classes.hpp.
        // that is ceil(log2(class_count)), the number of bits that can address every class.
        let bits = class_count
            .checked_next_power_of_two()
            .map_or(usize::BITS, usize::trailing_zeros) as usize;

        let class_infos: Vec<ClassInfo> = cmd
            .classes
            .iter()
            .map(|cls| ClassInfo {
                network_name_hash: fxhash::hash_bytes(cls.network_name().as_bytes()),
            })
            .collect();

        Self {
            classes: class_count,
            bits,
            class_infos,
        }
    }

    #[must_use]
    pub fn by_id(&self, class_id: i32) -> Option<&ClassInfo> {
        self.class_infos.get(usize::try_from(class_id).ok()?)
    }
}
