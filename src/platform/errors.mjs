export class SovereignError extends Error {
  constructor(code, message, { status = 400, details } = {}) {
    super(message);
    this.name = "SovereignError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function requireCondition(condition, code, message, options) {
  if (!condition) throw new SovereignError(code, message, options);
}
