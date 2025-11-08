import { BarChart, Book, FileText, Grid, Home, ListOrdered, Swords } from "lucide-react";
import React from "react";
import { Link } from "react-router";
import { ASSETS_API_DOCS_URL, GAME_API_DOCS_URL } from "~/lib/consts";
import { SidebarLink } from "./sidebar-link";
import { SidebarSeparator } from "./sidebar-separator";

export function Sidebar() {
  return (
    <div className="bg-sidebar flex flex-col justify-center">
      <div className="px-4 py-6 flex items-center justify-center">
        <Link to="/" className="flex gap-2 items-center">
          <img
            src="/favicon.webp"
            alt="Deadlock API Logo"
            width={36}
            height={36}
            className="aspect-square object-contain"
          />
          <h1 className="lg:text-2xl font-bold tracking-tight text-lg text-white">Deadlock API</h1>
        </Link>
      </div>
      <aside className={`w-64 text-white p-4 h-full`}>
        <nav className="flex flex-col justify-between h-full">
          <div>
            <SidebarLink to="#" icon={Home} label="Home" />
            <SidebarSeparator label="Analytics" />
            <SidebarLink to="#" icon={BarChart} label="Rank Distribution" />
            <SidebarLink to="#" icon={Grid} label="Kill/Death Heatmap" />
            <SidebarSeparator label="Game" />
            <SidebarLink to="/heroes" icon={Swords} label="Heroes" />
            <SidebarLink to="#" icon={Grid} label="Items" />
            <SidebarLink to="#" icon={ListOrdered} label="Leaderboard" />
          </div>
          <div>
            <SidebarSeparator label="Documentation" />
            <SidebarLink to={GAME_API_DOCS_URL} icon={Book} target="_blank" label="Game API Docs" />
            <SidebarLink to={ASSETS_API_DOCS_URL} icon={FileText} target="_blank" label="Assets API Docs" />
          </div>
        </nav>
      </aside>
    </div>
  );
}
