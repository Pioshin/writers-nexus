import { AIService } from './AIService.js';

export class AIPanel {
  constructor(dataManager) {
    this.dataManager = dataManager;
    this.isOpen = false;
    this.currentContext = 'general';
    this.panelEl = document.getElementById('ai-panel');
    this.toggleBtn = document.getElementById('ai-toggle-btn');
    this.closeBtn = document.getElementById('close-ai-panel');
    this.chatInput = document.getElementById('ai-chat-input');
    this.sendBtn = document.getElementById('ai-send-btn');
    this.chatContainer = document.getElementById('ai-chat-messages');
    this.clearBtn = document.getElementById('ai-clear-chat');
    this.contextIndicator = document.getElementById('ai-context-indicator');
    this.modelLabel = document.getElementById('ai-model-label');

    this.init();
    this.setupEventListeners();
  }

  async init() {
    this.updateContext('Dashboard'); // Default context
    await this.updateModelInfo();
  }

  setupEventListeners() {
    this.toggleBtn.addEventListener('click', () => this.toggle());
    this.closeBtn.addEventListener('click', () => this.close());
    this.sendBtn.addEventListener('click', () => this.sendMessage());

    this.chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.clearBtn.addEventListener('click', () => {
      this.chatContainer.innerHTML = `
        <div class="p-3 bg-primary/50 rounded-lg rounded-tl-none border border-white/5 text-sm text-secondary">
           Chat pulita. Sono pronto per nuovi suggerimenti!
        </div>
      `;
    });

    // Auto-resize textarea
    this.chatInput.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = this.scrollHeight + 'px';
      if (this.value === '') this.style.height = 'auto';
    });
  }

  toggle() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.panelEl.classList.remove('translate-x-full');
      this.chatInput.focus();
    } else {
      this.panelEl.classList.add('translate-x-full');
    }
  }

  close() {
    this.isOpen = false;
    this.panelEl.classList.add('translate-x-full');
  }

  open() {
    this.isOpen = true;
    this.panelEl.classList.remove('translate-x-full');
    this.chatInput.focus();
  }

  async updateModelInfo() {
    try {
      const settings = await this.dataManager.getSettings();
      const model = settings.aiModel || 'default';
      const provider = settings.aiProvider || 'openai-compatible';
      // Clean display name
      let display = `${provider} / ${model}`;
      if (display.length > 25) display = display.substring(0, 22) + '...';

      if (this.modelLabel) {
        this.modelLabel.textContent = display;
        this.modelLabel.title = `Provider: ${provider}, Model: ${model}`;
      }
    } catch {
      if (this.modelLabel) this.modelLabel.textContent = 'AI Offline';
    }
  }

  updateContext(viewName) {
    this.currentContext = viewName;
    const labels = {
      dashboard: 'Dashboard',
      ideation: 'Ideazione',
      structure: 'Struttura',
      writing: 'Scrittura',
      editing: 'Editing',
      analysis: 'Analisi',
    };
    this.contextIndicator.textContent = `Contesto: ${labels[viewName] || viewName}`;
  }

  async sendMessage() {
    const text = this.chatInput.value.trim();
    if (!text) return;

    // Add user message
    this.appendMessage('user', text);
    this.chatInput.value = '';
    this.chatInput.style.height = 'auto'; // Reset height

    // Show typing
    const typingId = this.showTyping();

    try {
      // Build system prompt based on context
      const systemPrompt = await this.buildSystemPrompt();

      // Get chat history (simplified for now - scraping DOM or keeping explicit state)
      // Ideally AIService.chat consumes an array of messages.
      // We'll reconstruct history from DOM for simplicity or implement state array.
      // Let's use a simple state array approach could be better, but lets just use single turn + system for now or simple history.
      // Re-reading AIService... it accepts `messages`.

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ];

      // Call AI
      const response = await AIService.chat({ messages });

      this.removeTyping(typingId);
      this.appendMessage('assistant', response.text);
    } catch (error) {
      this.removeTyping(typingId);
      this.appendMessage('system', `Errore: ${error.message}`);
      console.error(error);
    }
  }

  appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = 'flex flex-col gap-1 max-w-[90%]';

    const bubble = document.createElement('div');
    if (role === 'user') {
      div.className = 'ml-auto max-w-[85%]';
      bubble.className =
        'p-3 bg-accent text-primary rounded-lg rounded-tr-none text-sm shadow-md';
    } else if (role === 'assistant') {
      div.className = 'mr-auto max-w-[90%]';
      bubble.className =
        'p-3 bg-secondary/80 rounded-lg rounded-tl-none text-sm text-text-primary border border-white/5 shadow-md whitespace-pre-wrap';
    } else {
      div.className = 'w-full';
      bubble.className = 'p-2 text-center text-xs text-red-400 italic';
    }

    bubble.innerHTML = this.formatText(text);
    div.appendChild(bubble);

    // Contextual Actions for Assistant
    if (role === 'assistant') {
      const actionsLine = document.createElement('div');
      actionsLine.className = 'flex gap-2 mt-1 ml-1';

      // Copy Button
      const copyBtn = document.createElement('button');
      copyBtn.className = 'text-[10px] text-secondary hover:text-white flex items-center gap-1 opacity-70 hover:opacity-100 transition-opacity';
      copyBtn.innerHTML = `<i data-lucide="copy" class="w-3 h-3"></i> Copia`;
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(text);
        copyBtn.innerHTML = `<i data-lucide="check" class="w-3 h-3"></i> Copiato!`;
        setTimeout(() => copyBtn.innerHTML = `<i data-lucide="copy" class="w-3 h-3"></i> Copia`, 2000);
      };
      actionsLine.appendChild(copyBtn);

      // Insert Button (only if context supports it)
      if (['writing', 'ideation'].includes(this.currentContext)) {
        const insertBtn = document.createElement('button');
        insertBtn.className = 'text-[10px] text-accent hover:text-white flex items-center gap-1 opacity-80 hover:opacity-100 transition-opacity';
        insertBtn.innerHTML = `<i data-lucide="corner-down-left" class="w-3 h-3"></i> Inserisci`;
        insertBtn.onclick = () => {
          const event = new CustomEvent('ai-action-insert', { detail: { text, context: this.currentContext } });
          window.dispatchEvent(event);
          insertBtn.innerHTML = `<i data-lucide="check-circle" class="w-3 h-3"></i> Inserito`;
        };
        actionsLine.appendChild(insertBtn);
      }

      div.appendChild(actionsLine);
    }

    this.chatContainer.appendChild(div);
    this.scrollToBottom();

    // Refresh icons in case
    if (window.lucide) window.lucide.createIcons();
  }

  showTyping() {
    const id = 'typing-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className =
      'mr-auto p-3 bg-secondary/50 rounded-lg rounded-tl-none text-sm text-secondary flex items-center gap-1';
    div.innerHTML = `
        <span class="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce"></span>
        <span class="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
        <span class="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
    `;
    this.chatContainer.appendChild(div);
    this.scrollToBottom();
    return id;
  }

  removeTyping(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  scrollToBottom() {
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  formatText(text) {
    // Simple bold formatting
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return formatted;
  }

  async buildSystemPrompt() {
    let contextData = '';
    const projectId = await this.dataManager.getCurrentProjectId();

    if (projectId) {
      const project = await this.dataManager.getProject(projectId);
      contextData += `PROGETTO: ${project.title}\nPREMESSA: ${project.premise}\n\n`;

      // --- Context specific data injection ---
      if (this.currentContext === 'writing') {
        const sceneId = await this.dataManager.getCurrentSceneId();
        if (sceneId) {
          const scene = await this.dataManager.getScene(sceneId);
          contextData += `SCENA ATTUALE (Titolo: ${scene.title}):\n${scene.content}\n\n`;
        }
        // Also inject characters for reference
        const characters = await this.dataManager.getProjectItems(projectId, 'characters');
        const charSummary = characters.map(c => `- ${c.name}: ${c.role}, ${c.archetype}`).join('\n');
        contextData += `PERSONAGGI DISPONIBILI:\n${charSummary}\n\n`;

      } else if (this.currentContext === 'ideation') {
        const ideas = await this.dataManager.getProjectItems(projectId, 'ideas');
        const ideasText = ideas.map((i, idx) => `Idea ${idx + 1}: ${i.content}`).join('\n');
        contextData += `LISTA IDEE:\n${ideasText}\n\n`;

        const characters = await this.dataManager.getProjectItems(projectId, 'characters');
        const charText = characters.map(c => `Personaggio (${c.name}): ${c.description || ''}`).join('\n');
        contextData += `PERSONAGGI:\n${charText}\n\n`;

        const locations = await this.dataManager.getProjectItems(projectId, 'locations');
        contextData += `LUOGHI:\n${locations.map(l => l.name).join(', ')}\n\n`;

      } else if (this.currentContext === 'structure') {
        const plotlines = await this.dataManager.getProjectItems(projectId, 'plotlines');
        const plText = plotlines.map(p => `Trama (${p.name}): ${p.description}`).join('\n');
        contextData += `LINEE NARRATIVE:\n${plText}\n\n`;

        // Fetch all scenes for structure overview
        const scenes = await this.dataManager.getProjectItems(projectId, 'scenes');
        scenes.sort((a, b) => a.order - b.order); // simplistic sort, might need stage logic
        const sceneOutline = scenes.map(s => `- Scena ${s.order}: ${s.title} (${s.stageKey})`).join('\n');
        contextData += `SCALETTA SCENE:\n${sceneOutline}\n\n`;
      }
    }

    const basePrompt = `Sei l'assistente IA di Writer's Nexus. Aiuti uno scrittore a sviluppare la sua storia.
    Attualmente l'utente si trova nella vista: ${this.currentContext.toUpperCase()}.
    
    DATI DEL PROGETTO (Usa questi dati per rispondere all'utente. Non chiedere informazioni se sono già qui):
    --------------------------
    ${contextData}
    --------------------------
    
    ISTRUZIONI:
    - Rispondi in modo conciso, creativo e propositivo.
    - Se l'utente si riferisce a "Idea X", cerca nella lista Idee qui sopra.
    - Usa il contesto fornito per evitare domande inutili.
    `;
    return basePrompt;
  }
}
