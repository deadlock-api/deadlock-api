import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import { Card, CardTitle } from "~/components/ui/card";
import { ASSETS_API_DOCS_URL, DATABASE_DUMPS_URL, GAME_API_DOCS_URL, STREAMKIT_URL } from "~/lib/consts";

export function meta() {
  return [{ title: "Deadlock API" }, { name: "description", content: "Deadlock API" }];
}

export default function Index() {
  return (
    <Card className="text-center">
      <CardTitle>
        <h1 className="text-center text-4xl">Deadlock API</h1>
      </CardTitle>
      <p className="text-balance">
        The Deadlock API provides a comprehensive set of endpoints to access game data, including match history, player
        statistics, and more. Whether you are a developer looking to integrate game data into your application or a
        player wanting to analyze your performance, the Deadlock API has you covered.
      </p>

      <h2 className="text-2xl mb-4 mt-8">Available Services</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-4 gap-4 mx-8">
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
    </Card>
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
      <p className="text-balance text-left mx-auto leading-5.5 h-16.5 line-clamp-3">{description}</p>
      <Button type="button" className="mx-auto w-full" variant="accent">
        <Link to={link} target="_blank" rel="noopener noreferrer" className="text-ellipsis overflow-hidden">
          {linkLabel}
        </Link>
      </Button>
    </Card>
  );
}
