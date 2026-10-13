import { useQueries } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";

import { AddBotDialog } from "~/components/features/patron/AccountDialogs";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Stack } from "~/components/ui/stack";
import { botFriendStatusQueryOptions, useBotFriendStatus, useSteamAccounts } from "~/queries/patron-queries";

/** The "Add bot friend" button of one account, with the dialog holding its invite links. */
function AddBotFriendButton({ steamId3 }: { steamId3: number }) {
  const [open, setOpen] = useState(false);
  const query = useBotFriendStatus(steamId3);
  const status = query.data;
  if (!status || status.is_friend) return null;

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Add bot friend
      </Button>
      <AddBotDialog
        open={open}
        onOpenChange={setOpen}
        invites={status.invites}
        isChecking={query.isFetching}
        onCheck={() => query.refetch()}
      />
    </>
  );
}

/**
 * Lists the active accounts that no bot is friends with. Their match history is never fetched, so
 * prioritization does nothing for them until the player accepts a bot's friend request.
 */
export function BotFriendWarning() {
  const accountsQuery = useSteamAccounts();
  const active = (accountsQuery.data?.accounts ?? []).filter((a) => a.deleted_at === null);
  const statuses = useQueries({
    queries: active.map((a) => botFriendStatusQueryOptions(a.steam_id3)),
  });
  const missing = active.filter((_, i) => statuses[i]?.data?.is_friend === false);
  if (missing.length === 0) return null;

  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>Add one of our bots as a Steam friend</AlertTitle>
      <AlertDescription>
        <p>
          {missing.length === 1 ? "This account is" : "These accounts are"} not friends with any of our bots. Without a
          bot friend we cannot read the match history, so these accounts are <strong>not prioritized</strong> and new
          matches can be missing.
        </p>
        <Stack gap={2}>
          {missing.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-foreground">{a.steam_id3}</span>
              <AddBotFriendButton steamId3={a.steam_id3} />
            </div>
          ))}
        </Stack>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Opens the bot friend dialog for a just-added account, unless a bot is already its friend. Closes
 * by itself once the connection check finds the friendship.
 */
export function NewAccountBotDialog({ steamId3, onClose }: { steamId3: number | null; onClose: () => void }) {
  const query = useBotFriendStatus(steamId3 ?? 0, steamId3 !== null);
  const status = steamId3 === null ? undefined : query.data;
  if (!status || status.is_friend) return null;

  return (
    <AddBotDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      invites={status.invites}
      isChecking={query.isFetching}
      onCheck={() => query.refetch()}
    />
  );
}
