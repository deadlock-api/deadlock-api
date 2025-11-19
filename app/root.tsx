import {
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useNavigate,
} from "react-router";

import "./app.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import React from "react";
import "@fontsource-variable/inter";
import interWoff2 from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { isDevelopment } from "~/lib/consts";
import PageLayout from "./components/layout/PageLayout";

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>Deadlock API</title>
				<link
					rel="preload"
					href={interWoff2}
					as="font"
					type="font/woff2"
					crossOrigin="anonymous"
				/>
				<Meta />
				<Links />
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	const [queryClient] = React.useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						retry: 3,
						retryDelay: 100,
					},
				},
			}),
	);

	return (
		<QueryClientProvider client={queryClient}>
			<PageLayout>
				<Outlet />
			</PageLayout>

			{isDevelopment && <ReactQueryDevtools initialIsOpen={false} />}
		</QueryClientProvider>
	);
}

export function ErrorBoundary() {
	const navigate = useNavigate();

	const backToSafety = () => {
		navigate("/");
	};

	return (
		<AlertDialog open>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>An unexpected error occurred</AlertDialogTitle>
					<AlertDialogDescription>
						We are sorry, but something went wrong. Please return to the
						homepage.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogAction onClick={backToSafety}>
						Back to Homepage
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
