// Minimal MCP server scaffold (in-process). Intentionally not exported publicly.
import { JSONRPCServer } from 'json-rpc-2.0';
import * as tasksController from '../controllers/tasksController.js';
import * as goalsController from '../controllers/goalsController.js';
import * as calendarService from '../utils/calendarService.js';
import logger from '../utils/logger.js';

export function createMCPServer() {
  const server = new JSONRPCServer();

  const safeCall = async (fn, ...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      logger.error('MCP tool error', e);
      return { error: e?.message || 'Tool execution failed' };
    }
  };

  // goal.*
  server.addMethod('goal.create', ({ args }) => safeCall(goalsController.createGoalFromAI, args.data || args, args.userId, args.userContext));
  server.addMethod('goal.update', ({ args }) => safeCall(goalsController.updateGoalFromAI, args.data || args, args.userId, args.userContext));
  server.addMethod('goal.delete', ({ args }) => safeCall(goalsController.deleteGoalFromAI, args.data || args, args.userId, args.userContext));
  server.addMethod('goal.read',   ({ args }) => safeCall(goalsController.getGoalsForUser, args.userId, args.userContext?.token, args.filters || {}));

  // task.*
  server.addMethod('task.create', ({ args }) => safeCall(tasksController.createTaskFromAI, args.data || args, args.userId, args.userContext));
  server.addMethod('task.update', ({ args }) => safeCall(tasksController.updateTaskFromAI, args.data || args, args.userId, args.userContext));
  server.addMethod('task.delete', ({ args }) => safeCall(tasksController.deleteTaskFromAI, args.data || args, args.userId, args.userContext));
  server.addMethod('task.read',   ({ args }) => safeCall(tasksController.readTaskFromAI, args.filters || {}, args.userId, args.userContext));

  // calendar_event.*
  server.addMethod('calendar_event.create', ({ args }) => safeCall(calendarService.createCalendarEventFromAI, args.data || args, args.userId, args.userContext));
  server.addMethod('calendar_event.update', ({ args }) => safeCall(calendarService.updateCalendarEventFromAI, args.data || args, args.userId, args.userContext));
  server.addMethod('calendar_event.delete', ({ args }) => safeCall(calendarService.deleteCalendarEventFromAI, args.data || args, args.userId, args.userContext));
  server.addMethod('calendar_event.read',   ({ args }) => safeCall(calendarService.readCalendarEventFromAI, args.filters || {}, args.userId, args.userContext));

  return server;
}



