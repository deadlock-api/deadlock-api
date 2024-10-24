ALTER TABLE active_matches
ADD COLUMN compat_version Nullable (UInt32),
ADD COLUMN ranked_badge_level Nullable (UInt32);
