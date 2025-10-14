# Assistant UI Runtime Endpoint

- Streaming route: POST /api/chat (SSE)
- JSON fallback: POST /api/chat?stream=false
- Headers used:
  - Authorization: Bearer <jwt>
  - X-User-Mood: low|okay|energized (optional)
  - X-User-Timezone: IANA tz (e.g., America/Chicago)

Security:
- Protected by enhancedAuth middleware.
- MCP actions execute in-process and are not publicly exposed.

Frontend:
- Provider calls /api/chat.
- Legacy AIChat now uses JSON fallback for compatibility.
