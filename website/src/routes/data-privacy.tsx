import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useEffect, useRef, useState } from "react";

import { BulletItem, BulletList } from "~/components/patterns/content/BulletList";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
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
import { Heading } from "~/components/ui/heading";
import { Stack } from "~/components/ui/stack";
import { Text } from "~/components/ui/text";
import { TextLink } from "~/components/ui/text-link";
import { useSteamAuthCallback } from "~/hooks/useSteamAuthCallback";
import { sendDataPrivacyRequest } from "~/lib/data-privacy-api";
import { pageTitle, seo } from "~/lib/seo";
import { cleanupCallbackUrl, redirectToSteamAuth } from "~/lib/steam-auth";

export const Route = createFileRoute("/data-privacy")({
  head: () =>
    seo({
      title: pageTitle("Data Privacy & GDPR"),
      description:
        "Manage your data privacy settings. Request data deletion or re-enable tracking via Steam authentication.",
      path: "/data-privacy",
    }),
  component: DataPrivacy,
});

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
  const titleClassName = variant === "danger" ? "text-destructive" : "text-positive";
  const buttonVariant = variant === "danger" ? "destructive" : "default";

  const button = (
    <Button
      onClick={confirmDialog ? undefined : onAction}
      variant={buttonVariant}
      className="w-full"
      loading={isLoading}
      loadingLabel="Processing"
    >
      {isLoading ? "Processing..." : buttonText}
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className={titleClassName}>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap={4}>
          <Text as="p" tone="muted">
            {details}
          </Text>
          <BulletList className="ps-4">
            {listItems.map((item) => (
              <BulletItem key={item} tone="muted">
                {item}
              </BulletItem>
            ))}
          </BulletList>
          {notice}
          {confirmDialog ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>{button}</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className={titleClassName}>{confirmDialog.title}</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <Stack gap={3}>{confirmDialog.description}</Stack>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onAction} variant="destructive">
                    {confirmDialog.confirmText}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            button
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap={2}>
      <Heading size="lg">{title}</Heading>
      {children}
    </Stack>
  );
}

function DataPrivacy() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const { steamId64, openIdParams } = useSteamAuthCallback();
  const hasProcessedCallback = useRef(false);

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
          text: `${actionText} submitted successfully.`,
        });
      } catch (error) {
        console.error("Error processing Steam callback:", error);
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "Failed to process your request. Please try again.",
        });
      }
      setIsLoading(false);
      cleanupCallbackUrl();
    };

    void processCallback();
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
    <PageShell density="content">
      <PageHeader
        size="lg"
        title="Data Privacy"
        description="Manage your data privacy settings and control how your information is used"
      />

      {message && (
        <Alert variant={message.type === "success" ? "positive" : "destructive"}>
          <AlertTitle>{message.text}</AlertTitle>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>What Data We Collect and Store</CardTitle>
          <CardDescription>Understanding how the Deadlock API handles your gaming data</CardDescription>
        </CardHeader>
        <CardContent>
          <Stack gap={4}>
            <InfoBlock title="Game Statistics">
              <p className="text-muted-foreground">
                We collect and store publicly available game statistics from Deadlock matches.
              </p>
            </InfoBlock>

            <InfoBlock title="Steam Account Information">
              <p className="text-muted-foreground">We may store your:</p>
              <BulletList className="ps-4 text-base">
                <BulletItem tone="muted">Steam ID</BulletItem>
                <BulletItem tone="muted">Public profile information (username, avatar)</BulletItem>
                <BulletItem tone="muted">Match data</BulletItem>
              </BulletList>
            </InfoBlock>

            <InfoBlock title="Data Usage">
              <p className="text-muted-foreground">
                Your data is used to provide comprehensive game analytics, improve our services, and contribute to the
                broader Deadlock community through aggregated statistics and insights.
              </p>
            </InfoBlock>

            <InfoBlock title="Website Analytics">
              <p className="text-muted-foreground">
                We use PostHog (EU-hosted) in cookieless mode to understand how the website is used. It sets no cookies
                and stores nothing in your browser; visitors are counted with a short-lived, non-reversible hash and are
                never linked to a Steam account.
              </p>
            </InfoBlock>
          </Stack>
        </CardContent>
      </Card>

      <fieldset className="grid gap-6 md:grid-cols-2">
        <legend className="sr-only">Privacy actions</legend>
        <DataPrivacyActionCard
          title="Request Data Deletion"
          description="Remove all your personal data from our systems"
          details="This will permanently delete all data associated with your Steam account and block future API requests, including:"
          listItems={["Match history and statistics", "Profile information", "Ranking data", "Any stored preferences"]}
          notice={
            <Alert variant="warning">
              <AlertDescription>
                <p>
                  ⚠️ Warning: This action is permanent and cannot be undone. Even if you re-enable tracking later, your
                  historical data may not be recovered.
                </p>
              </AlertDescription>
            </Alert>
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
                <BulletList className="ps-4">
                  <BulletItem tone="muted">Match history and statistics</BulletItem>
                  <BulletItem tone="muted">Profile information</BulletItem>
                  <BulletItem tone="muted">Ranking data</BulletItem>
                  <BulletItem tone="muted">Any stored preferences</BulletItem>
                </BulletList>
                <p className="font-semibold text-warning">
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
            <Alert variant="info">
              <AlertDescription>
                <p>
                  <strong>Note:</strong> Re-enabling tracking will start fresh data collection. Any historical data from
                  before deletion may not be recovered.
                </p>
              </AlertDescription>
            </Alert>
          }
          buttonText="Re-enable Tracking"
          variant="safe"
          onAction={() => handleSteamAuth("tracking")}
          isLoading={isLoading}
        />
      </fieldset>

      <Card>
        <CardHeader>
          <CardTitle>Important Information</CardTitle>
        </CardHeader>
        <CardContent>
          <Stack gap={4}>
            <InfoBlock title="Authentication Process">
              <p className="text-muted-foreground">
                Both actions require Steam OpenID authentication to verify your account ownership. You will be
                redirected to Steam's secure login page and then back to this site.
              </p>
            </InfoBlock>

            <InfoBlock title="Processing Time">
              <p className="text-muted-foreground">
                Data deletion requests are typically processed within 24-48 hours. Re-enabling tracking takes effect
                immediately after verification.
              </p>
            </InfoBlock>

            <InfoBlock title="Contact">
              <p className="text-muted-foreground">
                If you have questions about your data or need assistance, please contact us at{" "}
                <TextLink href="mailto:info@deadlock-api.com">info@deadlock-api.com</TextLink>
              </p>
            </InfoBlock>
          </Stack>
        </CardContent>
      </Card>
    </PageShell>
  );
}
