/**
 * Docker Stack Management Module
 * Handles container operations: list, get details, start, stop, restart
 * Provides real-time event streaming for container state changes
 */

import { getDockerClient } from "./client";
import type {
  ContainerInfo,
  ContainerDetails,
  ContainerEvent,
  HealthEvent,
  HealthStatus,
  ContainerStatus,
  ContainerLabel,
  ContainerPort,
  MountInfo,
  DockerEvent,
} from "./types";
import { isDockerEvent } from "./types";

// ============================================================================
// Container List Operations
// ============================================================================

/**
 * Lists all containers (running and stopped)
 * @param opts - Optional filter options
 * @returns Array of container information
 */
export async function listContainers(opts?: {
  all?: boolean;
  filters?: Record<string, string[]>;
}): Promise<ContainerInfo[]> {
  const docker = getDockerClient();
  const containers = await docker.listContainers({
    all: opts?.all ?? true,
    filters: opts?.filters,
  });

  return containers.map(mapDockerodeContainerToContainerInfo);
}

/**
 * Maps Dockerode container info to our ContainerInfo type
 */
function mapDockerodeContainerToContainerInfo(
  container: {
    Id: string;
    Names?: string[];
    Image: string;
    ImageID: string;
    Command?: string;
    Created: number;
    Ports?: Array<{
      IP?: string;
      PrivatePort: number;
      PublicPort?: number;
      Type?: string;
    }>;
    Labels?: Record<string, string>;
    State: string;
    Status?: string;
    SizeRw?: number;
    SizeRootFs?: number;
    HostConfig?: { NetworkMode?: string };
    NetworkSettings?: {
      Networks?: Record<
        string,
        { IPAddress?: string; Gateway?: string; MacAddress?: string }
      >;
    };
    Mounts?: Array<{
      Type?: string;
      Name?: string;
      Source?: string;
      Destination?: string;
      Driver?: string;
      Mode?: string;
      RW?: boolean;
      Propagation?: string;
    }>;
  },
): ContainerInfo {
  const labels: ContainerLabel[] = Object.entries(container.Labels ?? {}).map(
    ([key, value]): ContainerLabel => ({ key, value }),
  );

  const ports: ContainerPort[] = (container.Ports ?? []).map((port) => ({
    ip: port.IP ?? "",
    privatePort: port.PrivatePort,
    publicPort: port.PublicPort ?? undefined,
    type: (port.Type as "tcp" | "udp" | "sctp") ?? "tcp",
  }));

  const mounts: MountInfo[] = (container.Mounts ?? []).map((mount) => ({
    type: (mount.Type as MountInfo["type"]) ?? "bind",
    name: mount.Name ?? undefined,
    source: mount.Source ?? "",
    destination: mount.Destination ?? "",
    driver: mount.Driver ?? undefined,
    mode: mount.Mode ?? "",
    rw: mount.RW ?? false,
    propagation: mount.Propagation ?? "",
  }));

  const state = mapStateToContainerStatus(container.State);
  const health = container.Status?.includes("healthy")
    ? "healthy"
    : container.Status?.includes("unhealthy")
      ? "unhealthy"
      : container.Status?.includes("health: starting")
        ? "starting"
        : undefined;

  return {
    id: container.Id,
    names: container.Names ?? [],
    image: container.Image,
    imageId: container.ImageID,
    command: container.Command ?? "",
    created: new Date(container.Created * 1000),
    ports,
    labels,
    state,
    status: container.Status ?? "",
    health,
    sizeRw: container.SizeRw ?? undefined,
    sizeRootFs: container.SizeRootFs ?? undefined,
    hostConfig: {
      networkMode: container.HostConfig?.NetworkMode ?? "",
    },
    networkSettings: {
      networks: Object.fromEntries(
        Object.entries(container.NetworkSettings?.Networks ?? {}).map(
          ([name, net]) => [
            name,
            {
              ipAddress: net.IPAddress ?? "",
              gateway: net.Gateway ?? "",
              macAddress: net.MacAddress ?? "",
            },
          ],
        ),
      ),
    },
    mounts,
  };
}

/**
 * Maps Docker state string to ContainerStatus type
 */
function mapStateToContainerStatus(state: string): ContainerStatus {
  switch (state.toLowerCase()) {
    case "running":
      return "running";
    case "exited":
      return "exited";
    case "paused":
      return "paused";
    case "restarting":
      return "restarting";
    case "dead":
      return "dead";
    case "created":
      return "created";
    default:
      return "stopped";
  }
}

// ============================================================================
// Container Detail Operations
// ============================================================================

/**
 * Gets detailed information about a specific container
 * @param id - Container ID or name
 * @returns Container details
 * @throws Error if container not found
 */
export async function getContainer(id: string): Promise<ContainerDetails> {
  const docker = getDockerClient();
  const container = docker.getContainer(id);
  const info = await container.inspect();

  return mapContainerInspectToContainerDetails(info, id);
}

/**
 * Maps Dockerode container inspect info to our ContainerDetails type
 */
function mapContainerInspectToContainerDetails(
  info: {
    Created?: string;
    Path?: string;
    Args?: string[];
    State?: {
      Status?: string;
      Running?: boolean;
      Paused?: boolean;
      Restarting?: boolean;
      OOMKilled?: boolean;
      Dead?: boolean;
      Pid?: number;
      ExitCode?: number;
      Error?: string;
      StartedAt?: string;
      FinishedAt?: string;
      Health?: {
        Status?: string;
        FailingStreak?: number;
        Log?: Array<{
          Start: string;
          End: string;
          ExitCode: number;
          Output: string;
        }>;
      };
    };
    Image?: string;
    ResolvConfPath?: string;
    HostnamePath?: string;
    HostsPath?: string;
    LogPath?: string;
    Name?: string;
    RestartCount?: number;
    Driver?: string;
    Platform?: string;
    MountLabel?: string;
    ProcessLabel?: string;
    AppArmorProfile?: string;
    ExecIDs?: string[] | null;
    HostConfig?: {
      CpuShares?: number;
      Memory?: number;
      BlkioWeight?: number;
      BlkioWeightDevice?: unknown[];
      BlkioDeviceReadBps?: unknown[];
      BlkioDeviceWriteBps?: unknown[];
      BlkioDeviceReadIOps?: unknown[];
      BlkioDeviceWriteIOps?: unknown[];
      CpuPeriod?: number;
      CpuQuota?: number;
      CpuRealtimePeriod?: number;
      CpuRealtimeRuntime?: number;
      CpusetCpus?: string;
      CpusetMems?: string;
      Devices?: unknown[];
      DeviceCgroupRules?: string[] | null;
      DiskQuota?: number;
      KernelMemory?: number;
      MemoryReservation?: number;
      MemorySwap?: number;
      MemorySwappiness?: number | null;
      OomKillDisable?: boolean | null;
      OomScoreAdj?: number;
      PidMode?: string;
      PidsLimit?: number | null;
      PortBindings?: Record<string, { HostIp: string; HostPort: string }[]>;
      PublishAllPorts?: boolean;
      Privileged?: boolean;
      ReadonlyRootfs?: boolean;
      Dns?: string[];
      DnsOptions?: string[];
      DnsSearch?: string[];
      ExtraHosts?: string[] | null;
      GroupAdd?: string[] | null;
      IpcMode?: string;
      Cgroup?: string;
      Links?: string[] | null;
      UTSMode?: string;
      UsernsMode?: string;
      ShmSize?: number;
      Runtime?: string;
      ConsoleSize?: number[];
      Isolation?: string;
      SecurityOpt?: string[] | null;
      StorageOpt?: Record<string, string>;
      Sysctls?: Record<string, string>;
      Ulimits?: unknown[] | null;
      LogConfig?: { Type?: string; Config?: Record<string, string> };
      VolumeDriver?: string;
      RestartPolicy?: {
        Name?: string;
        MaximumRetryCount?: number;
      };
    };
    GraphDriver?: { Name?: string; Data?: Record<string, string> };
    SizeRootFs?: number;
    SizeRw?: number;
    Config?: {
      Hostname?: string;
      Domainname?: string;
      User?: string;
      AttachStdin?: boolean;
      AttachStdout?: boolean;
      AttachStderr?: boolean;
      ExposedPorts?: Record<string, Record<string, unknown>>;
      Tty?: boolean;
      OpenStdin?: boolean;
      StdinOnce?: boolean;
      Env?: string[];
      Cmd?: string | string[];
      Healthcheck?: {
        Test?: string | string[];
        Interval?: number;
        Timeout?: number;
        Retries?: number;
        StartPeriod?: number;
        StartInterval?: number;
      };
      ArgsEscaped?: boolean;
      Image?: string;
      Volumes?: Record<string, Record<string, unknown>>;
      WorkingDir?: string;
      Entrypoint?: string | string[];
      Labels?: Record<string, string>;
    };
    NetworkSettings?: {
      SandboxID?: string;
      Ports?: Record<string, { HostIp: string; HostPort: string }[]>;
      SandboxKey?: string;
      Networks?: Record<
        string,
        {
          IPAMConfig?: unknown;
          Links?: unknown;
          Aliases?: unknown;
          MacAddress?: string;
          DriverOpts?: Record<string, string>;
          NetworkID?: string;
          EndpointID?: string;
          Gateway?: string;
          IPAddress?: string;
          IPPrefixLen?: number;
          IPv6Gateway?: string;
          GlobalIPv6Address?: string;
          GlobalIPv6PrefixLen?: number;
          DNSNames?: string[];
        }
      >;
    };
  },
  id: string,
): ContainerDetails {
  const state = info.State;
  const config = info.Config;
  const hostConfig = info.HostConfig;

  const health = state?.Health
    ? {
        status: (state.Health.Status as HealthStatus) ?? "none",
        failingStreak: state.Health.FailingStreak ?? 0,
        log:
          state.Health.Log?.map((entry) => ({
            start: new Date(entry.Start),
            end: new Date(entry.End),
            exitCode: entry.ExitCode,
            output: entry.Output,
          })) ?? [],
      }
    : undefined;

  return {
    id,
    created: new Date(info.Created ?? Date.now()),
    path: info.Path ?? "",
    args: info.Args ?? [],
    state: {
      status: (state?.Status as ContainerStatus) ?? "stopped",
      running: state?.Running ?? false,
      paused: state?.Paused ?? false,
      restarting: state?.Restarting ?? false,
      oomKilled: state?.OOMKilled ?? false,
      dead: state?.Dead ?? false,
      pid: state?.Pid ?? 0,
      exitCode: state?.ExitCode ?? 0,
      error: state?.Error ?? "",
      startedAt: new Date(state?.StartedAt ?? Date.now()),
      finishedAt: new Date(state?.FinishedAt ?? Date.now()),
      health,
    },
    image: info.Image ?? "",
    resolvConfPath: info.ResolvConfPath ?? "",
    hostnamePath: info.HostnamePath ?? "",
    hostsPath: info.HostsPath ?? "",
    logPath: info.LogPath ?? "",
    name: info.Name ?? "",
    restartCount: info.RestartCount ?? 0,
    driver: info.Driver ?? "",
    platform: info.Platform ?? "",
    mountLabel: info.MountLabel ?? "",
    processLabel: info.ProcessLabel ?? "",
    appArmorProfile: info.AppArmorProfile ?? "",
    execIDs: info.ExecIDs ?? null,
    hostConfig: {
      cpuShares: hostConfig?.CpuShares ?? 0,
      memory: hostConfig?.Memory ?? 0,
      blkioWeight: hostConfig?.BlkioWeight ?? 0,
      blkioWeightDevice: hostConfig?.BlkioWeightDevice ?? [],
      blkioDeviceReadBps: hostConfig?.BlkioDeviceReadBps ?? [],
      blkioDeviceWriteBps: hostConfig?.BlkioDeviceWriteBps ?? [],
      blkioDeviceReadIOps: hostConfig?.BlkioDeviceReadIOps ?? [],
      blkioDeviceWriteIOps: hostConfig?.BlkioDeviceWriteIOps ?? [],
      cpuPeriod: hostConfig?.CpuPeriod ?? 0,
      cpuQuota: hostConfig?.CpuQuota ?? 0,
      cpuRealtimePeriod: hostConfig?.CpuRealtimePeriod ?? 0,
      cpuRealtimeRuntime: hostConfig?.CpuRealtimeRuntime ?? 0,
      cpusetCpus: hostConfig?.CpusetCpus ?? "",
      cpusetMems: hostConfig?.CpusetMems ?? "",
      devices: hostConfig?.Devices ?? [],
      deviceCgroupRules: hostConfig?.DeviceCgroupRules ?? null,
      diskQuota: hostConfig?.DiskQuota ?? 0,
      kernelMemory: hostConfig?.KernelMemory ?? 0,
      memoryReservation: hostConfig?.MemoryReservation ?? 0,
      memorySwap: hostConfig?.MemorySwap ?? 0,
      memorySwappiness: hostConfig?.MemorySwappiness ?? null,
      oomKillDisable: hostConfig?.OomKillDisable ?? null,
      oomScoreAdj: hostConfig?.OomScoreAdj ?? 0,
      pidMode: hostConfig?.PidMode ?? "",
      pidsLimit: hostConfig?.PidsLimit ?? null,
      portBindings: hostConfig?.PortBindings
        ? Object.fromEntries(
            Object.entries(hostConfig.PortBindings).map(([key, bindings]) => [
              key,
              (bindings ?? []).map((b) => ({
                hostIp: b.HostIp,
                hostPort: b.HostPort,
              })),
            ]),
          )
        : ({} as Record<string, { hostIp: string; hostPort: string }[]>),
      publishAllPorts: hostConfig?.PublishAllPorts ?? false,
      privileged: hostConfig?.Privileged ?? false,
      readonlyRootfs: hostConfig?.ReadonlyRootfs ?? false,
      dns: hostConfig?.Dns ?? [],
      dnsOptions: hostConfig?.DnsOptions ?? [],
      dnsSearch: hostConfig?.DnsSearch ?? [],
      extraHosts: hostConfig?.ExtraHosts ?? null,
      groupAdd: hostConfig?.GroupAdd ?? null,
      ipcMode: hostConfig?.IpcMode ?? "",
      cgroup: hostConfig?.Cgroup ?? "",
      cgroupParent: "",
      links: hostConfig?.Links ?? null,
      utsMode: hostConfig?.UTSMode ?? "",
      usernsMode: hostConfig?.UsernsMode ?? "",
      shmSize: hostConfig?.ShmSize ?? 0,
      runtime: hostConfig?.Runtime ?? "",
      consoleSize: (hostConfig?.ConsoleSize as [number, number] | undefined) ?? [0, 0],
      isolation: hostConfig?.Isolation ?? "",
      securityOpt: hostConfig?.SecurityOpt ?? null,
      storageOpt: hostConfig?.StorageOpt ?? {},
      sysctls: hostConfig?.Sysctls ?? {},
      ulimits: hostConfig?.Ulimits ?? null,
      logConfig: hostConfig?.LogConfig
        ? {
            type: hostConfig.LogConfig.Type ?? "",
            config: hostConfig.LogConfig.Config ?? {},
          }
        : null,
      volumeDriver: hostConfig?.VolumeDriver ?? "",
      restartPolicy: {
        name: (hostConfig?.RestartPolicy?.Name as
          | ""
          | "no"
          | "always"
          | "unless-stopped"
          | "on-failure") ?? "",
        maximumRetryCount: hostConfig?.RestartPolicy?.MaximumRetryCount ?? 0,
      },
    },
    graphDriver: {
      name: info.GraphDriver?.Name ?? "",
      data: info.GraphDriver?.Data ?? {},
    },
    sizeRootFs: info.SizeRootFs ?? undefined,
    sizeRw: info.SizeRw ?? undefined,
    config: {
      hostname: config?.Hostname ?? "",
      domainname: config?.Domainname ?? "",
      user: config?.User ?? "",
      attachStdin: config?.AttachStdin ?? false,
      attachStdout: config?.AttachStdout ?? false,
      attachStderr: config?.AttachStderr ?? false,
      exposedPorts: config?.ExposedPorts ?? null,
      tty: config?.Tty ?? false,
      openStdin: config?.OpenStdin ?? false,
      stdinOnce: config?.StdinOnce ?? false,
      env: config?.Env ?? [],
      cmd: Array.isArray(config?.Cmd) ? config.Cmd : [config?.Cmd ?? ""],
      healthcheck: config?.Healthcheck
        ? {
            test: Array.isArray(config.Healthcheck.Test)
              ? config.Healthcheck.Test
              : [config.Healthcheck.Test ?? ""],
            interval: config.Healthcheck.Interval ?? 0,
            timeout: config.Healthcheck.Timeout ?? 0,
            retries: config.Healthcheck.Retries ?? 0,
            startPeriod: config.Healthcheck.StartPeriod ?? 0,
            startInterval: config.Healthcheck.StartInterval ?? 0,
          }
        : undefined,
      argsEscaped: config?.ArgsEscaped ?? null,
      image: config?.Image ?? "",
      volumes: config?.Volumes ?? null,
      workingDir: config?.WorkingDir ?? "",
      entrypoint: Array.isArray(config?.Entrypoint)
        ? config.Entrypoint
        : config?.Entrypoint
          ? [config.Entrypoint]
          : null,
      networkDisabled: null,
      macAddress: null,
      onBuild: null,
      labels: config?.Labels ?? {},
      stopSignal: null,
      stopTimeout: null,
      shell: null,
    },
    networkSettings: {
      bridge: "",
      sandboxId: info.NetworkSettings?.SandboxID ?? "",
      hairpinMode: false,
      linkLocalIPv6Address: "",
      linkLocalIPv6PrefixLen: 0,
      ports: info.NetworkSettings?.Ports
        ? Object.fromEntries(
            Object.entries(info.NetworkSettings.Ports).map(([key, bindings]) => [
              key,
              (bindings ?? []).map((b) => ({
                hostIp: b.HostIp,
                hostPort: b.HostPort,
              })),
            ]),
          )
        : ({} as Record<string, { hostIp: string; hostPort: string }[]>),
      sandboxKey: info.NetworkSettings?.SandboxKey ?? "",
      secondaryIPAddresses: null,
      secondaryIPv6Addresses: null,
      endpointId: "",
      gateway: "",
      globalIPv6Address: "",
      globalIPv6PrefixLen: 0,
      ipAddress: "",
      ipPrefixLen: 0,
      ipv6Gateway: "",
      macAddress: "",
      networks: Object.fromEntries(
        Object.entries(info.NetworkSettings?.Networks ?? {}).map(
          ([name, net]) => [
            name,
            {
              ipAMConfig: net.IPAMConfig ?? null,
              links: (net.Links as string[] | null) ?? null,
              aliases: (net.Aliases as string[] | null) ?? null,
              macAddress: net.MacAddress ?? "",
              driverOpts: net.DriverOpts ?? null,
              networkId: net.NetworkID ?? "",
              endpointId: net.EndpointID ?? "",
              gateway: net.Gateway ?? "",
              ipAddress: net.IPAddress ?? "",
              ipPrefixLen: net.IPPrefixLen ?? 0,
              ipv6Gateway: net.IPv6Gateway ?? "",
              globalIPv6Address: net.GlobalIPv6Address ?? "",
              globalIPv6PrefixLen: net.GlobalIPv6PrefixLen ?? 0,
              dnsNames: net.DNSNames ?? null,
            },
          ],
        ),
      ),
    },
  };
}

// ============================================================================
// Container Lifecycle Operations
// ============================================================================

/**
 * Starts a stopped container
 * @param id - Container ID or name
 * @returns Operation result
 */
export async function startContainer(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const docker = getDockerClient();
    const container = docker.getContainer(id);
    await container.start();
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Stops a running container
 * @param id - Container ID or name
 * @param timeout - Seconds to wait before force killing (default: 10)
 * @returns Operation result
 */
export async function stopContainer(
  id: string,
  timeout?: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const docker = getDockerClient();
    const container = docker.getContainer(id);
    await container.stop({ t: timeout ?? 10 });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

/**
 * Restarts a container
 * @param id - Container ID or name
 * @param timeout - Seconds to wait before force killing (default: 10)
 * @returns Operation result
 */
export async function restartContainer(
  id: string,
  timeout?: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const docker = getDockerClient();
    const container = docker.getContainer(id);
    await container.restart({ t: timeout ?? 10 });
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

// ============================================================================
// Protected Container Management
// ============================================================================

const PROTECTED_CONTAINERS = ["gateway", "traefik", "postgres"];

async function checkProtectedContainer(container: { name: string; labels: Array<{ key: string; value: string }> }): Promise<{ protected: boolean; reason?: string }> {
  // Check by name
  if (PROTECTED_CONTAINERS.includes(container.name)) {
    return { protected: true, reason: "Container is in protected list" };
  }

  // Check by label
  const hasProtectedLabel = container.labels.some(
    label => label.key === "com.clawdock.protected" && label.value === "true"
  );

  if (hasProtectedLabel) {
    return { protected: true, reason: "Container has protected label" };
  }

  return { protected: false };
}

/**
 * Removes a container
 * @param id - Container ID or name
 * @returns Operation result
 */
export async function removeContainer(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const docker = getDockerClient();
    const container = docker.getContainer(id);

    // Check if container is protected
    const containerInfo = await container.inspect();
    const containerLabels: Array<{ key: string; value: string }> = Object.entries(containerInfo.Config?.Labels ?? {}).map(
      ([key, value]) => ({ key, value })
    );

    const checkResult = await checkProtectedContainer({
      name: containerInfo.Name.replace(/^\//, ""),
      labels: containerLabels
    });

    if (checkResult.protected) {
      return { success: false, error: `Cannot remove protected container: ${checkResult.reason}` };
    }

    await container.remove();
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

// ============================================================================
// Event Streaming
// ============================================================================

type EventStream = NodeJS.ReadableStream & {
  destroy(): void;
  on(event: "data", callback: (chunk: Buffer) => void): void;
  on(event: "error", callback: (error: Error) => void): void;
};

/**
 * Active event stream - kept for cleanup
 */
let activeEventStream: Promise<EventStream> | null = null;

/**
 * Subscribes to Docker container events
 * @param callback - Called when a container event occurs
 * @param options - Filter options for events
 * @returns Unsubscribe function
 */
export function subscribeToContainerEvents(
  callback: (event: ContainerEvent) => void,
  options?: {
    containerId?: string;
    eventTypes?: Array<
      | "start"
      | "stop"
      | "die"
      | "health_status"
      | "create"
      | "destroy"
      | "pause"
      | "unpause"
      | "restart"
    >;
  },
): () => void {
  const docker = getDockerClient();

  // Build filters
  const filters: Record<string, string[]> = {
    type: ["container"],
  };

  if (options?.containerId) {
    filters["container"] = [options.containerId];
  }

  if (options?.eventTypes) {
    filters["event"] = options.eventTypes;
  }

  // Get events stream
  const eventStream = docker.getEvents({
    filters,
  }) as Promise<EventStream>;

  activeEventStream = eventStream;

  // Handle events
  void eventStream.then((stream) => {
    stream.on("data", (chunk: Buffer) => {
      try {
        const data = JSON.parse(chunk.toString()) as unknown;
        if (isDockerEvent(data)) {
          const event = mapDockerEventToContainerEvent(data);
          if (event) {
            callback(event);
          }
        }
      } catch {
        // Ignore parse errors
      }
    });

    stream.on("error", () => {
      // Stream errors are handled by closing
    });
  });

  // Return unsubscribe function
  return () => {
    void eventStream
      .then((stream) => {
        stream.destroy();
      })
      .catch(() => {
        // Ignore cleanup errors
      });
    if (activeEventStream === eventStream) {
      activeEventStream = null;
    }
  };
}

/**
 * Subscribes to health check events
 * @param callback - Called when a container health status changes
 * @param options - Filter options
 * @returns Unsubscribe function
 */
export function subscribeToHealthEvents(
  callback: (event: HealthEvent) => void,
  options?: {
    containerId?: string;
  },
): () => void {
  return subscribeToContainerEvents(
    (event) => {
      if (event.type === "health_changed") {
        callback({
          containerId: event.containerId,
          health: event.health,
          timestamp: event.timestamp,
        });
      }
    },
    {
      containerId: options?.containerId,
      eventTypes: ["health_status"],
    },
  );
}

/**
 * Maps Docker event to our ContainerEvent type
 */
function mapDockerEventToContainerEvent(
  event: DockerEvent,
): ContainerEvent | null {
  const containerId = event.Actor.ID;
  const timestamp = new Date(event.time * 1000);
  const attributes = event.Actor.Attributes;

  switch (event.Action) {
    case "start":
      return { type: "started", containerId, timestamp };

    case "stop":
      return {
        type: "stopped",
        containerId,
        exitCode: parseInt(attributes["exitCode"] ?? "0", 10),
        timestamp,
      };

    case "die":
      return {
        type: "stopped",
        containerId,
        exitCode: parseInt(attributes["exitCode"] ?? "0", 10),
        timestamp,
      };

    case "health_status": {
      const healthStatus = attributes["health_status"] as HealthStatus;
      if (
        healthStatus === "healthy" ||
        healthStatus === "unhealthy" ||
        healthStatus === "starting"
      ) {
        return {
          type: "health_changed",
          containerId,
          health: healthStatus,
          timestamp,
        };
      }
      return null;
    }

    case "create":
      return { type: "created", containerId, timestamp };

    case "destroy":
      return { type: "destroyed", containerId, timestamp };

    case "pause":
      return { type: "paused", containerId, timestamp };

    case "unpause":
      return { type: "unpaused", containerId, timestamp };

    case "restart":
      return { type: "restarted", containerId, timestamp };

    default:
      return null;
  }
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Closes all active event streams
 */
export function closeAllStreams(): void {
  if (activeEventStream !== null) {
    void activeEventStream
      .then((stream) => {
        stream.destroy();
      })
      .catch(() => {
        // Ignore cleanup errors
      });
    activeEventStream = null;
  }
}
