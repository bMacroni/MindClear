// Minimal MCP server scaffold (in-process). Intentionally not exported publicly.
import { JSONRPCServer } from 'json-rpc-2.0';
import * as goalsController from '../controllers/goalsController.js';
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

  const validateArgs = (params, requiredFields) => {
    // Normalize params to handle both {args} and direct params
    const args = params?.args ?? params;
    if (!args || typeof args !== 'object') {
      throw new Error('Missing request args');
    }
    for (const field of requiredFields) {
      if (args[field] === undefined) {
        throw new Error(`Missing required parameter: ${field}`);
      }
    }
    return args;
  };

  const getPayload = (params) => {
    // Normalize params to handle both {args} and direct params
    const args = params?.args ?? params;
    const payload = args?.data ?? args?.payload;
    if (!payload || typeof payload !== 'object') {
      throw new Error('Missing required parameter: data (or payload)');
    }
    return payload;
  };

  // goal.*
  server.addMethod('goal.create', (params) => {
    const args = validateArgs(params, ['data', 'userId']);
    return safeCall(goalsController.createGoalFromAI, args.data, args.userId, args.userContext);
  });
  server.addMethod('goal.update', (params) => {
    const args = validateArgs(params, ['userId']);
    const payload = getPayload(params);
    if (payload.id === undefined) {
      throw new Error('Missing required parameter: data.id');
    }
    return safeCall(goalsController.updateGoalFromAI, payload, args.userId, args.userContext);
  });
  server.addMethod('goal.delete', (params) => {
    const args = validateArgs(params, ['userId']);
    const payload = getPayload(params);
    if (payload.id === undefined) {
      throw new Error('Missing required parameter: data.id');
    }
    return safeCall(goalsController.deleteGoalFromAI, payload, args.userId, args.userContext);
  });
  server.addMethod('goal.read', (params) => {
    const args = validateArgs(params, ['userId']);
    return safeCall(goalsController.getGoalsForUser, args.userId, args.userContext?.token, args.filters || {});
  });
  return server;
}



