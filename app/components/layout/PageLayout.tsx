import { Header } from "~/components/layout/Header";
import { Sidebar } from "~/components/layout/sidebar/Sidebar";
import { Card } from "../ui/card";

export default function PageLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-row min-h-screen">
			<Sidebar />
			<div className="flex flex-col flex-1 min-h-screen w-full overflow-auto">
				<Header />
				<main className="h-full p-16 bg-center bg-no-repeat bg-cover bg-[url('/background.svg')]">
					<Card className="mx-auto p-8">{children}</Card>
				</main>
			</div>
		</div>
	);
}
