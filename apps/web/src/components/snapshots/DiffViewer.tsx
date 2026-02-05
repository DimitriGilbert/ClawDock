"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { File, Plus, Minus } from "lucide-react";

export interface DiffViewerProps {
  diff: {
    filesChanged: number;
    additions: number;
    deletions: number;
    files: Array<{
      path: string;
      status: "added" | "modified" | "deleted";
      diff?: string;
    }>;
  };
}

const getStatusVariant = (
  status: "added" | "modified" | "deleted"
): "success" | "warning" | "destructive" => {
  switch (status) {
    case "added":
      return "success";
    case "modified":
      return "warning";
    case "deleted":
      return "destructive";
  }
};

const getStatusLabel = (
  status: "added" | "modified" | "deleted"
): string => {
  switch (status) {
    case "added":
      return "Added";
    case "modified":
      return "Modified";
    case "deleted":
      return "Deleted";
  }
};

const getStatusIcon = (
  status: "added" | "modified" | "deleted"
): React.ReactNode => {
  switch (status) {
    case "added":
      return <Plus className="h-3 w-3" />;
    case "modified":
      return <File className="h-3 w-3" />;
    case "deleted":
      return <Minus className="h-3 w-3" />;
  }
};

export function DiffViewer({ diff }: DiffViewerProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Summary */}
      <div className="flex items-center gap-4 p-3 bg-muted/30 border-b text-xs">
        <div className="flex items-center gap-1">
          <File className="h-3 w-3" />
          <span className="font-medium">{diff.filesChanged} files changed</span>
        </div>
        <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
          <Plus className="h-3 w-3" />
          <span>{diff.additions} additions</span>
        </div>
        <div className="flex items-center gap-1 text-red-600 dark:text-red-400">
          <Minus className="h-3 w-3" />
          <span>{diff.deletions} deletions</span>
        </div>
      </div>

      {/* File List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {diff.files.map((file) => (
            <div
              key={`${file.path}-${file.status}`}
              className="flex items-start gap-2 p-2 rounded-none hover:bg-muted/50 transition-colors"
            >
              <div className="flex-shrink-0 mt-0.5">
                {getStatusIcon(file.status)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono truncate text-foreground">
                    {file.path}
                  </span>
                  <Badge variant={getStatusVariant(file.status)} className="text-[10px] h-4 px-1 shrink-0">
                    {getStatusLabel(file.status)}
                  </Badge>
                </div>
                {file.diff && (
                  <pre className="text-[10px] font-mono bg-muted/50 p-2 rounded-none overflow-x-auto text-muted-foreground whitespace-pre-wrap">
                    {file.diff
                      .split("\n")
                      .slice(0, 10) // Show first 10 lines
                      .join("\n")}
                    {file.diff.split("\n").length > 10 && "\n..."}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
