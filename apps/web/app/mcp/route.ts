import { buildMcpServer } from "@agencyos/modules/mcp/server";
import { ctxFromToken } from "@agencyos/modules/mcp/tokens";
import { clientIp, RATE_RULES, rateLimitResponse } from "@agencyos/modules/shared/rate-limit";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const unauthorized = () =>
  new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Token inválido, vencido o revocado." }, id: null }), {
    status: 401,
    headers: { "content-type": "application/json", "www-authenticate": 'Bearer realm="agencyos"' },
  });

/** Servidor MCP (Streamable HTTP, sin estado). Autenticación: Authorization: Bearer ag_… */
async function handle(req: Request) {
  const auth = req.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  // Por token (hasheado) o, sin token, por IP: frena tanto a un cliente desbocado como a la fuerza bruta de tokens.
  const limited = await rateLimitResponse(RATE_RULES.mcp, bearer ? `t:${bearer}` : `ip:${clientIp(req.headers)}`, { json: true });
  if (limited) return limited;
  const ctx = await ctxFromToken(bearer);
  if (!ctx) return unauthorized();
  const server = buildMcpServer(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    void server.close();
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
