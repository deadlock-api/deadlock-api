import { createFileRoute, redirect } from "@tanstack/react-router";

/** The tracker's own page is the demo profile: it says how to get a real one, and patrons open theirs from /patron. */
export const Route = createFileRoute("/tracker")({
  beforeLoad: () => {
    throw redirect({ to: "/tracker/demo", statusCode: 301 });
  },
});
