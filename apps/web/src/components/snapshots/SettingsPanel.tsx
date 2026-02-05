"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Database, FileText, Settings } from "lucide-react";

export interface SettingsPanelProps {
  maxSnapshots: number;
  preChangeCompose: boolean;
  preChangeAgentFiles: boolean;
  includeDatabase: boolean;
  onChange: (settings: {
    maxSnapshots?: number;
    preChangeCompose?: boolean;
    preChangeAgentFiles?: boolean;
    includeDatabase?: boolean;
  }) => void;
  isSaving?: boolean;
}

export function SettingsPanel({
  maxSnapshots,
  preChangeCompose,
  preChangeAgentFiles,
  includeDatabase,
  onChange,
  isSaving = false,
}: SettingsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          <CardTitle>Snapshot Settings</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Max Snapshots */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="max-snapshots" className="text-sm font-medium">
              Maximum Snapshots
            </Label>
            <span className="text-xs font-mono bg-muted px-2 py-1 rounded-none">
              {maxSnapshots}
            </span>
          </div>
          <Slider
            id="max-snapshots"
            min={1}
            max={100}
            step={1}
            value={maxSnapshots}
            onValueChange={(value) => onChange({ maxSnapshots: value })}
            disabled={isSaving}
          />
          <p className="text-[10px] text-muted-foreground">
            Oldest snapshots beyond this limit will be automatically pruned.
          </p>
        </div>

        {/* Auto-Snapshot Settings */}
        <div className="space-y-4 pt-4 border-t">
          <p className="text-xs font-medium text-muted-foreground mb-3">
            Automatic Snapshots
          </p>

          {/* Pre-change Compose */}
          <div className="flex items-center justify-between">
            <div className="flex-1 space-y-0.5">
              <Label htmlFor="pre-change-compose" className="text-sm font-medium cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" />
                  Before Compose Changes
                </div>
              </Label>
              <p className="text-[10px] text-muted-foreground">
                Create snapshot before updating docker-compose.yml
              </p>
            </div>
            <Switch
              id="pre-change-compose"
              checked={preChangeCompose}
              onCheckedChange={(checked) =>
                onChange({ preChangeCompose: checked })
              }
              disabled={isSaving}
              size="sm"
            />
          </div>

          {/* Pre-change Agent Files */}
          <div className="flex items-center justify-between">
            <div className="flex-1 space-y-0.5">
              <Label htmlFor="pre-change-agent-files" className="text-sm font-medium cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" />
                  Before Agent File Edits
                </div>
              </Label>
              <p className="text-[10px] text-muted-foreground">
                Create snapshot before editing agent files (SOUL.md, AGENTS.md, etc.)
              </p>
            </div>
            <Switch
              id="pre-change-agent-files"
              checked={preChangeAgentFiles}
              onCheckedChange={(checked) =>
                onChange({ preChangeAgentFiles: checked })
              }
              disabled={isSaving}
              size="sm"
            />
          </div>
        </div>

        {/* Database Settings */}
        <div className="space-y-4 pt-4 border-t">
          <p className="text-xs font-medium text-muted-foreground mb-3">
            Database Backup
          </p>

          {/* Include Database by Default */}
          <div className="flex items-center justify-between">
            <div className="flex-1 space-y-0.5">
              <Label htmlFor="include-database" className="text-sm font-medium cursor-pointer select-none">
                <div className="flex items-center gap-2">
                  <Database className="h-3.5 w-3.5" />
                  Include by Default
                </div>
              </Label>
              <p className="text-[10px] text-muted-foreground">
                Include database backup when creating manual snapshots
              </p>
            </div>
            <Switch
              id="include-database"
              checked={includeDatabase}
              onCheckedChange={(checked) =>
                onChange({ includeDatabase: checked })
              }
              disabled={isSaving}
              size="sm"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
