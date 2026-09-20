import { cva, type VariantProps } from "class-variance-authority";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

type BrandIconProps = Omit<React.ComponentProps<"svg">, "children">;

function BrandSvg({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      data-slot="brand-icon"
      aria-hidden="true"
      fill="currentColor"
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      {...props}
    />
  );
}

export function PatreonIcon(props: BrandIconProps) {
  return (
    <BrandSvg viewBox="0 0 180 180" {...props}>
      <path d="M108.8135992 26.06720125c-26.468266 0-48.00213212 21.53066613-48.00213212 47.99733213 0 26.38653268 21.53386613 47.85426547 48.00213213 47.85426547 26.38639937 0 47.8530655-21.4677328 47.8530655-47.85426547 0-26.466666-21.46666613-47.99733213-47.85306547-47.99733213" />
      <path d="M23.333335 153.93333178V26.0666679h23.46666576v127.8666639z" />
    </BrandSvg>
  );
}

/** The service status mark: a live dot in a ring. */
export function StatusIcon(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="6" />
    </BrandSvg>
  );
}

export function DiscordIcon(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
    </BrandSvg>
  );
}

export function GitHubIcon(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.004.07 1.532 1.032 1.532 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.339-2.221-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.025A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.295 2.748-1.025 2.748-1.025.546 1.378.202 2.397.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.847-2.337 4.695-4.566 4.944.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.744 0 .268.18.58.688.482C19.138 20.2 22 16.448 22 12.021 22 6.484 17.523 2 12 2z" />
    </BrandSvg>
  );
}

export function SteamIcon(props: BrandIconProps) {
  return (
    <BrandSvg {...props}>
      <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658a3.387 3.387 0 0 1 1.912-.593c.064 0 .127.003.19.007l2.862-4.146V8.91a4.528 4.528 0 0 1 4.524-4.524 4.528 4.528 0 0 1 4.524 4.524 4.528 4.528 0 0 1-4.524 4.524h-.105l-4.08 2.911c0 .052.004.105.004.158a3.39 3.39 0 0 1-3.39 3.393 3.396 3.396 0 0 1-3.349-2.878L.533 15.34A11.98 11.98 0 0 0 11.979 24c6.627 0 12-5.373 12-12s-5.373-12-12-12z" />
    </BrandSvg>
  );
}

const socialLinkVariants = cva("text-muted-foreground", {
  variants: {
    brand: {
      patreon: "hover:text-primary",
      status: "hover:text-positive",
      discord: "hover:text-discord",
      github: "hover:text-foreground",
    },
  },
});

type Brand = NonNullable<VariantProps<typeof socialLinkVariants>["brand"]>;

const SOCIAL_LINKS: { brand: Brand; href: string; title: string; Icon: (props: BrandIconProps) => React.ReactNode }[] =
  [
    {
      brand: "patreon",
      href: "https://www.patreon.com/c/manuelhexe",
      title: "Support us on Patreon",
      Icon: PatreonIcon,
    },
    { brand: "status", href: "https://stats.uptimerobot.com/V1HIfGQT77", title: "Service Status", Icon: StatusIcon },
    { brand: "discord", href: "https://discord.gg/pqWQfTPQJu", title: "Discord", Icon: DiscordIcon },
    { brand: "github", href: "https://github.com/deadlock-api/", title: "GitHub", Icon: GitHubIcon },
  ];

/** The project's outbound links as icon buttons; each lights up in its brand's color on hover. */
export function SocialLinks({ className, ...props }: Omit<React.ComponentProps<"ul">, "children">) {
  return (
    <ul
      data-slot="social-links"
      aria-label="Community and project links"
      className={cn("flex items-center justify-center gap-1", className)}
      {...props}
    >
      {SOCIAL_LINKS.map(({ brand, href, title, Icon }) => (
        <li key={brand}>
          <Button asChild variant="ghost" size="icon-lg" className={socialLinkVariants({ brand })}>
            <a href={href} target="_blank" rel="noopener noreferrer" title={title} aria-label={title}>
              <Icon className="size-5" />
            </a>
          </Button>
        </li>
      ))}
    </ul>
  );
}
