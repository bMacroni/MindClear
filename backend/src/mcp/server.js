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
      // Rethrow so json-rpc-2.0 can populate the JSON-RPC error field
      if (e instanceof Error) {
        throw e;
      }
      throw new Error('Tool execution failed');
    }
  };

  // goal.*

  const validateArgs = (args, requiredFields) => {
    if (!args || typeof args !== 'object') {
      throw new Error('Missing request args');
    }
    for (const field of requiredFields) {
      if (args[field] === undefined) {
        throw new Error(`Missing required parameter: ${field}`);
      }
    }
  };

  const getPayload = (args) => {
    const payload = args?.data ?? args?.payload;
    if (!payload || typeof payload !== 'object') {
      throw new Error('Missing required parameter: data (or payload)');
    }
    return payload;
  };

  // goal.*
  server.addMethod('goal.create', ({ args }) => {
    validateArgs(args, ['data', 'userId']);
    return safeCall(goalsController.createGoalFromAI, args.data, args.userId, args.userContext);
  });
  server.addMethod('goal.update', ({ args }) => {
    validateArgs(args, ['userId']);
    const payload = getPayload(args);
    if (payload.id === undefined) {
      throw new Error('Missing required parameter: data.id');
    }
    return safeCall(goalsController.updateGoalFromAI, payload, args.userId, args.userContext);
  });
  server.addMethod('goal.delete', ({ args }) => {
    validateArgs(args, ['userId']);
    const payload = getPayload(args);
    if (payload.id === undefined) {
      throw new Error('Missing required parameter: data.id');
    }
    return safeCall(goalsController.deleteGoalFromAI, payload, args.userId, args.userContext);
  });
  server.addMethod('goal.read',   ({ args }) => {
    validateArgs(args, ['userId']);
    return safeCall(goalsController.getGoalsForUser, args.userId, args.userContext?.token, args.filters || {});
  });
  return server;
}



