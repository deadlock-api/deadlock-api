import type { LinksFunction } from "react-router";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import "./tailwind.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import NavHeader from "~/components/nav_header";

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />

        <link rel="icon" type="image/ico" href="favicon.ico" />
        <link rel="icon" type="image/webp" href="favicon.webp" />
        <link rel="icon" type="image/png" href="favicon.png" />

        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Deadlock API provides game data like images, stats, and more." />
        <meta name="keywords" content="Deadlock, API, Game, Data, Images, Stats, Heroes, Items, Weapons, Abilities" />
        <meta name="Cache-Control" content="public, max-age=86400" />
        <meta name="robots" content="index, follow" />

        <meta name="og:title" content="Deadlock API" />
        <meta name="og:description" content="Deadlock API provides game data like images, stats, and more." />
        <meta name="og:image" content="https://deadlock-api.com/favicon.webp" />
        <meta name="og:url" content="https://deadlock-api.com" />
        <meta name="og:type" content="website" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta property="twitter:domain" content="deadlock-api.pages.dev" />
        <meta property="twitter:url" content="https://deadlock-api.pages.dev" />
        <meta name="twitter:title" content="Deadlock API" />
        <meta name="twitter:description" content="Deadlock API provides game data like images, stats, and more." />
        <meta name="twitter:image" content="https://deadlock-api.com/favicon.webp" />

        <Meta />
        <Links />
      </head>
      <body className="bg-center bg-no-repeat bg-cover bg-fixed bg-[url('/background.svg')]">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: 100,
    },
  },
});
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NavHeader />

      <main className="flex justify-center items-start">
        <div className="my-6 w-full max-w-6xl bg-gray-900 rounded-lg shadow-lg p-8">
          <Outlet />
        </div>
      </main>
    </QueryClientProvider>
  );
}

export function HydrateFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-900 z-50">
      <div className="space-y-4 text-center">
        <svg
          aria-hidden="true"
          className="inline w-10 h-10 animate-spin text-gray-600 fill-blue-600"
          viewBox="0 0 100 101"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
            fill="currentColor"
          />
          <path
            d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
            fill="currentFill"
          />
        </svg>
        <p>Loading...</p>
      </div>
    </div>
  );
}
