import { AIService } from './AIService.js';
import { AIWorldbuilding } from './AIWorldbuilding.js';

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
    this.setupModalObserver();
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

  setupModalObserver() {
    // Debounce function to prevent infinite loops
    let debounceTimer = null;
    const debouncedUpdate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.updateQuickActionsForModal();
      }, 100);
    };

    // Observe modal visibility changes to update quick actions
    const observer = new MutationObserver((mutations) => {
      // Only trigger on class changes that affect 'hidden' state
      const relevantChange = mutations.some(m =>
        m.type === 'attributes' &&
        m.attributeName === 'class' &&
        m.target.classList.contains('modal-backdrop')
      );
      if (relevantChange) {
        debouncedUpdate();
      }
    });

    // Observe the document body for modal visibility changes
    // Use a more targeted approach - observe only modal backdrops
    const observeModals = () => {
      document.querySelectorAll('.modal-backdrop').forEach(modal => {
        observer.observe(modal, {
          attributes: true,
          attributeFilter: ['class']
        });
      });
    };

    // Initial observation
    setTimeout(observeModals, 500);

    // Re-observe when new modals might be added
    document.addEventListener('DOMContentLoaded', observeModals);
  }

  toggle() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.panelEl.classList.remove('translate-x-full');
      this.chatInput.focus();
      this.updateQuickActionsForModal(); // Refresh on open
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
    this.updateQuickActionsForModal();
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
    this.updateQuickActions(viewName);
  }

  updateQuickActionsForModal() {
    const openModal = AIWorldbuilding.detectOpenModal();
    if (openModal) {
      this.showModalActions(openModal);
    } else {
      this.updateQuickActions(this.currentContext);
    }
  }

  showModalActions(elementType) {
    const actionsGrid = document.getElementById('ai-actions-grid');
    if (!actionsGrid) return;

    const config = AIWorldbuilding.getElementConfig(elementType);
    if (!config) return;

    // Update context indicator
    this.contextIndicator.textContent = `✏️ Modale: ${config.displayName}`;

    // Generate actions for the open modal
    actionsGrid.innerHTML = `
      <button class="ai-modal-action col-span-2 flex items-center justify-center gap-2 px-3 py-2 bg-accent text-primary font-bold rounded-lg hover:bg-accent-hover transition-colors" data-action="create" data-type="${elementType}">
        <i data-lucide="sparkles" class="w-4 h-4"></i>
        <span>Genera ${config.displayName}</span>
      </button>
      <button class="ai-modal-action col-span-2 flex items-center justify-center gap-2 px-3 py-2 bg-accent/20 text-accent font-semibold rounded-lg hover:bg-accent/30 transition-colors" data-action="improve" data-type="${elementType}">
        <i data-lucide="wand-2" class="w-4 h-4"></i>
        <span>Migliora ${config.displayName}</span>
      </button>
      <div class="col-span-2 space-y-2 pt-2 border-t border-white/10">
        <label class="text-[10px] uppercase tracking-wider text-secondary">Istruzioni opzionali</label>
        <textarea id="ai-modal-instructions" rows="2" 
          class="w-full bg-primary/50 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-accent resize-none"
          placeholder="Es. Rendilo più misterioso, aggiungi un trauma passato..."></textarea>
      </div>
      <div class="col-span-2 flex gap-2 text-[10px]">
        <button class="ai-modal-action flex-1 px-2 py-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30" data-action="stop">
          <i data-lucide="square" class="w-3 h-3 inline"></i> Stop
        </button>
        <button class="ai-modal-action flex-1 px-2 py-1.5 bg-primary/50 border border-white/10 rounded-lg hover:bg-accent/20" data-action="apply" data-type="${elementType}">
          <i data-lucide="check" class="w-3 h-3 inline"></i> Applica
        </button>
      </div>
    `;

    // Re-initialize lucide icons
    if (window.lucide) window.lucide.createIcons();

    // Bind events
    actionsGrid.querySelectorAll('.ai-modal-action').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        const type = btn.dataset.type;

        if (action === 'create' || action === 'improve') {
          await this.executeModalAction(type, action);
        } else if (action === 'stop') {
          AIWorldbuilding.abort();
          this.appendMessage('system', 'Generazione interrotta.');
        } else if (action === 'apply') {
          this.applyLastOutput(type);
        }
      });
    });
  }

  async executeModalAction(elementType, mode) {
    const instructionsEl = document.getElementById('ai-modal-instructions');
    const instructions = instructionsEl?.value?.trim() || '';
    const config = AIWorldbuilding.getElementConfig(elementType);

    this.appendMessage('user', `${mode === 'create' ? 'Genera' : 'Migliora'} ${config.displayName}${instructions ? ': ' + instructions : ''}`);

    const typingId = this.showTyping();

    try {
      const result = await AIWorldbuilding.generate(elementType, mode, { instructions });
      this.removeTyping(typingId);

      if (result.success) {
        // Show the raw output in chat
        this.appendMessage('assistant', `Ecco il ${config.displayName} generato:\n\n\`\`\`json\n${result.raw}\n\`\`\`\n\nClicca **Applica** per inserirlo nei campi.`);
      }
    } catch (error) {
      this.removeTyping(typingId);
      this.appendMessage('system', `Errore: ${error.message}`);
    }
  }

  applyLastOutput(elementType) {
    const lastOutput = AIWorldbuilding.lastOutput;
    if (!lastOutput) {
      this.appendMessage('system', 'Nessun output da applicare. Prima genera un elemento.');
      return;
    }

    try {
      const repaired = AIWorldbuilding.repairJson(lastOutput);
      const data = JSON.parse(repaired);
      const applied = AIWorldbuilding.applyToFields(elementType, data);

      if (applied) {
        this.appendMessage('system', '✅ Dati applicati ai campi del modale!');
      } else {
        this.appendMessage('system', '⚠️ Nessun campo trovato da aggiornare.');
      }
    } catch (e) {
      this.appendMessage('system', `❌ Errore parsing JSON: ${e.message}`);
    }
  }

  updateQuickActions(viewName) {
    // Check if a modal is open first
    const openModal = AIWorldbuilding.detectOpenModal();
    if (openModal) {
      this.showModalActions(openModal);
      return;
    }

    const actionsGrid = document.getElementById('ai-actions-grid');
    if (!actionsGrid) return;

    // Define context-specific chat actions
    const actionsByContext = {
      dashboard: [
        { icon: 'lightbulb', label: 'Suggerisci premessa', prompt: 'Suggeriscimi 3 idee originali per una premessa narrativa avvincente.' },
        { icon: 'book-open', label: 'Analizza genere', prompt: 'Quali sono le convenzioni e gli elementi chiave del mio genere letterario?' },
      ],
      ideation: [
        { icon: 'sparkles', label: 'Idea personaggio', prompt: 'Dammi 3 idee per personaggi interessanti basati sul mio progetto.' },
        { icon: 'map-pin', label: 'Idea luogo', prompt: 'Suggerisci 3 luoghi narrativi che potrebbero arricchire il mio mondo.' },
        { icon: 'gem', label: 'Idea oggetto', prompt: 'Proponi 3 oggetti iconici che potrebbero essere importanti nella trama.' },
        { icon: 'brain', label: 'Brainstorm', prompt: 'Facciamo brainstorming: quali elementi mancano al mio worldbuilding?' },
      ],
      structure: [
        { icon: 'git-branch', label: 'Sviluppa trama', prompt: 'Aiutami a sviluppare una linea narrativa con inizio, sviluppo e climax.' },
        { icon: 'list', label: 'Suggerisci scene', prompt: 'Basandoti sulla struttura attuale, suggerisci 3 scene che potrebbero mancare.' },
        { icon: 'zap', label: 'Colpo di scena', prompt: 'Proponi un colpo di scena inaspettato ma coerente con la trama.' },
      ],
      writing: [
        { icon: 'pen-tool', label: 'Continua scena', prompt: 'Continua la scena attuale mantenendo tono e stile.' },
        { icon: 'message-circle', label: 'Scrivi dialogo', prompt: 'Scrivi un dialogo naturale tra i personaggi presenti nella scena.' },
        { icon: 'eye', label: 'Descrivi ambiente', prompt: 'Aggiungi una descrizione evocativa dell\'ambiente della scena attuale.' },
        { icon: 'heart', label: 'Aggiungi emozione', prompt: 'Intensifica l\'impatto emotivo della scena attuale.' },
      ],
      editing: [
        { icon: 'edit-3', label: 'Riscrivi passaggio', prompt: 'Riscrivi il passaggio selezionato migliorando lo stile.' },
        { icon: 'scissors', label: 'Taglia per conciso', prompt: 'Riduci il passaggio mantenendo le informazioni essenziali.' },
        { icon: 'maximize', label: 'Espandi dettagli', prompt: 'Espandi il passaggio con più dettagli sensoriali e descrittivi.' },
        { icon: 'check-circle', label: 'Correggi tono', prompt: 'Verifica e correggi il tono del passaggio per coerenza con il resto.' },
      ],
      analysis: [
        { icon: 'bar-chart', label: 'Analizza pacing', prompt: 'Analizza il ritmo narrativo e suggerisci miglioramenti.' },
        { icon: 'users', label: 'Analizza personaggi', prompt: 'Valuta la coerenza e lo sviluppo dei personaggi principali.' },
        { icon: 'alert-triangle', label: 'Trova buchi trama', prompt: 'Identifica possibili incongruenze o buchi nella trama.' },
      ],
    };

    const actions = actionsByContext[viewName] || [
      { icon: 'help-circle', label: 'Aiuto generale', prompt: 'Come puoi aiutarmi con la mia storia?' },
    ];

    actionsGrid.innerHTML = actions.map(action => `
      <button class="ai-action-btn flex items-center gap-2 px-2 py-1.5 bg-primary/50 hover:bg-accent/20 border border-white/10 rounded-lg text-xs transition-colors" data-prompt="${this.escapeHtml(action.prompt)}">
        <i data-lucide="${action.icon}" class="w-3 h-3 text-accent"></i>
        <span class="truncate">${action.label}</span>
      </button>
    `).join('');

    // Re-initialize lucide icons
    if (window.lucide) window.lucide.createIcons();

    // Bind click events
    actionsGrid.querySelectorAll('.ai-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.dataset.prompt;
        this.chatInput.value = prompt;
        this.chatInput.focus();
      });
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/"/g, '&quot;');
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
