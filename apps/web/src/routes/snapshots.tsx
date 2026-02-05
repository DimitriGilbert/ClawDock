import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

import {
  Camera,
  RefreshCw,
  Trash2,
  Search,
  Settings,
  FolderOpen,
  Database,
  FileText,
  AlertTriangle,
  Clock,
} from "lucide-react";

export const Route = createFileRoute("/snapshots")({
  component: SnapshotsPage,
});

interface SnapshotWithGroup {
  id: string;
  commitHash: string;
  timestamp: string | Date;
  type: "manual" | "pre-change" | "auto";
  trigger?: string;
  comment: string;
  fileCount: number;
  sizeBytes: number;
  dbBackupPath?: string;
  groupLabel: string;
}

function SnapshotsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "manual" | "pre-change" | "auto">("all");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<SnapshotWithGroup | null>(null);
  const [includeDbRestore, setIncludeDbRestore] = useState(true);
  const [newSnapshotComment, setNewSnapshotComment] = useState("");
  const [newSnapshotIncludeDb, setNewSnapshotIncludeDb] = useState(true);

  // Fetch snapshots list
  const { data: snapshots, isLoading: isLoadingSnapshots } = useQuery(
    trpc.snapshot.list.queryOptions()
  );

  // Fetch settings
  const { data: settings } = useQuery(
    trpc.snapshot.getSettings.queryOptions()
  );

  // Create snapshot mutation
  const createSnapshotMutation = useMutation({
    ...trpc.snapshot.create.mutationOptions(),
    onSuccess: () => {
      toast.success("Snapshot created successfully");
      setIsCreateModalOpen(false);
      setNewSnapshotComment("");
      void queryClient.invalidateQueries({
        queryKey: trpc.snapshot.list.queryKey(),
      });
    },
    onError: (error) => {
      toast.error(`Failed to create snapshot: ${error.message}`);
    },
  });

  // Restore snapshot mutation
  const restoreMutation = useMutation({
    ...trpc.snapshot.restore.mutationOptions(),
    onSuccess: () => {
      toast.success("Snapshot restored successfully. Services may need to restart.");
      setIsRestoreModalOpen(false);
      setSelectedSnapshot(null);
      void queryClient.invalidateQueries({
        queryKey: trpc.snapshot.list.queryKey(),
      });
    },
    onError: (error) => {
      toast.error(`Failed to restore snapshot: ${error.message}`);
    },
  });

  // Delete snapshot mutation
  const deleteMutation = useMutation({
    ...trpc.snapshot.delete.mutationOptions(),
    onSuccess: () => {
      toast.success("Snapshot deleted successfully");
      void queryClient.invalidateQueries({
        queryKey: trpc.snapshot.list.queryKey(),
      });
    },
    onError: (error) => {
      toast.error(`Failed to delete snapshot: ${error.message}`);
    },
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    ...trpc.snapshot.updateSettings.mutationOptions(),
    onSuccess: () => {
      toast.success("Settings updated successfully");
      void queryClient.invalidateQueries({
        queryKey: trpc.snapshot.getSettings.queryKey(),
      });
    },
    onError: (error) => {
      toast.error(`Failed to update settings: ${error.message}`);
    },
  });

  // Group snapshots by date
  const groupedSnapshots = snapshots
    ? (() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const thisWeek = new Date(today);
        thisWeek.setDate(thisWeek.getDate() - 7);

        const filtered = snapshots.filter((s) => {
          const matchesSearch =
            searchQuery === "" ||
            s.comment.toLowerCase().includes(searchQuery.toLowerCase());
          const matchesType =
            filterType === "all" || s.type === filterType;
          return matchesSearch && matchesType;
        });

        const grouped = new Map<string, SnapshotWithGroup[]>();

        filtered.forEach((s) => {
          const snapshotDate = new Date(s.timestamp);
          let groupLabel = "Older";

          if (snapshotDate >= today) {
            groupLabel = "Today";
          } else if (snapshotDate >= yesterday) {
            groupLabel = "Yesterday";
          } else if (snapshotDate >= thisWeek) {
            groupLabel = "This Week";
          }

          if (!grouped.has(groupLabel)) {
            grouped.set(groupLabel, []);
          }
          grouped.get(groupLabel)!.push({
            ...s,
            timestamp: snapshotDate,
            groupLabel,
          });
        });

        // Sort within groups by timestamp descending
        grouped.forEach((group) => {
          group.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        });

        // Return ordered groups
        return {
          Today: grouped.get("Today") ?? [],
          Yesterday: grouped.get("Yesterday") ?? [],
          "This Week": grouped.get("This Week") ?? [],
          Older: grouped.get("Older") ?? [],
        };
      })()
    : { Today: [], Yesterday: [], "This Week": [], Older: [] };

  const hasAnySnapshots = Object.values(groupedSnapshots).some((group) => group.length > 0);

  const handleCreateSnapshot = () => {
    createSnapshotMutation.mutate({
      comment: newSnapshotComment || "Manual snapshot",
      includeDatabase: newSnapshotIncludeDb,
    });
  };

  const handleRestoreSnapshot = () => {
    if (selectedSnapshot) {
      restoreMutation.mutate({
        id: selectedSnapshot.id,
        includeDatabase: includeDbRestore,
      });
    }
  };

  const handleDeleteSnapshot = (id: string) => {
    if (window.confirm("Are you sure you want to delete this snapshot? This cannot be undone.")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleOpenRestore = (snapshot: SnapshotWithGroup) => {
    setSelectedSnapshot(snapshot);
    setIncludeDbRestore(!!snapshot.dbBackupPath);
    setIsRestoreModalOpen(true);
  };

  const handleUpdateSettings = (updates: {
    maxSnapshots?: number;
    preChangeCompose?: boolean;
    preChangeAgentFiles?: boolean;
    includeDatabase?: boolean;
  }) => {
    updateSettingsMutation.mutate(updates);
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatTimestamp = (timestamp: string | Date): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Camera className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Snapshots</h1>
            <p className="text-xs text-muted-foreground">
              Version control for agent state
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings className="mr-2 size-4" />
            Settings
          </Button>
          <Button
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Camera className="mr-2 size-4" />
            Create Snapshot
          </Button>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search snapshots..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={filterType === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("all")}
          >
            All
          </Button>
          <Button
            variant={filterType === "manual" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("manual")}
          >
            Manual
          </Button>
          <Button
            variant={filterType === "pre-change" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("pre-change")}
          >
            Pre-Change
          </Button>
          <Button
            variant={filterType === "auto" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType("auto")}
          >
            Auto
          </Button>
        </div>
      </div>

      {/* Snapshots List */}
      <ScrollArea className="flex-1">
        <div className="space-y-6 pr-4">
          {isLoadingSnapshots ? (
            // Loading skeletons
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                      <Skeleton className="h-8 w-24" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !hasAnySnapshots ? (
            // Empty state
            <Card className="flex min-h-[400px] items-center justify-center">
              <CardContent className="flex flex-col items-center text-center p-8">
                <Camera className="mb-4 size-12 text-muted-foreground/50" />
                <h3 className="text-lg font-medium">No snapshots yet</h3>
                <p className="mb-4 max-w-sm text-sm text-muted-foreground">
                  Create your first snapshot to save your agent's current state.
                  Snapshots include agent files, configuration, and optionally database backups.
                </p>
                <Button onClick={() => setIsCreateModalOpen(true)}>
                  <Camera className="mr-2 size-4" />
                  Create First Snapshot
                </Button>
              </CardContent>
            </Card>
          ) : (
            // Grouped snapshots
            <>
              {(["Today", "Yesterday", "This Week", "Older"] as const).map((groupLabel) => {
                const groupSnapshots = groupedSnapshots[groupLabel];
                if (groupSnapshots.length === 0) return null;

                return (
                  <div key={groupLabel} className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {groupLabel}
                    </h3>
                    <div className="space-y-2">
                      {groupSnapshots.map((snapshot) => (
                        <Card
                          key={snapshot.id}
                          className="transition-colors hover:bg-accent/50"
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              {/* Left: Info */}
                              <div className="flex min-w-0 flex-1 gap-3">
                                <div className="mt-0.5 shrink-0">
                                  <Badge
                                    variant={
                                      snapshot.type === "manual"
                                        ? "default"
                                        : snapshot.type === "pre-change"
                                          ? "secondary"
                                          : "outline"
                                    }
                                  >
                                    {snapshot.type}
                                  </Badge>
                                </div>
                                <div className="min-w-0 flex-1 space-y-1">
                                  <p className="truncate text-sm font-medium">
                                    {snapshot.comment}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                      <Clock className="size-3" />
                                      <span>{formatTimestamp(snapshot.timestamp)}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <FolderOpen className="size-3" />
                                      <span>{snapshot.fileCount} files</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Database className="size-3" />
                                      <span>{snapshot.dbBackupPath ? "DB included" : "No DB"}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <FileText className="size-3" />
                                      <span>{formatSize(snapshot.sizeBytes)}</span>
                                    </div>
                                  </div>
                                  {snapshot.trigger && (
                                    <Badge variant="outline" className="mt-1 text-[10px]">
                                      Triggered: {snapshot.trigger}
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              {/* Right: Actions */}
                              <div className="flex shrink-0 gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenRestore(snapshot)}
                                >
                                  <RefreshCw className="mr-1 size-3" />
                                  Restore
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteSnapshot(snapshot.id)}
                                >
                                  <Trash2 className="size-3" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Create Snapshot Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Snapshot</DialogTitle>
            <DialogDescription>
              Capture the current state of your agent. This will save agent files,
              configuration, and optionally create a database backup.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="comment">Comment (optional)</Label>
              <Input
                id="comment"
                placeholder="e.g., Before major changes"
                value={newSnapshotComment}
                onChange={(e) => setNewSnapshotComment(e.target.value)}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-db"
                checked={newSnapshotIncludeDb}
                onCheckedChange={(checked) =>
                  setNewSnapshotIncludeDb(checked === true)
                }
              />
              <Label htmlFor="include-db" className="cursor-pointer">
                Include database backup
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Database backups ensure complete state recovery but take longer to create.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateModalOpen(false)}
              disabled={createSnapshotMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSnapshot}
              disabled={createSnapshotMutation.isPending}
            >
              {createSnapshotMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 size-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Camera className="mr-2 size-4" />
                  Create Snapshot
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Snapshot Modal */}
      <Dialog open={isRestoreModalOpen} onOpenChange={setIsRestoreModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Snapshot</DialogTitle>
            <DialogDescription>
              Restoring will revert your agent to this snapshot's state.
              A pre-restore safety snapshot will be created automatically.
            </DialogDescription>
          </DialogHeader>
          {selectedSnapshot && (
            <div className="space-y-4 py-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{selectedSnapshot.comment}</CardTitle>
                    <Badge variant="secondary">{selectedSnapshot.type}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Clock className="size-3" />
                    <span>{formatTimestamp(selectedSnapshot.timestamp)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FolderOpen className="size-3" />
                    <span>{selectedSnapshot.fileCount} files</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="size-3" />
                    <span>{formatSize(selectedSnapshot.sizeBytes)}</span>
                  </div>
                </CardContent>
              </Card>

              {selectedSnapshot.dbBackupPath && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="restore-db"
                    checked={includeDbRestore}
                    onCheckedChange={(checked) => setIncludeDbRestore(checked === true)}
                  />
                  <Label htmlFor="restore-db" className="cursor-pointer">
                    Restore database from backup
                  </Label>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <div className="text-xs">
                  <p className="font-semibold">Important Warning</p>
                  <p className="mt-1">
                    Restoring will overwrite your current agent state. A pre-restore snapshot
                    will be created for safety. Services may need to restart after restore.
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRestoreModalOpen(false)}
              disabled={restoreMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRestoreSnapshot}
              disabled={restoreMutation.isPending}
            >
              {restoreMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 size-4 animate-spin" />
                  Restoring...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 size-4" />
                  Restore Snapshot
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Modal */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Snapshot Settings</DialogTitle>
            <DialogDescription>
              Configure automatic snapshot behavior and retention policies.
            </DialogDescription>
          </DialogHeader>
          {settings && (
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="max-snapshots">
                  Maximum snapshots to keep: {settings.maxSnapshots}
                </Label>
                <Input
                  id="max-snapshots"
                  type="range"
                  min="1"
                  max="100"
                  value={settings.maxSnapshots}
                  onChange={(e) =>
                    handleUpdateSettings({
                      maxSnapshots: Number.parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full"
                  disabled={updateSettingsMutation.isPending}
                />
                <p className="text-xs text-muted-foreground">
                  Old snapshots will be automatically pruned when this limit is exceeded.
                </p>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Pre-Change Snapshots</h4>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="pre-compose">Before compose updates</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically create snapshot before updating docker-compose.yml
                    </p>
                  </div>
                  <Switch
                    id="pre-compose"
                    checked={settings.preChangeCompose}
                    onCheckedChange={(checked) =>
                      handleUpdateSettings({ preChangeCompose: checked })
                    }
                    disabled={updateSettingsMutation.isPending}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="pre-agent-files">Before agent file edits</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically create snapshot before editing agent files
                    </p>
                  </div>
                  <Switch
                    id="pre-agent-files"
                    checked={settings.preChangeAgentFiles}
                    onCheckedChange={(checked) =>
                      handleUpdateSettings({ preChangeAgentFiles: checked })
                    }
                    disabled={updateSettingsMutation.isPending}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Database Defaults</h4>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="include-db-default">Include database by default</Label>
                    <p className="text-xs text-muted-foreground">
                      New snapshots will include database backup unless disabled
                    </p>
                  </div>
                  <Switch
                    id="include-db-default"
                    checked={settings.includeDatabase}
                    onCheckedChange={(checked) =>
                      handleUpdateSettings({ includeDatabase: checked })
                    }
                    disabled={updateSettingsMutation.isPending}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsSettingsOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
