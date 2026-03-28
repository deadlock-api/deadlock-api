import type { MetaFunction } from "react-router";

import { createPageMeta } from "~/lib/meta";

export const meta: MetaFunction = () => {
  return [
    ...createPageMeta({
      title: "Deadlock Stats Privacy Policy",
      description: "Deadlock Stats Privacy Policy",
      path: "/deadlockstats-privacy",
    }),
    { name: "robots", content: "noindex, nofollow" },
  ];
};

export default function PrivacyPolicy() {
  const lastUpdated = "August 8, 2025";
  const effectiveDate = "August 8, 2025";
  return (
    <div className="bg-background font-sans text-foreground antialiased">
      {/* Content container */}
      <div className="container mx-auto my-8 max-w-4xl rounded-lg border border-border bg-card p-6 sm:p-10">
        <h1 className="mb-4 text-3xl font-extrabold text-foreground sm:text-4xl">Privacy Policy for DeadlockStats</h1>

        <p className="mb-6 text-muted-foreground">
          <strong className="font-semibold text-foreground">Effective Date:</strong> {effectiveDate}
        </p>

        {/* Highlighted contact info block */}
        <div className="mb-8 rounded-lg border border-border bg-background p-4">
          <p className="text-lg font-bold text-foreground">Deadlock API</p>
          <p className="mt-1 text-foreground">
            <strong className="font-semibold">Contact:</strong> Manuel Raimann (
            <a
              href="mailto:info@deadlock-api.com"
              className="text-blue-400 transition-colors duration-200 hover:text-blue-300 hover:underline"
            >
              info@deadlock-api.com
            </a>
            )
          </p>
        </div>

        <section>
          <h2 className="mt-8 mb-3 border-b border-border pb-2 text-2xl font-bold text-foreground">Introduction</h2>
          <p className="leading-relaxed">
            At Deadlock API, we are committed to protecting your privacy. This Privacy Policy explains how DeadlockStats
            ("the App") handles your personal information and data when you use our mobile application.
          </p>
        </section>

        <section>
          <h2 className="mt-8 mb-3 border-b border-border pb-2 text-2xl font-bold text-foreground">
            Information We Collect
          </h2>

          <h3 className="mt-6 mb-2 text-xl font-semibold text-foreground">No Personal Data Collection</h3>
          <p className="mb-4 leading-relaxed">
            DeadlockStats does not collect, store, or process any personal information from our users. We do not gather:
          </p>
          <ul className="list-inside list-disc space-y-2 pl-4">
            <li>Names or contact information</li>
            <li>Email addresses or phone numbers</li>
            <li>Device identifiers or advertising IDs</li>
            <li>Location data</li>
            <li>Payment information</li>
            <li>Any other personally identifiable information</li>
          </ul>

          <h3 className="mt-6 mb-2 text-xl font-semibold text-foreground">Steam Account Integration</h3>
          <p className="mb-4 leading-relaxed">
            The App provides the option to link your Steam account through OpenID authentication to display personalized
            game statistics for Deadlock. This process:
          </p>
          <ul className="list-inside list-disc space-y-2 pl-4">
            <li>Uses Steam's secure OpenID system for authentication</li>
            <li>Only stores authentication data locally on your device</li>
            <li>Does not transmit or store your Steam credentials on our servers</li>
            <li>
              Does not access personal information from your Steam account beyond what's necessary for game statistics
            </li>
          </ul>

          <h3 className="mt-6 mb-2 text-xl font-semibold text-foreground">Local Data Storage</h3>
          <p className="mb-4 leading-relaxed">
            All data related to your use of the App is stored exclusively on your device, including:
          </p>
          <ul className="list-inside list-disc space-y-2 pl-4">
            <li>Steam authentication tokens</li>
            <li>Game statistics and preferences</li>
            <li>App settings and configurations</li>
          </ul>
        </section>

        <section>
          <h2 className="mt-8 mb-3 border-b border-border pb-2 text-2xl font-bold text-foreground">
            Your Rights and Choices
          </h2>
          <p className="mb-4 leading-relaxed">You have complete control over your data:</p>
          <ul className="list-inside list-disc space-y-2 pl-4">
            <li>
              <strong className="font-semibold text-foreground">Access:</strong> All data is stored locally and
              accessible only by you.
            </li>
            <li>
              <strong className="font-semibold text-foreground">Deletion:</strong> Remove all data by signing out or
              uninstalling the App.
            </li>
            <li>
              <strong className="font-semibold text-foreground">Control:</strong> No data is collected without your
              explicit action (linking your Steam account).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mt-8 mb-3 border-b border-border pb-2 text-2xl font-bold text-foreground">
            AI Assistant Chatbot
          </h2>
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
            , which enables advanced conversational capabilities. When using the chatbot, user queries are securely sent
            to Google for processing, and results are delivered directly in the app; no queries are stored or used for
            advertising purposes by DeadlockStats.
          </p>
        </section>

        <section>
          <h2 className="mt-8 mb-3 border-b border-border pb-2 text-2xl font-bold text-foreground">
            Analytics with PostHog EU Cloud
          </h2>
          <p>
            For usage analytics and to enhance our product, we use{" "}
            <a href="https://posthog.com/" target="_blank" rel="noopener noreferrer">
              PostHog EU Cloud
            </a>
            . All analytics data—including events, session information, and behavioral metrics—is securely processed and
            stored on servers located in Frankfurt, Germany. This helps us comply with GDPR and ensures that your data
            does not leave the European Union. We have a data processing agreement in place with PostHog, and analytics
            are conducted using anonymized and/or pseudonymized data where possible. You may opt out of analytics at any
            time in your preferences. For more details about the data PostHog processes and your data protection rights,
            see our{" "}
            <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="mt-8 mb-3 border-b border-border pb-2 text-2xl font-bold text-foreground">Legal Compliance</h2>
          <p className="mb-4 leading-relaxed">This Privacy Policy has been designed to comply with:</p>
          <ul className="list-inside list-disc space-y-2 pl-4">
            <li>European Union General Data Protection Regulation (GDPR)</li>
            <li>California Consumer Privacy Act (CCPA)</li>
            <li>Children's Online Privacy Protection Act (COPPA)</li>
            <li>Google Play Store privacy requirements</li>
            <li>Apple App Store privacy requirements</li>
            <li>Other applicable privacy laws and regulations</li>
          </ul>
          <p className="mt-4 leading-relaxed">
            Since DeadlockStats does not collect personal information, many privacy regulations do not apply to our data
            practices. However, we maintain this comprehensive policy to ensure transparency and compliance with
            platform requirements.
          </p>
        </section>

        <hr className="my-10 border-border" />

        <footer className="text-sm">
          <p className="text-muted-foreground">
            <strong className="font-semibold text-foreground">Last Updated:</strong> {lastUpdated}
          </p>
          <p className="mt-2 text-muted-foreground">
            This Privacy Policy is effective as of the date listed above and applies to all users of DeadlockStats.
          </p>
        </footer>
      </div>
    </div>
  );
}
