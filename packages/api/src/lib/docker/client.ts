/**
 * Dockerode client singleton with proper typing
 * Provides a typed interface to the Docker daemon
 */

import Dockerode from "dockerode";

let dockerInstance: Dockerode | null = null;

/**
 * Gets or creates the Docker client singleton
 * Uses Docker socket from environment or defaults to /var/run/docker.sock
 */
export function getDockerClient(): Dockerode {
  if (dockerInstance === null) {
    const dockerSocket = process.env["DOCKER_SOCKET"] ?? "/var/run/docker.sock";

    dockerInstance = new Dockerode({ socketPath: dockerSocket });
  }

  return dockerInstance;
}

/**
 * Resets the Docker client singleton (useful for testing)
 */
export function resetDockerClient(): void {
  dockerInstance = null;
}

/**
 * Checks if Docker is accessible
 * Returns true if Docker daemon responds, false otherwise
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    const docker = getDockerClient();
    await docker.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets Docker version information
 */
export async function getDockerVersion(): Promise<{
  version: string;
  apiVersion: string;
  os: string;
  arch: string;
}> {
  const docker = getDockerClient();
  const version = await docker.version();

  return {
    version: version.Version ?? "unknown",
    apiVersion: version.ApiVersion ?? "unknown",
    os: version.Os ?? "unknown",
    arch: version.Arch ?? "unknown",
  };
}
