import { useEffect, useState } from "react";
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
import { sendDataPrivacyRequest } from "~/lib/data-privacy-api";
import { cleanupCallbackUrl, parseSteamCallback, redirectToSteamAuth } from "~/lib/steam-auth";

export const meta: MetaFunction = () => {
  return [
    { title: "Data Privacy - Deadlock API" },
    { name: "description", content: "Manage your data privacy settings for Deadlock API" },
  ];
};

export default function DataPrivacy() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Handle Steam authentication callback
  const handleSteamCallback = async () => {
    if (typeof window === "undefined") return;

    const urlParams = new URLSearchParams(window.location.search);
    const callbackData = parseSteamCallback(urlParams);

    if (!callbackData) return;

    setIsLoading(true);
    setMessage(null);

    try {
      const response = await sendDataPrivacyRequest(callbackData.action, {
        steam_id: callbackData.steamId,
        open_id_params: callbackData.openIdParams,
      });

      if (response.success) {
        const actionText = callbackData.action === "deletion" ? "Data deletion request" : "Tracking re-enablement";
        setMessage({
          type: "success",
          text: response.message || `${actionText} submitted successfully. You will receive confirmation via Steam.`,
        });
      } else {
        setMessage({
          type: "error",
          text: "Failed to process your request. Please try again.",
        });
      }
    } catch (error) {
      console.error("Error processing Steam callback:", error);
      setMessage({
        type: "error",
        text: "An unexpected error occurred while processing your request. Please try again or contact support if the issue persists.",
      });
    } finally {
      setIsLoading(false);
      cleanupCallbackUrl();
    }
  };

  // Check for Steam callback on component mount
  useEffect(() => {
    handleSteamCallback();
  }, [handleSteamCallback]);

  const handleDataDeletion = () => {
    try {
      redirectToSteamAuth("deletion");
    } catch (error) {
      console.error(error);
      setMessage({
        type: "error",
        text: "Failed to initiate Steam authentication. Please try again.",
      });
    }
  };

  const handleReEnableTracking = () => {
    try {
      redirectToSteamAuth("tracking");
    } catch (error) {
      console.error(error);
      setMessage({
        type: "error",
        text: "Failed to initiate Steam authentication. Please try again.",
      });
    }
  };

  return (
    <div className="container mx-auto max-w-4xl space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight lg:text-5xl mb-4">Data Privacy</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Manage your data privacy settings and control how your information is used by the Deadlock API.
        </p>
      </div>

      {/* Status Message */}
      {message && (
        <Card className={`border-2 ${message.type === "success" ? "border-green-500" : "border-red-500"}`}>
          <CardContent className="p-6">
            <p className={`text-center font-medium ${message.type === "success" ? "text-green-400" : "text-red-400"}`}>
              {message.text}
            </p>
          </CardContent>
        </Card>
      )}

      {/* What We Collect Section */}
      <Card>
        <CardHeader>
          <CardTitle>What Data We Collect and Store</CardTitle>
          <CardDescription>Understanding how the Deadlock API handles your gaming data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-2">Game Statistics</h3>
            <p className="text-muted-foreground">
              We collect and store publicly available game statistics from Deadlock matches.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Steam Account Information</h3>
            <p className="text-muted-foreground">We may store your:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-muted-foreground ml-4">
              <li>Steam ID</li>
              <li>Public profile information (username, avatar)</li>
              <li>Match data</li>
            </ul>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Data Usage</h3>
            <p className="text-muted-foreground">
              Your data is used to provide comprehensive game analytics, improve our services, and contribute to the
              broader Deadlock community through aggregated statistics and insights.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Privacy Actions */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-red-400">Request Data Deletion</CardTitle>
            <CardDescription>Remove all your personal data from our systems</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will permanently delete all data associated with your Steam account and block future API requests,
              including:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>Match history and statistics</li>
              <li>Profile information</li>
              <li>Ranking data</li>
              <li>Any stored preferences</li>
            </ul>
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-3 mb-4">
              <p className="text-sm text-yellow-400 font-medium">
                ⚠️ Warning: This action is permanent and cannot be undone. Even if you re-enable tracking later, your
                historical data may not be recovered.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Processing...
                    </>
                  ) : (
                    "Request Data Deletion"
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-red-400">⚠️ Permanent Data Deletion Warning</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-3">
                    <p>
                      <strong>This action is permanent and cannot be undone.</strong>
                    </p>
                    <p>
                      Once you confirm data deletion, all your information will be permanently removed from our systems,
                      including:
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>Match history and statistics</li>
                      <li>Profile information</li>
                      <li>Ranking data</li>
                      <li>Any stored preferences</li>
                    </ul>
                    <p className="font-semibold text-yellow-400">
                      Important: Even if you re-enable tracking later, we will not be able to recover your historical
                      data. You will start with a completely fresh profile.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDataDeletion} className="bg-red-600 hover:bg-red-700">
                    Yes, Delete My Data Permanently
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-green-400">Re-enable Data Tracking</CardTitle>
            <CardDescription>Restore data collection for your account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              If you previously requested data deletion, you can re-enable tracking to:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1 ml-4">
              <li>Resume match data collection</li>
              <li>Restore access to statistics</li>
              <li>Enable personalized features</li>
              <li>Contribute to community analytics</li>
            </ul>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-md p-3 mt-4">
              <p className="text-sm text-blue-400">
                <strong>Note:</strong> Re-enabling tracking will start fresh data collection. Any historical data from
                before deletion may not be recovered.
              </p>
            </div>
            <Button onClick={handleReEnableTracking} variant="default" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Processing...
                </>
              ) : (
                "Re-enable Tracking"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Additional Information */}
      <Card>
        <CardHeader>
          <CardTitle>Important Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-2">Authentication Process</h3>
            <p className="text-muted-foreground">
              Both actions require Steam OpenID authentication to verify your account ownership. You will be redirected
              to Steam's secure login page and then back to this site.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Processing Time</h3>
            <p className="text-muted-foreground">
              Data deletion requests are typically processed within 24-48 hours. Re-enabling tracking takes effect
              immediately after verification.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-2">Contact</h3>
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
