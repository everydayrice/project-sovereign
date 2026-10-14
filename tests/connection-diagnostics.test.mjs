import test from 'node:test';
import assert from 'node:assert/strict';
import { observeConnection } from '../src/gateway/connection-diagnostics.mjs';

test('connection diagnostics preserve responses and exclude credentials and arbitrary paths', async () => {
  for (const [path, route] of [['/oauth/token', '/oauth/token'], ['/oauth/private-value', 'other']]) {
    const request = new Request(`https://sovereign.test${path}?code=secret-code`, {
      method: 'POST', headers: {authorization: 'Bearer secret-token', cookie: 'session=secret-cookie'},
      body: 'refresh_token=secret-refresh'
    });
    const response = Response.json({access_token:'secret-response'}, {status:200});
    const entries = [];
    assert.equal(await observeConnection(request, () => response, entry => entries.push(entry)), response);
    assert.deepEqual(entries, [{event:'sovereign_connection', route, method:'POST', status:200}]);
    assert.equal((await response.json()).access_token, 'secret-response');
  }
});
