const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const field = (name, label, value = '', required = false) => `<label>${esc(label)}<input name="${name}" value="${esc(value)}" ${required ? 'required' : ''}></label>`;
const states = ['planned','active','waiting','blocked','completed','cancelled'];

export function continuityWorkbench(snapshot) {
  const tasks = snapshot.continuity.tasks ?? snapshot.continuity.active_tasks;
  return `<section class="panel"><h2>Create a task</h2><form method="post" data-workflow="task-create">${field('title','Title','',true)}${field('objective','Objective','',true)}${field('next_action','Next action')}<button>Create task</button></form></section>
  <section class="panel"><h2>Tasks and resume</h2>${tasks.length ? tasks.map(task => `<details><summary>${esc(task.title)} · ${esc(task.state)}</summary><p>${esc(task.objective)}</p><form method="post" data-workflow="task-update" data-id="${esc(task.task_capsule_id)}">${field('title','Title',task.title,true)}${field('objective','Objective',task.objective,true)}${field('next_action','Next action',task.next_action)}<label>Status<select name="state">${states.map(state => `<option ${task.state === state ? 'selected' : ''}>${state}</option>`).join('')}</select></label><label>Blockers, one per line<textarea name="blockers">${esc(task.blockers?.join('\n'))}</textarea></label><button>Save task</button></form><button type="button" data-resume="${esc(task.task_capsule_id)}">View resume</button> <button type="button" data-start="${esc(task.task_capsule_id)}">Start work</button><div data-resume-output></div></details>`).join('') : '<p>No tasks yet.</p>'}</section>
  <section class="panel" id="work-session" hidden><h2>Record progress</h2><p id="work-session-title"></p><form method="post" data-workflow="checkpoint">${field('summary','What changed','',true)}${field('next_action','Next action')}<label>Blockers, one per line<textarea name="blockers"></textarea></label><button>Save checkpoint</button><button name="finish" value="yes">Save and check out</button></form></section>
  <section class="panel"><h2>Ideas</h2><p>Capture and develop ideas separately from canonical intelligence.</p><form method="post" data-workflow="idea-create">${field('title','Idea title','',true)}<label>Description<textarea name="description"></textarea></label><button>Capture idea</button></form><div id="ideas-list"><p>Loading ideas…</p></div></section>`;
}

export function recoveryWorkbench(snapshot) {
  return `<section class="panel"><h2>Start a Trust Recovery</h2><p>Inspect evidence and recent changes, preserve the current findings, and pause canonical automation in the affected scope.</p><form method="post" data-workflow="recovery-start">${field('reason','What seems wrong?','',true)}${field('project','Project scope (leave blank for the whole tenant)')}<button>Inspect and pause automation</button></form></section>
  ${snapshot.recovery.map(session => { const findings=session.findings ?? {}; return `<section class="panel"><h2>${esc(session.reason)}</h2><p>${esc(session.state)} · canonical revision ${session.canonical_snapshot_revision}</p><h3>What Sovereign believes</h3>${values((findings.understanding?.summary ?? []).map(item => readable(item.payload)),'No canonical understanding recorded in this scope.')}<h3>What may need attention</h3>${values([...(findings.missing ?? []),...(findings.source_health?.failed_sources ?? []).map(item => `${item.display_name}: failed`),...(findings.source_health?.stale_sources ?? []).map(item => `${item.display_name}: stale`),`${findings.unresolved_candidates?.length ?? 0} unresolved candidates`,`${findings.possible_conflicts?.length ?? 0} possible conflicts`,`${findings.uncertainty?.length ?? 0} uncertain records`],'No findings recorded.')}<h3>Recent changes</h3>${values((findings.canonical?.recent_change_sets ?? []).map(item=>`${item.title}: ${item.state}`),'No recent changes.')}<p><a href="/console/intelligence">Review canonical intelligence</a> · <a href="/console/sources">Inspect supporting sources</a> · <a href="/console/continuity">Review ongoing work</a></p>${session.state === 'active' ? `<form method="post" data-workflow="recovery-complete" data-id="${esc(session.recovery_session_id)}">${field('summary','Review outcome','',true)}<button>Complete recovery and resume automation</button></form>` : ''}</section>`; }).join('')}`;
}
function readable(value) { if (!value || typeof value !== 'object') return String(value ?? ''); return Object.entries(value).map(([key,v]) => `${key.replaceAll('_',' ')}: ${typeof v === 'object' ? readable(v) : v}`).join(' · '); }
function values(items, empty) { return items.length ? `<ul>${items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>` : `<p>${esc(empty)}</p>`; }

export function workflowAssets(focus) {
  return `<style>form[data-workflow]{display:grid;gap:12px;margin:16px 0;max-width:760px}form[data-workflow] label{display:grid;gap:5px}input,textarea,select,button{font:inherit}form[data-workflow] input,form[data-workflow] textarea,form[data-workflow] select{width:100%;min-width:0;border:1px solid #ccd1d9;border-radius:7px;padding:10px;background:white;color:#111419}button{cursor:pointer;border:1px solid #cbd0d8;border-radius:7px;padding:10px 14px;background:#f5f6f8;color:#111419;min-height:44px}button:disabled{opacity:.6;cursor:wait}details{border-top:1px solid #e5e7eb;padding:14px 0}summary{cursor:pointer;font-weight:650;overflow-wrap:anywhere}#workflow-status{position:sticky;bottom:12px;background:#eef2ff;padding:14px;border:1px solid #bdcafa;border-radius:8px}#workflow-status:empty{display:none}</style><p id="workflow-status" role="status" aria-live="polite"></p><script>(${WORKFLOW_CLIENT})(${JSON.stringify(focus)})</script>`;
}

const WORKFLOW_CLIENT = String.raw`function workflowClient(focus) {
  let sessionId=null;
  const status=document.getElementById('workflow-status');
  const message=text=>{status.textContent=text;};
  const api=async(path,method='GET',body)=>{
    const response=await fetch(path,{method,credentials:'same-origin',headers:{'content-type':'application/json'},...(body ? {body:JSON.stringify(body)} : {})});
    const result=await response.json();if(!response.ok)throw Error(result.message || 'Request failed. Please try again.');return result;
  };
  const node=(tag,text)=>{const element=document.createElement(tag);element.textContent=text;return element;};
  async function ideas(){
    const out=document.getElementById('ideas-list');if(!out)return;
    try { const result=await api('/v1/continuity/ideas');out.replaceChildren();
      for(const idea of result.ideas){const row=node('article','');row.append(node('h3',idea.title),node('p',idea.description||''));const select=document.createElement('select');select.setAttribute('aria-label','Status for '+idea.title);
        for(const state of ['captured','developing','parked','promoted','archived']){const option=node('option',state);option.selected=state===idea.state;select.append(option);}
        select.addEventListener('change',async()=>{select.disabled=true;try{await api('/v1/continuity/ideas/'+encodeURIComponent(idea.idea_id),'PATCH',{state:select.value});message('Idea updated.');}catch(error){select.value=idea.state;message(error.message);}finally{select.disabled=false;}});row.append(select);out.append(row);}
      if(!result.ideas.length)out.append(node('p','No ideas captured yet.'));
    } catch(error){out.replaceChildren(node('p',error.message));}
  }
  document.addEventListener('submit',async event=>{
    const form=event.target;if(!form.matches('[data-workflow]'))return;event.preventDefault();
    const body=Object.fromEntries(new FormData(form));if(body.blockers!==undefined)body.blockers=body.blockers.split('\n').map(s=>s.trim()).filter(Boolean);
    const action=form.dataset.workflow;const id=encodeURIComponent(form.dataset.id || '');const finish=event.submitter?.name==='finish';
    const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);message('Saving…');
    try {
      if(action==='task-create')await api('/v1/continuity/tasks','POST',body);
      else if(action==='task-update')await api('/v1/continuity/tasks/'+id,'PATCH',body);
      else if(action==='idea-create'){await api('/v1/continuity/ideas','POST',body);form.reset();await ideas();message('Idea captured.');return;}
      else if(action==='recovery-start'){await api('/v1/recovery','POST',{reason:body.reason,scope:body.project.trim()?{project:body.project.trim()}:{}});}
      else if(action==='recovery-complete'){if(!confirm('Complete this recovery and allow canonical automation to resume in its scope?')){message('Recovery remains active.');return;}await api('/v1/recovery/'+id+'/complete','POST',body);}
      else if(action==='checkpoint'){
        if(!sessionId)throw Error('Start work on a task first.');
        await api('/v1/control-plane/traffic/sessions/'+encodeURIComponent(sessionId)+'/checkpoints','POST',{...body,kind:'progress'});
        if(finish){await api('/v1/control-plane/traffic/sessions/'+encodeURIComponent(sessionId)+'/checkout','POST',{next_action:body.next_action,blockers:body.blockers,outcome:{summary:body.summary}});sessionId=null;document.getElementById('work-session').hidden=true;}
        message(finish?'Checkpoint saved and work checked out.':'Checkpoint saved.');return;
      }
      location.reload();
    }catch(error){message(error.message);}finally{buttons.forEach(b=>b.disabled=false);}
  });
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-resume],[data-start]');if(!button)return;button.disabled=true;
    try {
      const id=button.dataset.resume || button.dataset.start;const result=await api('/v1/continuity/tasks/'+encodeURIComponent(id)+'/resume');
      if(button.dataset.start){
        if(sessionId)throw Error('Check out your current work before starting another task.');
        const entered=await api('/v1/control-plane/check-in','POST',{task_capsule_id:id,objective:result.task.objective,actor:{provider:{key:'sovereign',displayName:'Sovereign'},surface:{key:'console',displayName:'Console',type:'human'},externalSessionId:crypto.randomUUID()}});
        sessionId=entered.traffic_session.traffic_session_id;document.getElementById('work-session').hidden=false;document.getElementById('work-session-title').textContent=result.task.title;document.getElementById('work-session').scrollIntoView({behavior:'smooth'});message('Work started. Save a checkpoint when you make progress.');
      }else{
        const out=button.parentElement.querySelector('[data-resume-output]');out.replaceChildren(node('h3','Resume '+result.task.title),node('p','Next action: '+(result.next_action||'Not recorded')));
        for(const blocker of result.blockers)out.append(node('p','Blocked: '+blocker));
        for(const checkpoint of result.recent_checkpoints)out.append(node('p',checkpoint.summary));
        if(result.pending_handoff)out.append(node('p','Handoff: '+result.pending_handoff.summary));
      }
    }catch(error){message(error.message);}finally{button.disabled=false;}
  });
  if(focus==='continuity')ideas();
}`;
