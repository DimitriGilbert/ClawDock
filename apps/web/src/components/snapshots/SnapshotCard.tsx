"use client";

import { useState } from "react";
import { Card, CardHeader, CardContent, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Clock, FileText, Database, Trash2, RotateCcw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export interface SnapshotCardProps {
  id: string;
  timestamp: Date;
  type: "manual" | "pre-change" | "auto";
  trigger?: string;
  comment: string;
  fileCount: number;
  sizeBytes: number;
  dbBackupPath?: string;
  onRestore?: (id: string) => void;
  onDelete?: (id: string) => void;
  onClick?: (id: string) => void;
}

const getTypeVariant = (type: SnapshotCardProps["type"]): "default" | "secondary" | "info" | "warning" => {
  switch (type) {
    case "manual":
      return "default";
    case "pre-change":
      return "warning";
    case "auto":
      return "info";
  }
};

const getTypeLabel = (type: SnapshotCardProps["type"]): string => {
  switch (type) {
    case "manual":
      return "Manual";
    case "pre-change":
      return "Pre-change";
    case "auto":
      return "Auto";
  }
};

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

export function SnapshotCard({
  id,
  timestamp,
  type,
  trigger,
  comment,
  fileCount,
  sizeBytes,
  dbBackupPath,
  onRestore,
  onDelete,
  onClick,
}: SnapshotCardProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const timeAgo = formatDistanceToNow(timestamp, { addSuffix: true });

  const handleRestore = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRestore?.(id);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    setIsDeleteDialogOpen(false);
    onDelete?.(id);
  };

  const handleDeleteCancel = () => {
    setIsDeleteDialogOpen(false);
  };

  const handleClick = () => {
    onClick?.(id);
  };

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors group"
      onClick={handleClick}
    >
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={getTypeVariant(type)} className="text-[10px] h-5 px-1.5">
                {getTypeLabel(type)}
              </Badge>
              {trigger && (
                <span className="text-[10px] text-muted-foreground">
                  via {trigger}
                </span>
              )}
            </div>
            <p className="text-sm font-medium truncate">{comment}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <Clock className="h-3 w-3" />
              {timeAgo}
            </p>
          </div>
          <CardAction className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onRestore && (
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={handleRestore}
                title="Restore this snapshot"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            )}
            {onDelete && (
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={handleDeleteClick}
                title="Delete this snapshot"
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            )}
          </CardAction>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            <span>{fileCount} files</span>
          </div>
          <div className="flex items-center gap-1">
            {dbBackupPath ? (
              <>
                <Database className="h-3 w-3" />
                <span>DB</span>
              </>
            ) : (
              <>
                <Database className="h-3 w-3 opacity-50" />
                <span className="opacity-50">No DB</span>
              </>
            )}
          </div>
          <div className="ml-auto">{formatBytes(sizeBytes)}          </div>
        </div>
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Snapshot</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this snapshot? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleDeleteCancel}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
