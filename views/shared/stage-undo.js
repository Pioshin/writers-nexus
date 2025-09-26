// Gestione undo per cambi di stage delle scene
// Stack semplice LIFO multistep
import { DataManager } from '../../DataManager.js';

const MAX_STACK = 100;
const stack = [];

function record(sceneId, fromStage, toStage) {
    if (!sceneId || fromStage === toStage) return;
    stack.push({ sceneId, fromStage, toStage, ts: Date.now() });
    if (stack.length > MAX_STACK) stack.shift();
}

async function undoLast() {
    const action = stack.pop();
    if (!action) return { ok: false, reason: 'empty' };
    const scene = await DataManager.getScene(action.sceneId);
    if (!scene) return { ok: false, reason: 'missingScene' };
    // Se lo stage corrente non coincide più con quello registrato come toStage, decidiamo comunque di forzare? Forziamo per coerenza.
    const previous = scene.stageKey;
    scene.stageKey = action.fromStage;
    await DataManager.saveScene(scene);
    window.dispatchEvent(new CustomEvent('stage-undo-applied', { detail: { sceneId: scene.id, toStage: previous, restoredStage: action.fromStage } }));
    return { ok: true, sceneId: scene.id, restoredStage: action.fromStage };
}

export const StageUndo = { record, undoLast };