import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FileText, Save, History, RotateCcw, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/files")({
  component: FilesPage,
});

// Agent file types
const AGENT_FILES = [
  { id: "agents", label: "AGENTS.md", description: "Agent Operations" },
  { id: "soul", label: "SOUL.md", description: "Core Identity" },
  { id: "goals", label: "GOALS.md", description: "Current Goals" },
  { id: "reflection", label: "REFLECTION.md", description: "Self-Reflection" },
] as const;

type AgentFileId = (typeof AGENT_FILES)[number]["id"];

function FilesPage(): React.ReactElement {
  const [selectedFile, setSelectedFile] = useState<AgentFileId>("agents");
  const [editedContent, setEditedContent] = useState<string>("");
  const [hasChanges, setHasChanges] = useState<boolean>(false);
  const queryClient = useQueryClient();

  // Fetch file content
  const fileQuery = useQuery({
    ...trpc.agent.getFile.queryOptions({ filename: selectedFile }),
    enabled: true,
  });

  // Fetch file history
  const historyQuery = useQuery({
    ...trpc.agent.getFileHistory.queryOptions({
      filename: selectedFile,
      limit: 20,
    }),
    enabled: true,
  });

  // Update file mutation
  const updateMutation = useMutation({
    ...trpc.agent.updateFile.mutationOptions(),
    onSuccess: () => {
      toast.success("File saved successfully");
      setHasChanges(false);
      queryClient.invalidateQueries({
        queryKey: trpc.agent.getFile.queryKey({ filename: selectedFile }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.agent.getFileHistory.queryKey({
          filename: selectedFile,
          limit: 20,
        }),
      });
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error.message}`);
    },
  });

  // Revert file mutation
  const revertMutation = useMutation({
    ...trpc.agent.revertFile.mutationOptions(),
    onSuccess: () => {
      toast.success("File reverted successfully");
      queryClient.invalidateQueries({
        queryKey: trpc.agent.getFile.queryKey({ filename: selectedFile }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.agent.getFileHistory.queryKey({
          filename: selectedFile,
          limit: 20,
        }),
      });
    },
    onError: (error) => {
      toast.error(`Failed to revert: ${error.message}`);
    },
  });

  // Handle file selection
  const handleSelectFile = (fileId: AgentFileId) => {
    if (hasChanges) {
      const confirmed = window.confirm(
        "You have unsaved changes. Discard them?"
      );
      if (!confirmed) return;
    }
    setSelectedFile(fileId);
    setHasChanges(false);
    setEditedContent("");
  };

  // Handle content change
  const handleContentChange = (value: string) => {
    setEditedContent(value);
    setHasChanges(true);
  };

  // Handle save
  const handleSave = () => {
    if (!hasChanges) return;
    updateMutation.mutate({
      filename: selectedFile,
      content: editedContent,
    });
  };

  // Handle revert
  const handleRevert = (commitHash: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to revert to this version?"
    );
    if (!confirmed) return;
    revertMutation.mutate({
      filename: selectedFile,
      commitHash,
    });
  };

  // Get current content (edited or fetched)
  const currentContent = hasChanges
    ? editedContent
    : fileQuery.data?.content ?? "";

  // Determine if file is editable
  const isEditable = fileQuery.data?.editable ?? true;
  const isLoading = fileQuery.isLoading || updateMutation.isPending;

  return (
    <div className="p-4 space-y-4 h-[calc(100vh-4rem)]">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="size-5 text-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            Agent Files Editor
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="warning" className="gap-1">
              <AlertCircle className="size-3" />
              Unsaved changes
            </Badge>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || !isEditable || isLoading}
          >
            {updateMutation.isPending ? (
              <>
                <Check className="size-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="size-4" />
                Save
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-12 gap-4 h-[calc(100%-3rem)]">
        {/* File List Sidebar */}
        <Card className="col-span-2 flex flex-col h-full overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2">
              <FileText className="size-3" />
              Files
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto px-2">
            <div className="space-y-1">
              {AGENT_FILES.map((file) => (
                <button
                  key={file.id}
                  onClick={() => handleSelectFile(file.id)}
                  className={cn(
                    "w-full text-left p-2 text-xs transition-colors hover:bg-muted",
                    "border border-transparent",
                    selectedFile === file.id
                      ? "bg-muted border-border"
                      : "bg-transparent"
                  )}
                >
                  <div className="font-medium">{file.label}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {file.description}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Editor Area */}
        <Card className="col-span-6 flex flex-col h-full overflow-hidden">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <div>
              <CardTitle className="text-xs flex items-center gap-2">
                <FileText className="size-3" />
                Editor
              </CardTitle>
              <CardDescription className="text-[10px] mt-1">
                {AGENT_FILES.find((f) => f.id === selectedFile)?.label}
                {!isEditable && (
                  <Badge variant="destructive" className="ml-2 text-[10px]">
                    Read Only
                  </Badge>
                )}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <textarea
              value={currentContent}
              onChange={(e) => handleContentChange(e.target.value)}
              disabled={!isEditable || fileQuery.isLoading}
              className={cn(
                "w-full h-full resize-none border-0 bg-background p-4 text-xs",
                "font-mono leading-relaxed focus:outline-none focus:ring-0",
                !isEditable && "opacity-50 cursor-not-allowed"
              )}
              placeholder={
                fileQuery.isLoading ? "Loading..." : "Start typing..."
              }
              spellCheck={false}
            />
          </CardContent>
        </Card>

        {/* Preview Panel */}
        <Card className="col-span-2 flex flex-col h-full overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2">
              <FileText className="size-3" />
              Preview
            </CardTitle>
            <CardDescription className="text-[10px]">
              Rendered markdown
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            <div
              className="text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground"
              style={{ fontFamily: "monospace" }}
            >
              {currentContent || "Preview will appear here..."}
            </div>
          </CardContent>
        </Card>

        {/* Version History Panel */}
        <Card className="col-span-2 flex flex-col h-full overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs flex items-center gap-2">
              <History className="size-3" />
              History
            </CardTitle>
            <CardDescription className="text-[10px]">
              Recent versions
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto px-2">
            {historyQuery.isLoading ? (
              <div className="text-xs text-muted-foreground">
                Loading history...
              </div>
            ) : historyQuery.data?.commits.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                No history available
              </div>
            ) : (
              <div className="space-y-2">
                {historyQuery.data?.commits.map((commit, index) => (
                  <div
                    key={commit.hash}
                    className={cn(
                      "p-2 text-[10px] border border-border",
                      index === 0 && "bg-muted/50 border-primary"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <code className="text-[9px] bg-muted px-1">
                        {commit.hash.slice(0, 7)}
                      </code>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => handleRevert(commit.hash)}
                        disabled={revertMutation.isPending}
                        title="Revert to this version"
                      >
                        <RotateCcw className="size-3" />
                      </Button>
                    </div>
                    <div className="font-medium truncate">{commit.message}</div>
                    <div className="text-muted-foreground">
                      {new Date(commit.date).toLocaleDateString()}
                    </div>
                    <div className="text-muted-foreground truncate">
                      by {commit.author}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
