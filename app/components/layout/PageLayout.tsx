import { Header } from '~/components/layout/Header';
import { Sidebar } from '~/components/layout/sidebar/Sidebar';
import { Card } from '../ui/card';

export default function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-row min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 overflow-y-auto bg-center bg-no-repeat bg-cover bg-[url('/background.svg')]">
          <Card className="w-full max-w-7xl mx-auto">{children}</Card>
        </main>
      </div>
    </div>
  );
}
