import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { API_ORIGIN } from "~/lib/constants";
import { cn } from "~/lib/utils";
import type { APISteamPlayer } from "~/types/api_steam_player";

export default function PlayerName({ accountId, className }: { accountId: number; className?: string }) {
  const { data } = useQuery<APISteamPlayer>({
    queryKey: ["api-player-steam", accountId],
    queryFn: () => fetch(new URL(`/v1/players/${accountId}/steam`, API_ORIGIN)).then((res) => res.json()),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const name = useMemo(() => data?.personaname ?? data?.realname ?? data?.account_id?.toString() ?? "", [data]);
  return (
    <span className={cn(className, "w-32 truncate")} title={name}>
      {name}
    </span>
  );
}
