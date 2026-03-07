import { cn } from "~/lib/utils";
import { Card, CardContent } from "~/components/ui/card";

interface FilterCardProps {
  children: React.ReactNode;
  className?: string;
}

export function FilterCard({ children, className }: FilterCardProps) {
  return (
    <Card className={cn("w-fit mx-auto", className)}>
      <CardContent>
        <div className="flex flex-wrap items-end gap-2 justify-center">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

export function FilterCardCustom({ children, className }: FilterCardProps) {
  return (
    <Card className={cn("w-fit mx-auto", className)}>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
