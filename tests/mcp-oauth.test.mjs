import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createMcpOAuth } from '../src/auth/mcp-oauth.mjs';
import { createServiceAuthenticator } from '../src/auth/service-credentials.mjs';
const origin='https://sovereign.test';
const redirect='https://chatgpt.com/connector_platform_oauth_redirect';
const digest=v=>createHash('sha256').update(v).digest('hex');

function fixture() {
  const clients=new Map();const grants=[];
  const store={
    async register(c){clients.set(c.client_id,c);return c;},
    async client(id){return clients.get(id);},
    async authorize(g){grants.push(g);return true;},
    async exchange(g){
      const found=grants.find(a=>a.clientId===g.clientId&&a.resource===g.resource&&
        (g.grantType==='authorization_code'?a.codeHash===g.presentedHash&&!a.used&&a.challenge===g.challenge&&a.redirectUri===g.redirectUri:a.refreshHash===g.presentedHash));
      if(!found)return null;found.used=true;found.refreshHash=g.refreshHash;return {scopes:found.scopes};
    }
  };
  const server=createMcpOAuth({store,authenticate:async req=>{
    if(!req.headers.get('cookie')?.includes('session=valid'))throw Object.assign(new Error('Sign in'),{status:401});
    return {authSubject:'owner',user:{email:'owner@example.test'}};
  },resolveBinding:async()=>({tenant_id:'ten_test',principal_id:'prn_owner'})});
  const post=(path,body,headers={})=>server.fetch(new Request(origin+path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...headers},body:new URLSearchParams(body)}));
  return {store,server,grants,post};
}

async function setup(ctx) {
  const response=await ctx.server.fetch(new Request(origin+'/oauth/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'ChatGPT',redirect_uris:[redirect],token_endpoint_auth_method:'none'})}));
  assert.equal(response.status,201);
  const client=await response.json();const verifier='v'.repeat(43);
  const params={client_id:client.client_id,redirect_uri:redirect,response_type:'code',resource:origin+'/mcp',code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),state:'state-one',scope:'continuity:read continuity:write'};
  return {params,verifier};
}

test('OAuth discovery, explicit consent, PKCE, code replay and refresh rotation',async()=>{
  const ctx=fixture();const {params,verifier}=await setup(ctx);
  const metadata=await (await ctx.server.fetch(new Request(origin+'/.well-known/oauth-authorization-server'))).json();
  assert.deepEqual(metadata.code_challenge_methods_supported,['S256']);
  const authorization=origin+'/oauth/authorize?'+new URLSearchParams(params);
  assert.match((await ctx.server.fetch(new Request(authorization))).headers.get('location'),/\/login\?return_to=/);
  const consent=await ctx.server.fetch(new Request(authorization,{headers:{cookie:'session=valid'}}));
  assert.equal(consent.status,200);
  assert.match(await consent.text(),/Allow connection/);
  const csrfCookie=consent.headers.get('set-cookie').split(';')[0];
  const csrf=csrfCookie.split('=')[1];
  const headers={origin,cookie:'session=valid; '+csrfCookie};
  assert.equal((await ctx.post('/oauth/authorize',{...params,decision:'allow',csrf:'bad'},headers)).status,403);
  assert.equal(ctx.grants.length,0);
  const approved=await ctx.post('/oauth/authorize',{...params,decision:'allow',csrf},headers);
  const callback=new URL(approved.headers.get('location'));
  assert.equal(callback.searchParams.get('state'),'state-one');assert.equal(callback.searchParams.get('iss'),origin);
  const exchange={grant_type:'authorization_code',client_id:params.client_id,resource:params.resource,redirect_uri:redirect,code:callback.searchParams.get('code'),code_verifier:verifier};
  assert.equal((await ctx.post('/oauth/token',{...exchange,code_verifier:'x'.repeat(43)})).status,400);
  const tokens=await (await ctx.post('/oauth/token',exchange)).json();
  assert.match(tokens.access_token,/^svk_oauth_/);assert.equal(tokens.expires_in,3600);
  assert.equal(ctx.grants[0].codeHash,digest(exchange.code));
  assert.equal((await ctx.post('/oauth/token',exchange)).status,400);
  const refresh={grant_type:'refresh_token',client_id:params.client_id,resource:params.resource,refresh_token:tokens.refresh_token};
  assert.equal((await ctx.post('/oauth/token',{...refresh,resource:'https://wrong.test/mcp'})).status,400);
  assert.equal((await ctx.post('/oauth/token',refresh)).status,200);
  assert.equal((await ctx.post('/oauth/token',refresh)).status,400);
});

test('OAuth rejects callback substitution, unsupported scopes, and cross-origin consent; cancel creates nothing',async()=>{
  const ctx=fixture();const {params}=await setup(ctx);
  for(const delta of [{redirect_uri:'https://evil.test/callback'},{resource:'https://evil.test/mcp'},{scope:'command:admin'},{code_challenge_method:'plain'}]) {
    const result=await ctx.server.fetch(new Request(origin+'/oauth/authorize?'+new URLSearchParams({...params,...delta}),{headers:{cookie:'session=valid'}}));
    assert.equal(result.status,400);assert.equal(result.headers.has('location'),false);
  }
  const headers={cookie:'session=valid; __Host-sovereign-oauth-csrf=abc',origin:'https://evil.test'};
  assert.equal((await ctx.post('/oauth/authorize',{...params,csrf:'abc',decision:'allow'},headers)).status,403);
  const denied=await ctx.post('/oauth/authorize',{...params,csrf:'abc',decision:'deny'},{...headers,origin});
  assert.equal(new URL(denied.headers.get('location')).searchParams.get('error'),'access_denied');
  assert.equal(ctx.grants.length,0);
});

test('OAuth access credentials cannot be used at another resource',async()=>{
  const authenticate=createServiceAuthenticator({credentialStore:{resolveToken:async()=>({oauthResource:origin+'/mcp',scopes:['continuity:read']})}});
  assert.ok(await authenticate(new Request(origin+'/mcp',{headers:{authorization:'Bearer svk_oauth_test'}})));
  await assert.rejects(()=>authenticate(new Request(origin+'/api/v1/continuity',{headers:{authorization:'Bearer svk_oauth_test'}})),e=>e.status===401);
});
