import { SteamIcon } from "~/components/domain/brand/BrandIcons";
import { Button } from "~/components/ui/button";

/**
 * Starts Steam OpenID sign-in, in Steam's colors. The caller owns the redirect (`generateSteamAuthUrl` or
 * `redirectToSteamAuth` from `~/lib/steam-auth`), because the return path differs per page.
 */
export function SteamSignInButton({
  size = "lg",
  children = "Sign in with Steam",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "variant" | "asChild">) {
  return (
    <Button data-slot="steam-sign-in-button" variant="steam" size={size} {...props}>
      <SteamIcon />
      {children}
    </Button>
  );
}
