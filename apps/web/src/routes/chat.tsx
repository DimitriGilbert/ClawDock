import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

import { trpc } from "@/utils/trpc";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquare } from "lucide-react";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
});

function ChatPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

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

  const deleteSession = useMutation({
    ...trpc.chat.deleteSession.mutationOptions(),
    onSuccess: (_, variables) => {
      toast.success("Session deleted");
      if (activeSessionId === variables.id) {
        setActiveSessionId(null);
      }
      void queryClient.invalidateQueries({
        queryKey: trpc.chat.listSessions.queryKey(),
      });
    },
    onError: (error) => {
      toast.error(`Failed to delete session: ${error.message}`);
    },
  });

  // Use AI SDK's useChat hook
  const { messages, status, sendMessage } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
  });

  const isLoading = status === "streaming" || status === "submitted";

  const handleSendMessage = (text: string) => {
    sendMessage(
      { text },
      {
        body: {
          sessionId: activeSessionId,
        },
      }
    );
  };

  const handleNewChat = () => {
    createSession.mutate({});
  };

  const activeSession = sessions?.find((s) => s.id === activeSessionId);

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      <ChatSidebar
        sessions={sessions}
        isLoading={sessionsLoading}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewChat={handleNewChat}
        onDeleteSession={(id) => deleteSession.mutate({ id })}
        isCreating={createSession.isPending}
        isDeleting={deleteSession.isPending}
      />

      {/* Chat Area */}
      <Card className="flex flex-1 flex-col">
        {/* Header */}
        <CardHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">
              {activeSession ? activeSession.title || "New Chat" : "New Chat"}
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
                <ChatMessage key={message.id} message={message} />
              ))}
            </div>
          )}
        </CardContent>

        <ChatInput isLoading={isLoading} onSend={handleSendMessage} />
      </Card>
    </div>
  );
}
