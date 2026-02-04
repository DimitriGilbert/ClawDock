import { useQuery, useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Layers, Activity, Server, CircleDot } from "lucide-react";

import { trpc, queryClient } from "@/utils/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage(): React.ReactElement {
  const healthCheck = useQuery(trpc.healthCheck.queryOptions());
  const { data: containers, isLoading } = useQuery(
    trpc.stack.listContainers.queryOptions()
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

      {/* Container List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="size-4" />
            Containers
          </CardTitle>
          <CardDescription>
            Manage and monitor your ClawDock containers
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-4 text-muted-foreground">
              Loading...
            </div>
          ) : containers?.length === 0 ? (
            <div className="flex items-center justify-center p-4 text-muted-foreground">
              No containers running
            </div>
          ) : (
            <div className="rounded-md border">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Container
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Image
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      State
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {containers?.map((container) => (
                    <ContainerRow key={container.id} container={container} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
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

interface ContainerRowProps {
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
  };
}

function ContainerRow({ container }: ContainerRowProps): React.ReactElement {
  const statusConfig = {
    running: {
      variant: "success" as const,
      label: "Running",
      dotClass: "bg-green-500",
    },
    stopped: {
      variant: "destructive" as const,
      label: "Stopped",
      dotClass: "bg-red-500",
    },
    paused: {
      variant: "warning" as const,
      label: "Paused",
      dotClass: "bg-yellow-500",
    },
    restarting: {
      variant: "warning" as const,
      label: "Restarting",
      dotClass: "bg-yellow-500",
    },
    dead: {
      variant: "destructive" as const,
      label: "Dead",
      dotClass: "bg-red-500",
    },
    created: {
      variant: "warning" as const,
      label: "Created",
      dotClass: "bg-yellow-500",
    },
    exited: {
      variant: "destructive" as const,
      label: "Exited",
      dotClass: "bg-red-500",
    },
  } as const;

  const status = statusConfig[container.state];
  const containerName = container.names[0]?.replace(/^\//, "") || container.id;

  return (
    <tr className="transition-colors hover:bg-muted/50">
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-3">
          <div className={cn("size-2 rounded-full", status.dotClass)} />
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">{containerName}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <p className="text-sm text-muted-foreground">{container.image}</p>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <Badge variant={status.variant}>{status.label}</Badge>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        <ContainerActions containerId={container.id} state={container.state} />
      </td>
    </tr>
  );
}

interface ContainerActionsProps {
  readonly containerId: string;
  readonly state: string;
}

function ContainerActions({ containerId, state }: ContainerActionsProps): React.ReactElement {
  const stopMutation = useMutation({
    ...trpc.stack.stopContainer.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.stack.listContainers.queryKey() });
    },
  });

  const startMutation = useMutation({
    ...trpc.stack.startContainer.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.stack.listContainers.queryKey() });
    },
  });

  const restartMutation = useMutation({
    ...trpc.stack.restartContainer.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trpc.stack.listContainers.queryKey() });
    },
  });

  if (state === "running") {
    return (
      <div className="flex gap-2">
        <button
          onClick={() => stopMutation.mutate({ id: containerId })}
          className="px-3 py-1 text-xs font-medium text-yellow-700 bg-yellow-50 rounded hover:bg-yellow-100"
        >
          Stop
        </button>
        <button
          onClick={() => restartMutation.mutate({ id: containerId })}
          className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100"
        >
          Restart
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => startMutation.mutate({ id: containerId })}
      className="px-3 py-1 text-xs font-medium text-green-700 bg-green-50 rounded hover:bg-green-100"
    >
      Start
    </button>
  );
}
