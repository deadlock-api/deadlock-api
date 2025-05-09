import { Link } from "react-router";

export default function NavHeader() {
  return (
    <header className="px-8 py-4 bg-gray-900 shadow">
      <div className="max-w-6xl mx-auto flex flex-wrap sm:flex-nowrap items-center justify-between">
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-12">
          <Link to="/" className="text-lg font-medium text-white">
            <span className="flex gap-2">
              <img src="favicon.webp" alt="Icon" width={36} height={36} />
              <h1 className="text-3xl font-bold tracking-tight">Deadlock API</h1>
            </span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link to="/heroes" className="text-lg font-medium hover:underline">
              Heroes
            </Link>
            <Link to="/items" className="text-lg font-medium hover:underline">
              Items
            </Link>
            <a
              href="https://assets.deadlock-api.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg font-medium hover:underline flex items-center gap-1"
              title="Assets API (external)"
            >
              Assets API
              <svg
                className="w-4 h-4 inline"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
            <a
              href="https://api.deadlock-api.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg font-medium hover:underline flex items-center gap-1"
              title="Game API (external)"
            >
              Game API
              <svg
                className="w-4 h-4 inline"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://stats.uptimerobot.com/V1HIfGQT77"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-gray-500 hover:text-green-400 rounded flex items-center"
            title="Service Status"
            aria-label="Service Status"
          >
            <span className="sr-only">Service Status</span>
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden={true}
            >
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
              <circle cx="12" cy="12" r="6" fill="currentColor" />
            </svg>
          </a>
          <a
            href="https://discord.gg/XMF9Xrgfqu"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-gray-500 rounded hover:text-[#7289da]"
            aria-label="Discord"
            title="Discord Server beitreten"
          >
            <span className="sr-only">Discord Server beitreten</span>
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden={true}>
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
            </svg>
          </a>
          <a
            href="https://github.com/deadlock-api/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-gray-500 rounded hover:text-white"
            title="GitHub Repository besuchen"
          >
            <span className="sr-only">GitHub Repository besuchen</span>
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden={true}>
              <path d="M12 2C6.477 2 2 6.484 2 12.021c0 4.428 2.865 8.184 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.868-.014-1.703-2.782.605-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.004.07 1.532 1.032 1.532 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.339-2.221-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.025A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.295 2.748-1.025 2.748-1.025.546 1.378.202 2.397.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.847-2.337 4.695-4.566 4.944.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.744 0 .268.18.58.688.482C19.138 20.2 22 16.448 22 12.021 22 6.484 17.523 2 12 2z" />
            </svg>
          </a>
          <a
            href="https://www.patreon.com/user?u=68961896"
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-gray-500 rounded hover:text-[#f96854]"
            title="Support on Patreon"
          >
            <span className="sr-only">Support on Patreon</span>
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden={true}>
              <circle cx="15.5" cy="8.5" r="5.5" />
              <rect x="2" y="3" width="4" height="18" rx="2" />
            </svg>
          </a>
        </div>
      </div>
    </header>
  );
}
