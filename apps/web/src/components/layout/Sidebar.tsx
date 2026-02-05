import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Camera, Layers, MessageSquare, FolderOpen } from "lucide-react";

export interface NavItem {
  readonly to: string;
  readonly label: string;
  readonly icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: readonly NavItem[] = [
  {
    to: "/",
    label: "Stack",
    icon: Layers,
  },
  {
    to: "/chat",
    label: "Chat Bay",
    icon: MessageSquare,
  },
  {
    to: "/files",
    label: "Agent Files",
    icon: FolderOpen,
  },
  {
    to: "/snapshots",
    label: "Snapshots",
    icon: Camera,
  },
] as const;

export interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps): React.ReactElement {
  const location = useLocation();

  return (
    <aside
      data-slot="sidebar"
      className={cn(
        "flex flex-col w-48 h-full border-r bg-sidebar text-sidebar-foreground",
        className
      )}
    >
      <nav className="flex flex-col gap-0.5 p-2">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.to;
          const Icon = item.icon;

          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors rounded-none",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export { NAV_ITEMS };
