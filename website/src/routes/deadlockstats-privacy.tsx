import { createFileRoute } from "@tanstack/react-router";

import { Prose } from "~/components/patterns/content/Prose";
import { PageHeader } from "~/components/patterns/page/PageHeader";
import { PageShell } from "~/components/patterns/page/PageShell";
import { Card, CardContent } from "~/components/ui/card";
import { Heading } from "~/components/ui/heading";
import { Stack } from "~/components/ui/stack";
import { TextLink } from "~/components/ui/text-link";
import { seo } from "~/lib/seo";

export const Route = createFileRoute("/deadlockstats-privacy")({
  head: () => {
    const base = seo({
      title: "Deadlock Stats Privacy Policy",
      description: "Deadlock Stats Privacy Policy",
      path: "/deadlockstats-privacy",
    });
    return {
      ...base,
      meta: [...base.meta, { name: "robots", content: "noindex, nofollow" }],
    };
  },
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  const lastUpdated = "August 8, 2025";
  const effectiveDate = "August 8, 2025";
  return (
    <PageShell width="prose" density="content">
      <PageHeader
        size="lg"
        title="Privacy Policy for DeadlockStats"
        description={
          <>
            <strong className="font-semibold text-foreground">Effective Date:</strong> {effectiveDate}
          </>
        }
      />

      <Card tone="inset" size="sm">
        <CardContent>
          <Stack gap={1}>
            <p className="text-lg font-bold">Deadlock API</p>
            <p>
              <strong className="font-semibold">Contact:</strong> Manuel Raimann (
              <TextLink href="mailto:info@deadlock-api.com">info@deadlock-api.com</TextLink>)
            </p>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Prose>
            <section>
              <Heading as="h2" size="xl">
                Introduction
              </Heading>
              <p>
                At Deadlock API, we are committed to protecting your privacy. This Privacy Policy explains how
                DeadlockStats ("the App") handles your personal information and data when you use our mobile
                application.
              </p>
            </section>

            <section>
              <Heading as="h2" size="xl">
                Information We Collect
              </Heading>

              <Heading size="default">No Personal Data Collection</Heading>
              <p>
                DeadlockStats does not collect, store, or process any personal information from our users. We do not
                gather:
              </p>
              <ul>
                <li>Names or contact information</li>
                <li>Email addresses or phone numbers</li>
                <li>Device identifiers or advertising IDs</li>
                <li>Location data</li>
                <li>Payment information</li>
                <li>Any other personally identifiable information</li>
              </ul>

              <Heading size="default">Steam Account Integration</Heading>
              <p>
                The App provides the option to link your Steam account through OpenID authentication to display
                personalized game statistics for Deadlock. This process:
              </p>
              <ul>
                <li>Uses Steam's secure OpenID system for authentication</li>
                <li>Only stores authentication data locally on your device</li>
                <li>Does not transmit or store your Steam credentials on our servers</li>
                <li>
                  Does not access personal information from your Steam account beyond what's necessary for game
                  statistics
                </li>
              </ul>

              <Heading size="default">Local Data Storage</Heading>
              <p>All data related to your use of the App is stored exclusively on your device, including:</p>
              <ul>
                <li>Steam authentication tokens</li>
                <li>Game statistics and preferences</li>
                <li>App settings and configurations</li>
              </ul>
            </section>

            <section>
              <Heading as="h2" size="xl">
                Your Rights and Choices
              </Heading>
              <p>You have complete control over your data:</p>
              <ul>
                <li>
                  <strong>Access:</strong> All data is stored locally and accessible only by you.
                </li>
                <li>
                  <strong>Deletion:</strong> Remove all data by signing out or uninstalling the App.
                </li>
                <li>
                  <strong>Control:</strong> No data is collected without your explicit action (linking your Steam
                  account).
                </li>
              </ul>
            </section>

            <section>
              <Heading as="h2" size="xl">
                AI Assistant Chatbot
              </Heading>
              <p>
                For enhanced protection against bots and abuse, DeadlockStats uses{" "}
                <a href="https://www.cloudflare.com/products/turnstile/" target="_blank" rel="noopener noreferrer">
                  Cloudflare Turnstile
                </a>{" "}
                as a privacy-first captcha solution. Turnstile helps verify genuine users transparently and securely,
                without tracking or cross-site profiling. Additionally, our AI Chatbot feature is powered by the{" "}
                <a href="https://ai.google.dev/gemini-api/docs/" target="_blank" rel="noopener noreferrer">
                  Google Gemini API
                </a>
                , which enables advanced conversational capabilities. When using the chatbot, user queries are securely
                sent to Google for processing, and results are delivered directly in the app; no queries are stored or
                used for advertising purposes by DeadlockStats.
              </p>
            </section>

            <section>
              <Heading as="h2" size="xl">
                Legal Compliance
              </Heading>
              <p>This Privacy Policy has been designed to comply with:</p>
              <ul>
                <li>European Union General Data Protection Regulation (GDPR)</li>
                <li>California Consumer Privacy Act (CCPA)</li>
                <li>Children's Online Privacy Protection Act (COPPA)</li>
                <li>Google Play Store privacy requirements</li>
                <li>Apple App Store privacy requirements</li>
                <li>Other applicable privacy laws and regulations</li>
              </ul>
              <p>
                Since DeadlockStats does not collect personal information, many privacy regulations do not apply to our
                data practices. However, we maintain this comprehensive policy to ensure transparency and compliance
                with platform requirements.
              </p>
            </section>
          </Prose>
        </CardContent>
      </Card>

      <Stack asChild gap={2} className="text-sm text-muted-foreground">
        <footer>
          <p>
            <strong className="font-semibold text-foreground">Last Updated:</strong> {lastUpdated}
          </p>
          <p>This Privacy Policy is effective as of the date listed above and applies to all users of DeadlockStats.</p>
        </footer>
      </Stack>
    </PageShell>
  );
}
