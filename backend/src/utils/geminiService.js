import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import logger from './logger.js';
import { dateParser } from './dateParser.js';
import {
  allGeminiFunctionDeclarations
} from './geminiFunctionDeclarations.js';
import * as tasksController from '../controllers/tasksController.js';
import * as goalsController from '../controllers/goalsController.js';
import * as calendarService from './calendarService.js';

export class GeminiService {
  constructor() {
    this.conversationHistory = new Map();
    this.DEBUG = process.env.DEBUG_LOGS === 'true';
    if (!process.env.GOOGLE_AI_API_KEY) {
      if (this.DEBUG) logger.warn('GOOGLE_AI_API_KEY not found. Gemini AI features will be disabled.');
      this.enabled = false;
      return;
    }
    this.enabled = true;
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    
    // Configure Gemini model with safety settings (long-term fix for harmful content filtering)
    // Using BLOCK_MEDIUM_AND_ABOVE as threshold for all categories to prevent harmful content
    // while reducing false positives from overly broad regex patterns
    this.model = this.genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
    });
    // Gemini AI initialized with model: gemini-2.5-flash and safety settings

    // Gate verbose debug logs. When DEBUG is false, suppress logs that are clearly
    // marked as Gemini debug (to keep console clean in pre-alpha builds).
    // This avoids touching error logs and other app logs.
    if (!this.DEBUG && !GeminiService.__debugLogPatched) {
      const originalLog = console.log.bind(console);
      console.log = (...args) => {
        try {
          const first = args && args.length > 0 ? args[0] : '';
          if (typeof first === 'string' && first.startsWith('🔍 [GEMINI DEBUG]')) {
            return; // swallow debug-only logs when DEBUG=false
          }
        } catch {}
        return originalLog(...args);
      };
      GeminiService.__debugLogPatched = true;
    }
  }

  /**
   * Generate consistent history key for userId and threadId combination
   */
  _getHistoryKey(userId, threadId) {
    return threadId ? `${userId}:${threadId}` : `${userId}:null`;
  }

  /**
   * Parse brain dump text into structured items.
   * Returns an array of normalized items with fields:
   * [{ text, type: 'task'|'goal', confidence: number, category: string|null, stress_level: 'low'|'medium'|'high', priority: 'low'|'medium'|'high' }]
   *
   * @param {string} text
   * @param {string} userId
   * @returns {Promise<Array<{text:string,type:string,confidence:number,category:string|null,stress_level:string,priority:string}>>}
   */
  async processBrainDump(text, userId) { // eslint-disable-line @typescript-eslint/no-unused-vars
    const buildFallback = () => {
      const first = String(text || '').split(/\.|\n|;|,/)[0]?.trim() || 'Note';
      return [{ text: first, type: 'task', confidence: 0.5, category: null, stress_level: 'medium', priority: 'medium' }];
    };

    if (!this.enabled) {
      return buildFallback();
    }

    const prompt = `You will receive a user's free-form brain dump. Extract a deduplicated list of items and classify each as either a short-term task or a longer-term goal (project/objective).\n
For each item, return ONLY a JSON array of objects with fields:\n- text: string\n- type: "task" | "goal"\n- confidence: number in [0,1]\n- category: string | null (use user's existing task categories if applicable for tasks; null for goals is acceptable)\n- stress_level: "low" | "medium" | "high"\n
Rules:\n- Tasks are concrete, one-off actions (e.g., "Email Dr. Lee", "Buy milk").\n- Goals are broader outcomes/projects (e.g., "Get in shape", "Plan a vacation").\n- Keep items concise.\n
Respond ONLY with a JSON array.`;

    try {
      const response = await this._generateContentWithRetry({
        contents: [
          { role: 'user', parts: [{ text: prompt }] },
          { role: 'user', parts: [{ text }] }
        ]
      }, 1, userId);
      const raw = response.text ? await response.text() : '';
      let items = [];
      try {
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) items = JSON.parse(match[0]);
      } catch (_) {
        // ignore parse error, will fallback below
      }
      const normalized = Array.isArray(items) ? items
        .filter(it => it && typeof it.text === 'string' && it.text.trim() !== '')
        .map(it => ({
          text: String(it.text).trim(),
          type: /^(task|goal)$/i.test(it.type) ? it.type.toLowerCase() : 'task',
          confidence: typeof it.confidence === 'number' && it.confidence >= 0 && it.confidence <= 1 ? it.confidence : 0.7,
          category: it.category || null,
          stress_level: /^(low|medium|high)$/i.test(it.stress_level) ? it.stress_level.toLowerCase() : 'medium',
          priority: /^(low|medium|high)$/i.test(it.stress_level) ? it.stress_level.toLowerCase() : 'medium'
        })) : [];

      return normalized.length > 0 ? normalized : buildFallback();
    } catch (err) {
      if (this.DEBUG) console.error('processBrainDump error:', err);
      return buildFallback();
    }
  }

  /**
   * Wrapper around model.generateContent with retries and model fallback.
   */
  async _generateContentWithRetry(request, attempt = 1, userId = null) {
    const maxAttempts = 3;
    const baseDelayMs = 400;
    try {
      const result = await this.model.generateContent(request);
      const response = await result.response;

      // Track token usage if available
      if (result.response.usageMetadata) {
        this._trackTokenUsage(result.response.usageMetadata, request, userId);
      }

      return response;
    } catch (err) {
      const isServerError = err && (err.status === 500 || err.status === 502 || err.status === 503 || err.status === 504);
      if (attempt < maxAttempts && isServerError) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        if (this.DEBUG) logger.warn(`Gemini generateContent failed (attempt ${attempt}). Retrying in ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay));
        return this._generateContentWithRetry(request, attempt + 1, userId);
      }
      // Fallback to a lighter model once before giving up
      if (attempt === maxAttempts) {
        try {
          if (this.DEBUG) logger.warn('Primary model failed after retries. Falling back to gemini-1.5-flash');
          const fallbackModel = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
          const result = await fallbackModel.generateContent(request);
          const fallbackResponse = await result.response;
          if (result.response?.usageMetadata) {
            this._trackTokenUsage(result.response.usageMetadata, request, userId);
          }
          return fallbackResponse;
        } catch (fallbackErr) {
          if (this.DEBUG) logger.error('Fallback model failed:', fallbackErr);
        }
      }      throw err;
    }
  }

  /**
   * Main entry point for processing a user message using Gemini function calling API.
   */
  async processMessage(message, userId, threadId = null, userContext = {}) {
    try {
      if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Starting processMessage');
      if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Input message:', message);
      if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] User ID:', userId);
      if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] User context:', JSON.stringify(userContext, null, 2));

      if (!this.enabled) {
        if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Gemini disabled, returning basic mode message');
        return {
          message: "I'm currently in basic mode. To enable full AI features, please set up your Gemini API key in the environment variables.",
          actions: []
        };
      }
      // Content filtering for harmful content
      const filteredMessage = this._filterHarmfulContent(message);
      if (filteredMessage.blocked) {
        if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Message blocked by content filter');
        return {
          message: "I noticed your message might contain content outside my area of expertise. I'm here to help with productivity, goal-setting, and task management. Could you rephrase your request to focus on tasks, goals, or scheduling?",
          actions: []
        };
      }

      // Update conversation history
      this._addToHistory(userId, threadId, { role: 'user', content: filteredMessage.content });
      // Add a system prompt to instruct Gemini to use functions
      // --- Add today's date to the prompt ---
      const today = new Date();
      const options = { year: 'numeric', month: 'long', day: 'numeric' };
      const todayString = today.toLocaleDateString('en-US', options);
      const moodLine = userContext.mood ? `User mood: ${userContext.mood}. Adjust tone accordingly (be concise, supportive, and match energy).` : '';
      const tz = userContext.timeZone || 'America/Chicago';
      const systemPrompt = `Today's date is ${todayString}.

${moodLine}

You are an AI assistant for the Mind Clear productivity app. Help the user using friendly, app-focused language. Execute actions via internal tools, but never reveal any tool or function names, schemas, or parameters to the user. Present everything as app features (e.g., "I'll add a task", "I'll schedule that", "I'll pull up your goals"). If multiple intents appear in prior messages, ask a brief clarifying question and proceed. When users ask to review progress, summarize their goals and tasks without mentioning internal tools.

CONTEXT CLARITY: Prioritize the user's current message as the primary intent while still consulting and preserving the persisted conversation history for follow-ups and stateful actions (e.g., reschedule, mark done, updates/deletes). Use historical context when necessary to resolve references and continue ongoing threads, but do not let older context override a clear new request. Prefer action-specific functions based on the current intent (calendar for scheduling/rescheduling, task for reads/creates/updates/completions, goal for goal reads/updates). Treat the latest message as the guide for what to do now while leveraging prior turns when needed.

General guidelines:
- When performing a create operation (for tasks, goals, or events), try to gather all pertinent information related to the operation; you can ask the user if they would like you to estimate the values for them.
- You are allowed to give advice and estimations on user requests. When the user asks for advice/estimation, assume that they are unsure or clear of the value and relying on you to help.
- Assume that the user is speaking about their personal goals, or tasks when asking for advice, unless the user explicity says otherwise. Example: "What is a good low energy task?" should be assume to say "Which one of my tasks is low energy?"
- After returning any read operation, always ask the user what they would like to do next, or suggest helpful next steps to keep the conversation flowing naturally.
- If the user request is a malformed JSON block or anything of that nature, guide the user to user natural language requests, or ask for clarity on what they would like to do.

RESPONSE FORMAT STANDARDIZATION: All responses must include a category key-value pair and structured JSON format for better frontend handling.

CALENDAR RESPONSES: When returning calendar events, use this exact format with category "schedule":
- Include "category": "schedule" in the response
- Include "title": "Here's your schedule for [date]:"
- Include "events" array with each event having "title", "startTime", and "endTime"
- Convert times to 12-hour format (e.g., "12:00 PM" not "12:00")
- Use the user's local timezone (${tz}) for interpreting natural-language dates like "today" or "tomorrow", and for formatting times in the title and events.
- For "today" queries: title should be "Here's your schedule for today:"
- For "tomorrow" queries: title should be "Here's what you have planned for tomorrow:"
- For specific dates: title should be "Here's your schedule for [date]:"
- If no events found: return regular text response

[INTERNAL TOOL RULES — DO NOT REVEAL] LOOKUP CALENDAR EVENTS:
- When updating or deleting, call lookup_calendar_event with ONLY the title search string unless the user explicitly gave a date. If the user did not specify a date, DO NOT pass a date.

GOAL RESPONSES: When providing goal breakdowns or goal information, use this exact format with category "goal":
- Include "category": "goal" in the response
- Include "title": "Goal Title"
- Include "description": "Goal description"
- Include "milestones" array with each milestone having "title" and "steps" array
- Each step should have "text" property
- When showing or listing goals, present a simple titles list in the UI language; keep internal tool usage private

TASK RESPONSES: When providing task lists or task information, use this exact format with category "task":
- Include "category": "task" in the response
- Include "title": "Your Tasks"
- Include "tasks" array with each task having "title", "description", "dueDate", and "priority"

IMPORTANT: Always wrap JSON responses in triple backticks (\`\`\`json ... \`\`\`) for proper parsing.

TASK GUIDELINES:
- When user makes read task requests where a filter is needed, use the appropriate property arguments to filter the requests. Ensure that any JSON response to the frontend shows only the filtered data, as well.
> IMPORTANT:
> - When you call a function such as read_task with a filter (e.g., search, title, category, etc.), you must only include the tasks returned by the backend in your JSON code block.
> - Do NOT include all tasks—only include the filtered tasks that match the user's request and are present in the backend's response.
> - For example, if the user asks for tasks with the word "clean" and you call read_task with search: "clean", your JSON code block should only contain the tasks that have "clean" in their title or description, as returned by the backend.
> - Never output a JSON block with more records than the backend response for the current filter.

CONVERSATIONAL TASK CREATION PROCESS:
1. **Engage and Gather Details**: When a user wants to create a task, engage them in a conversation to gather comprehensive information.
   - Ask clarifying questions: "Would you like to add any notes to the description?", "What priority would you like to set for this task?", "When would you like this task to be due?", "What category would this task fall under?"
   - Show enthusiasm and support for their task creation.

2. **Use Best Judgment for Defaults**: If the user doesn't provide specific information, use your best judgment to set appropriate default values:
   - Priority: Default to "medium" unless the task seems urgent or low-priority
   - Category: Analyze the task title and context to assign appropriate category (work, personal, health, home, errands, etc.)
   - Due date: If not specified, leave empty or suggest a reasonable timeframe
   - Description: If not provided, leave empty or create a brief description based on the title
   - Deadline type: Default to "soft" unless the task has a hard deadline
   - Status: Default to "not_started"

3. **Create with Confidence**: Once you have the information (or have set appropriate defaults), create the task with all available details.
   - Create the task with the complete information (do not mention internal tools in user-facing text).
   - Confirm what was created and celebrate their productivity.

Example Conversation Flow:
User: "Add a task to buy groceries"
AI: "Great! I'd love to help you create that task. Let me gather a few details to make it more useful for you:

- Would you like to add any notes to the description? (e.g., specific items, store location, etc.)
- What priority would you like to set for this task? (high, medium, or low)
- When would you like this task to be due?
- What category would this fall under? (errands, personal, etc.)

If you'd prefer, I can also use my best judgment to set reasonable defaults for any of these!"

User: "Just set defaults"
AI: "Perfect! I'll create this task with sensible defaults. Based on the title 'buy groceries', I'll set it as:
- Priority: Medium
- Category: Errands
- Due date: No specific due date (you can add one later if needed)
- Description: Empty for now (you can add details later)

Let me create this task for you..."

[INTERNAL TOOL USAGE]: create_task with appropriate defaults

GOAL Setting guidelines:
- Goal: The long-term destination or outcome the user wants to achieve.
  - Each goal is comprised of several milestones.
- Milestone: A major achievement or big step toward the goal.
  - Each milestone can be comprised of 2 or more steps, to only limit should be how many steps it will take to complete the milestone.
- Step: A specific, actionable task that helps complete a milestone.

GOAL UPDATE BEHAVIOR:
- When updating a goal with new milestones, ALWAYS ask the user: "Would you like me to add these new milestones to your existing ones, or replace all existing milestones with these new ones?"
- Use milestone_behavior: "add" when the user wants to keep existing milestones and add new ones
- Use milestone_behavior: "replace" when the user wants to replace all existing milestones with new ones
- Default to "add" behavior if the user doesn't specify their preference

CONVERSATIONAL GOAL CREATION PROCESS:
1. **Engage and Understand**: When a user mentions wanting to achieve something, engage them in a conversation about their goal.
   - Ask clarifying questions: "What specifically do you want to achieve?" "When would you like to complete this by?" "How important is this to you?"
   - Show enthusiasm and support for their goal.

2. **Break Down Together**: Help them break down their goal into manageable pieces.
   - "Let's break this down into smaller, achievable milestones. What would be the first major step toward your goal?"
   - "What would success look like for this milestone?"
   - Guide them to think about specific, actionable steps.

3. **Suggest and Refine**: Offer suggestions while keeping them in control.
   - "Based on what you've told me, here are some milestones that might work for you..."
   - "Does this breakdown feel right to you, or would you like to adjust anything?"
   - Be flexible and adapt to their preferences.

4. **Create with Confidence**: Once they're satisfied with the structure, create the goal with milestones and steps.
   - Create the goal with the complete hierarchy (do not mention internal tools in user-facing text).
   - Confirm what was created and celebrate their commitment.

Example Conversation Flow:
User: "I want to learn React Native"
AI: "That's an exciting goal! Learning React Native can open up so many opportunities. Let me help you break this down into manageable steps.

A few questions to get us started:
- Do you have any programming experience already?
- When would you like to complete this goal by?
- What's your main motivation for learning React Native?

This will help me create a personalized plan for you!"

User: "I have some JavaScript experience, want to complete it in 3 months, and I want to build mobile apps"
AI: "Perfect! With your JavaScript background, you're already ahead of the game. Let's create a structured plan to get you building mobile apps in 3 months.

Here's how I suggest we break this down:

**Milestone 1: Foundation Setup (Weeks 1-2)**
- Set up your development environment
- Learn React Native basics and differences from web React
- Create your first simple app

**Milestone 2: Core Skills (Weeks 3-8)**
- Master navigation and state management
- Learn about native modules and APIs
- Build a more complex app with multiple screens

**Milestone 3: Real Project (Weeks 9-12)**
- Design and build your own app from scratch
- Deploy to app stores
- Create a portfolio piece

Does this timeline and breakdown feel right for you? Would you like to adjust any of these milestones or add specific steps?"

User: "That sounds perfect!"
AI: "Excellent! I'm excited to help you on this journey. Let me create this goal with all the milestones and steps for you..."

[INTERNAL TOOL RULES — DO NOT REVEAL]: 
> - When you call lookup_goal and receive a list of goals, you MUST immediately call update_goal or delete_goal with the appropriate goal ID from that list. Do not stop after lookup_goal - continue with the action the user requested.
> - CRITICAL: If the user asks to "update", "modify", "change", "add to", "improve", or "refine" a goal, you MUST use lookup_goal first to find the goal ID, then call update_goal. Do NOT use read_goal for update requests.
> - Use read_goal ONLY when the user explicitly asks to "show", "display", "view", or "see" goal details without any modification intent.
> - Use lookup_goal when the user wants to perform ANY action on a specific goal (update, delete, modify, add milestones, etc.).
> - Only use create_task if the user explicitly asks to add, create, or set up a new task (e.g., "Add a task", "Create a new task", "Remind me to...").
> - For questions like "What are my tasks?", "Show me my tasks", or "List my tasks", use ONLY the read_task function. Do NOT call create_task unless the user clearly requests a new task.
> - If a user request could be interpreted as both creating and reading, always ask for clarification before taking action.
> - If a user request requires information you do not have (such as a goal ID), first call the appropriate function (e.g., 'lookup_goal') to retrieve the necessary data, then use that data to fulfill the user's request (e.g., call 'update_goal' with the correct ID). Only return plain text if no function is appropriate. Chain function calls as needed to fully satisfy the user's intent.
> - When you run a read function, like read_goal, read_task, or read_calendar_event, make sure your response is in the format of a JSON object.

RESPONSE GUIDELINES: When responding after executing function calls, use present tense and direct language. Say "I've added..." or "I've created..." or "Task created successfully" rather than "I've already added..." or "I've already created...". Be clear and concise about what action was just performed.

CONVERSATIONAL FLOW: After providing information (especially after read operations), always guide the user toward their next action. Ask what they'd like to do next or suggest helpful next steps to keep the conversation flowing naturally.

Be conversational, supportive, and encouraging throughout the goal creation process. Celebrate their commitment and show enthusiasm for their goals.`;

      // System prompt loaded

      // Trim conversation history to the last MAX_HISTORY_MESSAGES
      const MAX_HISTORY_MESSAGES = 20;
      const historyKey = this._getHistoryKey(userId, threadId);
      let fullHistory = this.conversationHistory.get(historyKey) || [];
      
      // If cache is empty and we have a threadId, try to load from database
      if (fullHistory.length === 0 && threadId) {
        if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Cache empty, loading history from database for thread:', threadId);
        fullHistory = await this._loadHistoryFromDatabase(userId, threadId);
        // Store loaded history in cache
        if (fullHistory.length > 0) {
          this.conversationHistory.set(historyKey, fullHistory);
        }
      }
      
      const trimmedHistory = fullHistory.slice(-MAX_HISTORY_MESSAGES);
      
      if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Conversation history length:', trimmedHistory.length);
      
      const contents = [
        { role: 'user', parts: [{ text: systemPrompt }] },
        ...trimmedHistory.map(msg => ({
          role: msg.role,
          parts: [{ text: msg.content }]
        })),
        { role: 'user', parts: [{ text: message }] }
      ];
      
      if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Sending request to Gemini with contents length:', contents.length);
      if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Function declarations count:', allGeminiFunctionDeclarations.length);
      
      // Send to Gemini (with retry/backoff and model fallback)
      const response = await this._generateContentWithRetry({
        contents,
        tools: [{ functionDeclarations: allGeminiFunctionDeclarations }]
      }, 1, userId);
      
      if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Received response from Gemini');
      if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Response has function calls:', !!response.functionCalls);
      
      // LONG-TERM FIX: Check Gemini's native safety ratings
      // If the response was blocked due to safety concerns, return a friendly fallback
      if (response.promptFeedback?.blockReason) {
        const blockReason = response.promptFeedback.blockReason;
        logger.warn('Gemini blocked content due to safety:', {
          blockReason,
          messageLength: message.length
        });
        return {
          message: "I'm here to help with productivity, goal-setting, and task management. Let's focus on how I can assist you with your goals and tasks.",
          actions: []
        };
      }
      
      // Check safety ratings in the response candidates
      if (response.candidates?.[0]?.safetyRatings) {
        const safetyRatings = response.candidates[0].safetyRatings;
        const blockedCategories = safetyRatings.filter(rating => 
          rating.probability === 'HIGH' || rating.probability === 'MEDIUM'
        );
        
        if (blockedCategories.length > 0) {
          logger.warn('Gemini flagged content with safety concerns:', {
            categories: blockedCategories.map(r => ({ category: r.category, probability: r.probability })),
            messageLength: message.length
          });
          return {
            message: "I'm here to help with productivity, goal-setting, and task management. Let's focus on how I can assist you with your goals and tasks.",
            actions: []
          };
        }
      }
      
      // Get function calls and text from Gemini response
      let functionCalls = response.functionCalls ? await response.functionCalls() : [];

      const functionCallsCount = Array.isArray(functionCalls) ? functionCalls.length : 0;
      if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Function calls count:', functionCallsCount);
      if (functionCallsCount > 0) {
        if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Function calls:', functionCalls.map(fc => ({
          name: fc.name,
          args: fc.args
        })));
      }
      
      // Defensive check to ensure functionCalls is always an array
      if (!functionCalls || !Array.isArray(functionCalls)) {
        functionCalls = [];
        if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Function calls was not an array, set to empty array');
      }
      
      // Check for function calls
      let actions = [];
      let functionResults = [];
      // Track executed function calls to prevent exact-duplicate execution
      const executedFunctionCalls = new Set();
      // Prevent multiple READs of the same entity in a single turn (e.g., read_task twice)
      const executedReadEntities = new Set();
      if (functionCalls && functionCalls.length > 0) {
        if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Processing function calls...');
        for (const functionCall of functionCalls) {
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Executing function call:', functionCall.name);
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Function call args:', JSON.stringify(functionCall.args, null, 2));
          
          // Create a unique key for the function call (name + args JSON)
          const callKey = `${functionCall.name}:${JSON.stringify(functionCall.args)}`;
          executedFunctionCalls.add(callKey);
          // Skip second+ read calls for the same entity
          if (functionCall.name.startsWith('read_')) {
            const match = functionCall.name.match(/^read_(.*)$/);
            const entity = match ? match[1] : functionCall.name;
            if (executedReadEntities.has(entity)) {
              if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Skipping duplicate read for entity:', entity);
              continue;
            }
            executedReadEntities.add(entity);
          }
          let execResult = await this._executeFunctionCall(functionCall, userId, userContext);
          
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Function execution result:', JSON.stringify(execResult, null, 2));
          
          // Due date normalization for tests (mock mode)
          let details = execResult !== undefined && execResult !== null ? execResult : functionCall.args;
          // Gemini API expects functionResponse.response to be an object, not an array
          if (functionCall.name === 'read_goal' && Array.isArray(details)) {
            details = { goals: details };
            if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Converted read_goal array to object with goals property');
          }
          if (functionCall.name === 'read_task' && Array.isArray(details)) {
            details = { tasks: details };
            if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Converted read_task array to object with tasks property');
          }
          if (functionCall.name === 'read_calendar_event' && Array.isArray(details)) {
            details = { events: details };
            if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Converted read_calendar_event array to object with events property');
          }
          if (details && details.due_date) {
            // Normalize past year to current year
            const m = details.due_date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (m) {
              const [_, y, mm, dd] = m;
              const nowY = new Date().getFullYear();
              if (parseInt(y, 10) < nowY) {
                details.due_date = `${nowY}-${mm}-${dd}`;
              }
            }
            // Normalize 'tomorrow' to tomorrow's date
            if (details.due_date.toLowerCase && details.due_date.toLowerCase() === 'tomorrow') {
              const tomorrow = new Date();
              tomorrow.setDate(tomorrow.getDate() + 1);
              const yyyy = tomorrow.getFullYear();
              const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
              const dd = String(tomorrow.getDate()).padStart(2, '0');
              details.due_date = `${yyyy}-${mm}-${dd}`;
            }
          }
          // Only add to actions if it's not a lookup operation
          if (functionCall.name !== 'lookup_goal') {
            // Map function call to action object
            let action_type = 'unknown';
            let entity_type = 'unknown';
            
            // Handle get_goal_titles specifically
            if (functionCall.name === 'get_goal_titles') {
              action_type = 'read';
              entity_type = 'goal';
            } else if (functionCall.name.startsWith('create_')) action_type = 'create';
            else if (functionCall.name.startsWith('read_')) action_type = 'read';
            else if (functionCall.name.startsWith('update_')) action_type = 'update';
            else if (functionCall.name.startsWith('delete_')) action_type = 'delete';
            
            // For standard CRUD operations, extract entity type from function name
            const entityMatch = functionCall.name.match(/^(create|read|update|delete)_(.*)$/);
            if (entityMatch) entity_type = entityMatch[2];
            
            actions.push({
              action_type,
              entity_type,
              details,
              args: functionCall.args || {}
            });
            
            // Normalize due_date if present
            this._normalizeDueDate(actions[actions.length - 1]);
            
            if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Added action:', { action_type, entity_type });
          }
          functionResults.push({ name: functionCall.name, response: details });
        }
        // Send function results back to Gemini for final message
        const functionResponses = functionResults.map(fr => ({
          name: fr.name,
          response: fr.response
        }));
        
        if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Function responses to send back to Gemini:', JSON.stringify(functionResponses, null, 2));
        
        const followupContents = [
          ...contents,
          ...functionResponses.map(fr => ({
            role: 'model',
            parts: [{ 
              functionResponse: { 
                name: fr.name, 
                response: Array.isArray(fr.response) ? { goals: fr.response } : fr.response 
              } 
            }]
          }))
        ];
        
        let message = '';
        if (actions.length > 1) {
          // Try to normalize multiple homogeneous READ actions into one category block
          const allRead = actions.every(a => a.action_type === 'read');
          const entityTypes = Array.from(new Set(actions.map(a => a.entity_type)));
          if (allRead && entityTypes.length === 1) {
            const entity = entityTypes[0];
            if (entity === 'task') {
              const mergedTasks = actions.flatMap(a => Array.isArray(a.details?.tasks) ? a.details.tasks : (Array.isArray(a.details) ? a.details : []));
              const payload = { category: 'task', title: 'Your Tasks', tasks: mergedTasks };
              const leadIn = this._buildReadLeadIn('task', mergedTasks?.length || 0, userContext);
              message = `${leadIn}\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
              if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Merged multiple read_task actions into category block');
            } else if (entity === 'calendar_event') {
              const mergedEvents = actions.flatMap(a => Array.isArray(a.details?.events) ? a.details.events : (Array.isArray(a.details) ? a.details : []));
              const payload = { category: 'schedule', title: "Here's your schedule:", events: mergedEvents };
              const leadIn = this._buildReadLeadIn('calendar_event', mergedEvents?.length || 0, userContext);
              message = `${leadIn}\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
              if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Merged multiple read_calendar_event actions into category block');
            } else {
              message = `created ${actions.length} actions`;
              if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Multiple actions (unsupported merge), using simple message:', message);
            }
          } else {
            message = `created ${actions.length} actions`;
            if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Multiple actions (heterogeneous), using simple message:', message);
          }
          } else {
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Sending followup request to Gemini for final response');
          const finalResponse = await this._generateContentWithRetry({
            contents: followupContents,
            tools: [{ functionDeclarations: allGeminiFunctionDeclarations }]
          }, 1, userId);
          
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Received final response from Gemini');
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Final response has function calls:', !!finalResponse.functionCalls);
          
          // Check for additional function calls in the final response
          let finalFunctionCalls = finalResponse.functionCalls ? await finalResponse.functionCalls() : [];
          
          // Defensive check to ensure finalFunctionCalls is always an array
          if (!finalFunctionCalls || !Array.isArray(finalFunctionCalls)) {
            finalFunctionCalls = [];
            if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Final function calls was not an array, set to empty array');
          }
          
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Final function calls count:', finalFunctionCalls.length);
          
          if (finalFunctionCalls && finalFunctionCalls.length > 0) {
            if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Processing additional function calls in final response...');
            // Process the additional function calls
            for (const functionCall of finalFunctionCalls) {
              if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Executing additional function call:', functionCall.name);
              // Create a unique key for the function call (name + args JSON)
              const callKey = `${functionCall.name}:${JSON.stringify(functionCall.args)}`;
              if (executedFunctionCalls.has(callKey)) {
                // Skip duplicate function call
                if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Skipping duplicate function call:', functionCall.name);
                continue;
              }
              executedFunctionCalls.add(callKey);
              // Skip second+ read calls for the same entity
              if (functionCall.name.startsWith('read_')) {
                const match = functionCall.name.match(/^read_(.*)$/);
                const entity = match ? match[1] : functionCall.name;
                if (executedReadEntities.has(entity)) {
                  if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Skipping duplicate read for entity (final pass):', entity);
                  continue;
                }
                executedReadEntities.add(entity);
              }
              const details = await this._executeFunctionCall(functionCall, userId, userContext);
              
              if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Additional function execution result:', JSON.stringify(details, null, 2));
              
              // Determine action type and entity type
              let action_type = 'unknown';
              let entity_type = 'unknown';
              
              // Handle get_goal_titles specifically
              if (functionCall.name === 'get_goal_titles') {
                action_type = 'read';
                entity_type = 'goal';
              } else if (functionCall.name.startsWith('create_')) action_type = 'create';
              else if (functionCall.name.startsWith('read_')) action_type = 'read';
              else if (functionCall.name.startsWith('update_')) action_type = 'update';
              else if (functionCall.name.startsWith('delete_')) action_type = 'delete';
              
              // For standard CRUD operations, extract entity type from function name
              const entityMatch = functionCall.name.match(/^(create|read|update|delete)_(.*)$/);
              if (entityMatch) entity_type = entityMatch[2];
              
              actions.push({
                action_type,
                entity_type,
                details,
                args: functionCall.args || {}
              });
              if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Added additional action:', { action_type, entity_type });
            }
          }
          
          message = finalResponse.text ? await finalResponse.text() : '';
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Final response text:', message);
          
          // Standardize READ responses to category blocks for frontend rendering
          const firstReadTask = actions.find(a => a.action_type === 'read' && a.entity_type === 'task');
          const firstReadGoal = actions.find(a => a.action_type === 'read' && a.entity_type === 'goal');
          const firstReadCal  = actions.find(a => a.action_type === 'read' && a.entity_type === 'calendar_event');

          if (firstReadCal) {
            const events = Array.isArray(firstReadCal.details?.events) ? firstReadCal.details.events : (Array.isArray(firstReadCal.details) ? firstReadCal.details : []);
            const schedulePayload = { category: 'schedule', title: "Here's your schedule:", events };
            const leadIn = this._buildReadLeadIn('calendar_event', events?.length || 0, userContext);
            message = `${leadIn}\n\n\`\`\`json\n${JSON.stringify(schedulePayload, null, 2)}\n\`\`\``;
            if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Injected schedule category block');
          } else if (firstReadGoal) {
            const details = firstReadGoal.details ?? {};
            const rawGoals = details?.goals ?? firstReadGoal.details;
            // Titles-only list (get_goal_titles): array of strings
            const titlesArray = Array.isArray(rawGoals) && rawGoals.every(g => typeof g === 'string')
              ? rawGoals
              : (Array.isArray(details?.goals) && details.goals.every(g => typeof g === 'string') ? details.goals : null);

            if (titlesArray) {
              const payload = { category: 'goal', title: 'Your Goals', goals: titlesArray };
              const leadIn = this._buildReadLeadIn('goal', titlesArray.length, userContext);
              message = `${leadIn}\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
              if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Injected goal titles category block');
            } else {
              // Fallback: focus a single goal object
              const goalsPayload = details?.goals ?? details;
              const goalsArray = Array.isArray(goalsPayload) ? goalsPayload : [goalsPayload];
              const firstGoal = goalsArray && goalsArray.length > 0 ? goalsArray[0] : null;
              if (firstGoal) {
                const goalPayload = { category: 'goal', title: firstGoal.title || 'Goal', goal: firstGoal };
                const leadIn = this._buildReadLeadIn('goal', 1, userContext);
                message = `${leadIn}\n\n\`\`\`json\n${JSON.stringify(goalPayload, null, 2)}\n\`\`\``;
                if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Injected goal category block');
              }
            }
          } else if (firstReadTask) {
            const tasks = Array.isArray(firstReadTask.details?.tasks) ? firstReadTask.details.tasks : (Array.isArray(firstReadTask.details) ? firstReadTask.details : []);
            const taskPayload = { category: 'task', title: 'Your Tasks', tasks };
            const leadIn = this._buildReadLeadIn('task', tasks?.length || 0, userContext, firstReadTask.args || {});
            message = `${leadIn}\n\n\`\`\`json\n${JSON.stringify(taskPayload, null, 2)}\n\`\`\``;
            if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Injected task category block');
          }

          // If we created or updated a calendar event in this cycle, append a precise confirmation line
          const createdEventAction = actions.find(a => a.action_type === 'create' && a.entity_type === 'calendar_event');
          const updatedEventAction = actions.find(a => a.action_type === 'update' && a.entity_type === 'calendar_event');
          const eventAction = createdEventAction || updatedEventAction;
          if (eventAction && eventAction.details) {
            const ev = eventAction.details;
            const startIso = ev.start_time || ev.start || ev.startTime;
            const endIso = ev.end_time || ev.end || ev.endTime;
            const start = startIso ? new Date(startIso) : null;
            const end = endIso ? new Date(endIso) : null;
            const tzOpt = userContext?.timeZone || 'America/Chicago';
            const startStr = start ? start.toLocaleString('en-US', { timeZone: tzOpt, hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric', year: 'numeric' }) : 'scheduled time';
            const endStr = end ? end.toLocaleTimeString('en-US', { timeZone: tzOpt, hour: 'numeric', minute: '2-digit', hour12: true }) : '';
            const whenText = endStr ? `${startStr} - ${endStr}` : startStr;
            const title = ev.title || ev.summary || (actions.find(a=>a.action_type==='create'&&a.entity_type==='calendar_event')?.details?.title) || 'your event';
            const verb = createdEventAction ? "scheduled" : "updated";
            message = `I've ${verb} "${title}" for ${whenText}.\n\n${message}`;
          }

          // If we deleted calendar events, craft a confirmation line for each
          const deletedEventActions = actions.filter(a => a.action_type === 'delete' && a.entity_type === 'calendar_event' && a.details && a.details.event);
          if (deletedEventActions.length > 0) {
            const confirmations = deletedEventActions.map(a => {
              const ev = a.details.event;
              const startIso = ev.start;
              const endIso = ev.end;
              const start = startIso ? new Date(startIso) : null;
              const end = endIso ? new Date(endIso) : null;
              const tzOpt = userContext?.timeZone || 'America/Chicago';
              const startStr = start ? start.toLocaleString('en-US', { timeZone: tzOpt, hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric', year: 'numeric' }) : '';
              const endStr = end ? end.toLocaleTimeString('en-US', { timeZone: tzOpt, hour: 'numeric', minute: '2-digit', hour12: true }) : '';
              const whenText = startStr ? (endStr ? `${startStr} - ${endStr}` : startStr) : 'the selected time';
              const title = ev.title || 'Event';
              return `Deleted "${title}" (${whenText})${ev.location ? ` • ${ev.location}` : ''}.`;
            }).join('\n');
            message = `${confirmations}\n\n${message}`.trim();
          }
          
          // Add confirmation flow for goal updates
          const updatedGoalAction = actions.find(a => a.action_type === 'update' && a.entity_type === 'goal');
          if (updatedGoalAction && updatedGoalAction.details) {
            const goal = updatedGoalAction.details;
            const goalTitle = goal.title || 'your goal';
            const milestoneBehavior = updatedGoalAction.args?.milestone_behavior || 'add';
            const hasMilestones = updatedGoalAction.args?.milestones && updatedGoalAction.args.milestones.length > 0;
            
            let confirmationMessage = `I've updated "${goalTitle}".`;
            
            if (hasMilestones) {
              if (milestoneBehavior === 'replace') {
                confirmationMessage += ` I've replaced all existing milestones with the new ones from our conversation.`;
              } else {
                confirmationMessage += ` I've added the new milestones to your existing ones.`;
              }
            }
            
            // If the original message is empty or very short, use our confirmation
            if (!message || message.trim().length < 10) {
              message = confirmationMessage;
            } else {
              message = `${confirmationMessage}\n\n${message}`;
            }
            if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Added goal update confirmation');
          }

          // Add directional guidance after read actions to keep conversation flowing
          //const readGoalAction = actions.find(a => a.action_type === 'read' && a.entity_type === 'goal');
          //const hasReadAction = readGoalAction || actions.some(a => a.action_type === 'read');
          //if (hasReadAction) {
            //console.log('🔍 [GEMINI DEBUG] Found read action, adding directional guidance');
            //let guidancePrompt = '';
            //if (readGoalAction) {
              //guidancePrompt = `\n\nWhat would you like to do next?\n• Add one of these steps as a task\n• Schedule time on your calendar for a step\n• Mark a step as complete\n• Update the goal details`;
            //} else {
              //guidancePrompt = `\n\nWhat would you like to do next? You can:\n• Add a new task or goal\n• Update an existing item\n• Ask me to help you prioritize or plan\n• Get more details about something specific`;
            //}
            //message += guidancePrompt;
            //console.log('🔍 [GEMINI DEBUG] Added directional guidance to message');
          //}
        }
        // Fallback: if message is still empty, provide a generic confirmation
        if (!message || message.trim().length === 0) {
          if (actions.length > 0) {
            const actionTypes = actions.map(a => a.action_type);
            const entityTypes = actions.map(a => a.entity_type);
            if (actionTypes.includes('update') && entityTypes.includes('goal')) {
              message = "I've updated your goal successfully.";
            } else if (actionTypes.includes('create')) {
              message = "I've created that for you.";
            } else if (actionTypes.includes('delete')) {
              message = "I've deleted that for you.";
            } else {
              message = "I've completed that action for you.";
            }
            if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Added fallback confirmation message');
          } else {
            message = "I've processed your request.";
            if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Added generic fallback message');
          }
        }
        
        // Add to conversation history
        this._addToHistory(userId, threadId, { role: 'model', content: message });
        
        // Defensive check to ensure actions is always an array
        if (!actions || !Array.isArray(actions)) {
          actions = [];
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Actions was not an array, set to empty array');
        }
        
        // Ensure general JSON-only replies render in clients that strip code blocks
        message = this._sanitizeMessageForFrontend(message);

        if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Final return object:', {
          message: message.substring(0, 200) + (message.length > 200 ? '...' : ''),
          actionsCount: actions.length,
          actions: actions.map(a => ({ action_type: a.action_type, entity_type: a.entity_type }))
        });
        
        return {
          message,
          actions
        };
      } else {
        // No function call, just return Gemini's text
        let message = response.text ? await response.text() : '';
        // Ensure general JSON-only replies render in clients that strip code blocks
        message = this._sanitizeMessageForFrontend(message);
        
        this._addToHistory(userId, threadId, { role: 'model', content: message });
        
        // Defensive check to ensure actions is always an array
        if (!actions || !Array.isArray(actions)) {
          actions = [];
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Actions was not an array, set to empty array');
        }
        
        if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Final return object (text only):', {
          message: message.substring(0, 200) + (message.length > 200 ? '...' : ''),
          actionsCount: actions.length
        });
        
        return {
          message,
          actions
        };
      }
    } catch (error) {
      console.error('🔍 [GEMINI DEBUG] Error in processMessage:', error);
      console.error('🔍 [GEMINI DEBUG] Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Generate a short, human-friendly conversation title using Gemini
   * @param {Array<{role: string, content: string}>} messages
   * @returns {Promise<string>} title
   */
  async generateConversationTitle(messages) {
    if (!this.enabled) {
      // Fallback: use first user message
      const firstUserMsg = messages.find(m => m.role === 'user');
      return firstUserMsg ? (firstUserMsg.content.substring(0, 40) + (firstUserMsg.content.length > 40 ? '...' : '')) : 'New Conversation';
    }
    try {
      // Use up to the first 6 messages for context
      const contextMessages = messages.slice(0, 6).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n');
      const prompt = `Summarize the following conversation in 5 words or less for a human-friendly title. Do not use quotes or punctuation.\n\n${contextMessages}`;
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      let title = response.text ? await response.text() : '';
      // Clean up title: remove quotes, trim, limit length
      title = title.replace(/^["']|["']$/g, '').trim();
      if (title.length > 60) title = title.substring(0, 60) + '...';
      if (!title) {
        // Fallback: use first user message
        const firstUserMsg = messages.find(m => m.role === 'user');
        return firstUserMsg ? (firstUserMsg.content.substring(0, 40) + (firstUserMsg.content.length > 40 ? '...' : '')) : 'New Conversation';
      }
      return title;
    } catch (e) {
      // Fallback: use first user message
      const firstUserMsg = messages.find(m => m.role === 'user');
      return firstUserMsg ? (firstUserMsg.content.substring(0, 40) + (firstUserMsg.content.length > 40 ? '...' : '')) : 'New Conversation';
    }
  }

  /**
   * Generate goal breakdown suggestions using Gemini AI
   * @param {string} goalTitle - The goal title
   * @param {string} goalDescription - Optional goal description
   * @returns {Promise<Object>} breakdown with milestones and steps
   */
  async generateGoalBreakdown(goalTitle, goalDescription = '') {
    if (!this.enabled) {
      return {
        milestones: [
          {
            title: 'Break down your goal into smaller steps',
            steps: [
              { text: 'Start with the very first action you can take' },
              { text: 'Identify what you need to learn or prepare' },
              { text: 'Set a specific deadline for each step' }
            ]
          }
        ]
      };
    }

    try {
      const prompt = `You are an AI assistant helping users break down their goals into manageable milestones and steps. This is especially important for users who may struggle with anxiety, depression, or feeling overwhelmed by large goals.

Goal: "${goalTitle}"
${goalDescription ? `Description: "${goalDescription}"` : ''}

Please create a structured breakdown with 3-5 milestones, each containing 2-4 specific, actionable steps. Consider:

1. **Mental Health Awareness**: Break goals into very small, achievable steps that won't overwhelm someone with anxiety or depression
2. **Progress Focus**: Each step should feel like a win when completed
3. **Flexibility**: Include steps that can be adjusted based on energy levels
4. **Self-Care**: Include steps that acknowledge the user's well-being
5. **Realistic Timeline**: Consider that some days will be harder than others

Respond with ONLY a JSON object in this exact format:
{
  "milestones": [
    {
      "title": "Milestone title (clear, encouraging)",
      "steps": [
        { "text": "Specific, small action step" },
        { "text": "Another specific action step" }
      ]
    }
  ]
}

Make the milestones and steps specific to this goal, encouraging, and achievable even on difficult days.`;

      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text ? await response.text() : '';

      // Try to parse the JSON response
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const breakdown = JSON.parse(jsonMatch[0]);
          
          // Validate the structure
          if (breakdown.milestones && Array.isArray(breakdown.milestones)) {
            // Add order numbers to milestones and steps
            breakdown.milestones = breakdown.milestones.map((milestone, index) => ({
              ...milestone,
              order: index + 1,
              steps: milestone.steps.map((step, stepIndex) => ({
                ...step,
                order: stepIndex + 1
              }))
            }));
            
            return breakdown;
          }
        }
      } catch (parseError) {
        console.error('Failed to parse Gemini response:', parseError);
      }

      // Fallback if parsing fails
      return {
        milestones: [
          {
            title: 'Start Small',
            order: 1,
            steps: [
              { text: 'Identify the very first thing you can do', order: 1 },
              { text: 'Set a specific time to start', order: 2 },
              { text: 'Celebrate completing this first step', order: 3 }
            ]
          },
          {
            title: 'Build Momentum',
            order: 2,
            steps: [
              { text: 'Plan your next small action', order: 1 },
              { text: 'Create a simple checklist', order: 2 },
              { text: 'Track your progress', order: 3 }
            ]
          }
        ]
      };

      } catch (error) {
    throw error;
  }
  }

  /**
   * Map Gemini function call to backend logic and execute.
   */
  async _executeFunctionCall(functionCall, userId, userContext) {
    const { name, args } = functionCall;
    
    if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] _executeFunctionCall - Function name:', name);
    if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] _executeFunctionCall - Function args:', JSON.stringify(args, null, 2));
    if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] _executeFunctionCall - User ID:', userId);
    if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] _executeFunctionCall - User context keys:', Object.keys(userContext));
    
    try {
      let result;
      
      switch (name) {
        case 'create_task':
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Executing create_task');
          result = await tasksController.createTaskFromAI(args, userId, userContext);
          break;
        case 'update_task':
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Executing update_task');
          result = await tasksController.updateTaskFromAI(args, userId, userContext);
          break;
        case 'delete_task':
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Executing delete_task');
          result = await tasksController.deleteTaskFromAI(args, userId, userContext);
          break;
        case 'read_task':
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Executing read_task');
          result = await tasksController.readTaskFromAI(args, userId, userContext);
          break;
        case 'lookup_task':
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Executing lookup_task');
          result = await tasksController.lookupTaskbyTitle(userId, userContext.token);
          break;
        case 'create_goal':
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Executing create_goal');
          result = await goalsController.createGoalFromAI(args, userId, userContext);
          break;
        case 'update_goal':
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Executing update_goal');
          result = await goalsController.updateGoalFromAI(args, userId, userContext);
          break;
        case 'delete_goal':
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Executing delete_goal');
          result = await goalsController.deleteGoalFromAI(args, userId, userContext);
          break;
        case 'lookup_goal':
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Executing lookup_goal');
          result = await goalsController.lookupGoalbyTitle(userId, userContext.token, args);
          break;
        case 'read_goal':
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Executing read_goal');
          // Map search parameter to title for compatibility with getGoalsForUser
          const readGoalArgs = { ...args };
          if (args.search) {
            readGoalArgs.title = args.search;
            delete readGoalArgs.search;
          }
          result = await goalsController.getGoalsForUser(userId, userContext.token, readGoalArgs);
          break;
        case 'get_goal_titles':
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Executing get_goal_titles');
          result = await goalsController.getGoalTitlesForUser(userId, userContext.token, args);
          break;
        case 'create_task_from_next_goal_step':
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Executing create_task_from_next_goal_step');
          result = await goalsController.createTaskFromNextGoalStep(userId, userContext.token, args);
          break;
        case 'create_calendar_event':
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Executing create_calendar_event');
          result = await calendarService.createCalendarEventFromAI(args, userId, userContext);
          break;
        case 'update_calendar_event':
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Executing update_calendar_event');
          result = await calendarService.updateCalendarEventFromAI(args, userId, userContext);
          break;
        case 'delete_calendar_event':
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Executing delete_calendar_event');
          result = await calendarService.deleteCalendarEventFromAI(args, userId, userContext);
          break;
        case 'read_calendar_event':
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Executing read_calendar_event');
          result = await calendarService.readCalendarEventFromAI(args, userId, userContext);
          break;
        case 'lookup_calendar_event':
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Executing lookup_calendar_event');
          // Pass date only if provided by the user; do not default here
          {
            const safeArgs = { ...args };
            result = await calendarService.lookupCalendarEventbyTitle(userId, safeArgs.search, safeArgs.date);
          }
          break;
        default:
          if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Unknown function call:', name);
          result = { error: `Unknown function call: ${name}` };
      }
      
      if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] _executeFunctionCall - Result type:', typeof result);
      if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] _executeFunctionCall - Result:', JSON.stringify(result, null, 2));
      
      return result;
    } catch (err) {
      if (this.DEBUG) console.error('🔍 [GEMINI DEBUG] Error in _executeFunctionCall:', err);
      if (this.DEBUG) console.error('🔍 [GEMINI DEBUG] Error stack:', err.stack);
      return { error: err.message || String(err) };
    }
  }

  /**
   * Recommend a task from a list based on user query (e.g., low energy day)
   */
  async recommendTaskFromList(userRequest, tasks, userId) {
    if (!this.enabled) {
      return { recommendedTask: null, message: "Gemini AI is not enabled." };
    }
    // Format the task list for the prompt
    const taskListText = tasks.map((t, i) => `Task ${i + 1}:\nTitle: ${t.title}\nDescription: ${t.description}\nPriority: ${t.priority}`).join('\n\n');
    const prompt = `You are an AI assistant helping users choose tasks based on their current needs.\n\nUser Request: "${userRequest}"\n\nHere is the user's current task list:\n${taskListText}\n\nBased on the user's request, recommend ONE task from the list that best fits. Respond ONLY with a JSON object in the following format:\n\n{\n  "recommendedTask": {\n    "title": "...",\n    "description": "...",\n    "priority": "..."\n  }\n}`;

    const result = await this.model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    // Try to parse the JSON response
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonResponse = JSON.parse(jsonMatch[0]);
        if (jsonResponse.recommendedTask) {
          return { recommendedTask: jsonResponse.recommendedTask, message: text };
        }
      }
    } catch (e) {
      // Parsing failed
    }
    return { recommendedTask: null, message: text };
  }

  /**
   * Normalize due_date in Gemini JSON actions using DateParser utility
   */
  _normalizeDueDate(action) {
    if (!action.details || !action.details.due_date) return;
    let dueDateStr = action.details.due_date;
    
    // Handle YYYY-MM-DD format directly to avoid timezone issues
    const directMatch = dueDateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (directMatch) {
      const [_, year, month, day] = directMatch;
      const currentYear = new Date().getFullYear();
      
      // If year is in the past, normalize to current year
      if (parseInt(year, 10) < currentYear) {
        const normalized = `${currentYear}-${month}-${day}`;
        action.details.due_date = normalized;
      }
      return;
    }
    
    // Handle ISO timestamp format (YYYY-MM-DDTHH:mm:ss+00:00) to avoid timezone issues
    const timestampMatch = dueDateStr.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (timestampMatch) {
      const [_, year, month, day] = timestampMatch;
      const currentYear = new Date().getFullYear();
      
      // If year is in the past, normalize to current year
      if (parseInt(year, 10) < currentYear) {
        const normalized = `${currentYear}-${month}-${day}`;
        action.details.due_date = normalized;
      } else {
        // Extract just the date part for current/future years
        const normalized = `${year}-${month}-${day}`;
        action.details.due_date = normalized;
      }
      return;
    }
    
    // For other formats, use DateParser
    let parsed = dateParser.parse(dueDateStr);
    if (parsed) {
      // Create date in local timezone to avoid UTC conversion issues
      const parsedDate = new Date(parsed);
      if (parsedDate && !isNaN(parsedDate)) {
        const now = new Date();
        // If year is in the past, or not this year or next, set to this year
        if (parsedDate.getFullYear() < now.getFullYear() || parsedDate.getFullYear() > now.getFullYear() + 1) {
          parsedDate.setFullYear(now.getFullYear());
        }
        // If the date is in the past, move to next year
        if (parsedDate < now) {
          parsedDate.setFullYear(parsedDate.getFullYear() + 1);
        }
        // Format as YYYY-MM-DD using local date components
        const yyyy = parsedDate.getFullYear();
        const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
        const dd = String(parsedDate.getDate()).padStart(2, '0');
        const normalized = `${yyyy}-${mm}-${dd}`;
        action.details.due_date = normalized;
      }
    }
  }

  /**
   * Sanitize messages that are JSON-only code blocks to avoid blank UI in apps.
   * If the block has category "general", return its "message" string as plain text.
   * Leaves schedule/goal/task payloads intact for structured renderers.
   * @param {string} message
   * @returns {string}
   */
  _sanitizeMessageForFrontend(message) {
    try {
      if (typeof message !== 'string') return message;
      const trimmed = message.trim();
      const match = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
      if (!match || !match[1]) return message;
      const obj = JSON.parse(match[1]);
      const category = String(obj?.category || '').toLowerCase();
      if (category === 'general' && typeof obj.message === 'string' && obj.message.trim() !== '') {
        return obj.message.trim();
      }
      return message;
    } catch (_) {
      return message;
    }
  }

  /**
   * Build a short conversational lead-in for READ responses.
   * @param {('task'|'goal'|'calendar_event')} entity
   * @param {number} count
   * @param {object} userContext
   */
  _buildReadLeadIn(entity, count = 0, userContext = {}, filters = {}) {
    const mood = userContext?.mood || '';
    const softPrefix = mood && /tired|low|stressed|anxious/i.test(mood)
      ? "I'll keep it light. "
      : '';

    if (entity === 'calendar_event') {
      if (count === 0) return `${softPrefix}Your calendar looks clear. Want to use the open time for a task or some self‑care?`;
      return `${softPrefix}Here are your upcoming events. After you review them, want me to slot a task into your day?`;
    }
    if (entity === 'goal') {
      return `${softPrefix}I pulled up a goal to focus on. We can pick a quick step from it if you like.`;
    }
    // task
    if (count === 0) {
      const pieces = [];
      const normalize = (s) => (typeof s === 'string' ? s.trim() : '');
      const priority = normalize(filters.priority);
      const category = normalize(filters.category);
      const search = normalize(filters.search);
      const completed = typeof filters.completed === 'boolean' ? filters.completed : undefined;

      if (priority) pieces.push(`${priority}-priority`);
      if (completed !== undefined) pieces.push(completed ? 'completed' : 'pending');

      let subject = pieces.length > 0 ? `${pieces.join(' ')} tasks` : 'tasks';
      if (category) subject += ` in ${category}`;
      if (search) subject += ` matching "${search}"`;

      return `${softPrefix}I couldn’t find any ${subject}. Want me to add one or broaden the search?`;
    }
    if (count === 1) return `${softPrefix}You’ve got one pending task. Does that feel doable today, or should we add something lighter?`;
    return `${softPrefix}I see ${count} pending tasks. Which one do you have the energy for today?`;
  }

  /**
   * Validate the JSON structure matches the expected format
   */
  _validateJsonStructure(json) {
    const requiredFields = ['action_type', 'entity_type', 'details'];
    const validActionTypes = ['create', 'read', 'update', 'delete'];
    const validEntityTypes = ['goal', 'task', 'calendar_event'];
    
    // Check required fields exist
    for (const field of requiredFields) {
      if (!json.hasOwnProperty(field)) {
        return false;
      }
    }
    
    // Check action_type is valid
    if (!validActionTypes.includes(json.action_type)) {
      return false;
    }
    
    // Check entity_type is valid
    if (!validEntityTypes.includes(json.entity_type)) {
      return false;
    }
    
    // Check details is an object
    if (typeof json.details !== 'object' || json.details === null) {
      return false;
    }
    
    // Check details has at least a title
    if (!json.details.title) {
      return false;
    }
    
    return true;
  }

  /**
   * Load conversation history from database for a specific thread
   */
  async _loadHistoryFromDatabase(userId, threadId) {
    try {
      // Return empty array immediately if no threadId
      if (!threadId) {
        return [];
      }
      
      const { conversationController } = await import('../controllers/conversationController.js');
      const messages = await conversationController.getRecentMessages(threadId, userId, 10);
      return messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        content: msg.content
      }));
    } catch (error) {
      if (this.DEBUG) console.log('🔍 [GEMINI DEBUG] Failed to load history from database:', error);
      return [];
    }
  }

  /**
   * Add message to conversation history
   */
  _addToHistory(userId, threadId, message) {
    const historyKey = this._getHistoryKey(userId, threadId);
    const userHistory = this.conversationHistory.get(historyKey) || [];
    userHistory.push(message);
    
    // Keep only last 20 exchanges to prevent memory bloat
    if (userHistory.length > 20) {
      userHistory.splice(0, userHistory.length - 20);
    }
    
    this.conversationHistory.set(historyKey, userHistory);
  }

  /**
   * Clear conversation history for a user
   */
  clearHistory(userId, threadId = null) {
    if (threadId) {
      // Clear specific thread history
      const historyKey = this._getHistoryKey(userId, threadId);
      this.conversationHistory.delete(historyKey);
    } else {
      // Clear all thread histories for the user
      const keysToDelete = [];
      for (const key of this.conversationHistory.keys()) {
        if (key.startsWith(`${userId}:`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.conversationHistory.delete(key));
    }
  }

  /**
   * Get conversation history for a user
   */
  getHistory(userId) {
    return this.conversationHistory.get(userId) || [];
  }

  /**
   * Track AI token usage for analytics
   */
  async _trackTokenUsage(usageMetadata, request, userId) {
    try {
      if (!usageMetadata || typeof usageMetadata !== 'object') {
        return;
      }

      // Extract token counts
      const promptTokenCount = usageMetadata.promptTokenCount || 0;
      const candidatesTokenCount = usageMetadata.candidatesTokenCount || 0;
      const totalTokenCount = usageMetadata.totalTokenCount || 0;

      // Track the token usage event
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
      );

      if (userId) {
        const { error: insertError } = await supabase
          .from('analytics_events')
          .insert({
            user_id: userId,
            event_name: 'ai_tokens_used',
            payload: {
              prompt_tokens: promptTokenCount,
              response_tokens: candidatesTokenCount,
              total_tokens: totalTokenCount,
              model: 'gemini-2.5-flash',
              request_type: this._getRequestType(request),
              timestamp: new Date().toISOString()
            }
          });
        if (insertError) {
          throw insertError;
        }

        if (this.DEBUG) {
          console.log('🔍 [GEMINI DEBUG] Tracked token usage:', {
            userId,
            promptTokens: promptTokenCount,
            responseTokens: candidatesTokenCount,
            totalTokens: totalTokenCount
          });
        }
      }    } catch (error) {
      if (this.DEBUG) {
        console.error('🔍 [GEMINI DEBUG] Failed to track token usage:', error);
      }
    }
  }

  /**
   * Get current user ID from conversation history (simple implementation)
   */
  _getCurrentUserIdFromHistory() {
    // This is a simplified approach - in a real implementation,
    // we'd want to track the current user context more explicitly
    // For now, return null and let the calling code handle user tracking
    return null;
  }

  /**
   * Determine the type of request for analytics
   */
  _getRequestType(request) {
    try {
      if (request.contents && Array.isArray(request.contents)) {
        const lastContent = request.contents[request.contents.length - 1];
        if (lastContent.parts && Array.isArray(lastContent.parts)) {
          const lastPart = lastContent.parts[lastContent.parts.length - 1];
          if (lastPart && lastPart.text) {
            const text = lastPart.text.toLowerCase();
            if (text.includes('brain dump') || text.includes('extract') || text.includes('parse')) {
              return 'brain_dump_processing';
            } else if (text.includes('function') || text.includes('tool')) {
              return 'function_calling';
            } else if (text.includes('title') || text.includes('summarize')) {
              return 'title_generation';
            } else {
              return 'general_chat';
            }
          }
        }
      }
      return 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Filter harmful content from user messages (SHORT-TERM FIX)
   * Note: This is a narrow backup filter. Primary safety is handled by Gemini's native
   * safetySettings (configured in constructor) and response safety rating checks (in processMessage).
   * 
   * @param {string} message - The user message to filter
   * @returns {Object} - { content: string, blocked: boolean, pattern?: string }
   */
  _filterHarmfulContent(message) {
    if (!message || typeof message !== 'string') {
      return { content: message, blocked: false };
    }

    const lowerMessage = message.toLowerCase();
    
    // SHORT-TERM FIX: Narrowed patterns to reduce false positives
    // Removed ambiguous single words (kill, harm, drug, hack, explicit, offensive, etc.)
    // Changed patterns to target unambiguous phrases or require multiple indicators/context
    const harmfulPatterns = [
      // Direct threats with verbs + targets (strict word boundaries, exclude productivity contexts)
      { pattern: /\b(going to kill|will kill|gonna kill|i'll kill)\s+(you|him|her|them|myself)\b/, name: 'direct_threat' },
      { pattern: /\b(plan to kill|want to kill)\s+(you|him|her|them|myself)\b/, name: 'direct_threat' },
      { pattern: /\b(commit suicide|end my life|kill myself)\b/, name: 'self_harm_intent' },
      
      // Explicit slurs (examples - add specific slurs as needed with strict boundaries)
      { pattern: /\b(n[i1]gg[ae]r|f[a@]gg[o0]t|sp[i1]c|ch[i1]nk|k[i1]ke)\b/, name: 'explicit_slur' },
      
      // Pornographic phrases (multi-word patterns)
      { pattern: /\b(watch porn|pornographic (content|material|video)|explicit sex)\b/, name: 'pornographic_phrase' },
      
      // Illegal activity with intent indicators (requires context)
      { pattern: /\b(how to (make|build|create|construct) (bomb|explosive|weapon|dynamite|grenade))\b/, name: 'illegal_weapon_instruction' },
      { pattern: /\b(sell drugs|buy drugs|drug dealer)\b/, name: 'drug_transaction' },
      
      // Coordinated spam patterns (more specific to avoid productivity contexts)
      { pattern: /\b(click here now|limited time offer|free money|you've won|act now and get)\b/, name: 'spam_phrase' },
    ];

    // Check for harmful patterns
    for (const { pattern, name } of harmfulPatterns) {
      if (pattern.test(lowerMessage)) {
        logger.warn('Blocked potentially harmful content:', { 
          patternName: name,
          messageLength: message.length 
        });
        return { content: message, blocked: true, pattern: name };
      }
    }

    // Check for excessive repetition (potential spam)
    const words = lowerMessage.split(/\s+/);
    const excludedWords = ['task', 'goal', 'event', 'schedule', 'meet', 'meeting', 'plan', 'planning', 'need', 'want', 'help', 'create', 'update', 'delete', 'set', 'get', 'find', 'work', 'project', 'deadline', 'time', 'today', 'tomorrow', 'week', 'month', 'year', 'perfect', 'great', 'good', 'excellent', 'amazing', 'wonderful', 'fantastic'];
    const wordCounts = {};
    for (const word of words) {
      if (word.length > 3 && !excludedWords.includes(word)) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    }

    // Block if any word appears more than 15 times or comprises >40% of the message (more lenient)
    // Only apply ratio check for messages with at least 5 words to avoid blocking single words
    for (const [word, count] of Object.entries(wordCounts)) {
      const ratio = count / words.length;
      if (count > 15 || (words.length >= 5 && ratio > 0.4)) {
        logger.warn('Blocked repetitive content:', { word, count, messageLength: message.length });
        return { content: message, blocked: true, pattern: 'excessive_repetition' };
      }
    }

    return { content: message, blocked: false };
  }
}

export default GeminiService; 