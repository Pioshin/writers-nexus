export class ConsistencyEngine {
    constructor(dataManager, toast, aiService) { // Injected aiService
        this.dataManager = dataManager;
        this.toast = toast;
        this.aiService = aiService;
        this.issues = [];
        this.isRunning = false;
        this.aiStatus = 'unknown'; // 'online', 'offline', 'error'
        this.currentProjectId = null;
        this.rules = [
            this.checkGhostCharacters.bind(this),
            this.checkAbandonedPlotlines.bind(this),
            this.checkEmptyScenes.bind(this)
        ];
    }

    log(msg, type = 'info') {
        console.log(`[ConsistencyEngine] ${msg}`);
        window.dispatchEvent(new CustomEvent('consistency-log', {
            detail: { message: msg, type, timestamp: new Date().toLocaleTimeString() }
        }));
    }

    reset() {
        this.issues = [];
        this.isRunning = false;
        this.currentProjectId = null;
        this.broadcastIssues();
        console.log('[ConsistencyEngine] Reset complete.');
    }

    init() {
        // Listen for data changes to re-run checks
        // window.addEventListener('datachanged', () => this.scheduleRun());
        // Initial run
        // setTimeout(() => this.run(), 2000);
        console.log('[ConsistencyEngine] Init complete. Auto-run disabled (using Manual/MemVid only).');
    }

    scheduleRun() {
        // if (this.debounceTimer) clearTimeout(this.debounceTimer);
        // this.debounceTimer = setTimeout(() => this.run(), 5000); // 5s debounce
    }

    async run(options = {}) {
        const forceAI = options.forceAI || false;

        if (this.isRunning) return;
        this.isRunning = true;
        this.issues = [];
        console.log(`[ConsistencyEngine] Starting audit (AI Forced: ${forceAI})...`);

        try {
            // ... existing setup ...
            const projectId = await this.dataManager.getCurrentProjectId();
            // ... 

            // ... fetching logic ...
            const [scenes, characters, locations, objects, systems, plotlines] = await Promise.all([
                this.dataManager.getProjectItems(projectId, 'scenes'),
                this.dataManager.getProjectItems(projectId, 'characters'),
                this.dataManager.getProjectItems(projectId, 'locations'),
                this.dataManager.getProjectItems(projectId, 'objects'),
                this.dataManager.getProjectItems(projectId, 'systems'),
                this.dataManager.getProjectItems(projectId, 'plotlines')
            ]);

            const project = await this.dataManager.getProject(projectId);
            // ...

            const context = { scenes, characters, locations, objects, systems, plotlines, projectId, projectTitle: project.title };

            for (const rule of this.rules) {
                // Pass forceAI to rules
                const ruleIssues = await rule(context, forceAI);
                if (ruleIssues && ruleIssues.length) {
                    // ... existing aggregation ...
                    const enrichedIssues = ruleIssues.map(i => ({
                        ...i,
                        projectName: project.title,
                        projectId: project.id
                    }));
                    this.issues.push(...enrichedIssues);
                }
            }

            this.broadcastIssues();
        } catch (error) {
            console.error('[ConsistencyEngine] Error during audit:', error);
            this.aiStatus = 'error';
            this.broadcastIssues();
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Forces a complete re-analysis by clearing cached results for all scenes.
     */
    async forceReanalysis() {
        if (this.isRunning) {
            this.toast('Analisi già in corso...', 'warning');
            return;
        }

        this.toast('Riavvio analisi forzato. Potrebbe richiedere tempo...', 'info');
        console.log('[ConsistencyEngine] Force Re-analysis triggered.');

        // VISUAL CLEANUP: Clear valid issues immediately
        this.issues = [];
        this.broadcastIssues();

        try {
            const projectId = await this.dataManager.getCurrentProjectId();
            if (!projectId) return;

            // 1. Clear cache for ALL scenes
            const scenes = await this.dataManager.getProjectItems(projectId, 'scenes');
            // We need to update them one by one or batch. DataManager might not have batch update.
            // Let's assume we iterate and save.
            const updates = scenes.map(scene => {
                scene.extractedEntities = null; // Clear entities
                scene.contentHash = null;       // Clear hash to force re-scan
                return this.dataManager.saveScene(scene);
            });

            await Promise.all(updates);
            console.log('[ConsistencyEngine] Cache cleared. Restarting run...');

            // 2. Run immediately
            await this.run({ forceAI: true });
            this.toast('Analisi completata!', 'success');

        } catch (e) {
            console.error('[ConsistencyEngine] Force run failed:', e);
            this.toast('Errore durante il riavvio dell\'analisi', 'error');
        }
    }

    broadcastIssues() {
        console.log(`[ConsistencyEngine] Audit complete. Issues: ${this.issues.length} | AI Status: ${this.aiStatus}`);
        const event = new CustomEvent('consistency-issues-updated', {
            detail: {
                issues: this.issues,
                aiStatus: this.aiStatus
            }
        });
        window.dispatchEvent(event);

        // Update UI Badge directly if existing
        const badge = document.getElementById('consistency-badge');
        if (badge) {
            if (this.issues.length > 0) {
                badge.classList.remove('hidden');
                badge.textContent = this.issues.length;
            } else {
                badge.classList.add('hidden');
            }
        }
    }

    // --- RULES ---

    async checkGhostCharacters(context, forceAI = false) {
        const issues = [];
        const { scenes, characters, locations, objects, systems } = context;

        // 1. Build a Set of known names (normalized)
        const knownNames = new Set([
            ...characters.map(c => c.name.toLowerCase()),
            ...locations.map(l => l.name.toLowerCase()),
            ...objects.map(o => o.name.toLowerCase()),
            ...systems.map(s => s.name.toLowerCase())
        ]);

        // 2. Iterate scenes
        let aiConfigured = false;
        try {
            // We check settings but we ONLY run AI if forceAI is true
            const config = await this.dataManager.getSettings();
            if (config.aiApiKey || config.geminiKey || config.openaiKey) aiConfigured = true;
        } catch (e) { }

        for (const scene of context.scenes) {
            if (!scene.content || scene.content.length < 50) continue;

            let entities = scene.extractedEntities;
            let source = scene.extractionSource;

            // Only re-analyze if content changed OR if we are forcing AI
            // AND if forceAI is true. If forceAI is false, we try heuristic if no entities exist.
            const sceneHash = this.computeHash(scene.content);
            const needsAnalysis = scene.contentHash !== sceneHash || !entities || entities.length === 0;

            if (needsAnalysis || (forceAI && source !== 'ai')) {
                // DEFAULT: HEURISTIC
                source = 'heuristic';

                // AI TRIGGER: Only if explicitly forced AND configured
                if (forceAI && aiConfigured) {
                    try {
                        console.log(`[Consistency] Manual AI Analysis triggered for "${scene.title}"...`);
                        const result = await this.analyzeSceneWithAI(scene.content, context.projectTitle);
                        if (result) {
                            entities = result;
                            source = 'ai';
                            // RATE LIMITING: Wait 10 seconds between checks to avoid 429 Google AI errors (Quota: 5/min approx)
                            // Only wait if we actually called the AI
                            this.log("Attesa rispetto quota API (5s)...", 'info');
                            await new Promise(resolve => setTimeout(resolve, 5000));
                        } else {
                            // Fallback if AI returned null (quota/error)
                            entities = this.analyzeSceneHeuristic(scene.content);
                        }
                    } catch (e) {
                        console.warn("AI Manual Trigger Failed:", e);
                        entities = this.analyzeSceneHeuristic(scene.content);
                    }
                } else if (!entities || needsAnalysis) {
                    // Always fallback to heuristic for automatic runs
                    // console.log(`[Consistency] Auto-Audit (Heuristic) for "${scene.title}"`);
                    entities = this.analyzeSceneHeuristic(scene.content);
                }

                if (entities) {
                    scene.extractedEntities = entities; // Should we store source too? Yes but simplifying for now.
                    scene.extractionSource = source; // Store source
                    scene.contentHash = sceneHash;
                    await this.dataManager.saveScene(scene);
                }
            }

            // 3. Compare extracted entities with known DB
            entities.forEach(entity => {
                if (!knownNames.has(entity.name.toLowerCase())) {
                    // Check if already reported for this check run to avoid duplicates across scenes?
                    // No, usually we want to know *where* it appears, but for the dashboard summary we might group.
                    // For now, let's just push unique issues per entity name to avoid spamming the user with 50 alerts for "Terrax"

                    const existingIssue = issues.find(i => i.data.name.toLowerCase() === entity.name.toLowerCase());
                    if (existingIssue) {
                        existingIssue.data.count++;
                        existingIssue.message = `"${existingIssue.data.name}" appare in più scene (${existingIssue.data.count}). Non è nel database.`;
                    } else {
                        issues.push({
                            type: 'ghost_character',
                            severity: 'info',
                            projectName: context.projectTitle, // Added context
                            projectId: context.projectId,
                            source: scene.extractionSource || 'unknown',
                            message: `"${entity.name}" rilevato nel testo ma non nel database.`,
                            data: { name: entity.name, type: entity.type || 'Entità', count: 1 }
                        });
                    }
                }
            });
        }

        return issues;
    }

    async analyzeVideoMemory(fileData) {
        if (!this.aiService) return;

        this.toast('Analisi MemVid avviata. Potrebbe richiedere 1-2 minuti...', 'info');
        console.log(`[Consistency] Analyzing MemVid (${(fileData.size / 1024 / 1024).toFixed(2)} MB)...`);
        this.isRunning = true;
        this.aiStatus = 'online';

        try {
            const prompt = `
            STRUTTURA MANOSCRITTO (MEMVID DECODING):
            Questo video contiene i dati codificati dell'intero manoscritto.
            Analizza il contenuto visuale/testuale e estrai TUTTE le Entità Nominate (Personaggi, Luoghi, Oggetti, Sistemi) menzionate nella narrazione.

            FORMATO OUTPUT RICHIESTO (Unico JSON Array):
            [
              {"name": "Nome", "type": "Personaggio", "context": "Descrizione breve..."},
              ...
            ]
            `;

            const response = await this.aiService.chat({
                messages: [
                    { role: 'user', content: prompt }
                ],
                inlineData: {
                    data: fileData.data,
                    mimeType: fileData.mimeType
                },
                maxTokens: 100000 // High output limit (Flash supports it)
            });

            const entities = this.parseAIResponse(response);
            if (entities) {
                this.log(`Analisi MemVid completata! Trovate ${entities.length} entità.`, 'success');
                // Here we would ideally merge with DB. For now, create specific "MemVid Issues".
                // Or better: update all scenes? 
                // Updating entire project consistency map.
                this.issues = entities.map(e => ({
                    type: 'memvid_found',
                    severity: 'info',
                    message: `Entità MemVid: ${e.name} (${e.type})`,
                    data: e
                }));
                this.broadcastIssues();
                this.toast('MemVid analizzato con successo!', 'success');
            } else {
                this.log("Nessuna entità trovata nel MemVid.", 'warning');
                this.toast('Analisi completata ma nessun dato estratto.', 'warning');
            }

        } catch (e) {
            console.error("MemVid Error:", e);
            this.log(`Errore Analisi MemVid: ${e.message}`, 'error');
            this.toast('Errore analisi video (forse troppo grande?)', 'error');
        } finally {
            this.isRunning = false;
        }
    }

    async analyzeSceneWithAI(text, projectTitle = '') {
        if (!this.aiService) return null;

        // Short-circuit if text is too short
        if (text.length < 50) return null;

        this.log(`Analisi scena "${projectTitle ? projectTitle : '...'}" (len: ${text.length}) avviata...`);
        const prompt = `
        TASK: Extract Named Entities from the text below as a JSON Array.
        
        RULES:
        1. OUTPUT ONLY JSON. NO intro, NO markdown.
        2. Detect: Person (Personaggio), Place (Luogo), Object (Oggetto), Organization (Sistema).
        3. IGNORE common words (The, A, Look, After).
        4. Context matters: "Terrax" acting = Person. "Terrax" visited = Place.

        EXAMPLE OUTPUT:
        [{"name": "Geralt", "type": "Personaggio"}, {"name": "Rivia", "type": "Luogo"}]

        TEXT:
        ${text.substring(0, 4000)} 
        `;

        try {
            this.log(`Invio richiesta IA...`, 'info');
            // Use low temp for determinstic JSON
            // Note: inlineData is NOT used here (text analysis), only for Video
            const response = await this.aiService.chat({
                messages: [
                    // System prompt simplified and forceful
                    { role: 'system', content: 'You are a JSON Extractor. Output ONLY valid JSON array.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1
            });

            if (!response || !response.text) throw new Error("Risposta vuota dall'IA");

            console.log('[Consistency] Raw AI Response:', response.text); // DEBUG RAW log in browser

            // CLEANUP JSON (Robust for Ollama/Local LLMs)
            let jsonString = response.text.trim();
            // 1. Remove Markdown code fences
            if (jsonString.includes('```')) {
                jsonString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
            }

            // 2. Locate the Array Brackets [] to ignore conversational filler
            const firstBracket = jsonString.indexOf('[');
            const lastBracket = jsonString.lastIndexOf(']');
            if (firstBracket !== -1 && lastBracket !== -1) {
                jsonString = jsonString.substring(firstBracket, lastBracket + 1);
            } else {
                this.log("ERRORE: Nessun JSON array trovato nella risposta raw.", 'error');
                console.warn("Invalid JSON structure:", response.text);
                return null;
            }

            try {
                return JSON.parse(jsonString);
            } catch (pError) {
                console.error('[Consistency] JSON Parse Error. Cleaned:', jsonString);
                this.log(`Errore parsing JSON: ${pError.message}`, 'error');
                return null;
            }

        } catch (error) {
            console.error('[Consistency] AI Analysis Runtime Error:', error);
            this.log(`Errore API IA: ${error.message}`, 'error');
            // If it's a 429/Quota error, return null to signal quota exhaustion
            if (error.message.includes('429') || error.message.includes('Quota')) {
                this.log("QUOTA SUPERATA / RATE LIMIT.", 'warning');
            }
            return null;
        }
    }

    analyzeSceneHeuristic(text) {
        // The old regex logic, but formatted to return [{name, type}]
        const candidates = [];
        const seen = new Set();

        const stopWords = new Set([
            'Il', 'Lo', 'La', 'I', 'Gli', 'Le', 'Un', 'Uno', 'Una', 'Del', 'Dello', 'Della', 'Dei', 'Degli', 'Delle',
            'Al', 'Allo', 'Alla', 'Ai', 'Agli', 'Alle', 'Dal', 'Dallo', 'Dalla', 'Dai', 'Dagli', 'Dalle',
            'Nel', 'Nello', 'Nella', 'Nei', 'Negli', 'Nelle', 'Col', 'Coi', 'Sul', 'Sullo', 'Sulla', 'Sui', 'Sugli', 'Sulle',
            'Di', 'A', 'Da', 'In', 'Con', 'Su', 'Per', 'Tra', 'Fra',
            'Ma', 'Però', 'Quindi', 'E', 'O', 'Se', 'Sì', 'Si', 'No', 'Non', 'Che', 'Chi', 'Cosa', 'Dove', 'Quando', 'Perché', 'Come',
            'Tutto', 'Tutti', 'Tutta', 'Tutte', 'Niente', 'Nulla', 'Qualche', 'Alcuni', 'Molti', 'Pochi',
            'Io', 'Tu', 'Lui', 'Lei', 'Noi', 'Voi', 'Loro', 'Esso', 'Essa', 'Essi', 'Esse',
            'Mio', 'Tuo', 'Suo', 'Nostra', 'Vostro', 'Loro', 'Mia', 'Tua', 'Sua', 'Nostra', 'Vostra',
            'Qui', 'Qua', 'Lì', 'Là', 'Su', 'Giù', 'Dentro', 'Fuori', 'Sopra', 'Sotto', 'Dietro', 'Davanti',
            'Eccolo', 'Eccola', 'Disse', 'Rispose', 'Signore', 'Signora', 'Re', 'Regina', 'C', 'Era',
            'Dopo', 'Prima', 'Durante', 'Mentre', 'Verso', 'Oltre', 'Presso', 'Intanto', 'Infine', 'Tuttavia', 'Allora', 'Inoltre'
        ]);

        const matches = text.match(/\b[A-Z][a-zàèéìòù]{2,}\b/g) || [];

        const counts = {};
        matches.forEach(word => {
            const clean = word.trim();
            if (!stopWords.has(clean)) {
                counts[clean] = (counts[clean] || 0) + 1;
            }
        });

        // Filter by frequency (>= 3)
        Object.entries(counts).forEach(([name, count]) => {
            if (count >= 3) {
                if (!seen.has(name.toLowerCase())) {
                    candidates.push({ name: name, type: 'Entità (Auto)' }); // Generic type
                    seen.add(name.toLowerCase());
                }
            }
        });

        return candidates;
    }

    computeHash(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString();
    }

    async checkAbandonedPlotlines({ scenes, plotlines }) {
        const issues = [];
        plotlines.forEach(pl => {
            const hasBeats = pl.beats && pl.beats.length > 0;
            // A plotline is abandoned if it has no beats mapped to scenes, or keywords never appear
            // Check keywords presence if beats are empty
            let isPresent = false;

            if (hasBeats) {
                // Check if at least one beat is assigned to a scene
                isPresent = pl.beats.some(b => b.sceneIds && b.sceneIds.length > 0);
            } else {
                // Fallback to keyword search
                const keywords = [pl.name, ...(pl.keywords || [])];
                const regex = new RegExp(keywords.join('|'), 'i');
                isPresent = scenes.some(s => regex.test(s.content));
            }

            if (!isPresent) {
                issues.push({
                    type: 'abandoned_plotline',
                    severity: 'info',
                    message: `La linea narrativa "${pl.name}" non sembra essere presente in nessuna scena.`,
                    data: { plotlineId: pl.id }
                });
            }
        });
        return issues;
    }

    async checkEmptyScenes({ scenes }) {
        const issues = [];
        scenes.forEach(s => {
            if (!s.content || s.content.trim().length < 50) {
                issues.push({
                    type: 'empty_scene',
                    severity: 'warning',
                    message: `La scena "${s.title}" è vuota o molto breve.`,
                    data: { sceneId: s.id }
                });
            }
        });
        return issues;
    }
}
