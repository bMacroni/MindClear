import { createMCPServer } from './server.js';
import { JSONRPCClient } from 'json-rpc-2.0';

// In-process client that dispatches directly to server.handle
const server = createMCPServer();

const client = new JSONRPCClient(async (jsonRPCRequest) => {
  const response = await server.receive(jsonRPCRequest);
  if (response) {
    client.receive(response);
  }
});

export async function executeTool(method, params) {
  return client.request(method, params);
}



