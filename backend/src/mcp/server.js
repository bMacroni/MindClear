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

  const validateArgs = (args, requiredFields) => {
    for (const field of requiredFields) {
      if (args[field] === undefined) {
        throw new Error(`Missing required parameter: ${field}`);
      }
    }
  };

  // goal.*
  server.addMethod('goal.create', ({ args }) => {
    validateArgs(args, ['data', 'userId']);
    return safeCall(goalsController.createGoalFromAI, args.data, args.userId, args.userContext);
  });
  server.addMethod('goal.update', ({ args }) => safeCall(goalsController.updateGoalFromAI, args.data || args, args.userId, args.userContext));
  server.addMethod('goal.delete', ({ args }) => safeCall(goalsController.deleteGoalFromAI, args.data || args, args.userId, args.userContext));
  server.addMethod('goal.read',   ({ args }) => safeCall(goalsController.getGoalsForUser, args.userId, args.userContext?.token, args.filters || {}));
  return server;
}



