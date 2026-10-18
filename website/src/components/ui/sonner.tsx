import { CircleCheckIcon, InfoIcon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { type ExternalToast, Toaster as Sonner, type ToasterProps, toast as sonnerToast } from "sonner";

import { Spinner } from "~/components/ui/spinner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Spinner />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

// A toast with an action (Undo) stays at least this long, so the action can be reached in time (WCAG 2.2.1).
const ACTION_TOAST_MS = 10_000;

function withActionTime(data?: ExternalToast): ExternalToast | undefined {
  if (!data?.action) return data;
  return { ...data, duration: Math.max(data.duration ?? 0, ACTION_TOAST_MS) };
}

type ToastMessage = Parameters<typeof sonnerToast>[0];

/**
 * Sonner's `toast` with one timing policy: a toast that carries an `action` stays at least 10 seconds, whatever
 * `duration` the call asks for. Call it as sonner's (`toast()`, `.success`, `.error`, `.info`, `.warning`,
 * `.message`, `.loading`, `.promise`, `.custom`, `.dismiss`).
 */
const toast = Object.assign(
  (message: ToastMessage, data?: ExternalToast) => sonnerToast(message, withActionTime(data)),
  {
    success: (message: ToastMessage, data?: ExternalToast) => sonnerToast.success(message, withActionTime(data)),
    error: (message: ToastMessage, data?: ExternalToast) => sonnerToast.error(message, withActionTime(data)),
    info: (message: ToastMessage, data?: ExternalToast) => sonnerToast.info(message, withActionTime(data)),
    warning: (message: ToastMessage, data?: ExternalToast) => sonnerToast.warning(message, withActionTime(data)),
    message: (message: ToastMessage, data?: ExternalToast) => sonnerToast.message(message, withActionTime(data)),
    loading: sonnerToast.loading,
    promise: sonnerToast.promise,
    custom: sonnerToast.custom,
    dismiss: sonnerToast.dismiss,
  },
);

export { Toaster, toast };
