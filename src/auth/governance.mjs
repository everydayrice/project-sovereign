import { SovereignError } from '../platform/errors.mjs';

// Authentication establishes identity; governance independently authorizes changes.
export function governancePermission(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return null;
  const path = new URL(request.url).pathname;
  if (path.startsWith('/v1/command/service-credentials')) return 'command.service_credentials.manage';
  if (path.startsWith('/v1/command/')) return 'command.manage';
  if (path.startsWith('/v1/extensions/')) return 'extensions.manage';
  if (/^\/v1\/recovery\/[^/]+\/complete$/.test(path)) return 'recovery.manage';
  if (/^\/v1\/intelligence\/canonical\/change-sets\/[^/]+\/(approve|approve-candidate|reject|revert)$/.test(path)) return 'intelligence.canonical.approve';
  return null;
}

export async function authorizeGovernance({ request, persistence, tenantId, principalId }) {
  const permission = governancePermission(request);
  if (!permission) return;
  const permissions = await persistence.principalPermissions({ tenantId, principalId });
  if (!permissions.includes('*') && !permissions.includes(permission)) {
    throw new SovereignError('command_permission_denied', 'Your role does not allow this governance action.', { status: 403, details: { required_permission: permission } });
  }
}
