"use client";

import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, RotateCcw, Database } from "lucide-react";
import { DiffViewer, type DiffViewerProps } from "./DiffViewer";

export interface RestoreModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (includeDatabase: boolean) => Promise<void>;
  snapshotId: string;
  comment: string;
  timestamp: Date;
  dbBackupPath?: string;
  isRestoring?: boolean;
  isDiffLoading?: boolean;
  diff?: DiffViewerProps["diff"];
  onPreviewDiff?: () => void;
}

export function RestoreModal({
  open,
  onOpenChange,
  onRestore,
  snapshotId,
  comment,
  timestamp,
  dbBackupPath,
  isRestoring = false,
  isDiffLoading = false,
  diff,
  onPreviewDiff,
}: RestoreModalProps) {
  const [includeDatabase, setIncludeDatabase] = useState(dbBackupPath !== undefined);
  const [isReady, setIsReady] = useState(false);
  const previewDiffRef = useRef(onPreviewDiff);

  // Keep ref updated with the latest callback
  useEffect(() => {
    previewDiffRef.current = onPreviewDiff;
  }, [onPreviewDiff]);

  useEffect(() => {
    if (open) {
      setIsReady(false);
      previewDiffRef.current?.();
      // Small delay to allow diff to load
      const timer = setTimeout(() => setIsReady(true), 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onRestore(includeDatabase);
    onOpenChange(false);
  };

  const handleClose = () => {
    if (!isRestoring) {
      onOpenChange(false);
    }
  };

  const timeAgo = new Date(timestamp).toLocaleString();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            <DialogTitle>Restore Snapshot</DialogTitle>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* Snapshot Info */}
          <div className="mb-4 p-4 bg-muted/50 rounded-none space-y-2">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{comment}</p>
                <p className="text-xs text-muted-foreground">{timeAgo}</p>
              </div>
              <Badge variant="outline" className="ml-2">
                {snapshotId.slice(0, 8)}
              </Badge>
            </div>
          </div>

          {/* Diff Viewer */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {isDiffLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : diff && diff.files.length > 0 ? (
              <div className="h-full overflow-hidden">
                <DiffViewer diff={diff} />
              </div>
            ) : diff && diff.files.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-muted-foreground">
                <p className="text-sm">No changes detected</p>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center text-muted-foreground">
                <p className="text-sm">No diff available</p>
              </div>
            )}
          </div>

          {/* Warning */}
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-none">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <div className="text-xs text-destructive">
                <p className="font-medium mb-1">Important Warning</p>
                <p className="opacity-90">
                  Restoring will replace your current files and settings with this
                  snapshot's state. This will restart the Gateway service. The
                  application will be temporarily unavailable. A pre-restore safety
                  snapshot will be created automatically.
                </p>
              </div>
            </div>
          </div>

          {/* Database Option */}
          {dbBackupPath && (
            <div className="mt-4 flex items-center space-x-2">
              <Checkbox
                id="include-database"
                checked={includeDatabase}
                onCheckedChange={(checked) => setIncludeDatabase(checked === true)}
                disabled={isRestoring || !isReady}
              />
              <Label
                htmlFor="include-database"
                className="text-sm cursor-pointer select-none flex items-center gap-1"
              >
                <Database className="h-3 w-3" />
                Restore database from backup
              </Label>
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isRestoring}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isRestoring || !isReady}
            variant="destructive"
          >
            {isRestoring ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Restoring...
              </>
            ) : (
              "Restore Snapshot"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
