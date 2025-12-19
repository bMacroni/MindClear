# Feature PRD: AI Chat Token Streaming

## 1. Product Foundation

### Product Purpose
Transform the mobile AI Chat experience from a "wait-and-response" model to a real-time conversational interface. By streaming tokens as they are generated, we reduce perceived latency and provide immediate visual feedback, making the AI feel faster and more natural to interact with.

### Success Metrics
1.  **Time to First Token (TTFT)**: < 1000ms (perceptible improvement over current >3s latency).
2.  **User Satisfaction**: Increase in perceived speed and responsiveness.
3.  **Completion Rate**: Reduction in user abandonments during generation.

### Target Users
-   **Primary**: Mobile App users utilizing AI Chat (Fast/Groq and Smart/Gemini modes).
-   **Context**: Users often on variable mobile networks.

### Scope Boundaries
-   **In Scope**:
    -   Backend `/api/ai/chat` refactor for SSE.
    -   Streaming adapters for `GroqService` and `GeminiService`.
    -   Mobile `AIChatScreen` real-time rendering.
    -   Mobile `conversationService` SSE client integration.
    -   Partial message persistence.
-   **Out of Scope**:
    -   Frontend (Web App) implementation.
    -   Offline support (requires active network).
    -   Other AI endpoints (`/recommend-task`, etc.).

## 2. Technical Architecture

### Technology Stack
-   **Backend**: Node.js + Express + Server-Sent Events (SSE).
-   **Mobile**: React Native + `react-native-sse` (for reliable EventSource support).
-   **Database**: Supabase (PostgreSQL) - Write-on-finish/abort strategy.

### System Architecture & Data Flow
1.  **Initiation**: Mobile POSTs to `/api/ai/chat` with `Accept: text/event-stream`.
2.  **Streaming**:
    -   Backend invokes AI provider with `stream: true`.
    -   Backend flushes headers immediately to bypass compression.
    -   Chunks forwarded to client as `data: {"type": "token", "content": "..."}`.
    -   Heartbeat (`: ping`) sent every 15s to prevent timeouts.
3.  **Completion/Termination**:
    -   **Finish**: Full message buffered, Actions parsed, saved to DB. Final event `data: {"type": "finish", "actions": [...]}` sent.
    -   **Abort/Error**: Partial buffer saved to DB (no Actions). Stream closed.

### Constraints & Mitigations
-   **Compression**: Middleware must be bypassed for SSE routes to prevent buffering.
-   **Timeouts**: 1000 token hard limit + 15s heartbeat to maintain connection.
-   **Backgrounding**: App backgrounding terminates stream; partial persistence preserves data.

## 3. Feature Specification

### Core Features
1.  **SSE Endpoint**: Streaming text delivery.
2.  **Real-time UI**: "Thinking..." -> Streaming Text -> Final Message.
3.  **Action Parsing**: Post-stream extraction of Goals/Tasks.
4.  **Resiliency**: Retry button for failed streams; Stop button for user cancellation.

### User Stories
-   **Streaming**: "As a user, I want to see the AI's answer appear word-by-word so that I don't feel like the app is frozen."
-   **Actions**: "As a user, I want the app to still identify Tasks and Goals in the AI response so I can save them to my list."
-   **Retry**: "As a user, if the connection drops, I want to tap 'Retry' on the specific message to try again."

## 4. Development Roadmap

### Phase 1: Backend Plumbing (Day 1)
-   [ ] Install `react-native-sse` on mobile.
-   [ ] Create `GroqService.streamMessage` and `GeminiService.streamMessage` methods.
-   [ ] Refactor `/api/ai/chat` to handle `Accept: text/event-stream`.
-   [ ] Implement compression bypass and heartbeat logic.

### Phase 2: Mobile Integration (Day 2)
-   [ ] Update `conversationService.sendMessage` to use `EventSource` when streaming.
-   [ ] Update `AIChatScreen` state to handle `token` events and append text.
-   [ ] Implement "Stop Generating" UI.

### Phase 3: Robustness & Polish (Day 3)
-   [ ] Implement "Retry" logic for failed messages.
-   [ ] Implement Partial Persistence (save on abort).
-   [ ] Verify "Actions" parsing works correctly on the final buffer.
-   [ ] Tune timeouts and token limits (1000 tokens).

## 5. Risks & Mitigation
-   **Risk**: JSON structure broken by partial stream.
    -   *Mitigation*: Only parse Actions on "finish". If aborted, save text but do not attempt to parse Actions.
-   **Risk**: Mobile network jitter causes "disconnects".
    -   *Mitigation*: `react-native-sse` auto-reconnects by default; we may need to disable this for non-idempotent chat generation (we don't want it to restart generation automatically). We will configure it to **not** auto-reconnect, and rely on the manual "Retry" button.
