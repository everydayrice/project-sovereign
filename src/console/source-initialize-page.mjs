export function sourceInitializePageHtml({ sources = [] } = {}) {
  const eligible = sources.filter((source) => source.connection_state === "connected" && source.processing_state === "inventoried");
  const rows = eligible.length
    ? eligible.map((source) => `<article class="source"><div><strong>${escapeHtml(source.display_name)}</strong><span>${escapeHtml(source.source_category)} · ${escapeHtml(source.currentness)}</span></div><button data-source-id="${escapeHtml(source.source_id)}">Initialize</button></article>`).join("")
    : '<p class="empty">No inventoried sources are ready to initialize.</p>';

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Initialize source · Sovereign</title><style>${styles}</style></head><body><main><a class="wordmark" href="/console/sources">RICE COMMAND</a><section class="card"><p class="eyebrow">Sources / Storage</p><h1>Initialize source</h1><p class="lede">For this alpha, Markdown and plain-text files use a bounded structured-text analyzer. It extracts only explicitly labeled facts, policies, decisions, and constraints into non-canonical Candidate Intelligence.</p><div class="sources">${rows}</div><p id="message" class="message" aria-live="polite"></p></section></main><script>
  const message = document.getElementById('message');
  document.querySelectorAll('button[data-source-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      message.textContent = 'Initializing source…';
      try {
        const response = await fetch('/v1/sources/' + encodeURIComponent(button.dataset.sourceId) + '/initialize-text', {
          method: 'POST', credentials: 'same-origin'
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Initialization failed.');
        message.textContent = `Created ${payload.candidate_intelligence?.length ?? 0} candidate intelligence records.`;
        setTimeout(() => window.location.assign('/console/intelligence'), 650);
      } catch (error) {
        message.textContent = error.message || 'Initialization failed.';
        button.disabled = false;
      }
    });
  });
</script></body></html>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

const styles = `:root{color-scheme:light;--ink:#111419;--muted:#68707d;--line:#e5e7eb;--surface:#fff;--canvas:#f7f7f5}*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:800px;margin:auto;padding:32px}.wordmark{display:inline-block;margin-bottom:72px;color:inherit;text-decoration:none;font-size:13px;letter-spacing:.12em;font-weight:800}.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:32px}.eyebrow{margin:0 0 10px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.12em}.lede,.source span,.empty{color:var(--muted)}h1{margin:0 0 14px;font-size:32px}.sources{display:grid;gap:10px;margin-top:26px}.source{display:flex;align-items:center;justify-content:space-between;gap:16px;border:1px solid var(--line);border-radius:10px;padding:14px}.source div{display:grid;gap:3px}.source span{font-size:12px}button{border:0;border-radius:8px;background:var(--ink);color:white;padding:10px 14px;font:600 13px/1 inherit;cursor:pointer}button:disabled{opacity:.5;cursor:wait}.message{min-height:22px;margin:18px 0 0;color:#374151}@media(max-width:600px){main{padding:22px}.card{padding:24px}.wordmark{margin-bottom:48px}.source{align-items:flex-start;flex-direction:column}button{width:100%}}`;
