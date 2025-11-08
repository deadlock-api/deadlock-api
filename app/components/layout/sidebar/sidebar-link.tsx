import type { LucideIcon } from "lucide-react";
import { Link, type LinkProps } from "react-router";

interface SidebarLinkProps extends LinkProps {
  icon: LucideIcon;
  label: string;
}

export function SidebarLink({ icon: Icon, label, ...props }: SidebarLinkProps) {
  return (
    <Link
      {...props}
      className="group flex items-center p-2 rounded-md hover:bg-accent/40 transition-colors duration-200"
    >
      <div className="rounded-md bg-gray-900 p-1 mr-3 transition-colors duration-200 group-hover:bg-accent/50">
        <Icon className="w-5 h-5 text-gray-200 transition-colors duration-200 group-hover:text-accent-foreground" />
      </div>
      <span className="hidden md:inline text-white/70 transition-colors duration-200 group-hover:text-accent-foreground">
        {label}
      </span>
    </Link>
  );
}
