import { Header } from "~/components/layout/Header";
import { Sidebar } from "~/components/layout/sidebar/sidebar";

export default function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-4 overflow-y-auto bg-center bg-no-repeat bg-cover bg-[url('/background.svg')]">
          {children}
        </main>
      </div>
    </div>
  );
}
