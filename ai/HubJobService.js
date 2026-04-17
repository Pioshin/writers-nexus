/**
 * HubJobService — NOOS Hub Job lifecycle manager for Writer's Nexus frontend.
 *
 * Provides a high-level API to submit AI jobs to NOOS Hub workers
 * (BKA for analysis, KRONK for writing) and track their progress via polling.
 *
 * Design:
 *   - Polls GET /v1/jobs/:id every 2s until terminal state
 *   - Fires window events for UI progress (`hub-job-progress`, `hub-job-done`)
 *   - Convenience methods for all engine task types
 *   - Auto-resolves HubClient from HubSync when no explicit client is set
 *
 * Usage:
 *   import { HubJobService } from './HubJobService.js';
 *   HubJobService.configure(hubClient);
 *   const result = await HubJobService.writeChapter(projectId, { ... }, onProgress);
 */

import { HubSync } from '../HubSync.js';

// ─── State ───

let _client = null;
const _activeJobs = new Map(); // jobId → { abort, meta }

const POLL_INTERVAL_MS = 2500;
const DEFAULT_TIMEOUT_MS = 600_000; // 10 min

function _log(...args) {
  console.debug('[HubJob]', ...args);
}

// ─── Internals ───

function _getClient() {
  return _client || HubSync.getClient();
}

function _ensureClient() {
  const client = _getClient();
  if (!client) {
    throw new Error(
      'Hub non configurato. Abilita la connessione al Hub nelle Impostazioni e inserisci il token.'
    );
  }
  return client;
}

/**
 * Submit a job and wait for a terminal state via polling.
 *
 * @param {string}   engine     — 'BKA' | 'KRONK'
 * @param {string}   taskType   — e.g. 'write.chapter', 'analyze.manuscript'
 * @param {string}   projectId
 * @param {object}   payload    — engine-specific payload
 * @param {object}   [opts]
 * @param {string}   [opts.priority='standard']
 * @param {function} [opts.onProgress]  — fn({ phase, percent, message })
 * @param {number}   [opts.timeoutMs=600000]
 * @returns {Promise<object>} — The full JobResource on success (includes result/artifact)
 */
async function submitJob(engine, taskType, projectId, payload, opts = {}) {
  const client = _ensureClient();
  const {
    priority = 'standard',
    onProgress,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = opts;

  // ── 1. Create job ──
  const queued = await client.createJob(engine, taskType, projectId, payload, {
    priority,
  });
  const jobId = queued.jobId;
  _log('queued', jobId, engine, taskType, 'pos', queued.queuePosition);

  if (onProgress) {
    onProgress({
      phase: 'queued',
      percent: 0,
      message: `Job in coda (pos. ${queued.queuePosition ?? '?'})`,
    });
  }

  _dispatchEvent('hub-job-queued', { jobId, engine, taskType });

  // ── 2. Poll until terminal ──
  return new Promise((resolve, reject) => {
    let settled = false;
    let pollTimer = null;
    let timeoutTimer = null;

    const cleanup = () => {
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      _activeJobs.delete(jobId);
    };

    const settle = (err, result) => {
      if (settled) return;
      cleanup();
      if (err) {
        _dispatchEvent('hub-job-done', { jobId, ok: false, error: err.message });
        reject(err);
      } else {
        _dispatchEvent('hub-job-done', { jobId, ok: true, result });
        resolve(result);
      }
    };

    // Expose abort handle for cancelJob()
    _activeJobs.set(jobId, {
      abort: () => settle(new Error('Job annullato dal client')),
      engine,
      taskType,
    });

    // Timeout guard
    timeoutTimer = setTimeout(() => {
      settle(new Error(`Job timeout dopo ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    // Polling loop
    const poll = async () => {
      if (settled) return;
      try {
        const job = await client.getJob(jobId);

        switch (job.status) {
          case 'queued':
          case 'running': {
            const progress = job.progress || {};
            if (onProgress) {
              onProgress({
                phase: progress.currentPhase || job.status,
                percent: progress.percentComplete ?? -1,
                message: progress.message || '',
              });
            }
            _dispatchEvent('hub-job-progress', {
              jobId,
              status: job.status,
              phase: progress.currentPhase,
              percent: progress.percentComplete,
              message: progress.message,
            });
            break;
          }
          case 'succeeded':
            _log('succeeded', jobId);
            settle(null, job);
            break;
          case 'failed':
            settle(new Error(job.error || `Job ${jobId} fallito`));
            break;
          case 'cancelled':
            settle(new Error('Job annullato'));
            break;
          case 'dead_letter':
            settle(new Error('Job in dead-letter (troppi tentativi falliti)'));
            break;
          default:
            _log('unknown status', job.status);
        }
      } catch (e) {
        _log('poll error', e.message);
        // Network blip — don't settle, just log. Next poll will retry.
      }
    };

    // First poll immediately, then every POLL_INTERVAL_MS
    poll();
    pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  });
}

/**
 * Cancel a running/queued job.
 * @param {string} jobId
 */
async function cancelJob(jobId) {
  // Abort local tracking
  const entry = _activeJobs.get(jobId);
  if (entry?.abort) entry.abort();

  // Cancel on Hub
  try {
    const client = _getClient();
    if (client) {
      await client._request('DELETE', `/v1/jobs/${encodeURIComponent(jobId)}`);
      _log('cancelled on hub', jobId);
    }
  } catch (e) {
    _log('cancel failed (may already be terminal)', e.message);
  }
}

// ─── Window events (for decoupled UI) ───

function _dispatchEvent(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

// ═══════════════════════════════════════════════
//  Convenience methods — KRONK (writing engine)
// ═══════════════════════════════════════════════

/**
 * Generate a new chapter.
 * @param {string} projectId
 * @param {object} payload — { title, synopsis, characters[], previousContext, style, chapterNumber }
 * @param {function} [onProgress]
 */
function writeChapter(projectId, payload, onProgress) {
  return submitJob('KRONK', 'write.chapter', projectId, payload, {
    priority: 'interactive',
    onProgress,
  });
}

/**
 * Revise an existing chapter.
 * @param {string} projectId
 * @param {object} payload — { text, instructions, focusAreas[] }
 * @param {function} [onProgress]
 */
function reviseChapter(projectId, payload, onProgress) {
  return submitJob('KRONK', 'revise.chapter', projectId, payload, {
    priority: 'standard',
    onProgress,
  });
}

/**
 * Rewrite a specific section.
 * @param {string} projectId
 * @param {object} payload — { text, instructions, style }
 * @param {function} [onProgress]
 */
function rewriteSection(projectId, payload, onProgress) {
  return submitJob('KRONK', 'rewrite.section', projectId, payload, {
    priority: 'standard',
    onProgress,
  });
}

// ═══════════════════════════════════════════════
//  Convenience methods — BKA (analysis engine)
// ═══════════════════════════════════════════════

/**
 * Analyze a full manuscript / chapter text.
 * @param {string} projectId
 * @param {object} payload — { text, analysisDepth }
 * @param {function} [onProgress]
 */
function analyzeManuscript(projectId, payload, onProgress) {
  return submitJob('BKA', 'analyze.manuscript', projectId, payload, {
    priority: 'standard',
    onProgress,
  });
}

/**
 * Consistency analysis across scenes / chapters.
 * @param {string} projectId
 * @param {object} payload — { scenes[], focusAreas[] }
 * @param {function} [onProgress]
 */
function analyzeConsistency(projectId, payload, onProgress) {
  return submitJob('BKA', 'analyze.consistency', projectId, payload, {
    priority: 'batch',
    onProgress,
  });
}

/**
 * Extract entities (characters, locations, objects) from text.
 * @param {string} projectId
 * @param {object} payload — { text, entityTypes[] }
 * @param {function} [onProgress]
 */
function extractEntities(projectId, payload, onProgress) {
  return submitJob('BKA', 'extract.entities', projectId, payload, {
    priority: 'batch',
    onProgress,
  });
}

// ═══════════════════════════════════════════════
//  Public API
// ═══════════════════════════════════════════════

export const HubJobService = {
  /**
   * Set the HubClient to use. Normally auto-resolved from HubSync.
   * @param {import('../HubClient.js').HubClient} client
   */
  configure(client) {
    _client = client;
    _log('configured', !!client);
  },

  /**
   * Check if Hub jobs are available (Hub enabled + reachable).
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      const client = _getClient();
      if (!client) return false;
      return await client.isReachable();
    } catch {
      return false;
    }
  },

  /** Number of jobs currently being tracked. */
  activeJobCount() {
    return _activeJobs.size;
  },

  /** List of tracked job IDs. */
  activeJobIds() {
    return [..._activeJobs.keys()];
  },

  // Core
  submitJob,
  cancelJob,

  // KRONK convenience
  writeChapter,
  reviseChapter,
  rewriteSection,

  // BKA convenience
  analyzeManuscript,
  analyzeConsistency,
  extractEntities,
};
