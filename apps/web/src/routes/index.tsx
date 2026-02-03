import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Layers, Activity, Server, CircleDot } from "lucide-react";

import { trpc } from "@/utils/trpc";
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

// Types for container status
interface ContainerStatus {
  readonly id: string;
  readonly name: string;
  readonly status: "running" | "stopped" | "warning";
  readonly image: string;
  readonly uptime: string;
}

// Mock data for containers (will be replaced with API data)
const MOCK_CONTAINERS: readonly ContainerStatus[] = [
  {
    id: "api-1",
    name: "clawdock-api",
    status: "running",
    image: "clawdock/api:latest",
    uptime: "2h 34m",
  },
  {
    id: "web-1",
    name: "clawdock-web",
    status: "running",
    image: "clawdock/web:latest",
    uptime: "2h 34m",
  },
  {
    id: "agent-1",
    name: "clawthis-agent",
    status: "running",
    image: "clawdock/agent:latest",
    uptime: "1h 15m",
  },
  {
    id: "db-1",
    name: "postgres-db",
    status: "running",
    image: "postgres:16-alpine",
    uptime: "5d 12h",
  },
] as const;

function DashboardPage(): React.ReactElement {
  const healthCheck = useQuery(trpc.healthCheck.queryOptions());

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
          value={MOCK_CONTAINERS.length}
          subtitle="Total"
          icon={Server}
          status="neutral"
        />
        <StatCard
          title="Running"
          value={MOCK_CONTAINERS.filter((c) => c.status === "running").length}
          subtitle="Active"
          icon={CircleDot}
          status="success"
        />
        <StatCard
          title="Stopped"
          value={MOCK_CONTAINERS.filter((c) => c.status === "stopped").length}
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
          <div className="grid gap-3">
            {MOCK_CONTAINERS.map((container) => (
              <ContainerRow key={container.id} container={container} />
            ))}
          </div>
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
  readonly status: "neutral" | "success" | "destructive" | "warning";
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  status,
}: StatCardProps): React.ReactElement {
  const statusClasses = {
    neutral: "bg-muted text-muted-foreground",
    success: "bg-green-500/10 text-green-600 dark:text-green-400",
    destructive: "bg-red-500/10 text-red-600 dark:text-red-400",
    warning: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  } as const;

  return (
    <Card className="group">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-lg font-semibold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-none", statusClasses[status])}>
            <Icon className="size-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface ContainerRowProps {
  readonly container: ContainerStatus;
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
    warning: {
      variant: "warning" as const,
      label: "Warning",
      dotClass: "bg-yellow-500",
    },
  } as const;

  const status = statusConfig[container.status];

  return (
    <div className="flex items-center justify-between border p-3 transition-colors hover:bg-muted/50">
      <div className="flex items-center gap-3">
        <div className={cn("size-2 rounded-full", status.dotClass)} />
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-foreground">{container.name}</p>
          <p className="text-xs text-muted-foreground">{container.image}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{container.uptime}</span>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
    </div>
  );
}
