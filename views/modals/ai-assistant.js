import { AIService } from '../../ai/AIService.js';

let modalEl, sendBtn, closeBtn, stopBtn, promptInput, outputEl, goalEl, presetEl, contextEl;
let currentMode = 'ideation';
let fillContextBtn;

function show(opts = {}) {
  modalEl.classList.remove('hidden');
  try { window.lucide?.createIcons?.(); } catch {}
  // Autofocus sul prompt per scrivere subito
  setTimeout(() => promptInput?.focus(), 0);
}
function hide() {
  modalEl.classList.add('hidden');
}

function open() { show(); }

async function onSend() {
  const prompt = promptInput.value.trim();
  const goal = goalEl.value.trim();
  const preset = presetEl.value;
  const context = contextEl.value.trim();
  if (!prompt && !goal) return;

  const system = buildSystemPrompt(preset, currentMode);
  const userPrompt = buildUserPrompt({ prompt, goal, context, mode: currentMode });

  appendOutput(`Tu: ${prompt || goal}`, 'user');
  setLoading(true);
  try {
    const { text } = await AIService.complete({ prompt: userPrompt, system, temperature: 0.9, maxTokens: 900 });
    appendOutput(text, 'ai');
  } catch (e) {
    appendOutput(`Errore: ${e.message}`, 'error');
  } finally {
    setLoading(false);
  }
}

function appendOutput(text, role = 'ai') {
  const div = document.createElement('div');
  div.className = role === 'user' ? 'mb-2 text-secondary' : role === 'error' ? 'mb-2 text-red-400' : 'mb-4';
  div.innerText = text;
  outputEl.appendChild(div);
  // Scroll to bottom after layout paints
  requestAnimationFrame(() => { outputEl.scrollTop = outputEl.scrollHeight; });
}

function setLoading(isLoading) {
  sendBtn.disabled = isLoading;
  stopBtn.disabled = !isLoading;
}

function buildSystemPrompt(preset, mode) {
  const base = `Sei un assistente IA esperto di scrittura creativa. Rispondi in italiano, con punti elenco quando utile, esempi concreti e tono incoraggiante.`;
  const presets = {
    coach: `Agisci come coach creativo: aiuta a chiarire obiettivi, tema e conflitto. Suggerisci alternative e tecniche pratiche (snowflake, mind map, beat sheet).`,
    worldbuilder: `Agisci come worldbuilder: proponi elementi di lore, regole del mondo, culture e dettagli sensoriali coerenti.`,
    'story-analyst': `Agisci come analista: valuta coerenza della trama, arco del personaggio, pacing e fai domande mirate.`,
    'scene-doctor': `Agisci come scene doctor: proponi riscritture di battute, azioni e micro-tensioni per rendere la scena più viva.`
  };
  const modes = {
    ideation: `Fase di ideazione: genera idee divergenti e convergenti, con titoli, logline e hook.`,
    structure: `Fase di struttura: lavora su tappe del Viaggio dell'Eroe, obiettivi per scena e turning points.`,
    writing: `Fase di scrittura: proponi paragrafi campione nello stile indicato e suggerisci continuazioni.`,
    editing: `Fase di editing: focus su chiarezza, stile, tagli e riscritture mirate.`
  };
  return `${base}\n${presets[preset]}\n${modes[mode]}`;
}

function buildUserPrompt({ prompt, goal, context, mode }) {
  const parts = [];
  if (goal) parts.push(`Obiettivo: ${goal}`);
  if (context) parts.push(`Contesto: ${context}`);
  if (prompt) parts.push(`Richiesta: ${prompt}`);
  parts.push(`Modalità: ${mode}`);
  return parts.join('\n');
}

function init(dataManager, loadModal, switchView) {
  modalEl = document.getElementById('ai-assistant-modal');
  sendBtn = document.getElementById('ai-send-btn');
  closeBtn = document.getElementById('ai-close-btn');
  stopBtn = document.getElementById('ai-stop-btn');
  promptInput = document.getElementById('ai-prompt');
  outputEl = document.getElementById('ai-output');
  goalEl = document.getElementById('ai-goal');
  presetEl = document.getElementById('ai-preset');
  contextEl = document.getElementById('ai-context');
  fillContextBtn = document.getElementById('ai-fill-context');

  document.querySelectorAll('.ai-mode').forEach(btn => {
    btn.addEventListener('click', () => {
      currentMode = btn.dataset.mode;
      document.querySelectorAll('.ai-mode').forEach(b => b.classList.remove('accent'));
      btn.classList.add('accent');
    });
  });

  sendBtn.addEventListener('click', onSend);
  closeBtn.addEventListener('click', hide);
  stopBtn.addEventListener('click', () => AIService.abort());
  fillContextBtn?.addEventListener('click', async () => {
    const projectId = await dataManager.getCurrentProjectId();
    if (!projectId) return;
    const project = await dataManager.getProject(projectId);
    const scenes = await dataManager.getProjectItems(projectId, 'scenes');
    const currentSceneId = await dataManager.getCurrentSceneId();
    const currentScene = currentSceneId ? await dataManager.getScene(currentSceneId) : null;
    const characters = await dataManager.getProjectItems(projectId, 'characters');
    const locations = await dataManager.getProjectItems(projectId, 'locations');
    const ideas = await dataManager.getProjectItems(projectId, 'ideas');
    const ctx = [
      project?.title ? `Titolo: ${project.title}` : null,
      project?.premise ? `Premessa: ${project.premise}` : null,
      currentScene ? `Scena corrente: ${currentScene.title} — ${currentScene.synopsis || ''}` : null,
      scenes?.length ? `Scene totali: ${scenes.length}` : null,
      characters?.length ? `Personaggi: ${characters.slice(0,5).map(c=>c.name).join(', ')}${characters.length>5?'…':''}` : null,
      locations?.length ? `Luoghi: ${locations.slice(0,5).map(l=>l.name).join(', ')}${locations.length>5?'…':''}` : null,
      ideas?.length ? `Idee esistenti: ${ideas.length}` : null
    ].filter(Boolean).join('\n');
    contextEl.value = ctx;
  });

  return {
    init: () => {},
  open: () => show(),
    hide
  };
}

export default { init, show, hide, open };
