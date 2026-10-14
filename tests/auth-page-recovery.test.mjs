import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { authPageHtml } from '../src/console/auth-pages.mjs';

// Execute the rendered browser script with controlled network responses. No
// real account, password, session or authorization grant is used by these tests.
function fixture({returnTo='/oauth/authorize?client_id=test&state=kept',signup=false}={}) {
  const origin='https://sovereign.test';
  const html=authPageHtml({mode:signup?'signup':'login',returnTo});
  const listeners={};const navigations=[];const requests=[];const timers=new Map();
  const message={textContent:''};const button={disabled:false};
  const fields={email:{value:'person@example.test'},password:{value:'wrong-test-value',focus(){this.focused=true;}}};
  const form={elements:fields,attributes:{},querySelector:()=>button,setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,v){listeners[k]=v;}};
  const ctx={html,form,fields,message,button,navigations,requests,timers,
    respond:async()=>Response.json({user:{id:'test'}}),
    submit:()=>listeners.submit({preventDefault(){}})};
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{
    document:{getElementById:id=>id==='auth-form'?form:message},
    window:{location:{origin,search:'?'+new URLSearchParams({return_to:returnTo}),assign:url=>navigations.push(url)}},
    FormData:function(){return Object.entries(fields).map(([key,input])=>[key,input.value]);},
    fetch:async(url,options)=>{requests.push({url,options});return ctx.respond(url,options);},
    URL,URLSearchParams,AbortController,
    setTimeout(fn){const id=Symbol();timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}
  });
  return ctx;
}

test('Wrong credentials remain retryable, preserve email and return to the same consent request after success',async()=>{
  const ctx=fixture();
  ctx.respond=async()=>Response.json({code:'INVALID_EMAIL_OR_PASSWORD',message:'private upstream detail'},{status:401});
  await ctx.submit();
  assert.match(ctx.message.textContent,/email or password is incorrect/);
  assert.match(ctx.message.textContent,/Project Sovereign/);
  assert.doesNotMatch(ctx.message.textContent,/private upstream/);
  assert.equal(ctx.fields.email.value,'person@example.test');
  assert.equal(ctx.fields.password.value,'');
  assert.equal(ctx.fields.password.focused,true);
  assert.equal(ctx.button.disabled,false);
  assert.equal(ctx.form.attributes['aria-busy'],'false');
  assert.equal(ctx.navigations.length,0);
  ctx.fields.password.value='correct-test-value';
  ctx.respond=async()=>Response.json({user:{id:'test'}});
  await ctx.submit();
  assert.equal(ctx.requests.length,2);
  assert.equal(ctx.requests[1].url,'/api/auth/sign-in/email');
  assert.equal(JSON.parse(ctx.requests[1].options.body).password,'correct-test-value');
  assert.equal(ctx.navigations[0],'https://sovereign.test/oauth/authorize?client_id=test&state=kept');
  assert.equal(ctx.timers.size,0);
});

test('Rate limits, provider outages and unverified accounts show distinct recoverable errors',async()=>{
  for(const [status,body,expected] of [
    [429,{},/Wait 90 seconds/],
    [503,{},/temporarily unavailable/],
    [403,{code:'EMAIL_NOT_VERIFIED'},/Verify your email/],
    [400,{error:{code:'INVALID_EMAIL_OR_PASSWORD'}},/email or password is incorrect/]
  ]) {
    const ctx=fixture();
    ctx.respond=async()=>Response.json(body,{status,headers:{'retry-after':'90'}});
    await ctx.submit();
    assert.match(ctx.message.textContent,expected);
    assert.equal(ctx.button.disabled,false);
    assert.equal(ctx.navigations.length,0);
    assert.equal(ctx.timers.size,0);
  }
});

test('Network failures, malformed success responses and request timeouts leave the form usable',async()=>{
  const ctx=fixture();
  ctx.respond=async()=>{throw new TypeError('sensitive network detail');};
  await ctx.submit();
  assert.match(ctx.message.textContent,/Could not reach Sovereign/);
  assert.equal(ctx.button.disabled,false);
  ctx.respond=async()=>new Response('not JSON');
  await ctx.submit();
  assert.match(ctx.message.textContent,/unexpected sign-in response/);
  ctx.respond=async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'}))));
  const pending=ctx.submit();
  assert.equal(ctx.button.disabled,true);
  [...ctx.timers.values()][0]();
  await pending;
  assert.match(ctx.message.textContent,/timed out/);
  assert.equal(ctx.button.disabled,false);
  assert.equal(ctx.timers.size,0);
  assert.equal(ctx.navigations.length,0);
  ctx.respond=async()=>Response.json({user:{id:'test'}});
  await ctx.submit();
  assert.equal(ctx.navigations.length,1);
});

test('Repeated taps submit credentials only once while a request is pending',async()=>{
  const ctx=fixture();let finish;
  ctx.respond=()=>new Promise(resolve=>{finish=resolve;});
  const first=ctx.submit();
  await ctx.submit();
  assert.equal(ctx.requests.length,1);
  finish(Response.json({user:{id:'test'}}));
  await first;
  assert.equal(ctx.navigations.length,1);
  assert.equal(ctx.button.disabled,false);
});

test('Successful sign-in cannot navigate to external, malformed or unrelated return destinations',async()=>{
  for(const returnTo of ['https://untrusted.test/oauth/authorize','//untrusted.test/oauth/authorize','https://[','/api/auth/sign-out']) {
    const ctx=fixture({returnTo});await ctx.submit();
    assert.equal(ctx.navigations[0],'/onboarding');
  }
  const signup=fixture({signup:true});
  signup.respond=async()=>Response.json({message:'private detail'},{status:400});
  await signup.submit();
  assert.equal(signup.requests[0].url,'/api/auth/sign-up/email');
  assert.match(signup.message.textContent,/already have a Sovereign account/);
  assert.equal(signup.button.disabled,false);
});
