function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

export function trafficBoardHtml(board) {
  const rows = board.claims.map((claim) => `<tr>
    <td>${escapeHtml(claim.state)}</td><td>${escapeHtml(claim.intent)}</td><td>${escapeHtml(claim.objective)}</td>
    <td>${escapeHtml(claim.scope?.branch ?? claim.scope?.environment ?? "—")}</td>
    <td>${escapeHtml(claim.lease_expires_at)}</td>
  </tr>`).join("") || '<tr><td colspan="5">No live traffic.</td></tr>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sovereign Control Plane</title><style>body{font-family:ui-sans-serif,system-ui;margin:2rem;color:#111827}table{border-collapse:collapse;width:100%;max-width:1100px}th,td{text-align:left;padding:.7rem;border-bottom:1px solid #d1d5db}th{font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;color:#4b5563}small{color:#6b7280}</style></head>
  <body><h1>Control Plane traffic board</h1><p>${board.active_session_count} live traffic session(s). <small>Generated ${escapeHtml(board.generated_at)}</small></p>
  <table><thead><tr><th>Claim state</th><th>Intent</th><th>Objective</th><th>Scope</th><th>Lease expiry</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}
