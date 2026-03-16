import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MetaFunction } from "react-router";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { useSteamAuthCallback } from "~/hooks/useSteamAuthCallback";
import { sendDataPrivacyRequest } from "~/lib/data-privacy-api";
import { createPageMeta } from "~/lib/meta";
import { cleanupCallbackUrl, redirectToSteamAuth } from "~/lib/steam-auth";

export const meta: MetaFunction = () => {
  return createPageMeta({
    title: "Data Privacy & GDPR | Deadlock API",
    description:
      "Manage your data privacy settings. Request data deletion or re-enable tracking via Steam authentication.",
    path: "/data-privacy",
  });
};

function DataPrivacyActionCard({
  title,
  description,
  details,
  listItems,
  notice,
  buttonText,
  onAction,
  isLoading,
  variant,
  confirmDialog,
}: {
  title: string;
  description: string;
  details: string;
  listItems: string[];
  notice: React.ReactNode;
  buttonText: string;
  onAction: () => void;
  isLoading: boolean;
  variant: "danger" | "safe";
  confirmDialog?: {
    title: string;
    description: React.ReactNode;
    confirmText: string;
  };
}) {
  const titleClassName = variant === "danger" ? "text-red-400" : "text-green-400";
  const buttonVariant = variant === "danger" ? "destructive" : "default";

  const button = (
    <Button
      onClick={confirmDialog ? undefined : onAction}
      variant={buttonVariant}
      className="w-full"
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 size-4 animate-spin" />
          Processing...
        </>
      ) : (
        buttonText
      )}
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className={titleClassName}>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{details}</p>
        <ul className="ml-4 list-inside list-disc space-y-1 text-sm text-muted-foreground">
          {listItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {notice}
        {confirmDialog ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>{button}</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className={titleClassName}>{confirmDialog.title}</AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">{confirmDialog.description}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onAction} className="bg-red-600 hover:bg-red-700">
                  {confirmDialog.confirmText}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          button
        )}
      </CardContent>
    </Card>
  );
}

function AnalyticsInfoCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Analytics</CardTitle>
        <CardDescription>How we collect anonymous usage data</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h3 className="mb-2 text-lg font-semibold">Cookieless Analytics</h3>
          <p className="text-muted-foreground">
            We use{" "}
            <a
              href="https://posthog.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              PostHog
            </a>
            , an open-source analytics platform, to understand how people use Deadlock API. Our analytics are fully
            cookieless and do not store any data on your device. PostHog is self-hosted on EU servers (Frankfurt) to
            keep your data within the European Union.
          </p>
        </div>

        <div>
          <h3 className="mb-2 text-lg font-semibold">What Is Collected</h3>
          <ul className="ml-4 list-inside list-disc space-y-1 text-muted-foreground">
            <li>Page views and navigation patterns</li>
            <li>Feature usage (e.g. which filters or tabs are used)</li>
            <li>Performance metrics and errors</li>
            <li>Basic device info (browser, screen size)</li>
          </ul>
          <p className="mt-2 text-sm text-muted-foreground">
            We do <strong>not</strong> track personal information, Steam accounts, or match data through analytics. No
            cookies or persistent identifiers are used.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DataPrivacy() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const { steamId64, openIdParams } = useSteamAuthCallback();
  const hasProcessedCallback = useRef(false);

  // Handle Steam authentication callback
  useEffect(() => {
    if (!steamId64 || hasProcessedCallback.current) return;

    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get("action") as "deletion" | "tracking" | null;
    if (!action) return;

    hasProcessedCallback.current = true;

    const processCallback = async () => {
      setIsLoading(true);
      setMessage(null);

      try {
        await sendDataPrivacyRequest(action, {
          steam_id: steamId64,
          open_id_params: openIdParams,
        });

        const actionText = action === "deletion" ? "Data deletion request" : "Tracking re-enablement";
        setMessage({
          type: "success",
          text: `${actionText} submitted successfully. You will receive confirmation via Steam.`,
        });
      } catch (error) {
        console.error("Error processing Steam callback:", error);
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to process your request. Please try again.",
        });
      } finally {
        setIsLoading(false);
        cleanupCallbackUrl();
      }
    };

    processCallback();
  }, [steamId64, openIdParams]);

  const handleSteamAuth = (action: "deletion" | "tracking") => {
    try {
      redirectToSteamAuth(action);
    } catch (error) {
      console.error(error);
      setMessage({
        type: "error",
        text: "Failed to initiate Steam authentication. Please try again.",
      });
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Data Privacy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your data privacy settings and control how your information is used
        </p>
      </div>

      {/* Status Message */}
      {message && (
        <Card className={`border ${message.type === "success" ? "border-green-500/50" : "border-destructive/50"}`}>
          <CardContent className="p-6">
            <p
              className={`text-center font-medium ${message.type === "success" ? "text-green-400" : "text-destructive"}`}
            >
              {message.text}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Analytics Information */}
      <AnalyticsInfoCard />

      {/* What We Collect Section */}
      <Card>
        <CardHeader>
          <CardTitle>What Data We Collect and Store</CardTitle>
          <CardDescription>Understanding how the Deadlock API handles your gaming data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="mb-2 text-lg font-semibold">Game Statistics</h3>
            <p className="text-muted-foreground">
              We collect and store publicly available game statistics from Deadlock matches.
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-lg font-semibold">Steam Account Information</h3>
            <p className="text-muted-foreground">We may store your:</p>
            <ul className="mt-2 ml-4 list-inside list-disc space-y-1 text-muted-foreground">
              <li>Steam ID</li>
              <li>Public profile information (username, avatar)</li>
              <li>Match data</li>
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-lg font-semibold">Data Usage</h3>
            <p className="text-muted-foreground">
              Your data is used to provide comprehensive game analytics, improve our services, and contribute to the
              broader Deadlock community through aggregated statistics and insights.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Privacy Actions */}
      <fieldset className="grid gap-6 border-0 p-0 md:grid-cols-2">
        <legend className="sr-only">Privacy actions</legend>
        <DataPrivacyActionCard
          title="Request Data Deletion"
          description="Remove all your personal data from our systems"
          details="This will permanently delete all data associated with your Steam account and block future API requests, including:"
          listItems={["Match history and statistics", "Profile information", "Ranking data", "Any stored preferences"]}
          notice={
            <div className="rounded-md border border-yellow-500/20 bg-yellow-500/10 p-3">
              <p className="text-sm font-medium text-yellow-400">
                ⚠️ Warning: This action is permanent and cannot be undone. Even if you re-enable tracking later, your
                historical data may not be recovered.
              </p>
            </div>
          }
          buttonText="Request Data Deletion"
          variant="danger"
          onAction={() => handleSteamAuth("deletion")}
          isLoading={isLoading}
          confirmDialog={{
            title: "⚠️ Permanent Data Deletion Warning",
            description: (
              <>
                <p>
                  <strong>This action is permanent and cannot be undone.</strong>
                </p>
                <p>
                  Once you confirm data deletion, all your information will be permanently removed from our systems,
                  including:
                </p>
                <ul className="ml-4 list-inside list-disc space-y-1">
                  <li>Match history and statistics</li>
                  <li>Profile information</li>
                  <li>Ranking data</li>
                  <li>Any stored preferences</li>
                </ul>
                <p className="font-semibold text-yellow-400">
                  Important: Even if you re-enable tracking later, we will not be able to recover your historical data.
                  You will start with a completely fresh profile.
                </p>
              </>
            ),
            confirmText: "Yes, Delete My Data Permanently",
          }}
        />

        <DataPrivacyActionCard
          title="Re-enable Data Tracking"
          description="Restore data collection for your account"
          details="If you previously requested data deletion, you can re-enable tracking to:"
          listItems={[
            "Resume match data collection",
            "Restore access to statistics",
            "Enable personalized features",
            "Contribute to community analytics",
          ]}
          notice={
            <div className="rounded-md border border-blue-500/20 bg-blue-500/10 p-3">
              <p className="text-sm text-blue-400">
                <strong>Note:</strong> Re-enabling tracking will start fresh data collection. Any historical data from
                before deletion may not be recovered.
              </p>
            </div>
          }
          buttonText="Re-enable Tracking"
          variant="safe"
          onAction={() => handleSteamAuth("tracking")}
          isLoading={isLoading}
        />
      </fieldset>

      {/* Additional Information */}
      <Card>
        <CardHeader>
          <CardTitle>Important Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="mb-2 text-lg font-semibold">Authentication Process</h3>
            <p className="text-muted-foreground">
              Both actions require Steam OpenID authentication to verify your account ownership. You will be redirected
              to Steam's secure login page and then back to this site.
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-lg font-semibold">Processing Time</h3>
            <p className="text-muted-foreground">
              Data deletion requests are typically processed within 24-48 hours. Re-enabling tracking takes effect
              immediately after verification.
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-lg font-semibold">Contact</h3>
            <p className="text-muted-foreground">
              If you have questions about your data or need assistance, please contact us at{" "}
              <a href="mailto:info@deadlock-api.com" className="text-primary hover:underline">
                info@deadlock-api.com
              </a>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
