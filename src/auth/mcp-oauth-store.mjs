import { neon } from '@neondatabase/serverless';

export function createMcpOAuthStore(databaseUrl, { sql = neon(databaseUrl) } = {}) {
  return {
    async register(client) {
      await sql.query('INSERT INTO command.oauth_clients(client_id,client_name,redirect_uris) VALUES($1,$2,$3::jsonb)', [client.client_id, client.client_name, JSON.stringify(client.redirect_uris)]);
      return client;
    },
    async client(id) {
      return (await sql.query('SELECT client_id,client_name,redirect_uris FROM command.oauth_clients WHERE client_id=$1', [id]))[0];
    },
    async authorize(g) {
      // The Owner/credential-manager check and all inserts share a single transaction.
      const rows = await sql.query(`WITH owner AS (
        SELECT p.principal_id FROM command.principals p
        JOIN command.tenants t ON t.tenant_id=p.tenant_id
        WHERE p.tenant_id=$1 AND p.principal_id=$2 AND p.kind='human' AND p.state='active' AND t.state='active'
        AND EXISTS (SELECT 1 FROM command.principal_role_bindings b JOIN command.roles r ON r.role_id=b.role_id AND r.tenant_id=b.tenant_id
          WHERE b.tenant_id=p.tenant_id AND b.principal_id=p.principal_id
          AND (r.permission_set ? '*' OR r.permission_set ? 'command.service_credentials.manage'))
      ), principal AS (
        INSERT INTO command.principals(principal_id,tenant_id,kind,display_name,state,metadata,revision,created_at,updated_at)
        SELECT $3,$1,'service',$4,'active',$5::jsonb,1,now(),now() FROM owner RETURNING principal_id
      ), credential AS (
        INSERT INTO command.service_credentials(service_credential_id,tenant_id,principal_id,display_name,token_prefix,token_hash,scopes,state,expires_at,created_by_principal_id)
        SELECT $6,$1,principal_id,$4,'oauth_pending',$7,$8::jsonb,'active',now(),$2 FROM principal RETURNING service_credential_id
      ) INSERT INTO command.oauth_grants(grant_id,client_id,tenant_id,service_credential_id,redirect_uri,resource,code_challenge,code_hash,code_expires_at)
      SELECT $9,$10,$1,service_credential_id,$11,$12,$13,$14,now()+interval '5 minutes' FROM credential RETURNING grant_id`,
      [g.tenantId,g.principalId,g.servicePrincipalId,g.displayName,JSON.stringify({oauth_resource:g.resource,oauth_client_id:g.clientId}),g.credentialId,g.pendingHash,JSON.stringify(g.scopes),g.grantId,g.clientId,g.redirectUri,g.resource,g.challenge,g.codeHash]);
      return Boolean(rows.length);
    },
    async exchange(g) {
      // Conditional UPDATE serializes concurrent redemptions; only one request wins.
      const isCode = g.grantType === 'authorization_code';
      if (!isCode) {
        // Reuse of an already rotated token revokes the connection, including its
        // current access token. Retain history only inside protected OAuth storage.
        const replay = await sql.query(`UPDATE command.service_credentials c SET state='revoked',revoked_at=now(),updated_at=now()
          FROM command.oauth_grants g WHERE c.service_credential_id=g.service_credential_id
          AND g.client_id=$1 AND g.resource=$2 AND g.used_refresh_hashes ? $3 AND c.state='active'
          RETURNING c.service_credential_id`, [g.clientId,g.resource,g.presentedHash]);
        if (replay.length) return null;
      }
      const predicate = isCode
        ? 'g.code_hash=$3 AND g.code_challenge=$4 AND g.redirect_uri=$5 AND g.consumed_at IS NULL AND g.code_expires_at>now()'
        : 'g.refresh_hash=$3 AND g.consumed_at IS NOT NULL AND g.refresh_expires_at>now()';
      const rows = await sql.query(`WITH redeemed AS (
        UPDATE command.oauth_grants g SET consumed_at=COALESCE(g.consumed_at,now()),
          used_refresh_hashes=CASE WHEN g.refresh_hash IS NULL THEN g.used_refresh_hashes ELSE g.used_refresh_hashes || to_jsonb(g.refresh_hash) END,
          refresh_hash=$6,
          refresh_expires_at=COALESCE(g.refresh_expires_at,now()+interval '30 days')
        FROM command.service_credentials c,command.principals p,command.principals owner,command.tenants t
        WHERE g.client_id=$1 AND g.resource=$2 AND ${predicate}
          AND c.service_credential_id=g.service_credential_id AND c.tenant_id=g.tenant_id AND c.state='active'
          AND p.principal_id=c.principal_id AND p.tenant_id=g.tenant_id AND p.state='active'
          AND owner.principal_id=c.created_by_principal_id AND owner.tenant_id=g.tenant_id AND owner.state='active'
          AND t.tenant_id=g.tenant_id AND t.state='active'
          AND EXISTS (SELECT 1 FROM command.principal_role_bindings b JOIN command.roles r ON r.role_id=b.role_id AND r.tenant_id=b.tenant_id
            WHERE b.tenant_id=g.tenant_id AND b.principal_id=owner.principal_id
              AND (r.permission_set ? '*' OR r.permission_set ? 'command.service_credentials.manage'))
        RETURNING g.service_credential_id
      ) UPDATE command.service_credentials c SET token_hash=$7,token_prefix=$8,expires_at=now()+interval '1 hour',updated_at=now()
        FROM redeemed r WHERE c.service_credential_id=r.service_credential_id AND $4::text IS NOT NULL AND $5::text IS NOT NULL RETURNING c.scopes`,
      [g.clientId,g.resource,g.presentedHash,g.challenge ?? '',g.redirectUri ?? '',g.refreshHash,g.accessHash,g.accessPrefix]);
      return rows[0];
    }
  };
}
