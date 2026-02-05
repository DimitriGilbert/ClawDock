"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SnapshotCard } from "./SnapshotCard";
import { isToday, isYesterday, isThisWeek, subDays } from "date-fns";

export interface SnapshotListProps {
  snapshots: Array<{
    id: string;
    timestamp: Date;
    type: "manual" | "pre-change" | "auto";
    trigger?: string;
    comment: string;
    fileCount: number;
    sizeBytes: number;
    dbBackupPath?: string;
  }>;
  isLoading?: boolean;
  onRestore?: (id: string) => void;
  onDelete?: (id: string) => void;
  onClick?: (id: string) => void;
}

type SnapshotData = SnapshotListProps["snapshots"][number];

interface GroupedSnapshots {
  today: SnapshotData[];
  yesterday: SnapshotData[];
  thisWeek: SnapshotData[];
  older: SnapshotData[];
}

function groupSnapshots(snapshots: SnapshotListProps["snapshots"]): GroupedSnapshots {
  const now = new Date();
  const startOfThisWeek = subDays(now, 7);

  return snapshots.reduce<GroupedSnapshots>(
    (acc, snapshot) => {
      if (isToday(snapshot.timestamp)) {
        acc.today.push(snapshot);
      } else if (isYesterday(snapshot.timestamp)) {
        acc.yesterday.push(snapshot);
      } else if (isThisWeek(snapshot.timestamp) && snapshot.timestamp >= startOfThisWeek) {
        acc.thisWeek.push(snapshot);
      } else {
        acc.older.push(snapshot);
      }
      return acc;
    },
    {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: [],
    }
  );
}

function SnapshotSection({
  title,
  snapshots,
  onRestore,
  onDelete,
  onClick,
}: {
  title: string;
  snapshots: SnapshotData[];
  onRestore?: (id: string) => void;
  onDelete?: (id: string) => void;
  onClick?: (id: string) => void;
}) {
  if (snapshots.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-muted-foreground mb-3 px-1">
        {title}
      </h3>
      <div className="space-y-2">
        {snapshots.map((snapshot) => (
          <SnapshotCard
            key={snapshot.id}
            {...snapshot}
            onRestore={onRestore}
            onDelete={onDelete}
            onClick={onClick}
          />
        ))}
      </div>
    </div>
  );
}

function SnapshotListSkeleton() {
  return (
    <div className="space-y-6">
      {["Today", "Yesterday", "This Week", "Older"].map((section) => (
        <div key={section} className="mb-6">
          <Skeleton className="h-5 w-24 mb-3" />
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Note: ScrollArea is used instead of virtualized list because:
// - Snapshot count is small (typically < 100 total)
// - Retention policy limits to 30-100 snapshots max
// - Each card is lightweight text content with minimal DOM overhead
// - ScrollArea provides smooth native scrolling with sufficient performance
// - Virtualization complexity not justified for this data size
export function SnapshotList({
  snapshots,
  isLoading = false,
  onRestore,
  onDelete,
  onClick,
}: SnapshotListProps) {
  if (isLoading) {
    return <SnapshotListSkeleton />;
  }

  if (snapshots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground mb-2">No snapshots yet</p>
        <p className="text-xs text-muted-foreground">
          Create your first snapshot to save the current state
        </p>
      </div>
    );
  }

  const grouped = groupSnapshots(snapshots);

  return (
    <ScrollArea className="h-full pr-4">
      <div className="pb-4">
        <SnapshotSection
          title="Today"
          snapshots={grouped.today}
          onRestore={onRestore}
          onDelete={onDelete}
          onClick={onClick}
        />
        <SnapshotSection
          title="Yesterday"
          snapshots={grouped.yesterday}
          onRestore={onRestore}
          onDelete={onDelete}
          onClick={onClick}
        />
        <SnapshotSection
          title="This Week"
          snapshots={grouped.thisWeek}
          onRestore={onRestore}
          onDelete={onDelete}
          onClick={onClick}
        />
        <SnapshotSection
          title="Older"
          snapshots={grouped.older}
          onRestore={onRestore}
          onDelete={onDelete}
          onClick={onClick}
        />
      </div>
    </ScrollArea>
  );
}
