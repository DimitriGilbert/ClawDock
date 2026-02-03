# Chat Module Review (Gemini)

## Summary
The Chat Module has a solid backend foundation with AI SDK and OpenCode provider integration, but is essentially non-functional due to missing wiring and a completely absent frontend implementation.

## Findings

### 1. Backend Implementation (`apps/server/src/routes/chat.ts`, `packages/api/src/routers/chat.ts`)
- **Status**: **Backend Partial, Integration Missing**
- **Details**:
  - **Success**: Uses `streamText` and `ai-sdk-provider-opencode-sdk` correctly.
  - **Success**: tRPC router handles session CRUD.
  - **Critical Fail**: Neither the Hono route (`chatRoutes`) nor the tRPC router (`chatRouter`) are mounted in their respective entry points.
  - **Critical Fail**: AI Response persistence is missing (only user messages are saved).
  - **Critical Fail**: Context injection (system prompt) is static and does not load `AGENTS.md`.

### 2. Frontend Implementation (`apps/web`)
- **Status**: **Missing**
- **Details**:
  - No `chat.tsx` route exists.
  - No usage of `useChat` hook found.
  - No UI components for chat.

### 3. Data Persistence
- **Status**: **Good Schema, Partial Logic**
- **Details**:
  - Schema is correct.
  - Logic to save user messages exists.
  - Logic to save assistant responses is missing.

## Recommendations
1. **Frontend**: Implement `apps/web/src/routes/chat.tsx` using `@ai-sdk/react`.
2. **Mounting**: 
   - Mount `chatRouter` in `packages/api/src/routers/index.ts`.
   - Mount `chatRoutes` in `apps/server/src/index.ts`.
3. **Persistence**: Use `onFinish` callback in `streamText` to save assistant responses to the database.
4. **Context**: Implement `buildSystemPrompt` to read `AGENTS.md` and other files using the Agent module logic.
