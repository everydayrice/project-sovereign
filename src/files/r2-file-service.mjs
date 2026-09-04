import { SovereignError, requireCondition } from "../platform/errors.mjs";

export class R2FileService {
  constructor({ bucket }) {
    this.bucket = bucket;
  }

  assertConfigured() {
    if (!this.bucket) throw new SovereignError("storage_not_configured", "SOVEREIGN_FILES R2 binding is required.", { status: 503 });
  }

  async put({ tenantId, sourceId, sourceItemId, body, contentType = "application/octet-stream", contentLength, contentHash }) {
    this.assertConfigured();
    requireCondition(tenantId && sourceId && sourceItemId, "storage_identity_required", "Tenant, source, and source-item identifiers are required.");
    const key = objectKey({ tenantId, sourceId, sourceItemId });
    const object = await this.bucket.put(key, body, {
      httpMetadata: { contentType },
      customMetadata: {
        tenant_id: tenantId,
        source_id: sourceId,
        source_item_id: sourceItemId,
        ...(contentHash ? { content_hash: contentHash } : {}),
        ...(contentLength !== undefined && contentLength !== null ? { content_length: String(contentLength) } : {})
      }
    });
    return {
      object_key: key,
      version: object?.version ?? null,
      etag: object?.httpEtag ?? object?.etag ?? null,
      size: object?.size ?? contentLength ?? null,
      uploaded_at: object?.uploaded?.toISOString?.() ?? new Date().toISOString()
    };
  }

  async get({ tenantId, sourceId, sourceItemId }) {
    this.assertConfigured();
    return this.bucket.get(objectKey({ tenantId, sourceId, sourceItemId }));
  }

  async head({ tenantId, sourceId, sourceItemId }) {
    this.assertConfigured();
    return this.bucket.head(objectKey({ tenantId, sourceId, sourceItemId }));
  }
}

export function objectKey({ tenantId, sourceId, sourceItemId }) {
  return `tenants/${safe(tenantId)}/sources/${safe(sourceId)}/items/${safe(sourceItemId)}`;
}

function safe(value) {
  return encodeURIComponent(String(value));
}
