\*\*Project Title:\*\* Mind Clear \- Low-Latency Multi-Model Infrastructure Upgrade

\#\#\# 1\. Project Summary  
We are upgrading the backend infrastructure and frontend UI of "Mind Clear," a task and goal management application. The goal is to solve user latency complaints by implementing a \*\*Multi-Model Architecture\*\*. This features a client-side \*\*Model Selector\*\* directly on the chat interface, allowing users to toggle between "Auto/Fast" (Groq) and "Smart" (Gemini) modes instantly.

\#\#\# 2\. Target Audience  
Users who need immediate responsiveness for quick task capture but want the option to toggle "intelligence" for complex goal planning without leaving the chat flow.

\#\#\# 3\. Core Upgrade Features  
\* \*\*Chat Screen Model Toggle:\*\*  
    \* A UI element (Dropdown or Segmented Control) placed prominently in the Chat Header or near the Input Bar.  
    \* Options: \*\*Auto/Fast\*\* (Default) vs. \*\*Smart\*\*.  
\* \*\*Unified LLM Interface (Adapter Pattern):\*\*  
    \* Backend logic that accepts a \`model\` parameter from the client and routes the request to the appropriate provider (Groq vs. Google Vertex/Gemini).  
\* \*\*Real-Time Streaming:\*\*  
    \* Implementation of streaming responses to maximize perceived speed (low Time-To-First-Token).

\#\#\# 4\. Key User Flow  
1\.  \*\*Open Chat:\*\* User opens the chat screen. The top header shows a toggle set to "Auto" (Lightning icon).  
2\.  \*\*Quick Task (Fast Mode):\*\* User types "Add milk." The system uses the \*\*Groq (Llama 3)\*\* backend for an instant (\<300ms) response.  
3\.  \*\*Complex Request (Smart Mode):\*\* User wants help breaking down a large project. They tap the toggle to switch to "\*\*Smart\*\*" (Brain icon).  
4\.  \*\*Planning:\*\* User types: "Help me plan a marketing strategy." The system routes this to \*\*Google Gemini (1.5 Flash/Pro)\*\* for a detailed, reasoning-heavy response (utilizing the large context window if needed).  
5\.  \*\*State Management:\*\* The app remembers the last selected mode for the duration of the session.

\#\#\# 5\. API & Data Model Updates  
\* \*\*API Request Payload:\*\* The Chat API endpoint must be updated to accept a new parameter:  
    \* \`modelMode\`: \`string\` ('fast' | 'smart')  
\* \*\*Frontend State:\*\*  
    \* Use local state (e.g., React \`useState\`) to track the currently selected model.

\#\#\# 6\. Suggested Tech Stack  
\* \*\*Frontend:\*\* React Native (or current framework). Component library for the dropdown/toggle.  
\* \*\*Backend Routing:\*\* Vercel AI SDK (Google & OpenAI providers) or Custom Wrapper.  
\* \*\*Fast Provider:\*\* \*\*Groq API\*\* (Llama 3.1 8b).  
\* \*\*Smart Provider:\*\* \*\*Google Gemini API\*\* (Gemini 1.5 Flash or 1.5 Pro).

\#\#\# 7\. Implementation Instructions for Cursor  
\* \*\*Step 1:\*\* Modify the Chat Screen component (\`ChatView.tsx\`) to add a header control/toggle for selecting the model.  
\* \*\*Step 2:\*\* Update the \`sendMessage\` function to include the selected \`modelMode\` in the API payload.  
\* \*\*Step 3:\*\* In the backend/API handler, implement the routing logic:  
    \* If \`mode \=== 'fast'\`, instantiate the Groq client.  
    \* If \`mode \=== 'smart'\`, instantiate the Google Generative AI client (using existing API keys).  
\* \*\*Step 4:\*\* Ensure both paths return a standardized stream format so the UI renders identically regardless of the provider.  
