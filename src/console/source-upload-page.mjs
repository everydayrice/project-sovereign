export function sourceUploadPageHtml({privacyPolicy={}}={}) {
  const classifications=["public","internal","confidential","restricted"];
  const allowed=classifications.slice(Math.max(0,classifications.indexOf(privacyPolicy.minimum_classification)));
  const selected=privacyPolicy.default_classification??"internal";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Upload source · Sovereign</title><style>${styles}</style></head><body>
  <main class="shell">
    <a class="wordmark" href="/console/sources">SOVEREIGN</a>
    <section class="card">
      <p class="eyebrow">Sources / Storage</p>
      <h1>Upload a file</h1>
      <p class="lede">Upload it once. Sovereign stores it in managed R2 storage and automatically processes supported content. You do not need to initialize the file or review every extracted statement.</p>
      <form id="upload-form" method="post"><p>Choose files or drop them onto the file control. Maximum 25 MB per file.</p>
        <label>File<input id="file" name="file" type="file" multiple required></label>
        <label>Data classification
          <select name="data_classification">
            ${allowed.map(value=>`<option value="${value}" ${value===selected?'selected':''}>${value[0].toUpperCase()+value.slice(1)}</option>`).join('')}
          </select>
        </label>
        <button id="submit" type="submit">Upload file</button>
        <p id="status" class="status" aria-live="polite"></p>
      </form>
      <a class="back" href="/console/sources">← Back to Sources / Storage</a>
    </section>
  </main>
  <script>
    const form = document.getElementById('upload-form');
    const status = document.getElementById('status');
    const submit = document.getElementById('submit');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const files = [...document.getElementById('file').files];
      if (!files.length) return;
      submit.disabled = true;
      const failures=[];let completed=0;
      for (const file of files) {
        status.textContent = 'Uploading and processing '+file.name+' ('+(completed+1)+'/'+files.length+')…';
        const data = new FormData();data.set('file',file);data.set('data_classification',new FormData(form).get('data_classification'));
        try {
          const response = await fetch('/v1/sources/upload-file',{method:'POST',credentials:'same-origin',body:data});
          const payload=await response.json().catch(()=>({}));
          if(!response.ok)throw Error(payload.message||'Upload failed.');
          completed++;
        }catch(error){failures.push(file.name+': '+error.message);}
      }
      status.textContent=completed+' file(s) stored. '+failures.join(' ');
      submit.disabled=false;
      if(!failures.length)window.location.assign('/console/sources');
    });
  </script>
  </body></html>`;
}

const styles = `:root{color-scheme:light;--ink:#111419;--muted:#68707d;--line:#e5e7eb;--surface:#fff;--canvas:#f7f7f5;--accent:#3157e5}*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.shell{max-width:760px;margin:auto;padding:32px}.wordmark{display:inline-block;margin-bottom:72px;color:inherit;text-decoration:none;font-size:13px;letter-spacing:.12em;font-weight:800}.card{max-width:620px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:32px;box-shadow:0 16px 50px rgba(17,20,25,.05)}.eyebrow{margin:0 0 10px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.12em}h1{font-size:32px;line-height:1.1;margin:0 0 14px}.lede{color:var(--muted);margin:0 0 26px}form{display:grid;gap:18px}label{display:grid;gap:8px;font-weight:600;font-size:13px}input,select{width:100%;border:1px solid #d7dbe2;border-radius:9px;background:#fff;padding:12px 13px;font:inherit;color:inherit}input[type=file]{padding:10px}button{border:0;border-radius:9px;background:var(--ink);color:white;padding:12px 16px;font:600 14px/1 inherit;cursor:pointer}button:disabled{opacity:.55;cursor:wait}.status{min-height:22px;margin:0;color:var(--muted)}.back{display:inline-block;margin-top:24px;color:var(--muted);text-decoration:none;font-size:13px}@media(max-width:600px){.shell{padding:22px}.wordmark{margin-bottom:48px}.card{padding:24px;border-radius:12px}h1{font-size:28px}}`;
