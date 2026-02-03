# Docker Module Review (Gemini)

## Summary
The Docker SDK module implementation is robust and type-safe, forming a solid foundation for stack management. It successfully implements core lifecycle operations, event streaming, and YAML editing. However, critical safety features required by the PRD (protection labels, removal logic) are currently missing.

## Findings

### 1. Docker Client (`packages/api/src/lib/docker/client.ts`)
- **Status**: **Pass**
- **Details**: Correctly implemented as a singleton connecting to `/var/run/docker.sock`.

### 2. Stack Management (`packages/api/src/lib/docker/stack.ts`)
- **Status**: **Partial**
- **Details**:
  - Implements `list`, `start`, `stop`, `restart`.
  - **Missing**: `remove` container operation.
  - **Missing**: Logic to respect `com.clawdock.protected=true` labels (Safety Critical).
  - **Success**: Real-time event subscription (`onContainerChange`) is implemented.

### 3. YAML Editor (`packages/api/src/lib/docker/editor.ts`)
- **Status**: **Good**
- **Details**:
  - Uses `yaml` and `ajv` for parsing and validation.
  - Implements backup strategy.
  - **Missing**: "Dry-run" mode for deployments is not implemented in the library or router.

### 4. Type Safety (`packages/api/src/routers/stack.ts`, `types.ts`)
- **Status**: **Excellent**
- **Details**:
  - Full usage of Zod schemas for inputs.
  - Strong typing for Docker entities (no `any`).

## Recommendations
1. **Implement Protection Logic**: Add a check in `removeContainer` (and others) to reject actions on containers with the `com.clawdock.protected` label.
2. **Add Remove Operation**: Implement the `remove` container functionality in `stack.ts` and the router.
3. **Implement Dry-Run**: Add a `dryRun` flag to the compose update procedure that returns the diff without applying it.
