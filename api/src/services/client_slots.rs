//! Caps how many requests one client has in flight at once on this replica, so a burst sent all
//! at the same time cannot outrun a cost that is only charged once each request has run.

use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};

/// At most `limit` requests in flight per client id.
#[derive(Debug)]
pub(crate) struct ClientSlots {
    limit: usize,
    in_flight: Mutex<HashMap<String, usize>>,
}

impl ClientSlots {
    pub(crate) fn new(limit: usize) -> Self {
        Self {
            limit,
            in_flight: Mutex::default(),
        }
    }

    pub(crate) const fn limit(&self) -> usize {
        self.limit
    }

    /// Takes one of `client_id`'s slots until the returned [`ClientSlot`] drops, or `None` if all
    /// of them are taken.
    pub(crate) fn acquire(&'static self, client_id: String) -> Option<ClientSlot> {
        let mut in_flight = self
            .in_flight
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let count = in_flight.entry(client_id.clone()).or_default();
        if *count >= self.limit {
            return None;
        }
        *count = count.saturating_add(1);
        drop(in_flight);
        Some(ClientSlot {
            slots: self,
            client_id,
        })
    }
}

/// One request's slot of [`ClientSlots`], given back on drop (also when the client hangs up).
#[derive(Debug)]
pub(crate) struct ClientSlot {
    slots: &'static ClientSlots,
    client_id: String,
}

impl Drop for ClientSlot {
    fn drop(&mut self) {
        let mut in_flight = self
            .slots
            .in_flight
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        if let Some(count) = in_flight.get_mut(&self.client_id) {
            *count = count.saturating_sub(1);
            if *count == 0 {
                in_flight.remove(&self.client_id);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::LazyLock;

    use super::*;

    #[test]
    fn caps_each_client_and_frees_on_drop() {
        static SLOTS: LazyLock<ClientSlots> = LazyLock::new(|| ClientSlots::new(2));
        let a1 = SLOTS.acquire("a".to_owned()).unwrap();
        let _a2 = SLOTS.acquire("a".to_owned()).unwrap();
        assert!(SLOTS.acquire("a".to_owned()).is_none());
        // Other clients have their own slots.
        let b = SLOTS.acquire("b".to_owned()).unwrap();
        drop(a1);
        let _a3 = SLOTS.acquire("a".to_owned()).unwrap();
        drop(b);
        // A client without requests in flight leaves no entry behind.
        assert!(!SLOTS.in_flight.lock().unwrap().contains_key("b"));
    }
}
