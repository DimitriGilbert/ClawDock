import { Badge } from "@/components/ui/badge";
import { ModeToggle } from "@/components/mode-toggle";
import { cn } from "@/lib/utils";

export interface HeaderProps {
  className?: string;
  agentName?: string;
}

export function Header({
  className,
  agentName = "Clawthis",
}: HeaderProps): React.ReactElement {
  return (
    <header
      data-slot="header"
      className={cn(
        "flex h-14 items-center justify-between border-b bg-background px-4",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold tracking-tight text-foreground">
          ClawDock Gateway
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Agent:</span>
          <Badge variant="secondary">{agentName}</Badge>
        </div>
        <ModeToggle />
      </div>
    </header>
  );
}

export default Header;
