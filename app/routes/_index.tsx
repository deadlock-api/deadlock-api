import { ArrowUpRightIcon } from "lucide-react";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import { Card, CardTitle } from "~/components/ui/card";
import {
	ASSETS_API_DOCS_URL,
	DATABASE_DUMPS_URL,
	GAME_API_DOCS_URL,
	STREAMKIT_URL,
} from "~/lib/consts";

export function meta() {
	return [
		{ title: "Deadlock API" },
		{ name: "description", content: "Deadlock API" },
	];
}

export default function Index() {
	return (
		<div className="space-y-8">
			<section className="space-y-4">
				<h1 className="text-center text-4xl">Deadlock API</h1>
				<p className="text-pretty text-center max-w-3xl mx-auto">
					The Deadlock API provides a comprehensive set of endpoints to access
					game data, including match history, player statistics, and more.
					Whether you are a developer looking to integrate game data into your
					application or a player wanting to analyze your performance, the
					Deadlock API has you covered.
				</p>
			</section>
			<section className="space-y-4">
				<h2 className="text-2xl text-center">Available Services</h2>
				<div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-4">
					<ServiceBox
						name="Assets API"
						description="Provides static game assets such as static heroes/item data, images, icons, sounds."
						link={ASSETS_API_DOCS_URL}
						linkLabel="Assets API Documentation"
					/>
					<ServiceBox
						name="Game API"
						description="Offers game data including matches, players, and statistics."
						link={GAME_API_DOCS_URL}
						linkLabel="Game API Documentation"
					/>
					<ServiceBox
						name="Database Dumps"
						description="Download up-to-date database snapshots for offline analysis or research."
						link={DATABASE_DUMPS_URL}
						linkLabel="Access Database Dumps"
					/>
					<ServiceBox
						name="Stream Kit"
						description="Enhance your livestreams with real-time game data overlays and widgets."
						link={STREAMKIT_URL}
						linkLabel="Explore Stream Kit"
					/>
				</div>
			</section>
			<section className="text-center space-y-4">
				<h2 className="text-3xl font-semibold tracking-tight">Our Sponsors</h2>
				<p className="text-muted-foreground">
					We are grateful to our sponsors for their support. <br />
					Please check out our{" "}
					<a
						href="https://www.patreon.com/user?u=68961896"
						target="_blank"
						rel="noopener noreferrer"
						className="font-medium text-primary underline underline-offset-4"
						title="Support on Patreon"
					>
						Patreon
					</a>
					.
				</p>
				<div className="flex justify-center items-center gap-8 mt-4">
					<a
						href="https://statlocker.gg/"
						title="Statlocker.GG"
						target="_blank"
						rel="noreferrer"
						className="max-w-[200px]"
					>
						<img src="/logo/statlocker.png" alt="Statlocker.GG Logo" />
					</a>
					<a
						href="https://blast.tv/"
						title="Blast.TV"
						target="_blank"
						rel="noreferrer"
						className="max-w-[200px]"
					>
						<img src="/logo/blast.svg" alt="Blast.TV Logo" />
					</a>
				</div>
			</section>

			<hr />

			<p className="text-sm text-center text-muted-foreground">
				deadlock-api.com is not endorsed by Valve and does not reflect the views
				or opinions of Valve or anyone officially involved in producing or
				managing Valve properties.
			</p>
		</div>
	);
}

function ServiceBox({
	name,
	description,
	link,
	linkLabel,
}: {
	name: string;
	description: string;
	link: string;
	linkLabel: string;
}) {
	return (
		<Card className="p-8">
			<CardTitle>
				<h2 className="text-2xl text-center line-clamp-1">{name}</h2>
			</CardTitle>
			<p className="text-pretty text-center mx-auto leading-5.5 h-16.5 line-clamp-3">
				{description}
			</p>
			<Button
				type="button"
				className="mx-auto w-full text-ellipsis overflow-hidden"
				variant="accent"
				asChild
			>
				<Link
					to={link}
					target="_blank"
					rel="noopener noreferrer"
					className="cursor-pointer"
				>
					{linkLabel}
					<ArrowUpRightIcon />
				</Link>
			</Button>
		</Card>
	);
}
