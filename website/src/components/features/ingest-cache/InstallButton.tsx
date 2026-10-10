import { Download } from "lucide-react";

import { WINDOWS_SETUP_URL } from "~/components/features/ingest-cache/links";
import { Button } from "~/components/ui/button";
import { useIsWindows } from "~/hooks/useIsWindows";

/** The page's main call to action: on Windows it downloads the installer, elsewhere it jumps to the install steps. */
export function InstallButton() {
  const isWindows = useIsWindows();
  return (
    <Button asChild size="lg">
      {isWindows ? (
        <a href={WINDOWS_SETUP_URL} download>
          <Download aria-hidden="true" />
          Download for Windows
        </a>
      ) : (
        <a href="#install">
          <Download aria-hidden="true" />
          Install the tool
        </a>
      )}
    </Button>
  );
}
