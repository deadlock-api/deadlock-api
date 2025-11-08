import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "~/lib/api";
import { cn } from "~/lib/utils";

export default function PlayerName({ accountId, className }: { accountId: number; className?: string }) {
  const { data } = useQuery({
    queryKey: ["api-player-steam", accountId],
    queryFn: async () => {
      const response = await api.players_api.steam({
        accountIds: [accountId],
      });
      return response.data[0];
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
  const name = useMemo(() => data?.personaname ?? data?.realname ?? data?.account_id?.toString() ?? "", [data]);
  return (
    <span className={cn(className, "w-32 truncate")} title={name}>
      {name}
    </span>
  );
}
