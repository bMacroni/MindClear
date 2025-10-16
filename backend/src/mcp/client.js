import { createMCPServer } from './server.js';
import { JSONRPCClient } from 'json-rpc-2.0';

// In-process client that dispatches directly to server.handle
const server = createMCPServer();

const client = new JSONRPCClient(async (jsonRPCRequest) => {
  try {
    const response = await server.receive(jsonRPCRequest);
    if (response) {
      client.receive(response);
    }
  } catch (error) {
    // Log the error for diagnostics
    console.error('MCP server.receive error:', error);
    
    // Don't send error responses for notifications (requests without id)
    if (jsonRPCRequest.id === undefined) {
      return;
    }
    
    // Construct and send a proper JSON-RPC error response
    const errorResponse = {
      jsonrpc: "2.0",
      id: jsonRPCRequest.id,
      error: {
        code: -32603, // Internal error
        message: "Internal error",
        data: error.message || "Unknown error occurred"
      }
    };
    
    client.receive(errorResponse);
  }});

export async function executeTool(method, params) {
  return client.request(method, params);
}



