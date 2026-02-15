/**
 * HubClient — Writer's Nexus ↔ NOOS Hub adapter
 *
 * Thin HTTP client for the NOOS /v1 API.
 * Pure ES module, no dependencies beyond fetch().
 *
 * Usage:
 *   import { HubClient } from './HubClient.js';
 *   const hub = new HubClient({ baseUrl: 'http://127.0.0.1:9090', token: '...' });
 *   const project = await hub.createProject('writer', { title: 'My Novel' });
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:9090';
const DEFAULT_APP = 'writer';
const RETRY_DELAYS = [200, 500, 1500]; // ms — 3 attempts with backoff

export class HubClient {
  /**
   * @param {object} opts
   * @param {string} [opts.baseUrl='http://127.0.0.1:9090']
   * @param {string}  opts.token   — JWT Bearer token
   * @param {string} [opts.app='writer']
   * @param {number} [opts.timeoutMs=10000]
   */
  constructor({ baseUrl, token, app, timeoutMs } = {}) {
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.token = token || '';
    this.app = app || DEFAULT_APP;
    this.timeoutMs = timeoutMs || 10000;
    this._healthy = null; // cached health status
  }

  // ─────────────────── Configuration ───────────────────

  /** Update token at runtime (e.g. after settings change). */
  setToken(token) {
    this.token = token || '';
  }

  /** Update base URL at runtime. */
  setBaseUrl(url) {
    this.baseUrl = (url || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this._healthy = null;
  }

  // ─────────────────── Health ───────────────────

  /** @returns {Promise<{status: string, components: object, metrics: object}>} */
  async health() {
    const data = await this._get('/v1/health', {}, false);
    this._healthy = data?.status === 'healthy';
    return data;
  }

  /** Quick connectivity check (resolves true/false, never throws). */
  async isReachable() {
    try {
      const h = await this.health();
      return h?.status === 'healthy';
    } catch {
      this._healthy = false;
      return false;
    }
  }

  // ─────────────────── Projects ───────────────────

  /** @returns {Promise<object>} ProjectResource */
  async createProject(payload) {
    return this._post(`/v1/projects?app=${this.app}`, payload);
  }

  /** @returns {Promise<object>} ProjectResource */
  async getProject(projectId) {
    return this._get(`/v1/projects/${enc(projectId)}?app=${this.app}`);
  }

  /** @returns {Promise<object>} ProjectListResponse */
  async listProjects({ limit = 50, offset = 0 } = {}) {
    return this._get(`/v1/projects?app=${this.app}&limit=${limit}&offset=${offset}`);
  }

  /** @returns {Promise<object>} ProjectResource */
  async updateProject(projectId, patch) {
    return this._patch(`/v1/projects/${enc(projectId)}?app=${this.app}`, patch);
  }

  /** @returns {Promise<object>} { projectId, deleted } */
  async deleteProject(projectId) {
    return this._delete(`/v1/projects/${enc(projectId)}?app=${this.app}`);
  }

  // ─────────────────── Entities ───────────────────

  /**
   * @param {string} entityType — e.g. 'characters', 'scenes', 'plotlines'
   * @param {string} projectId
   * @param {object} payload — { name, data }
   * @returns {Promise<object>} EntityResource
   */
  async createEntity(entityType, projectId, payload) {
    return this._post(
      `/v1/entities/${enc(entityType)}?app=${this.app}&projectId=${enc(projectId)}`,
      payload
    );
  }

  /** @returns {Promise<object>} EntityResource */
  async getEntity(entityType, entityId) {
    return this._get(
      `/v1/entities/${enc(entityType)}/${enc(entityId)}?app=${this.app}`
    );
  }

  /**
   * @param {string} entityType
   * @param {string} projectId
   * @param {object} [opts]
   * @returns {Promise<object>} EntityListResponse
   */
  async listEntities(entityType, projectId, { limit = 100, offset = 0, search } = {}) {
    let url = `/v1/entities/${enc(entityType)}?app=${this.app}&projectId=${enc(projectId)}&limit=${limit}&offset=${offset}`;
    if (search) url += `&search=${enc(search)}`;
    return this._get(url);
  }

  /** @returns {Promise<object>} EntityResource */
  async updateEntity(entityType, entityId, patch) {
    return this._patch(
      `/v1/entities/${enc(entityType)}/${enc(entityId)}?app=${this.app}`,
      patch
    );
  }

  /** @returns {Promise<object>} */
  async deleteEntity(entityType, entityId) {
    return this._delete(
      `/v1/entities/${enc(entityType)}/${enc(entityId)}?app=${this.app}`
    );
  }

  // ─────────────────── Jobs (read-only for now) ───────────────────

  /** @returns {Promise<object>} JobResource */
  async getJob(jobId) {
    return this._get(`/v1/jobs/${enc(jobId)}`);
  }

  /** @returns {Promise<object>} JobListResponse */
  async listJobs({ status, engine, projectId, limit = 20, offset = 0 } = {}) {
    const params = new URLSearchParams({ limit, offset });
    if (status) params.set('status', status);
    if (engine) params.set('engine', engine);
    if (projectId) params.set('projectId', projectId);
    return this._get(`/v1/jobs?${params}`);
  }

  // ─────────────────── SSE Events ───────────────────

  /**
   * Subscribe to the NOOS event stream.
   * @param {object} [filters] — { jobId, projectId }
   * @param {function} onEvent — callback(eventData)
   * @returns {{ close: function }} — call close() to disconnect
   */
  streamEvents({ jobId, projectId } = {}, onEvent) {
    const params = new URLSearchParams();
    if (jobId) params.set('jobId', jobId);
    if (projectId) params.set('projectId', projectId);
    const url = `${this.baseUrl}/v1/events/stream?${params}`;

    const es = new EventSource(url);
    // EventSource doesn't support custom headers natively.
    // For auth we fall back to a polyfill-style fetch+SSE if needed,
    // but for localhost this is acceptable.
    const handler = (e) => {
      try {
        const data = JSON.parse(e.data);
        onEvent(data);
      } catch { /* ignore parse errors */ }
    };

    // Listen to named event types from NOOS
    const eventTypes = [
      'job.queued', 'job.started', 'job.progress',
      'job.succeeded', 'job.failed', 'job.cancelled',
    ];
    eventTypes.forEach(t => es.addEventListener(t, handler));
    es.addEventListener('message', handler); // fallback

    return {
      close: () => {
        eventTypes.forEach(t => es.removeEventListener(t, handler));
        es.removeEventListener('message', handler);
        es.close();
      }
    };
  }

  // ─────────────────── HTTP internals ───────────────────

  /** @private */
  _headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  /** @private */
  async _request(method, path, body, useAuth = true) {
    const url = `${this.baseUrl}${path}`;
    const opts = {
      method,
      headers: useAuth ? this._headers() : { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    const controller = new AbortController();
    opts.signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, opts);
      clearTimeout(timer);

      if (res.ok) return await res.json();

      // Try to parse error body
      let detail;
      try { detail = await res.json(); } catch { detail = { message: res.statusText }; }
      const err = new HubError(
        detail?.detail?.message || detail?.message || detail?.detail || res.statusText,
        res.status,
        detail
      );
      throw err;
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof HubError) throw e;
      // Network / timeout error
      throw new HubError(e.message || 'Hub unreachable', 0, { originalError: e.name });
    }
  }

  /** @private — GET with retry */
  async _get(path, _unused, useAuth = true) {
    return this._withRetry(() => this._request('GET', path, undefined, useAuth));
  }

  /** @private — POST (no retry — not idempotent in general) */
  async _post(path, body) {
    return this._request('POST', path, body);
  }

  /** @private — PATCH with retry */
  async _patch(path, body) {
    return this._withRetry(() => this._request('PATCH', path, body));
  }

  /** @private — DELETE with retry */
  async _delete(path) {
    return this._withRetry(() => this._request('DELETE', path));
  }

  /** @private */
  async _withRetry(fn) {
    let lastErr;
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        return await fn();
      } catch (e) {
        lastErr = e;
        // Don't retry 4xx client errors (except 409 which may be transient lock)
        if (e.status >= 400 && e.status < 500 && e.status !== 409) throw e;
        if (attempt < RETRY_DELAYS.length) {
          await sleep(RETRY_DELAYS[attempt]);
        }
      }
    }
    throw lastErr;
  }
}

// ─────────────────── HubError ───────────────────

export class HubError extends Error {
  /**
   * @param {string} message
   * @param {number} status — HTTP status (0 = network error)
   * @param {object} [body]
   */
  constructor(message, status, body) {
    super(message);
    this.name = 'HubError';
    this.status = status;
    this.body = body;
  }

  get isNetworkError() { return this.status === 0; }
  get isNotFound() { return this.status === 404; }
  get isConflict() { return this.status === 409; }
  get isAuthError() { return this.status === 401 || this.status === 403; }
}

// ─────────────────── Helpers ───────────────────

function enc(s) { return encodeURIComponent(s); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
