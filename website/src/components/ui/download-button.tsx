import { Download } from "lucide-react";
import type { ComponentProps } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { useDownload } from "~/components/ui/hooks/use-download";

type DownloadButtonProps = Omit<ComponentProps<typeof Button>, "loading" | "loadingLabel"> & {
  /** The file to save; another origin works when it allows CORS. */
  href: string;
  /** The saved file's name, the last part of `href` by default. */
  filename?: string;
};

/**
 * Saves a file instead of opening it, through the headless `useDownload`. It shows a spinner while the file loads and
 * a toast when it fails. An `icon*` size shows the icon alone and needs an `aria-label` or `title`; any other size adds
 * the children.
 */
export function DownloadButton({
  href,
  filename,
  children = "Download",
  variant,
  size,
  onClick,
  ...props
}: DownloadButtonProps) {
  const { loading, download } = useDownload();
  const iconDisplay = size?.startsWith("icon") ?? false;
  const name = props["aria-label"] ?? props.title ?? "Download";

  return (
    <Button
      type="button"
      variant={variant ?? (iconDisplay ? "ghost" : "default")}
      size={size}
      data-slot="download-button"
      loading={loading}
      loadingLabel="Downloading"
      {...props}
      aria-label={iconDisplay ? name : props["aria-label"]}
      onClick={async (event) => {
        event.stopPropagation();
        onClick?.(event);
        if (!(await download(href, filename))) toast.error("Could not download the file. Please try again.");
      }}
    >
      {!loading && <Download aria-hidden="true" />}
      {!iconDisplay && children}
    </Button>
  );
}
