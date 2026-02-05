import { useQuery, useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Layers,
  Activity,
  Server,
  CircleDot,
  Trash2,
  FileText,
  Play,
  Square,
  RotateCw,
  Eye,
  Edit,
} from "lucide-react";

import { trpc, queryClient, trpcClient } from "@/utils/trpc";
import { ComposeEditorDialog } from "@/components/stack/ComposeEditorDialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage(): React.ReactElement {
  const [inspectContainerId, setInspectContainerId] = useState<string | null>(null);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [showAllContainers, setShowAllContainers] = useState(false);
  const healthCheck = useQuery(trpc.healthCheck.queryOptions());
  
  // Real-time Subscriptions
  useEffect(() => {
    const unsubContainer = trpcClient.stack.onContainerChange.subscribe(
      {},
      {
        onData: () => {
          void queryClient.invalidateQueries({ queryKey: trpc.stack.listContainers.queryKey() });
          void queryClient.invalidateQueries({ queryKey: trpc.healthCheck.queryKey() });
        },
        onError: (err) => {
          console.error("Container subscription error:", err);
        }
      }
    );

    const unsubHealth = trpcClient.stack.onHealthChange.subscribe(
      {},
      {
        onData: () => {
          void queryClient.invalidateQueries({ queryKey: trpc.stack.listContainers.queryKey() });
        },
        onError: (err) => {
          console.error("Health subscription error:", err);
        }
      }
    );

    return () => {
      unsubContainer.unsubscribe();
      unsubHealth.unsubscribe();
    };
  }, []);

  const { data: containers, isLoading } = useQuery(
    trpc.stack.listContainers.queryOptions({ showAll: showAllContainers })
  );

  return (
    <div className="p-4 space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="size-5 text-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Stack Overview</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsComposeOpen(true)}
            className="h-8"
          >
            <Edit className="size-3.5 mr-2" />
            Edit Stack
          </Button>

          <div className="flex items-center gap-2 px-2 py-1 rounded-md border bg-muted/50">
            <Switch
              id="show-all"
              checked={showAllContainers}
              onCheckedChange={setShowAllContainers}
              size="sm"
            />
            <Label htmlFor="show-all" className="text-xs cursor-pointer">
              Show All
            </Label>
          </div>

          <div
            className={cn(
              "size-2 rounded-full",
              healthCheck.isLoading
                ? "bg-yellow-500 animate-pulse"
                : healthCheck.data
                  ? "bg-green-500"
                  : "bg-red-500"
            )}
          />
          <span className="text-xs text-muted-foreground">
            {healthCheck.isLoading
              ? "Checking..."
              : healthCheck.data
                ? "Connected"
                : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Containers"
          value={containers?.length ?? 0}
          subtitle="Total"
          icon={Server}
          status="neutral"
        />
        <StatCard
          title="Running"
          value={containers?.filter((c) => c.state === "running").length ?? 0}
          subtitle="Active"
          icon={CircleDot}
          status="success"
        />
        <StatCard
          title="Stopped"
          value={containers?.filter((c) => c.state === "stopped" || c.state === "exited").length ?? 0}
          subtitle="Inactive"
          icon={CircleDot}
          status="destructive"
        />
        <StatCard
          title="Health"
          value={healthCheck.data ? "OK" : "--"}
          subtitle="System"
          icon={Activity}
          status={healthCheck.data ? "success" : "warning"}
        />
      </div>

      {/* Container Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          Loading containers...
        </div>
      ) : containers?.length === 0 ? (
        <div className="flex items-center justify-center p-8 text-muted-foreground border rounded-lg bg-muted/10">
          No containers found
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {containers?.map((container) => (
            <ContainerCard 
              key={container.id} 
              container={container} 
              onInspect={setInspectContainerId}
            />
          ))}
        </div>
      )}

      {/* Inspect Modal */}
      <ContainerInspectModal
        containerId={inspectContainerId}
        open={!!inspectContainerId}
        onOpenChange={(open) => !open && setInspectContainerId(null)}
      />
      
      <ComposeEditorDialog 
        open={isComposeOpen} 
        onOpenChange={setIsComposeOpen} 
      />
    </div>
  );
}

// Sub-components

interface StatCardProps {
  readonly title: string;
  readonly value: string | number;
  readonly subtitle: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly status: "success" | "warning" | "destructive" | "neutral";
}

function StatCard({ title, value, subtitle, icon: Icon, status }: StatCardProps): React.ReactElement {
  const statusConfig = {
    success: "text-green-600",
    warning: "text-yellow-600",
    destructive: "text-red-600",
    neutral: "text-muted-foreground",
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <Icon className={cn("size-8", statusConfig[status])} />
        </div>
      </CardContent>
    </Card>
  );
}

interface ContainerCardProps {
  readonly container: {
    id: string;
    names: string[];
    image: string;
    ports?: Array<{
      privatePort: number;
      publicPort?: number;
      type: string;
    }>;
    state: "running" | "stopped" | "paused" | "restarting" | "dead" | "created" | "exited";
    status?: string;
    health?: "healthy" | "unhealthy" | "starting" | "none";
  };
  readonly onInspect: (id: string) => void;
}

function ContainerCard({ container, onInspect }: ContainerCardProps): React.ReactElement {
  const containerName = container.names[0]?.replace(/^\//, "") || container.id;

  const stateConfig = {
    running: { color: "bg-green-500", label: "Running", variant: "success" as const },
    stopped: { color: "bg-red-500", label: "Stopped", variant: "destructive" as const },
    paused: { color: "bg-yellow-500", label: "Paused", variant: "warning" as const },
    restarting: { color: "bg-yellow-500", label: "Restarting", variant: "warning" as const },
    dead: { color: "bg-red-500", label: "Dead", variant: "destructive" as const },
    created: { color: "bg-yellow-500", label: "Created", variant: "warning" as const },
    exited: { color: "bg-red-500", label: "Exited", variant: "destructive" as const },
  };

  const stateInfo = stateConfig[container.state];

  // Mutations
  const stopMutation = useMutation({
    ...trpc.stack.stopContainer.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.stack.listContainers.queryKey() }),
  });

  const startMutation = useMutation({
    ...trpc.stack.startContainer.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.stack.listContainers.queryKey() }),
  });

  const restartMutation = useMutation({
    ...trpc.stack.restartContainer.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.stack.listContainers.queryKey() }),
  });

  const removeMutation = useMutation({
    ...trpc.stack.removeContainer.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.stack.listContainers.queryKey() }),
  });

  const handleRemove = () => {
    if (window.confirm("Are you sure you want to remove this container? This action cannot be undone.")) {
      removeMutation.mutate({ id: container.id });
    }
  };

  return (
    <Card className="flex flex-col h-full transition-all hover:shadow-md">
      <CardHeader className="pb-3 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-medium truncate" title={containerName}>
            {containerName}
          </CardTitle>
          <div className={cn("size-2.5 rounded-full shrink-0 mt-1.5", stateInfo.color)} />
        </div>
        <CardDescription className="text-xs truncate font-mono" title={container.image}>
          {container.image}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="flex-1 pb-3 space-y-3">
        {/* Status & Health Badges */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="h-5 text-[10px] px-1.5 font-normal">
            {container.status || container.state}
          </Badge>
          
          {container.health && container.health !== "none" && (
            <Badge 
              variant={container.health === "healthy" ? "success" : container.health === "unhealthy" ? "destructive" : "warning"}
              className="h-5 text-[10px] px-1.5 uppercase"
            >
              {container.health}
            </Badge>
          )}
        </div>

        {/* Ports */}
        {container.ports && container.ports.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground uppercase">Ports</p>
            <div className="flex flex-wrap gap-1">
              {container.ports.map((port) => (
                <Badge key={`${port.privatePort}-${port.type}`} variant="secondary" className="h-5 text-[10px] px-1.5 font-mono">
                  {port.publicPort ? `${port.publicPort}:${port.privatePort}` : `${port.privatePort}/${port.type}`}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-0 flex flex-col gap-3">
        {/* Primary Actions */}
        <div className="grid grid-cols-2 gap-2 w-full">
          {container.state === "running" ? (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs"
                onClick={() => stopMutation.mutate({ id: container.id })}
                disabled={stopMutation.isPending}
              >
                <Square className="size-3 mr-1.5 fill-current" />
                Stop
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-xs"
                onClick={() => restartMutation.mutate({ id: container.id })}
                disabled={restartMutation.isPending}
              >
                <RotateCw className="size-3 mr-1.5" />
                Restart
              </Button>
            </>
          ) : (
            <Button 
              variant="outline" 
              size="sm" 
              className="h-7 text-xs w-full col-span-2"
              onClick={() => startMutation.mutate({ id: container.id })}
              disabled={startMutation.isPending}
            >
              <Play className="size-3 mr-1.5 fill-current" />
              Start
            </Button>
          )}
        </div>

        {/* Secondary Actions */}
        <div className="flex items-center justify-between w-full pt-3 border-t">
          {/* TODO: Add logs page route when implemented */}
          <Button
            variant="ghost"
            size="icon-xs"
            className="h-6 w-6"
            title="Logs (Coming Soon)"
            disabled
          >
            <FileText className="size-3.5 text-muted-foreground/50" />
          </Button>
          
          <Button 
            variant="ghost" 
            size="icon-xs" 
            className="h-6 w-6" 
            title="Inspect"
            onClick={() => onInspect(container.id)}
          >
            <Eye className="size-3.5 text-muted-foreground" />
          </Button>

          <Button 
            variant="ghost" 
            size="icon-xs" 
            className="h-6 w-6 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" 
            title="Remove"
            onClick={handleRemove}
            disabled={container.state === "running"}
          >
            <Trash2 className="size-3.5 text-muted-foreground" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

function ContainerInspectModal({
  containerId,
  open,
  onOpenChange,
}: {
  containerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  const { data, isLoading, error } = useQuery(
    trpc.stack.getContainer.queryOptions(
      { id: containerId! },
      { enabled: !!containerId }
    )
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Container Inspection</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full max-h-[60vh] rounded-md border p-4 bg-muted/50">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                Loading details...
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-8 text-red-500">
                Error: {error.message}
              </div>
            ) : (
              <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(data, null, 2)}
              </pre>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
