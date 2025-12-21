# Mind Clear Coding Guidelines

This document outlines the coding standards and best practices for the Mind Clear project, specifically focusing on the backend and mobile directories.

## 1. Backend Development (Node.js/Express)

### 1.1 Architecture
The backend follows a standard Express.js architecture:
- **Routes**: Define endpoints and apply middleware.
- **Controllers**: Handle request logic, interact with services, and return responses.
- **Services**: Business logic that can be shared across controllers.
- **Utils**: Helper functions for common tasks (caching, logging, validation).

### 1.2 Supabase & Security
- **Row Level Security (RLS)**: We rely on Supabase RLS. Every request to Supabase in a controller should use the user's JWT.
  ```javascript
  const token = req.headers.authorization?.split(' ')[1];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  ```
- **Environment Variables**: Never hardcode sensitive values. Use `process.env`.
- **Validation**: Use middleware or utilities to validate incoming data.

### 1.3 AI & MCP (Model Context Protocol)
- **Gemini Service**: AI logic is encapsulated in `src/utils/geminiService.js`.
- **MCP Client**: Tool execution is handled by `src/mcp/client.js`.
- **Action Execution**:
  - AI responses generate "actions" which are executed server-side for mutations (create/update/delete) and client-side for reads.
  - Action Object Pattern: `{ action_type, entity_type, details, args }`.
  - Use `details` for the structured data being sent to the tool.
  - Use `args` for search/filter parameters.

### 1.4 Coding Standards
- **ESM**: Use ES Modules. File extensions are mandatory for local imports.
  ```javascript
  import { something } from './utils/helper.js'; // Correct
  import { something } from './utils/helper';    // Incorrect
  ```
- **Error Handling**: Always use `try-catch` blocks in controllers.
- **Logging**: Use the custom `logger` utility. Avoid `console.log`.

## 2. Mobile Development (React Native/TypeScript)

### 2.1 Theming & UI
- **Colors**: Use the theme system. Colors are defined in `src/themes/colors.ts`.
- **Icons**: Use **Hugeicons** exclusively.
  ```typescript
  import { Task01Icon } from '@hugeicons/react-native';
  // ...
  <Task01Icon size={24} color={colors.primary} />
  ```
- **Typography**: Reference `src/themes/typography.ts` for consistent text styling.

### 2.2 TypeScript
- All components must have prop definitions.
- Use interfaces for data models and state.
- Prefer `type` for simple unions or aliases.

### 2.3 State Management & Data
- **Local State**: Use React hooks (`useState`, `useReducer`).
- **Global State**: Use Context API for application-wide state (e.g., Auth, Theme).
- **Offline First**: Use WatermelonDB for local storage and synchronization.
- **Async Operations**: Always show loading indicators and handle errors gracefully.

### 2.4 Navigation
- Use React Navigation (v7+).
- Define types for navigation params.

## 3. General Practices

- **Naming**: 
  - Components: `PascalCase.tsx`
  - Constants: `UPPER_SNAKE_CASE`
  - Everything else: `camelCase`
- **Feature Branches**: Branch names should start with `feature_`.
- **Documentation**: Use JSDoc for complex functions. Refer to PRDs in `FeaturePRD/` for business logic.
- **Terminal**: All shell instructions should be for **PowerShell**.
