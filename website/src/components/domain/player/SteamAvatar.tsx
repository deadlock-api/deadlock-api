import { cva, type VariantProps } from "class-variance-authority";
import { UserRound } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";

const steamAvatarVariants = cva("shrink-0", {
  variants: {
    size: { xs: "size-5", sm: "size-6", default: "size-8", lg: "size-12" },
    /** `circle` in rows and lists; `rounded` for the large portrait of a profile header, as Steam draws it. */
    shape: { circle: "rounded-full", rounded: "rounded-xl" },
  },
  defaultVariants: { size: "default", shape: "circle" },
});

const FALLBACK_SHAPE = { circle: "rounded-full", rounded: "rounded-xl" } as const;
const FALLBACK_ICON = { xs: "size-3", sm: "size-3.5", default: "size-4", lg: "size-5" } as const;

/**
 * A player's Steam avatar. Decorative: the name beside it identifies the player, so it is hidden from assistive
 * technology. A missing or broken image falls back to a person glyph; `loading` holds the space with a skeleton.
 */
export function SteamAvatar({
  src,
  loading = false,
  size,
  shape,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Avatar>, "size" | "children"> &
  VariantProps<typeof steamAvatarVariants> & {
    src?: string | null;
    loading?: boolean;
  }) {
  const look = cn(steamAvatarVariants({ size, shape }), className);
  if (loading) return <Skeleton className={look} />;
  return (
    <Avatar aria-hidden="true" className={look} {...props}>
      {src && <AvatarImage src={src} alt="" loading="lazy" />}
      <AvatarFallback className={FALLBACK_SHAPE[shape ?? "circle"]}>
        <UserRound className={FALLBACK_ICON[size ?? "default"]} />
      </AvatarFallback>
    </Avatar>
  );
}
