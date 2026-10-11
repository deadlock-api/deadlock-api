import { Download } from "lucide-react";

import { type InstallCtaPlacement, useInstallCtaTracking } from "~/components/domain/ingest/analytics";
import { WINDOWS_SETUP_URL } from "~/components/domain/ingest/links";
import { Button } from "~/components/ui/button";
import { useIsWindows } from "~/hooks/useIsWindows";

interface InstallButtonProps extends Omit<React.ComponentProps<typeof Button>, "asChild" | "children"> {
  /** Where the button leads off Windows: the install steps, `#install` on the ingest page itself. */
  installHref?: string;
  /** Where the button sits, sent with its PostHog view and click events. */
  placement?: InstallCtaPlacement;
}

/** The ingest tool's call to action: on Windows it downloads the installer, elsewhere it leads to the install steps. */
export function InstallButton({
  installHref = "#install",
  placement = "ingest_header",
  size = "lg",
  ...props
}: InstallButtonProps) {
  const isWindows = useIsWindows();
  const tracking = useInstallCtaTracking(placement, isWindows ? "download" : "install_steps");
  return (
    <Button asChild size={size} {...props}>
      {isWindows ? (
        <a href={WINDOWS_SETUP_URL} download {...tracking}>
          <Download aria-hidden="true" />
          Download for Windows
        </a>
      ) : (
        <a href={installHref} {...tracking}>
          <Download aria-hidden="true" />
          Install the tool
        </a>
      )}
    </Button>
  );
}
