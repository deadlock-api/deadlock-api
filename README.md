# Deadlock API Frontend

A modern, high-performance web frontend for the Deadlock game API, built with React 19 and React Router 7. This application provides detailed game statistics, hero/item analysis, and an AI-powered chat interface.

## 🚀 Features

- **Hero & Item Analytics**: Comprehensive statistics, matchup data, and performance trends for all Deadlock heroes and items.
- **AI Chat Assistant**: Integrated chat interface with streaming responses and tool support.
- **Patreon Integration**: Tiered access and rate limiting based on Patreon membership.
- **Data Visualization**: Interactive charts for hero win rates, item buy timings, and more using Recharts.
- **Secure & Robust**: Cloudflare Turnstile integration and strict TypeScript implementation.

## 🛠 Tech Stack

- **Framework**: [React 19](https://react.dev/) with [React Router 7](https://reactrouter.com/)
- **Build Tool**: [Vite 7](https://vitejs.dev/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/) with [tw-animate-css](https://github.com/m-p-h-c/tw-animate-css)
- **State Management**: [TanStack Query v5](https://tanstack.com/query/latest)
- **UI Components**: [Radix UI](https://www.radix-ui.com/) & custom Shadcn-inspired primitives
- **Linting/Formatting**: [Biome](https://biomejs.dev/)
- **Type Safety**: [TypeScript](https://www.typescriptlang.org/) (Strict Mode)

## 📦 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20.0.0
- [pnpm](https://pnpm.io/) (preferred package manager)

### Installation

```bash
pnpm install
```

### Environment Setup

Copy the example environment file and fill in the required values:

```bash
cp .env.example .env
```

### Development

Start the development server:

```bash
pnpm dev
```

### Building for Production

```bash
pnpm build
```

The build output will be in `build/client/`.

### Quality Control

```bash
pnpm lint      # Run Biome checks
pnpm fmt       # Format code with Biome
pnpm typecheck # Run TypeScript compiler checks
```

## 📂 Project Structure

- `app/components`: Reusable UI components and page-specific blocks.
- `app/routes`: File-based routing for different views (Heroes, Items, Chat, etc.).
- `app/hooks`: Custom React hooks for data fetching and state logic.
- `app/lib`: Utility functions and API client configurations.
- `app/queries`: TanStack Query hooks for server state.
- `app/types`: Shared TypeScript interfaces and types.

## 📄 License

Refer to the [LICENSE](LICENSE) file for details.
