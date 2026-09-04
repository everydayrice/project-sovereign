export function authPageHtml({ mode = "login" } = {}) {
  const signup = mode === "signup";
  const title = signup ? "Create your Sovereign" : "Welcome back";
  const button = signup ? "Create account" : "Sign in";
  const alternate = signup
    ? '<p class="switch">Already have an account? <a href="/login">Sign in</a></p>'
    : '<p class="switch">New to Sovereign? <a href="/signup">Create account</a></p>';
  const nameField = signup ? '<label>Name<input name="name" autocomplete="name" required></label>' : "";
  return page(title, `
    <main class="auth-shell">
      <a class="wordmark" href="/">SOVEREIGN</a>
      <section class="auth-card">
        <p class="eyebrow">Persistent intelligence infrastructure</p>
        <h1>${title}</h1>
        <form id="auth-form">
          ${nameField}
          <label>Email<input name="email" type="email" autocomplete="email" required></label>
          <label>Password<input name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="8" required></label>
          <button type="submit">${button}</button>
          <p id="message" class="message" aria-live="polite"></p>
        </form>
        ${alternate}
      </section>
    </main>
    <script>
      const form = document.getElementById('auth-form');
      const message = document.getElementById('message');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        message.textContent = '${signup ? "Creating account…" : "Signing in…"}';
        const data = Object.fromEntries(new FormData(form));
        try {
          const response = await fetch('${signup ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email"}', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(data)
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.message || payload.error?.message || 'Authentication failed.');
          window.location.assign('/onboarding');
        } catch (error) {
          message.textContent = error.message || 'Authentication failed.';
        }
      });
    </script>
  `);
}

export function onboardingPageHtml({ user } = {}) {
  const defaultName = escapeHtml(user?.name ?? "");
  return page("Create workspace", `
    <main class="auth-shell">
      <a class="wordmark" href="/">SOVEREIGN</a>
      <section class="auth-card wide">
        <p class="eyebrow">First-time setup</p>
        <h1>Create your workspace</h1>
        <p class="lede">This creates your tenant boundary, owner principal, main workspace, and first durable Neon state.</p>
        <form id="bootstrap-form">
          <label>Workspace / organization name<input name="display_name" value="${defaultName}" required></label>
          <label>Workspace slug<input name="slug" pattern="[a-z0-9][a-z0-9-]{1,62}" placeholder="acme" required></label>
          <label>Command name<input name="command_display_name" value="COMMAND" required></label>
          <button type="submit">Initialize Sovereign</button>
          <p id="message" class="message" aria-live="polite"></p>
        </form>
      </section>
    </main>
    <script>
      const form = document.getElementById('bootstrap-form');
      const message = document.getElementById('message');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        message.textContent = 'Creating durable workspace…';
        const data = Object.fromEntries(new FormData(form));
        data.slug = data.slug.trim().toLowerCase();
        try {
          const response = await fetch('/v1/bootstrap', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(data)
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.message || 'Workspace initialization failed.');
          window.location.assign(payload.next || '/console');
        } catch (error) {
          message.textContent = error.message || 'Workspace initialization failed.';
        }
      });
    </script>
  `);
}

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Sovereign</title><style>${styles}</style></head><body>${body}</body></html>`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

const styles = `:root{color-scheme:light;--ink:#111419;--muted:#68707d;--line:#e5e7eb;--surface:#fff;--canvas:#f7f7f5;--accent:#3157e5}*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--ink);font:15px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:inherit}.auth-shell{max-width:760px;margin:auto;padding:32px}.wordmark{display:inline-block;margin-bottom:80px;color:inherit;text-decoration:none;font-size:13px;letter-spacing:.16em;font-weight:800}.auth-card{max-width:520px;background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:32px;box-shadow:0 16px 50px rgba(17,20,25,.05)}.auth-card.wide{max-width:620px}.eyebrow{margin:0 0 10px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.12em}.lede,.switch{color:var(--muted)}h1{font-size:32px;line-height:1.1;margin:0 0 24px}form{display:grid;gap:16px}label{display:grid;gap:7px;font-weight:600;font-size:13px}input{width:100%;border:1px solid #d7dbe2;border-radius:9px;background:#fff;padding:12px 13px;font:inherit;color:inherit}input:focus{outline:2px solid #b9c6ff;border-color:var(--accent)}button{border:0;border-radius:9px;background:var(--ink);color:white;padding:12px 16px;font:600 14px/1 inherit;cursor:pointer}.message{min-height:22px;margin:0;color:#a32323}.switch{margin:20px 0 0;font-size:13px}@media(max-width:600px){.auth-shell{padding:22px}.wordmark{margin-bottom:48px}.auth-card{padding:24px;border-radius:12px}h1{font-size:28px}}`;
