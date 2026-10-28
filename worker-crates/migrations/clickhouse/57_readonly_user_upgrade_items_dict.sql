-- Let api_readonly_user call dictHas/dictGet on upgrade_items_dict, so benchmark sessions can run the
-- item filters that pick `upgrades.item_id` over `items.item_id` for shop items.
GRANT dictGet ON default.upgrade_items_dict TO api_readonly_user;
