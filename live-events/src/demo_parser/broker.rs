use core::ops::Range;

/// Title of the `HudGameAnnouncement` sent when the Broker (corrupted item shop) spawns.
pub(super) const SPAWN_ANNOUNCEMENT: &str = "#Citadel_HUD_CorruptedItemShopSpawn";
/// Title of the `HudGameAnnouncement` sent when the Broker restocks.
pub(super) const RESTOCK_ANNOUNCEMENT: &str = "#Citadel_HUD_CorruptedItemShopRestock";
/// A restock announcement this close to a stock change from the game rules is the same restock.
const DEDUP_TICKS: i32 = 64;

/// Tracks the Broker's stock from its two signals, the game rules' `m_nNumCorruptedItemsLimit`
/// (1 after the spawn, +1 per restock) and the spawn/restock HUD announcements, so each spawn
/// and restock is reported once whichever signal arrives first.
#[derive(Debug, Default)]
pub(super) struct BrokerStock {
    /// Stock reported so far; `None` until the game rules are first seen. A stream joined
    /// mid-match takes the current stock as its baseline instead of replaying past spawns.
    stock: Option<i32>,
    /// Tick of the last stock change.
    tick: i32,
}

impl BrokerStock {
    /// Handles a game rules update; returns the new stock levels to report (1 is the spawn,
    /// anything above a restock).
    pub(super) fn on_limit(&mut self, tick: i32, limit: i32) -> Range<i32> {
        if self.stock.is_none() {
            self.stock = Some(limit);
            return Self::none();
        }
        self.raise_to(tick, limit)
    }

    /// Handles a `HudGameAnnouncement` title; returns the new stock levels to report.
    pub(super) fn on_announcement(&mut self, tick: i32, title: &str) -> Range<i32> {
        let stock = self.stock.unwrap_or_default();
        match title {
            SPAWN_ANNOUNCEMENT => self.raise_to(tick, 1),
            RESTOCK_ANNOUNCEMENT if stock < 1 || tick - self.tick > DEDUP_TICKS => {
                self.raise_to(tick, stock.max(1) + 1)
            }
            _ => Self::none(),
        }
    }

    fn raise_to(&mut self, tick: i32, stock: i32) -> Range<i32> {
        let from = self.stock.unwrap_or_default();
        if stock <= from {
            return Self::none();
        }
        self.stock = Some(stock);
        self.tick = tick;
        (from + 1)..(stock + 1)
    }

    fn none() -> Range<i32> {
        0..0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn levels(range: Range<i32>) -> Vec<i32> {
        range.collect()
    }

    #[test]
    fn test_game_rules_then_announcement() {
        let mut broker = BrokerStock::default();
        assert!(levels(broker.on_limit(1, 0)).is_empty());
        assert_eq!(levels(broker.on_limit(120_300, 1)), [1]);
        assert!(levels(broker.on_announcement(120_300, SPAWN_ANNOUNCEMENT)).is_empty());
        assert_eq!(levels(broker.on_limit(166_396, 2)), [2]);
        assert!(levels(broker.on_announcement(166_396, RESTOCK_ANNOUNCEMENT)).is_empty());
        assert!(levels(broker.on_limit(166_400, 2)).is_empty());
    }

    #[test]
    fn test_announcement_then_game_rules() {
        let mut broker = BrokerStock::default();
        assert!(levels(broker.on_limit(1, 0)).is_empty());
        assert_eq!(
            levels(broker.on_announcement(120_300, SPAWN_ANNOUNCEMENT)),
            [1]
        );
        assert!(levels(broker.on_limit(120_300, 1)).is_empty());
        assert_eq!(
            levels(broker.on_announcement(166_396, RESTOCK_ANNOUNCEMENT)),
            [2]
        );
        assert!(levels(broker.on_limit(166_396, 2)).is_empty());
        // A later restock announced without a game rules change.
        assert_eq!(
            levels(broker.on_announcement(210_000, RESTOCK_ANNOUNCEMENT)),
            [3]
        );
    }

    #[test]
    fn test_joined_mid_match() {
        let mut broker = BrokerStock::default();
        // The Broker already spawned before the stream was joined: no spawn is replayed.
        assert!(levels(broker.on_limit(130_000, 1)).is_empty());
        assert_eq!(levels(broker.on_limit(166_396, 2)), [2]);
    }

    #[test]
    fn test_missed_update_reports_every_level() {
        let mut broker = BrokerStock::default();
        assert!(levels(broker.on_limit(1, 0)).is_empty());
        assert_eq!(levels(broker.on_limit(170_000, 2)), [1, 2]);
    }

    #[test]
    fn test_other_announcements_are_ignored() {
        let mut broker = BrokerStock::default();
        assert!(levels(broker.on_limit(1, 0)).is_empty());
        assert!(levels(broker.on_announcement(43_772, "#Citadel_HUD_Koth_Warning")).is_empty());
    }
}
