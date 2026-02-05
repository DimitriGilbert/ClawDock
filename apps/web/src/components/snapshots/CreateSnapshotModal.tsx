"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Camera } from "lucide-react";

export interface CreateSnapshotModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (options: { comment: string; includeDatabase: boolean }) => Promise<void>;
  isCreating?: boolean;
}

export function CreateSnapshotModal({
  open,
  onOpenChange,
  onCreate,
  isCreating = false,
}: CreateSnapshotModalProps) {
  const [comment, setComment] = useState("");
  const [includeDatabase, setIncludeDatabase] = useState(true);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) {
      return;
    }

    await onCreate({
      comment: comment.trim(),
      includeDatabase,
    });

    setComment("");
    setIncludeDatabase(true);
    onOpenChange(false);
  };

  const handleClose = () => {
    if (!isCreating) {
      setComment("");
      setIncludeDatabase(true);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            <DialogTitle>Create Snapshot</DialogTitle>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="comment">Comment</Label>
              <Input
                id="comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Describe this snapshot..."
                disabled={isCreating}
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground">
                Add a note to help you identify this snapshot later
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-database"
                checked={includeDatabase}
                onCheckedChange={(checked) =>
                  setIncludeDatabase(checked === true)
                }
                disabled={isCreating}
              />
              <Label
                htmlFor="include-database"
                className="text-sm cursor-pointer select-none"
              >
                Include database backup
              </Label>
            </div>
            <p className="text-[10px] text-muted-foreground -mt-2 ml-6">
              Creates a compressed SQL dump. Increases snapshot size.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!comment.trim() || isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Snapshot"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
