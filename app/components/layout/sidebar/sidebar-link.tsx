import { ExternalLink, type LucideIcon } from "lucide-react";
import { Link, type LinkProps, useLocation } from "react-router";

interface SidebarLinkProps extends LinkProps {
  icon: LucideIcon;
  label: string;
  external?: boolean;
}

export function SidebarLink({ icon: Icon, label, external, ...props }: SidebarLinkProps) {
  const location = useLocation();
  const isActive =
    !external && props.to === "/" ? location.pathname === "/" : location.pathname.startsWith(props.to.toString());
  return (
    <Link
      {...props}
      className={`group flex items-center p-2 rounded-md transition-colors duration-200 ${
        isActive ? "bg-accent/60" : "hover:bg-accent/40"
      }`}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
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
      <div className="flex flex-row justify-between w-full ">
        <span
          className={`hidden md:inline transition-colors duration-200 ${
            isActive ? "text-accent-foreground" : "text-white/70 group-hover:text-accent-foreground"
          }`}
        >
          {label}
        </span>
        {external && <ExternalLink />}
      </div>
    </Link>
  );
}
