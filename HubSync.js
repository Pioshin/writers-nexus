/**
 * HubSync — Dual-write bridge between DataManager (IndexedDB) and NOOS Hub.
 *
 * Design:
 *   - IDB remains the source-of-truth during this phase.
 *   - Every write to IDB is mirrored to Hub in the background.
 *   - Sync failures are logged but never block the UX.
 *   - Controlled by settings: hubEnabled, hubUrl, hubToken.
 *
 * Usage:
 *   import { HubSync } from './HubSync.js';
 *   HubSync.install(DataManager);   // patches DataManager in-place
 */

import { HubClient, HubError } from './HubClient.js';

// ─── Entity type to NOOS store name mapping ───
const ENTITY_STORES = new Set([
  'characters', 'scenes', 'plotlines', 'locations',
  'ideas', 'objects', 'systems', 'geography', 'history', 'culture',
]);

let hub = null;
let enabled = false;

/** Debug log (only in dev) */
function _log(...args) {
  if (typeof console !== 'undefined') {
    console.debug('[HubSync]', ...args);
  }
}

/** Fire-and-forget async: logs errors, never blocks. */
function _fireAndForget(label, fn) {
  fn().catch(err => {
    _log(`⚠ ${label} failed:`, err.message || err);
  });
}

// ─── Mapping helpers: IDB ↔ Hub ───

/**
 * Convert IDB project to Hub create/update payload.
 * Hub expects { title, data } where data holds everything except id/title/timestamps.
 */
function _projectToHubPayload(project) {
  const { id, title, createdAt, lastModified, ...rest } = project;
  return { title: title || 'Untitled', data: rest };
}

/**
 * Convert IDB entity item to Hub create/update payload.
 * Hub expects { name, data } where data holds everything except id/name/projectId/timestamps.
 */
function _entityToHubPayload(item) {
  const { id, projectId, createdAt, lastModified, name, title, ...rest } = item;
  return { name: name || title || '', data: rest };
}

/**
 * Derive a stable Hub project ID from the IDB project ID.
 * IDB IDs like `proj-1707123456789-abc123` are kept as-is.
 */
function _hubProjectId(idbId) {
  return idbId; // Direct mapping — Hub stores them verbatim.
}

// ─── Core sync operations ───

async function _syncCreateProject(project) {
  if (!enabled || !hub) return;
  try {
    await hub.createProject(_projectToHubPayload(project));
    _log('✓ project synced →', project.id);
  } catch (e) {
    if (e.isConflict) {
      // Already exists (duplicate title) — try update instead
      try {
        await hub.updateProject(project.id, _projectToHubPayload(project));
        _log('✓ project updated (was conflict) →', project.id);
      } catch (e2) {
        _log('⚠ project update fallback failed:', e2.message);
      }
    } else {
      throw e;
    }
  }
}

async function _syncDeleteProject(projectId) {
  if (!enabled || !hub) return;
  try {
    await hub.deleteProject(projectId);
    _log('✓ project deleted →', projectId);
  } catch (e) {
    if (e.isNotFound) return; // Already gone — fine
    throw e;
  }
}

async function _syncCreateEntity(entityType, item) {
  if (!enabled || !hub) return;
  try {
    await hub.createEntity(entityType, item.projectId, _entityToHubPayload(item));
    _log(`✓ ${entityType} synced →`, item.id);
  } catch (e) {
    if (e.isConflict) {
      // May already exist — try update
      try {
        await hub.updateEntity(entityType, item.id, _entityToHubPayload(item));
        _log(`✓ ${entityType} updated (was conflict) →`, item.id);
      } catch { /* ignore */ }
    } else {
      throw e;
    }
  }
}

async function _syncDeleteEntity(entityType, entityId) {
  if (!enabled || !hub) return;
  try {
    await hub.deleteEntity(entityType, entityId);
    _log(`✓ ${entityType} deleted →`, entityId);
  } catch (e) {
    if (e.isNotFound) return;
    throw e;
  }
}

// ─── Public API ───

export const HubSync = {
  /**
   * Patch DataManager to add dual-write.
   * Must be called once at startup, after DataManager is imported.
   *
   * @param {object} dm — the DataManager singleton
   */
  install(dm) {
    // Wrap saveProject
    const _origSaveProject = dm.saveProject.bind(dm);
    dm.saveProject = async function (projectData) {
      const result = await _origSaveProject(projectData);
      _fireAndForget('saveProject', () => _syncCreateProject(result));
      return result;
    };

    // Wrap deleteProject
    const _origDeleteProject = dm.deleteProject.bind(dm);
    dm.deleteProject = async function (id) {
      await _origDeleteProject(id);
      _fireAndForget('deleteProject', () => _syncDeleteProject(id));
    };

    // Wrap saveScene
    const _origSaveScene = dm.saveScene.bind(dm);
    dm.saveScene = async function (sceneData) {
      const result = await _origSaveScene(sceneData);
      _fireAndForget('saveScene', () => _syncCreateEntity('scenes', result));
      return result;
    };

    // Wrap deleteScene
    const _origDeleteScene = dm.deleteScene.bind(dm);
    dm.deleteScene = async function (sceneId) {
      await _origDeleteScene(sceneId);
      _fireAndForget('deleteScene', () => _syncDeleteEntity('scenes', sceneId));
    };

    // Wrap saveProjectItem (generic entities)
    const _origSaveProjectItem = dm.saveProjectItem.bind(dm);
    dm.saveProjectItem = async function (projectId, itemType, itemData) {
      const result = await _origSaveProjectItem(projectId, itemType, itemData);
      if (ENTITY_STORES.has(itemType)) {
        _fireAndForget(`save:${itemType}`, () => _syncCreateEntity(itemType, result));
      }
      return result;
    };

    // Wrap deleteProjectItem
    const _origDeleteProjectItem = dm.deleteProjectItem.bind(dm);
    dm.deleteProjectItem = async function (itemType, itemId) {
      await _origDeleteProjectItem(itemType, itemId);
      if (ENTITY_STORES.has(itemType)) {
        _fireAndForget(`delete:${itemType}`, () => _syncDeleteEntity(itemType, itemId));
      }
    };

    // Listen for settings changes to toggle hub on/off
    window.addEventListener('settingschanged', (e) => {
      const s = e.detail?.newSettings;
      if (s) HubSync.configure(s);
    });

    _log('installed — dual-write ready');
  },

  /**
   * (Re)configure from settings object.
   * Called at init and whenever settings change.
   */
  configure(settings) {
    const wasEnabled = enabled;
    enabled = !!settings.hubEnabled;
    const url = settings.hubUrl || 'http://127.0.0.1:9090';
    const token = settings.hubToken || '';

    if (enabled) {
      if (!hub) {
        hub = new HubClient({ baseUrl: url, token, app: 'writer' });
      } else {
        hub.setBaseUrl(url);
        hub.setToken(token);
      }
      if (!wasEnabled) {
        _log('enabled → Hub at', url);
        // Quick reachability check
        hub.isReachable().then(ok => {
          _log('Hub reachable:', ok);
        });
      }
    } else {
      if (wasEnabled) _log('disabled');
    }
  },

  /** Get current HubClient instance (may be null if disabled). */
  getClient() {
    return enabled ? hub : null;
  },

  /** Check if Hub sync is currently active. */
  isEnabled() {
    return enabled;
  },
};
