/**
 * Type definitions for Docker operations and Compose files
 * Strict typing with no 'any' usage
 */

// ============================================================================
// Container Status Types
// ============================================================================

export type ContainerStatus =
  | "running"
  | "stopped"
  | "paused"
  | "restarting"
  | "dead"
  | "created"
  | "exited";

export type HealthStatus = "healthy" | "unhealthy" | "starting" | "none";

// ============================================================================
// Container Information Types
// ============================================================================

export interface ContainerPort {
  ip: string;
  privatePort: number;
  publicPort?: number;
  type: "tcp" | "udp" | "sctp";
}

export interface ContainerLabel {
  key: string;
  value: string;
}

export interface ContainerInfo {
  id: string;
  names: string[];
  image: string;
  imageId: string;
  command: string;
  created: Date;
  ports: ContainerPort[];
  labels: ContainerLabel[];
  state: ContainerStatus;
  status: string;
  health?: HealthStatus;
  sizeRw?: number;
  sizeRootFs?: number;
  hostConfig: {
    networkMode: string;
  };
  networkSettings: {
    networks: Record<string, NetworkSettings>;
  };
  mounts: MountInfo[];
}

export interface NetworkSettings {
  ipAddress: string;
  gateway: string;
  macAddress: string;
}

export interface MountInfo {
  type: "bind" | "volume" | "tmpfs" | "npipe" | "cluster";
  name?: string;
  source: string;
  destination: string;
  driver?: string;
  mode: string;
  rw: boolean;
  propagation: string;
}

// ============================================================================
// Container Details Types
// ============================================================================

export interface ContainerDetails {
  id: string;
  created: Date;
  path: string;
  args: string[];
  state: ContainerState;
  image: string;
  resolvConfPath: string;
  hostnamePath: string;
  hostsPath: string;
  logPath: string;
  name: string;
  restartCount: number;
  driver: string;
  platform: string;
  mountLabel: string;
  processLabel: string;
  appArmorProfile: string;
  execIDs: string[] | null;
  hostConfig: HostConfig;
  graphDriver: GraphDriver;
  sizeRootFs?: number;
  sizeRw?: number;
  config: ContainerConfig;
  networkSettings: ContainerNetworkSettings;
  health?: HealthConfig;
}

export interface ContainerState {
  status: ContainerStatus;
  running: boolean;
  paused: boolean;
  restarting: boolean;
  oomKilled: boolean;
  dead: boolean;
  pid: number;
  exitCode: number;
  error: string;
  startedAt: Date;
  finishedAt: Date;
  health?: HealthState;
}

export interface HealthState {
  status: HealthStatus;
  failingStreak: number;
  log: HealthLogEntry[];
}

export interface HealthLogEntry {
  start: Date;
  end: Date;
  exitCode: number;
  output: string;
}

export interface HostConfig {
  cpuShares: number;
  memory: number;
  cgroupParent: string;
  blkioWeight: number;
  blkioWeightDevice: unknown[];
  blkioDeviceReadBps: unknown[];
  blkioDeviceWriteBps: unknown[];
  blkioDeviceReadIOps: unknown[];
  blkioDeviceWriteIOps: unknown[];
  cpuPeriod: number;
  cpuQuota: number;
  cpuRealtimePeriod: number;
  cpuRealtimeRuntime: number;
  cpusetCpus: string;
  cpusetMems: string;
  devices: unknown[];
  deviceCgroupRules: string[] | null;
  diskQuota: number;
  kernelMemory: number;
  memoryReservation: number;
  memorySwap: number;
  memorySwappiness: number | null;
  oomKillDisable: boolean | null;
  oomScoreAdj: number;
  pidMode: string;
  pidsLimit: number | null;
  portBindings: Record<string, PortBinding[]> | null;
  publishAllPorts: boolean;
  privileged: boolean;
  readonlyRootfs: boolean;
  dns: string[];
  dnsOptions: string[];
  dnsSearch: string[];
  extraHosts: string[] | null;
  groupAdd: string[] | null;
  ipcMode: string;
  cgroup: string;
  links: string[] | null;
  utsMode: string;
  usernsMode: string;
  shmSize: number;
  runtime: string;
  consoleSize: [number, number];
  isolation: string;
  securityOpt: string[] | null;
  storageOpt: Record<string, string> | null;
  sysctls: Record<string, string> | null;
  ulimits: unknown[] | null;
  logConfig: LogConfig | null;
  volumeDriver: string;
  restartPolicy: RestartPolicy;
}

export interface PortBinding {
  hostIp: string;
  hostPort: string;
}

export interface LogConfig {
  type: string;
  config: Record<string, string>;
}

export interface RestartPolicy {
  name: "" | "no" | "always" | "unless-stopped" | "on-failure";
  maximumRetryCount: number;
}

export interface GraphDriver {
  name: string;
  data: Record<string, string>;
}

export interface ContainerConfig {
  hostname: string;
  domainname: string;
  user: string;
  attachStdin: boolean;
  attachStdout: boolean;
  attachStderr: boolean;
  exposedPorts: Record<string, Record<string, unknown>> | null;
  tty: boolean;
  openStdin: boolean;
  stdinOnce: boolean;
  env: string[];
  cmd: string[];
  healthcheck?: HealthConfig;
  argsEscaped: boolean | null;
  image: string;
  volumes: Record<string, Record<string, unknown>> | null;
  workingDir: string;
  entrypoint: string[] | null;
  networkDisabled: boolean | null;
  macAddress: string | null;
  onBuild: string[] | null;
  labels: Record<string, string>;
  stopSignal: string | null;
  stopTimeout: number | null;
  shell: string[] | null;
}

export interface HealthConfig {
  test: string[];
  interval: number;
  timeout: number;
  retries: number;
  startPeriod: number;
  startInterval: number;
}

export interface ContainerNetworkSettings {
  bridge: string;
  sandboxId: string;
  hairpinMode: boolean;
  linkLocalIPv6Address: string;
  linkLocalIPv6PrefixLen: number;
  ports: Record<string, PortBinding[]> | null;
  sandboxKey: string;
  secondaryIPAddresses: unknown[] | null;
  secondaryIPv6Addresses: unknown[] | null;
  endpointId: string;
  gateway: string;
  globalIPv6Address: string;
  globalIPv6PrefixLen: number;
  ipAddress: string;
  ipPrefixLen: number;
  ipv6Gateway: string;
  macAddress: string;
  networks: Record<string, NetworkDetails>;
}

export interface NetworkDetails {
  ipAMConfig: unknown | null;
  links: string[] | null;
  aliases: string[] | null;
  macAddress: string;
  driverOpts: Record<string, string> | null;
  networkId: string;
  endpointId: string;
  gateway: string;
  ipAddress: string;
  ipPrefixLen: number;
  ipv6Gateway: string;
  globalIPv6Address: string;
  globalIPv6PrefixLen: number;
  dnsNames: string[] | null;
}

// ============================================================================
// Container Event Types
// ============================================================================

export type ContainerEvent =
  | { type: "started"; containerId: string; timestamp: Date }
  | { type: "stopped"; containerId: string; exitCode: number; timestamp: Date }
  | {
      type: "health_changed";
      containerId: string;
      health: HealthStatus;
      timestamp: Date;
    }
  | { type: "created"; containerId: string; timestamp: Date }
  | { type: "destroyed"; containerId: string; timestamp: Date }
  | { type: "paused"; containerId: string; timestamp: Date }
  | { type: "unpaused"; containerId: string; timestamp: Date }
  | { type: "restarted"; containerId: string; timestamp: Date };

export interface HealthEvent {
  containerId: string;
  health: HealthStatus;
  timestamp: Date;
  previousHealth?: HealthStatus;
}

// ============================================================================
// Dockerode Event Stream Types
// ============================================================================

export interface DockerEvent {
  Type: string;
  Action: string;
  Actor: {
    ID: string;
    Attributes: Record<string, string>;
  };
  scope: string;
  time: number;
  timeNano: number;
}

// ============================================================================
// Compose File Types
// ============================================================================

export interface ComposeService {
  image?: string;
  build?:
    | string
    | {
        context?: string;
        dockerfile?: string;
        dockerfile_inline?: string;
        args?: Record<string, string> | string[];
        cache_from?: string[];
        target?: string;
      };
  command?: string | string[];
  entrypoint?: string | string[];
  environment?: Record<string, string | number | boolean> | string[];
  env_file?: string | string[];
  ports?:
    | (string | number)[]
    | {
        target?: number;
        published?: number | string;
        protocol?: "tcp" | "udp" | "sctp";
        mode?: "host" | "ingress";
        host_ip?: string;
      }[];
  volumes?:
    | string[]
    | {
        type?: "bind" | "volume" | "tmpfs" | "cluster" | "npipe" | "image";
        source?: string;
        target?: string;
        read_only?: boolean;
        bind?: {
          propagation?: string;
          create_host_path?: boolean;
          selinux?: "z" | "Z";
        };
        volume?: {
          nocopy?: boolean;
        };
      }[];
  networks?: string[] | Record<string, unknown>;
  depends_on?: string[] | Record<string, { condition: string }>;
  healthcheck?: {
    test?: string | string[];
    interval?: string;
    timeout?: string;
    retries?: number;
    start_period?: string;
    start_interval?: string;
    disable?: boolean;
  };
  restart?:
    | "no"
    | "always"
    | "unless-stopped"
    | "on-failure"
    | "on-failure:"
    | string;
  container_name?: string;
  hostname?: string;
  labels?: Record<string, string> | string[];
  user?: string;
  working_dir?: string;
  stdin_open?: boolean;
  tty?: boolean;
  privileged?: boolean;
  cap_add?: string[];
  cap_drop?: string[];
  security_opt?: string[];
  sysctls?: Record<string, string> | string[];
  ulimits?:
    | Record<string, number | { soft: number; hard: number }>
    | {
        name: string;
        soft: number;
        hard: number;
      }[];
  deploy?: {
    replicas?: number;
    resources?: {
      limits?: {
        cpus?: string | number;
        memory?: string;
        pids?: number;
      };
      reservations?: {
        cpus?: string | number;
        memory?: string;
      };
    };
    restart_policy?: {
      condition?: "none" | "on-failure" | "any";
      delay?: string;
      max_attempts?: number;
      window?: string;
    };
    placement?: {
      constraints?: string[];
    };
  };
  logging?: {
    driver?: string;
    options?: Record<string, string>;
  };
  [key: string]: unknown;
}

export interface ComposeNetwork {
  driver?: string;
  driver_opts?: Record<string, string | number>;
  ipam?: {
    driver?: string;
    config?: {
      subnet?: string;
      gateway?: string;
      ip_range?: string;
    }[];
  };
  external?: boolean | { name: string };
  internal?: boolean;
  attachable?: boolean;
  labels?: Record<string, string> | string[];
  [key: string]: unknown;
}

export interface ComposeVolume {
  driver?: string;
  driver_opts?: Record<string, string | number>;
  external?: boolean | { name: string };
  labels?: Record<string, string> | string[];
  name?: string;
  [key: string]: unknown;
}

export interface ComposeSecret {
  file?: string;
  environment?: string;
  external?: boolean | { name: string };
  labels?: Record<string, string> | string[];
  [key: string]: unknown;
}

export interface ComposeConfig {
  file?: string;
  external?: boolean | { name: string };
  labels?: Record<string, string> | string[];
  [key: string]: unknown;
}

export interface ComposeFile {
  version?: string;
  name?: string;
  services?: Record<string, ComposeService>;
  networks?: Record<string, ComposeNetwork>;
  volumes?: Record<string, ComposeVolume>;
  secrets?: Record<string, ComposeSecret>;
  configs?: Record<string, ComposeConfig>;
  include?: Array<{ path: string | string[]; project_directory?: string; env_file?: string | string[] }>;
  [key: `x-${string}`]: unknown;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  schemaPath?: string;
}

// ============================================================================
// Operation Result Types
// ============================================================================

export interface OperationResult {
  success: boolean;
  error?: string;
  message?: string;
}

export interface ContainerOperationResult extends OperationResult {
  containerId: string;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isContainerStatus(value: unknown): value is ContainerStatus {
  return (
    typeof value === "string" &&
    [
      "running",
      "stopped",
      "paused",
      "restarting",
      "dead",
      "created",
      "exited",
    ].includes(value)
  );
}

export function isHealthStatus(value: unknown): value is HealthStatus {
  return (
    typeof value === "string" &&
    ["healthy", "unhealthy", "starting", "none"].includes(value)
  );
}

export function isDockerEvent(value: unknown): value is DockerEvent {
  const event = value as DockerEvent | undefined;
  return (
    typeof event === "object" &&
    event !== null &&
    typeof event["Type"] === "string" &&
    typeof event["Action"] === "string" &&
    typeof event["Actor"] === "object" &&
    event["Actor"] !== null &&
    typeof event["Actor"]["ID"] === "string"
  );
}
