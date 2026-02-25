import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => {
  return [
    { title: "Deadlock Stats Privacy Policy" },
    { name: "description", content: "Deadlock Stats Privacy Policy" },
    { name: "robots", content: "noindex, nofollow" },
  ];
};

export default function PrivacyPolicy() {
  const lastUpdated = "August 8, 2025";
  const effectiveDate = "August 8, 2025";
  return (
    <div className="bg-gray-900 font-sans text-gray-300 antialiased">
      {/* Content container */}
      <div className="container mx-auto max-w-4xl bg-gray-800 p-6 sm:p-10 my-8 rounded-lg border border-gray-700">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white mb-4">Privacy Policy for DeadlockStats</h1>

        <p className="mb-6 text-gray-400">
          <strong className="font-semibold text-gray-200">Effective Date:</strong> {effectiveDate}
        </p>

        {/* Highlighted contact info block */}
        <div className="mb-8 p-4 bg-gray-900 rounded-lg border border-gray-700">
          <p className="text-lg font-bold text-white">Deadlock API</p>
          <p className="text-gray-300 mt-1">
            <strong className="font-semibold">Contact:</strong> Manuel Raimann (
            <a
              href="mailto:info@deadlock-api.com"
              className="text-blue-400 hover:text-blue-300 hover:underline transition-colors duration-200"
            >
              info@deadlock-api.com
            </a>
            )
          </p>
        </div>

        <section>
          <h2 className="text-2xl font-bold text-white mt-8 mb-3 pb-2 border-b border-gray-700">Introduction</h2>
          <p className="leading-relaxed">
            At Deadlock API, we are committed to protecting your privacy. This Privacy Policy explains how DeadlockStats
            ("the App") handles your personal information and data when you use our mobile application.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mt-8 mb-3 pb-2 border-b border-gray-700">
            Information We Collect
          </h2>

          <h3 className="text-xl font-semibold text-gray-100 mt-6 mb-2">No Personal Data Collection</h3>
          <p className="leading-relaxed mb-4">
            DeadlockStats does not collect, store, or process any personal information from our users. We do not gather:
          </p>
          <ul className="list-disc list-inside space-y-2 pl-4">
            <li>Names or contact information</li>
            <li>Email addresses or phone numbers</li>
            <li>Device identifiers or advertising IDs</li>
            <li>Location data</li>
            <li>Payment information</li>
            <li>Any other personally identifiable information</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-100 mt-6 mb-2">Steam Account Integration</h3>
          <p className="leading-relaxed mb-4">
            The App provides the option to link your Steam account through OpenID authentication to display personalized
            game statistics for Deadlock. This process:
          </p>
          <ul className="list-disc list-inside space-y-2 pl-4">
            <li>Uses Steam's secure OpenID system for authentication</li>
            <li>Only stores authentication data locally on your device</li>
            <li>Does not transmit or store your Steam credentials on our servers</li>
            <li>
              Does not access personal information from your Steam account beyond what's necessary for game statistics
            </li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-100 mt-6 mb-2">Local Data Storage</h3>
          <p className="leading-relaxed mb-4">
            All data related to your use of the App is stored exclusively on your device, including:
          </p>
          <ul className="list-disc list-inside space-y-2 pl-4">
            <li>Steam authentication tokens</li>
            <li>Game statistics and preferences</li>
            <li>App settings and configurations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mt-8 mb-3 pb-2 border-b border-gray-700">
            Your Rights and Choices
          </h2>
          <p className="leading-relaxed mb-4">You have complete control over your data:</p>
          <ul className="list-disc list-inside space-y-2 pl-4">
            <li>
              <strong className="font-semibold text-gray-100">Access:</strong> All data is stored locally and accessible
              only by you.
            </li>
            <li>
              <strong className="font-semibold text-gray-100">Deletion:</strong> Remove all data by signing out or
              uninstalling the App.
            </li>
            <li>
              <strong className="font-semibold text-gray-100">Control:</strong> No data is collected without your
              explicit action (linking your Steam account).
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white mt-8 mb-3 pb-2 border-b border-gray-700">
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
          <h2 className="text-2xl font-bold text-white mt-8 mb-3 pb-2 border-b border-gray-700">
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
          <h2 className="text-2xl font-bold text-white mt-8 mb-3 pb-2 border-b border-gray-700">Legal Compliance</h2>
          <p className="leading-relaxed mb-4">This Privacy Policy has been designed to comply with:</p>
          <ul className="list-disc list-inside space-y-2 pl-4">
            <li>European Union General Data Protection Regulation (GDPR)</li>
            <li>California Consumer Privacy Act (CCPA)</li>
            <li>Children's Online Privacy Protection Act (COPPA)</li>
            <li>Google Play Store privacy requirements</li>
            <li>Apple App Store privacy requirements</li>
            <li>Other applicable privacy laws and regulations</li>
          </ul>
          <p className="leading-relaxed mt-4">
            Since DeadlockStats does not collect personal information, many privacy regulations do not apply to our data
            practices. However, we maintain this comprehensive policy to ensure transparency and compliance with
            platform requirements.
          </p>
        </section>

        <hr className="my-10 border-gray-700" />

        <footer className="text-sm">
          <p className="text-gray-400">
            <strong className="font-semibold text-gray-200">Last Updated:</strong> {lastUpdated}
          </p>
          <p className="mt-2 text-gray-500">
            This Privacy Policy is effective as of the date listed above and applies to all users of DeadlockStats.
          </p>
        </footer>
      </div>
    </div>
  );
}
