// Gestione undo per cambi di stage delle scene
// Stack semplice LIFO multistep
import { DataManager } from '../../DataManager.js';

const MAX_STACK = 100;
const stack = [];

function record(sceneId, fromStage, toStage) {
  if (!sceneId || fromStage === toStage) return;
  stack.push({
    type: 'stage-change',
    sceneId,
    fromStage,
    toStage,
    ts: Date.now(),
  });
  if (stack.length > MAX_STACK) stack.shift();
}

function recordReorder(stageKey, beforeSnapshot = [], afterSnapshot = []) {
  if (!stageKey || !Array.isArray(beforeSnapshot) || !Array.isArray(afterSnapshot)) return;
  if (!beforeSnapshot.length || !afterSnapshot.length) return;

  const beforeMap = new Map(beforeSnapshot.map(item => [item.id, item.order]));
  const afterMap = new Map(afterSnapshot.map(item => [item.id, item.order]));
  const sameSize = beforeMap.size === afterMap.size;
  const hasDiff = Array.from(beforeMap.entries()).some(
    ([id, order]) => afterMap.get(id) !== order
  );
  if (!sameSize || !hasDiff) return;

  stack.push({
    type: 'reorder-stage',
    stageKey,
    before: beforeSnapshot,
    after: afterSnapshot,
    ts: Date.now(),
  });
  if (stack.length > MAX_STACK) stack.shift();
}

async function undoLast() {
  const action = stack.pop();
  if (!action) return { ok: false, reason: 'empty' };

  if (action.type === 'reorder-stage') {
    for (const item of action.before) {
      const scene = await DataManager.getScene(item.id);
      if (!scene) continue;
      scene.order = item.order;
      await DataManager.saveScene(scene);
    }
    window.dispatchEvent(
      new CustomEvent('stage-undo-applied', {
        detail: {
          type: 'reorder-stage',
          stageKey: action.stageKey,
        },
      })
    );
    return { ok: true, type: 'reorder-stage', stageKey: action.stageKey };
  }

  const scene = await DataManager.getScene(action.sceneId);
  if (!scene) return { ok: false, reason: 'missingScene' };
  const previous = scene.stageKey;
  scene.stageKey = action.fromStage;
  await DataManager.saveScene(scene);
  window.dispatchEvent(
    new CustomEvent('stage-undo-applied', {
      detail: {
        type: 'stage-change',
        sceneId: scene.id,
        toStage: previous,
        restoredStage: action.fromStage,
      },
    })
  );
  return {
    ok: true,
    type: 'stage-change',
    sceneId: scene.id,
    restoredStage: action.fromStage,
  };
}

export const StageUndo = { record, recordReorder, undoLast };
