import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Loader2, MessageSquare, Plus, Trash2 } from "lucide-react";

interface Session {
  id: string;
  title: string | null;
  messageCount: number;
}

interface ChatSidebarProps {
  sessions: Session[] | undefined;
  isLoading: boolean;
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  isCreating: boolean;
  isDeleting: boolean;
}

export function ChatSidebar({
  sessions,
  isLoading,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  isCreating,
  isDeleting,
}: ChatSidebarProps) {
  return (
    <Card className="w-64 flex shrink-0 flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <MessageSquare className="size-4" />
            Sessions
          </CardTitle>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onNewChat}
            disabled={isCreating}
          >
            <Plus className="size-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : sessions?.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-4">
            No sessions yet
            <br />
            <Button
              variant="link"
              size="sm"
              className="mt-1 h-auto p-0 text-xs"
              onClick={onNewChat}
            >
              Start a new chat
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            {sessions?.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelectSession(session.id)}
                className={cn(
                  "group w-full text-left p-2 text-xs transition-colors cursor-pointer rounded-md flex items-center justify-between gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "hover:bg-muted",
                  activeSessionId === session.id && "bg-muted font-medium"
                )}
              >
                <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                  <span className="truncate">{session.title || "New Chat"}</span>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {session.messageCount}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 focus:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm("Are you sure?")) {
                       onDeleteSession(session.id);
                    }
                  }}
                  disabled={isDeleting}
                  aria-label="Delete session"
                >
                  <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                </Button>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
