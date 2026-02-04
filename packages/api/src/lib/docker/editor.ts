/**
 * Docker Compose YAML Editor Module
 * Handles reading, parsing, validation, and updating compose files
 */

import YAML from "yaml";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import path from "node:path";
import type {
  ComposeFile,
  ComposeService,
  ComposeNetwork,
  ComposeVolume,
  ValidationResult,
} from "./types";

// ============================================================================
// AJV Setup for Compose Validation
// ============================================================================

const ALLOWED_BASE_DIRS = [
  process.cwd(),
  process.env.AGENT_DATA_PATH || "/home/didi/workspace/Code/ClawDock/data/Clawthis"
].filter(Boolean);

function validateFilePath(filePath: string): void {
  const resolved = path.resolve(filePath);
  const isAllowed = ALLOWED_BASE_DIRS.some(base =>
    resolved.startsWith(path.resolve(base))
  );

  if (!isAllowed) {
    throw new Error(`Access denied: ${filePath} is outside allowed directories`);
  }
}

/**
 * Basic compose file schema for validation
 * This is a simplified schema covering common compose file elements
 */
const composeSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  patternProperties: {
    "^x-": {},
  },
  properties: {
    version: {
      type: "string",
      deprecated: true,
    },
    name: {
      type: "string",
    },
    services: {
      type: "object",
      patternProperties: {
        "^[a-zA-Z0-9._-]+$": {
          type: "object",
          properties: {
            image: { type: "string" },
            build: {
              oneOf: [
                { type: "string" },
                {
                  type: "object",
                  properties: {
                    context: { type: "string" },
                    dockerfile: { type: "string" },
                    args: {
                      oneOf: [
                        { type: "object" },
                        { type: "array", items: { type: "string" } },
                      ],
                    },
                    target: { type: "string" },
                  },
                },
              ],
            },
            command: {
              oneOf: [
                { type: "string" },
                { type: "array", items: { type: "string" } },
              ],
            },
            entrypoint: {
              oneOf: [
                { type: "string" },
                { type: "array", items: { type: "string" } },
              ],
            },
            environment: {
              oneOf: [
                { type: "object" },
                { type: "array", items: { type: "string" } },
              ],
            },
            ports: {
              type: "array",
              items: {
                oneOf: [
                { type: "string" },
                { type: "number" },
                  {
                    type: "object",
                    properties: {
                      target: { oneOf: [{ type: "number" }, { type: "string" }] },
                      published: { oneOf: [{ type: "number" }, { type: "string" }] },
                      protocol: { type: "string", enum: ["tcp", "udp", "sctp"] },
                      mode: { type: "string", enum: ["host", "ingress"] },
                    },
                  },
                ],
              },
            },
            volumes: {
              type: "array",
              items: {
                oneOf: [
                  { type: "string" },
                  {
                    type: "object",
                    properties: {
                      type: { type: "string" },
                      source: { type: "string" },
                      target: { type: "string" },
                      read_only: { type: "boolean" },
                    },
                  },
                ],
              },
            },
            networks: {
              oneOf: [
                { type: "array", items: { type: "string" } },
                { type: "object" },
              ],
            },
            depends_on: {
              oneOf: [
                { type: "array", items: { type: "string" } },
                { type: "object" },
              ],
            },
            restart: {
              type: "string",
              enum: ["no", "always", "unless-stopped", "on-failure"],
            },
            container_name: { type: "string" },
            hostname: { type: "string" },
            labels: {
              oneOf: [
                { type: "object" },
                { type: "array", items: { type: "string" } },
              ],
            },
            healthcheck: {
              type: "object",
              properties: {
                test: {
                  oneOf: [
                    { type: "string" },
                    { type: "array", items: { type: "string" } },
                  ],
                },
                interval: { type: "string" },
                timeout: { type: "string" },
                retries: { type: "number" },
                start_period: { type: "string" },
                disable: { type: "boolean" },
              },
            },
          },
          additionalProperties: true,
        },
      },
    },
    networks: {
      type: "object",
      patternProperties: {
        "^[a-zA-Z0-9._-]+$": {
          type: "object",
          properties: {
            driver: { type: "string" },
            external: {
              oneOf: [{ type: "boolean" }, { type: "object" }],
            },
            internal: { type: "boolean" },
            attachable: { type: "boolean" },
          },
          additionalProperties: true,
        },
      },
    },
    volumes: {
      type: "object",
      patternProperties: {
        "^[a-zA-Z0-9._-]+$": {
          type: "object",
          properties: {
            driver: { type: "string" },
            external: {
              oneOf: [{ type: "boolean" }, { type: "object" }],
            },
          },
          additionalProperties: true,
        },
      },
    },
    secrets: {
      type: "object",
    },
    configs: {
      type: "object",
    },
  },
};

/**
 * Creates and configures an AJV instance for compose validation
 */
function createValidator(): Ajv {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
  });
  addFormats(ajv);
  return ajv;
}

// Single validator instance
let validator: Ajv | null = null;

/**
 * Gets or creates the AJV validator instance
 */
function getValidator(): Ajv {
  if (validator === null) {
    validator = createValidator();
  }
  return validator;
}

// ============================================================================
// YAML Parsing and Stringifying
// ============================================================================

/**
 * Parses a YAML compose file content
 * @param content - YAML string content
 * @returns Parsed compose file object
 * @throws Error if YAML is invalid
 */
export function parseCompose(content: string): ComposeFile {
  const parsed = YAML.parse(content) as unknown;

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid compose file: root must be an object");
  }

  return parsed as ComposeFile;
}

/**
 * Stringifies a compose file object to YAML
 * @param compose - Compose file object
 * @param options - YAML formatting options
 * @returns YAML string
 */
export function stringifyCompose(
  compose: ComposeFile,
  options?: {
    indent?: number;
    lineWidth?: number;
  },
): string {
  const yamlOptions: YAML.ToStringOptions = {
    indent: options?.indent ?? 2,
    lineWidth: options?.lineWidth ?? 80,
  };

  return YAML.stringify(compose, yamlOptions);
}

// ============================================================================
// Compose Validation
// ============================================================================

/**
 * Validates compose file content (YAML format)
 * @param content - YAML string to validate
 * @returns Validation result with errors if invalid
 */
export function validateComposeContent(content: string): ValidationResult {
  try {
    const parsed = parseCompose(content);
    return validateComposeObject(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      errors: [{ path: "", message }],
    };
  }
}

/**
 * Validates a parsed compose file object
 * @param compose - Parsed compose file object
 * @returns Validation result with errors if invalid
 */
export function validateComposeObject(compose: ComposeFile): ValidationResult {
  const ajv = getValidator();
  const validate = ajv.compile(composeSchema);
  const valid = validate(compose);

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors =
    validate.errors?.map((err) => ({
      path: err.instancePath,
      message: err.message ?? "Validation error",
      schemaPath: err.schemaPath,
    })) ?? [];

  return { valid: false, errors };
}

/**
 * Validates compose file content asynchronously
 * @param content - YAML string to validate
 * @returns Promise resolving to validation result
 */
export async function validateComposeAsync(
  content: string,
): Promise<ValidationResult> {
  return validateComposeContent(content);
}

// ============================================================================
// Compose File Operations
// ============================================================================

/**
 * Reads compose file from disk
 * @param filePath - Path to compose file
 * @returns File content as string
 * @throws Error if file cannot be read
 */
export async function readComposeFile(filePath: string): Promise<string> {
  validateFilePath(filePath);
  const fs = await import("fs/promises");
  return fs.readFile(filePath, "utf-8");
}

/**
 * Writes compose file to disk
 * @param filePath - Path to write compose file
 * @param content - YAML content to write
 * @throws Error if file cannot be written
 */
export async function writeComposeFile(
  filePath: string,
  content: string,
): Promise<void> {
  const fs = await import("fs/promises");
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Updates compose file on disk
 * Validates before writing and optionally creates a backup
 * @param filePath - Path to compose file
 * @param content - New YAML content
 * @param options - Update options
 * @returns Result of the operation
 */
export async function updateComposeFile(
  filePath: string,
  content: string,
  options?: {
    validate?: boolean;
    createBackup?: boolean;
    comment?: string;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    // Validate if requested
    if (options?.validate !== false) {
      const validation = validateComposeContent(content);
      if (!validation.valid) {
        return {
          success: false,
          error: `Validation failed: ${validation.errors.map((e) => `${e.path}: ${e.message}`).join(", ")}`,
        };
      }
    }

    // Create backup if requested
    if (options?.createBackup) {
      const fs = await import("fs/promises");
      const backupPath = `${filePath}.backup.${Date.now()}`;
      try {
        await fs.copyFile(filePath, backupPath);
      } catch {
        // Ignore backup errors - file might not exist
      }
    }

    // Write file
    await writeComposeFile(filePath, content);

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

// ============================================================================
// Compose Manipulation
// ============================================================================

/**
 * Adds or updates a service in a compose file
 * @param compose - Compose file object
 * @param serviceName - Name of the service
 * @param service - Service configuration
 * @returns Updated compose file
 */
export function addOrUpdateService(
  compose: ComposeFile,
  serviceName: string,
  service: ComposeService,
): ComposeFile {
  return {
    ...compose,
    services: {
      ...compose.services,
      [serviceName]: service,
    },
  };
}

/**
 * Removes a service from a compose file
 * @param compose - Compose file object
 * @param serviceName - Name of the service to remove
 * @returns Updated compose file
 */
export function removeService(
  compose: ComposeFile,
  serviceName: string,
): ComposeFile {
  const { [serviceName]: _, ...remainingServices } = compose.services ?? {};
  return {
    ...compose,
    services: remainingServices,
  };
}

/**
 * Adds or updates a network in a compose file
 * @param compose - Compose file object
 * @param networkName - Name of the network
 * @param network - Network configuration
 * @returns Updated compose file
 */
export function addOrUpdateNetwork(
  compose: ComposeFile,
  networkName: string,
  network: ComposeNetwork,
): ComposeFile {
  return {
    ...compose,
    networks: {
      ...compose.networks,
      [networkName]: network,
    },
  };
}

/**
 * Adds or updates a volume in a compose file
 * @param compose - Compose file object
 * @param volumeName - Name of the volume
 * @param volume - Volume configuration
 * @returns Updated compose file
 */
export function addOrUpdateVolume(
  compose: ComposeFile,
  volumeName: string,
  volume: ComposeVolume,
): ComposeFile {
  return {
    ...compose,
    volumes: {
      ...compose.volumes,
      [volumeName]: volume,
    },
  };
}

/**
 * Gets a service from a compose file
 * @param compose - Compose file object
 * @param serviceName - Name of the service
 * @returns Service configuration or undefined
 */
export function getService(
  compose: ComposeFile,
  serviceName: string,
): ComposeService | undefined {
  return compose.services?.[serviceName];
}

/**
 * Gets all service names from a compose file
 * @param compose - Compose file object
 * @returns Array of service names
 */
export function getServiceNames(compose: ComposeFile): string[] {
  return Object.keys(compose.services ?? {});
}

/**
 * Checks if a service exists in a compose file
 * @param compose - Compose file object
 * @param serviceName - Name of the service
 * @returns True if service exists
 */
export function hasService(
  compose: ComposeFile,
  serviceName: string,
): boolean {
  return serviceName in (compose.services ?? {});
}

// ============================================================================
// Compose Environment Variable Resolution
// ============================================================================

/**
 * Replaces environment variable placeholders in compose content
 * Format: ${VAR_NAME} or ${VAR_NAME:-default}
 * @param content - Compose file content with placeholders
 * @param env - Environment variables object
 * @returns Content with placeholders resolved
 */
export function resolveEnvironmentVariables(
  content: string,
  env: Record<string, string>,
): string {
  // Pattern matches ${VAR}, ${VAR:-default}, ${VAR:?error}
  const pattern = /\$\{([^}]+)\}/g;

  return content.replace(pattern, (_match, varDef: string) => {
    const parts = varDef.split(/(?=:-)|(?=:\?)/);
    const varName = parts[0] ?? "";
    const modifiers = parts.slice(1);
    const value = env[varName];

    if (value !== undefined && value !== "") {
      return value;
    }

    // Handle modifiers
    for (const modifier of modifiers) {
      if (modifier.startsWith(":-")) {
        // Default value
        return modifier.slice(2);
      }
      if (modifier.startsWith(":?")) {
        // Error if unset
        throw new Error(
          `Required environment variable ${varName} is not set: ${modifier.slice(2)}`,
        );
      }
    }

    // If no modifiers and not set, return empty string
    return "";
  });
}

// ============================================================================
// Compose File Discovery
// ============================================================================

/**
 * Common compose file names
 */
const COMPOSE_FILE_NAMES = [
  "compose.yaml",
  "compose.yml",
  "docker-compose.yaml",
  "docker-compose.yml",
];

/**
 * Finds compose file in a directory
 * @param directory - Directory to search
 * @returns Path to compose file or null if not found
 */
export async function findComposeFile(directory: string): Promise<string | null> {
  const fs = await import("fs/promises");
  const path = await import("path");

  for (const filename of COMPOSE_FILE_NAMES) {
    const filePath = path.join(directory, filename);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      // File doesn't exist, continue to next
    }
  }

  return null;
}

/**
 * Checks if a file is a valid compose file
 * @param filePath - Path to file
 * @returns True if file exists and is valid YAML
 */
export async function isComposeFile(filePath: string): Promise<boolean> {
  try {
    const content = await readComposeFile(filePath);
    const parsed = parseCompose(content);
    // Must have at least services, networks, volumes, secrets, or configs
    return (
      parsed.services !== undefined ||
      parsed.networks !== undefined ||
      parsed.volumes !== undefined ||
      parsed.secrets !== undefined ||
      parsed.configs !== undefined
    );
  } catch {
    return false;
  }
}
