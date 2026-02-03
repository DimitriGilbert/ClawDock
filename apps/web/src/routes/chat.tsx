import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MessageSquare, Plus, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
});

function ChatPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<Array<{id: string, role: string, content: string}>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: sessions, isLoading: sessionsLoading } = useQuery(
    trpc.chat.listSessions.queryOptions()
  );

  const createSession = useMutation({
    ...trpc.chat.createSession.mutationOptions(),
    onSuccess: (session) => {
      setActiveSessionId(session.id);
      toast.success("New session created");
      void queryClient.invalidateQueries({
        queryKey: trpc.chat.listSessions.queryKey(),
      });
    },
    onError: (error) => {
      toast.error(`Failed to create session: ${error.message}`);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isSubmitting) return;
    
    const userMessage = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue
    };
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSessionId,
          messages: [...messages, userMessage],
        }),
      });

      if (!response.ok) throw new Error("Failed to send message");
      
      const data = await response.json();
      const assistantMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: data.text
      };
      setMessages(prev => [...prev, assistantMessage]);
      
      if (!activeSessionId && data.sessionId) {
        setActiveSessionId(data.sessionId);
        void queryClient.invalidateQueries({
          queryKey: trpc.chat.listSessions.queryKey(),
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send message");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewChat = () => {
    createSession.mutate({});
    setMessages([]);
    setInputValue("");
  };

  const activeSession = sessions?.find((s) => s.id === activeSessionId);

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      {/* Session Sidebar */}
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
              onClick={handleNewChat}
              disabled={createSession.isPending}
            >
              {createSession.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Plus className="size-3" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto py-2">
          {sessionsLoading ? (
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
                onClick={handleNewChat}
              >
                Start a new chat
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              {sessions?.map((session) => (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={cn(
                    "w-full text-left p-2 text-xs transition-colors",
                    "hover:bg-muted",
                    activeSessionId === session.id && "bg-muted font-medium"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{session.title}</span>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {session.messageCount}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chat Area */}
      <Card className="flex flex-1 flex-col">
        {/* Header */}
        <CardHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">
              {activeSession ? activeSession.title : "New Chat"}
            </CardTitle>
            {activeSession && (
              <Badge variant="outline" className="text-xs">
                {activeSession.messageCount} messages
              </Badge>
            )}
          </div>
        </CardHeader>

        {/* Messages */}
        <CardContent className="flex-1 overflow-y-auto py-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="mb-2 size-8 opacity-50" />
              <p className="text-xs">Start a conversation</p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] px-3 py-2 text-xs",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    )}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))}
              {isSubmitting && (
                <div className="flex justify-start">
                  <div className="bg-muted px-3 py-2">
                    <Loader2 className="size-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>

        {/* Input */}
        <div className="border-t p-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.currentTarget.value)}
              placeholder="Type a message..."
              disabled={isSubmitting}
              className="flex-1"
            />
            <Button type="submit" disabled={!inputValue.trim() || isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
