import type { LucideIcon } from "lucide-react";
import { Link, type LinkProps, useLocation } from "react-router";

interface SidebarLinkProps extends LinkProps {
  icon: LucideIcon;
  label: string;
}

export function SidebarLink({ icon: Icon, label, ...props }: SidebarLinkProps) {
  const location = useLocation();
  const isActive = props.to === "/" ? location.pathname === "/" : location.pathname.startsWith(props.to.toString());
  return (
    <Link
      {...props}
      className={`group flex items-center p-2 rounded-md transition-colors duration-200 ${
        isActive ? "bg-accent/60" : "hover:bg-accent/40"
      }`}
    >
      <div
        className={`rounded-md bg-gray-900 p-1 mr-3 transition-colors duration-200 ${
          isActive ? "bg-accent/70" : "group-hover:bg-accent/50"
        }`}
      >
        <Icon
          className={`w-5 h-5 transition-colors duration-200 ${
            isActive ? "text-accent-foreground" : "text-gray-200 group-hover:text-accent-foreground"
          }`}
        />
      </div>
      <span
        className={`hidden md:inline transition-colors duration-200 ${
          isActive ? "text-accent-foreground" : "text-white/70 group-hover:text-accent-foreground"
        }`}
      >
        {label}
      </span>
    </Link>
  );
}
