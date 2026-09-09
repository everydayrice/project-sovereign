import { SERVICE_SCOPES } from './service-credentials.mjs';

// Extension administration is intentionally excluded from ordinary AI connections.
export const MCP_OAUTH_SCOPES = SERVICE_SCOPES.filter(scope => scope !== 'extensions:use');
const cookieName = '__Host-sovereign-oauth-csrf';

export function createMcpOAuth({ store, authenticate, resolveBinding }) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      const issuer = url.origin;
      const resource = `${issuer}/mcp`;
      try {
        if (request.method === 'GET' && ['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'].includes(url.pathname)) {
          return json({ resource, authorization_servers: [issuer], scopes_supported: MCP_OAUTH_SCOPES, bearer_methods_supported: ['header'] });
        }
        if (request.method === 'GET' && url.pathname === '/.well-known/oauth-authorization-server') {
          return json({ issuer, authorization_endpoint: `${issuer}/oauth/authorize`, token_endpoint: `${issuer}/oauth/token`,
            registration_endpoint: `${issuer}/oauth/register`, response_types_supported: ['code'],
            grant_types_supported: ['authorization_code','refresh_token'], token_endpoint_auth_methods_supported: ['none'],
            code_challenge_methods_supported: ['S256'], scopes_supported: MCP_OAUTH_SCOPES,
            authorization_response_iss_parameter_supported: true });
        }
        if (url.pathname === '/oauth/register' && request.method === 'POST') {
          const input = await request.json();
          if (input.token_endpoint_auth_method && input.token_endpoint_auth_method !== 'none') fail('invalid_client_metadata','Only public clients with PKCE are supported.');
          const uris = input.redirect_uris;
          if (!Array.isArray(uris) || !uris.length || uris.length > 10 || !uris.every(validRedirect)) fail('invalid_redirect_uri','Register 1–10 exact HTTPS callback URLs.');
          if (input.grant_types && (!Array.isArray(input.grant_types) || input.grant_types.some(g => !['authorization_code','refresh_token'].includes(g)))) fail('invalid_client_metadata','Unsupported grant type.');
          if (input.response_types && (!Array.isArray(input.response_types) || input.response_types.some(t => t !== 'code'))) fail('invalid_client_metadata','Only code responses are supported.');
          const client = await store.register({ client_id: `soc_${random()}`, client_name: String(input.client_name || 'AI client').slice(0,100), redirect_uris: uris });
          return json({ ...client, client_id_issued_at: Math.floor(Date.now()/1000), token_endpoint_auth_method:'none', grant_types:['authorization_code','refresh_token'], response_types:['code'] },201);
        }
        if (url.pathname === '/oauth/authorize' && ['GET','POST'].includes(request.method)) {
          const params = request.method === 'POST' ? new URLSearchParams(await request.text()) : url.searchParams;
          const client = await store.client(params.get('client_id'));
          const redirectUri = params.get('redirect_uri');
          if (!client || !client.redirect_uris.includes(redirectUri)) fail('invalid_request','Client or callback URL is not registered.');
          if (params.get('response_type') !== 'code') fail('unsupported_response_type','Use the authorization-code flow.');
          if (params.get('resource') !== resource) fail('invalid_target','The resource must be this Sovereign MCP endpoint.');
          const challenge = params.get('code_challenge');
          if (params.get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(challenge || '')) fail('invalid_request','S256 PKCE is required.');
          const scopes = [...new Set((params.get('scope') || MCP_OAUTH_SCOPES.join(' ')).split(' ').filter(Boolean))];
          if (!scopes.length || scopes.some(s => !MCP_OAUTH_SCOPES.includes(s))) fail('invalid_scope','One or more requested scopes are unsupported.');
          let identity;
          try { identity = await authenticate(request); }
          catch (error) {
            if (error.status !== 401 || request.method !== 'GET') throw error;
            return Response.redirect(`${issuer}/login?return_to=${encodeURIComponent(url.pathname+url.search)}`,302);
          }
          const binding = await resolveBinding(identity.authSubject);
          if (!binding) fail('access_denied','Create your Sovereign workspace before connecting an AI client.',403);
          if (request.method === 'GET') {
            const csrf = random();
            return consentPage({ client, params, csrf, scopes, email: identity.user?.email || 'Signed-in user', issuer });
          }
          const cookie = (request.headers.get('cookie') || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);
          if (request.headers.get('origin') !== issuer || !cookie || cookie !== params.get('csrf')) fail('access_denied','Consent expired. Start the connection again.',403);
          const redirect = new URL(redirectUri);
          redirect.searchParams.set('iss',issuer);
          if (params.has('state')) redirect.searchParams.set('state',params.get('state'));
          if (params.get('decision') !== 'allow') redirect.searchParams.set('error','access_denied');
          else {
            const code = random();
            const accepted = await store.authorize({ tenantId:binding.tenant_id,principalId:binding.principal_id,
              servicePrincipalId:`prn_${crypto.randomUUID()}`,credentialId:`svc_${crypto.randomUUID()}`,grantId:`oag_${crypto.randomUUID()}`,
              displayName:`${client.client_name} OAuth`,clientId:client.client_id,redirectUri,resource,challenge,scopes,
              pendingHash:await hash(random()),codeHash:await hash(code) });
            if (!accepted) fail('access_denied','An active owner or credential manager must approve this connection.',403);
            redirect.searchParams.set('code',code);
          }
          return new Response(null,{status:303,headers:{location:redirect.toString(),'cache-control':'no-store','set-cookie':`${cookieName}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`}});
        }
        if (url.pathname === '/oauth/token' && request.method === 'POST') {
          if (!(request.headers.get('content-type') || '').includes('application/x-www-form-urlencoded')) fail('invalid_request','Use form-encoded token requests.');
          const p = new URLSearchParams(await request.text());
          const grantType = p.get('grant_type');
          if (!['authorization_code','refresh_token'].includes(grantType)) fail('unsupported_grant_type','Unsupported grant type.');
          if (p.has('client_secret') || p.has('client_assertion')) fail('invalid_client','This client uses public-client PKCE authentication.');
          const client = await store.client(p.get('client_id'));
          if (!client) fail('invalid_client','Unknown OAuth client.');
          if (p.get('resource') !== resource) fail('invalid_target','Invalid MCP resource.');
          let challenge = '';
          if (grantType === 'authorization_code') {
            const verifier = p.get('code_verifier') || '';
            if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) fail('invalid_grant','Invalid PKCE verifier.');
            if (!client.redirect_uris.includes(p.get('redirect_uri'))) fail('invalid_grant','Callback mismatch.');
            challenge = await sha256Base64(verifier);
          }
          const presented = p.get(grantType === 'authorization_code' ? 'code' : 'refresh_token');
          if (!presented || presented.length > 256) fail('invalid_grant','Missing or invalid grant.');
          if (p.has('scope')) fail('invalid_scope','Omit scope during token exchange to retain the permissions explicitly approved by the user.');
          // OAuth tokens have a distinct prefix and are accepted only at their stored resource.
          const access = `svk_oauth_${random()}`;
          const refresh = random();
          const result = await store.exchange({grantType,clientId:client.client_id,resource,challenge,redirectUri:p.get('redirect_uri') || '',
            presentedHash:await hash(presented),refreshHash:await hash(refresh),accessHash:await hash(access),accessPrefix:access.slice(0,18)});
          if (!result) fail('invalid_grant','Grant is expired, revoked, already used, or does not match this client.');
          return json({access_token:access,token_type:'Bearer',expires_in:3600,refresh_token:refresh,scope:result.scopes.join(' ')});
        }
        return json({error:'invalid_request',error_description:'Method not allowed.'},405);
      } catch (error) {
        return json({error:error.oauthCode || (error.status===401?'access_denied':'server_error'),error_description:error.oauthCode?error.message:'Unable to complete Sovereign authorization.'},error.status || 500);
      }
    }
  };
}

function fail(code,message,status=400) { throw Object.assign(new Error(message),{oauthCode:code,status}); }
function json(data,status=200) { return Response.json(data,{status,headers:{'cache-control':'no-store','pragma':'no-cache'}}); }
function validRedirect(value) { try { const u=new URL(value); return typeof value==='string' && value.length<2048 && u.protocol==='https:' && !u.hash && !u.username && !u.password; } catch { return false; } }
function base64(bytes) { return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''); }
function random() { return base64(crypto.getRandomValues(new Uint8Array(32))); }
async function sha256Base64(value) { return base64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))); }
async function hash(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join(''); }
function escape(value) { return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function consentPage({client,params,csrf,scopes,email}) {
  const fields = ['client_id','redirect_uri','response_type','resource','code_challenge','code_challenge_method','state'];
  const hidden = fields.filter(k=>params.has(k)).map(k=>`<input type="hidden" name="${k}" value="${escape(params.get(k))}">`).join('');
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect to Sovereign</title>
  <style>body{font:16px/1.5 system-ui;margin:0;background:#f7f7f5;color:#111}main{max-width:580px;margin:8vh auto;padding:28px;background:white;border:1px solid #ddd;border-radius:16px}button{font:inherit;padding:12px 20px;margin:8px;cursor:pointer}li{overflow-wrap:anywhere}small{overflow-wrap:anywhere}</style>
  <main><p>SOVEREIGN</p><h1>Connect ${escape(client.client_name)}?</h1><p>Signed in as ${escape(email)}.</p>
  <p>This client requests access to your workspace:</p><ul>${scopes.map(s=>`<li>${escape(s)}</li>`).join('')}</ul>
  <p>Canonical changes remain subject to human approval. You can revoke this connection in Command → Machine access.</p>
  <small>Return to: ${escape(new URL(params.get('redirect_uri')).origin)}. Client name is supplied by the connecting application.</small>
  <form method="post" action="/oauth/authorize">${hidden}<input type="hidden" name="scope" value="${escape(scopes.join(' '))}"><input type="hidden" name="csrf" value="${csrf}"><button name="decision" value="deny">Cancel</button><button name="decision" value="allow">Allow connection</button></form></main></html>`,
  {headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'set-cookie':`${cookieName}=${csrf}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`}});
}
