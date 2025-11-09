import {ArrowUpRightIcon, ExternalLink, type LucideIcon} from "lucide-react";
import { Link, type LinkProps, useLocation } from "react-router";
import {Button} from "~/components/ui/button";
import {cn} from "~/lib/utils";

interface SidebarLinkProps extends LinkProps {
  icon: LucideIcon;
  label: string;
  external?: boolean;
}

export function SidebarLink({ icon: Icon, label, external, ...props }: SidebarLinkProps) {
  const location = useLocation();
  const isActive =
    !external && props.to === "/" ? location.pathname === "/" : location.pathname.startsWith(props.to.toString());
  const transition = "transition-colors duration-200";
  return (
    <Button asChild variant={isActive?"accent":"ghost"} className={cn("flex gap-2 group items-center p-2 rounded-md", transition)}>
    <Link
      {...props}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
    >
      <div
        className={cn("rounded-md shadow w-fit bg-gray-900 p-1", transition, isActive ? "bg-accent" : "group-hover:bg-accent")}
      >
        <Icon className={cn("w-5 h-5", transition, isActive ? "text-accent-foreground" : "text-gray-200 group-hover:text-accent-foreground")}/>
      </div>
      <div className="hidden lg:flex flex-row justify-between w-full gap-2">
        <span className={cn(transition, isActive ? "text-accent-foreground" : "text-white/70 group-hover:text-accent-foreground")}>
          {label}
        </span>
        {external && <ArrowUpRightIcon />}
      </div>
    </Link></Button>
  );
}
