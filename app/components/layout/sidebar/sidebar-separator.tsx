interface SidebarSeparatorProps {
  label: string;
}

export function SidebarSeparator({ label }: SidebarSeparatorProps) {
  return (
    <div className="relative flex items-center py-2">
      <div className="grow border-t border-gray-400"></div>
      <span className="shrink mx-4 text-gray-400 text-sm">{label}</span>
      <div className="grow border-t border-gray-400"></div>
    </div>
  );
}
