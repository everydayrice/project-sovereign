export function sourceUploadPageHtml() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Upload source · Sovereign</title><style>${styles}</style></head><body>
  <main class="shell">
    <a class="wordmark" href="/console/sources">RICE COMMAND</a>
    <section class="card">
      <p class="eyebrow">Sources / Storage</p>
      <h1>Upload a source</h1>
      <p class="lede">Upload one file into Sovereign-managed R2 storage. The file will be registered as an inventoried source; it will not become Canonical Intelligence automatically.</p>
      <form id="upload-form">
        <label>File<input id="file" name="file" type="file" required></label>
        <label>Data classification
          <select name="data_classification">
            <option value="internal" selected>Internal</option>
            <option value="confidential">Confidential</option>
            <option value="restricted">Restricted</option>
            <option value="public">Public</option>
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
      const file = document.getElementById('file').files[0];
      if (!file) return;
      submit.disabled = true;
      status.textContent = 'Uploading ' + file.name + '…';
      const data = new FormData(form);
      try {
        const response = await fetch('/v1/sources/upload-file', { method: 'POST', credentials: 'same-origin', body: data });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Upload failed.');
        status.textContent = 'Uploaded. Opening Sources / Storage…';
        window.location.assign('/console/sources');
      } catch (error) {
        status.textContent = error.message || 'Upload failed.';
        submit.disabled = false;
      }
    });
  </script>
  </body></html>`;
}

const styles = `:root{color-scheme:light;--ink:#111419;--muted:#68707d;--line:#e5e7eb;--surface:#fff;--canvas:#f7f7f5;--accent:#3157e5}*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.shell{max-width:760px;margin:auto;padding:32px}.wordmark{display:inline-block;margin-bottom:72px;color:inherit;text-decoration:none;font-size:13px;letter-spacing:.12em;font-weight:800}.card{max-width:620px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:32px;box-shadow:0 16px 50px rgba(17,20,25,.05)}.eyebrow{margin:0 0 10px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.12em}h1{font-size:32px;line-height:1.1;margin:0 0 14px}.lede{color:var(--muted);margin:0 0 26px}form{display:grid;gap:18px}label{display:grid;gap:8px;font-weight:600;font-size:13px}input,select{width:100%;border:1px solid #d7dbe2;border-radius:9px;background:#fff;padding:12px 13px;font:inherit;color:inherit}input[type=file]{padding:10px}button{border:0;border-radius:9px;background:var(--ink);color:white;padding:12px 16px;font:600 14px/1 inherit;cursor:pointer}button:disabled{opacity:.55;cursor:wait}.status{min-height:22px;margin:0;color:var(--muted)}.back{display:inline-block;margin-top:24px;color:var(--muted);text-decoration:none;font-size:13px}@media(max-width:600px){.shell{padding:22px}.wordmark{margin-bottom:48px}.card{padding:24px;border-radius:12px}h1{font-size:28px}}`;
