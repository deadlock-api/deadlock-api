import type React from "react";
import { Link } from "react-router";
import { DiscordIcon } from "~/components/layout/icons/DiscordIcon";
import { GithubIcon } from "~/components/layout/icons/GithubIcon";
import { PatreonIcon } from "~/components/layout/icons/PatreonIcon";
import { StatusIcon } from "~/components/layout/icons/StatusIcon";
import {
  DISCORD_LINK,
  GITHUB_LINK,
  PATREON_LINK,
  STATUS_PAGE_LINK,
} from "~/lib/consts";

export function Header() {
  return (
    <header className="flex items-center justify-end p-6 bg-sidebar text-header-foreground">
      <div className="flex items-center space-x-5">
        <a
          href={GITHUB_LINK}
          target="_blank"
          rel="noopener noreferrer"
          title="Visit our GitHub"
        >
          <GithubIcon width={24} height={24} />
        </a>
        <a
          href={DISCORD_LINK}
          target="_blank"
          rel="noopener noreferrer"
          title="Join our Discord"
        >
          <DiscordIcon width={24} height={24} />
        </a>
        <a
          href={STATUS_PAGE_LINK}
          target="_blank"
          rel="noopener noreferrer"
          title="Status"
        >
          <StatusIcon width={24} height={24} />
        </a>
        <a
          href={PATREON_LINK}
          target="_blank"
          rel="noopener noreferrer"
          title="Support us on Patreon"
        >
          <PatreonIcon width={24} height={24} />
        </a>
      </div>
    </header>
  );
}
