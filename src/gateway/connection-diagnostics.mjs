const routes = new Set([
  '/mcp', '/oauth/authorize', '/oauth/token', '/oauth/register', '/oauth/cancel',
  '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp'
]);

// Never record request bodies, headers, query parameters, or response content.
export async function observeConnection(request, operation, report = entry => console.info(entry)) {
  const path = new URL(request.url).pathname;
  const route = routes.has(path) ? path : 'other';
  const method = ['GET', 'POST', 'HEAD', 'OPTIONS', 'DELETE'].includes(request.method) ? request.method : 'other';
  const response = await operation();
  report({ event: 'sovereign_connection', route, method, status: response.status });
  return response;
}
