export class ConsistencyEngine {
    constructor(dataManager, toast, aiService) { // Injected aiService
        this.dataManager = dataManager;
        this.toast = toast;
        this.aiService = aiService;
        this.issues = [];
        this.logHistory = []; // Log buffer persistence
        this.isRunning = false;
        this.aiStatus = 'unknown'; // 'online', 'offline', 'error'
        this.currentProjectId = null;
        this.rules = [
            this.checkGhostCharacters.bind(this),
            this.checkAbandonedPlotlines.bind(this),
            this.checkEmptyScenes.bind(this)
        ];

        // Progress tracking for chunked analysis
        this.analysisProgress = {
            total: 0,
            completed: 0,
            currentScene: null,
            startTime: null,
            isPaused: false
        };
    }

    log(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[ConsistencyEngine] ${msg}`);

        // Persist to history (Last 50)
        const logEntry = { message: msg, type, timestamp };
        this.logHistory.unshift(logEntry); // Newest first
        if (this.logHistory.length > 50) this.logHistory.pop();

        window.dispatchEvent(new CustomEvent('consistency-log', {
            detail: logEntry
        }));
    }

    getLogHistory() {
        return this.logHistory;
    }

    reset() {
        this.issues = [];
        this.isRunning = false;
        this.currentProjectId = null;
        this.broadcastIssues();
        this.broadcastProgress('idle'); // Clear indicator
        console.log('[ConsistencyEngine] Reset complete.');
    }

    broadcastProgress(status, message = '', details = '') {
        window.dispatchEvent(new CustomEvent('consistency-progress', {
            detail: { status, message, details }
        }));
    }

    /**
     * Broadcasts detailed progress for scene-by-scene analysis with time estimates
     */
    broadcastDetailedProgress() {
        const elapsed = Date.now() - this.analysisProgress.startTime;
        const avgPerScene = this.analysisProgress.completed > 0
            ? elapsed / this.analysisProgress.completed
            : 30000; // default 30s estimate per scene
        const remaining = (this.analysisProgress.total - this.analysisProgress.completed) * avgPerScene;

        window.dispatchEvent(new CustomEvent('analysis-progress', {
            detail: {
                ...this.analysisProgress,
                elapsedMs: elapsed,
                estimatedRemainingMs: remaining
            }
        }));
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
            this.currentProjectId = projectId; // Ensure this is set for checkpoints!
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

            for (let i = 0; i < this.rules.length; i++) {
                const rule = this.rules[i];
                // Notify progress
                this.broadcastProgress('running', `Esecuzione regola ${i + 1}/${this.rules.length}...`, 'Analisi coerenza in corso');

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
            this.broadcastProgress('complete', 'Analisi completata', `${this.issues.length} problemi trovati`);
            setTimeout(() => this.broadcastProgress('idle'), 3000); // Hide after 3s

        } catch (error) {
            console.error('[ConsistencyEngine] Error during audit:', error);
            this.aiStatus = 'error';
            this.broadcastIssues();
            this.broadcastProgress('error', 'Errore durante l\'analisi', error.message);
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
        this.aiStatus = 'loading'; // Signal UI that we are working
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

            // 3. Reset AI status to indicate completion
            this.aiStatus = 'online';
            this.broadcastIssues(); // Re-broadcast with updated status
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
        let aiConfigured = false;
        try {
            // We check settings but we ONLY run AI if forceAI is true
            const config = await this.dataManager.getSettings();
            // Fix: Ollama might not have a key, so check provider/url too
            if (config.aiApiKey || config.geminiKey || config.openaiKey || (config.aiProvider === 'ollama' && config.aiBaseUrl)) {
                aiConfigured = true;
            }
        } catch (e) { }

        // PHASE 1: BATCH EXTRACTION (No Saving)
        // Accumulate raw entities from all scenes
        const rawEntitiesBatch = []; // [{ sceneId, entities: [] }]
        let scenesUpdatedCount = 0;

        // Initialize progress tracking
        const scenesToAnalyze = context.scenes.filter(s => s.content && s.content.length >= 50);
        this.analysisProgress = {
            total: scenesToAnalyze.length,
            completed: 0,
            currentScene: null,
            startTime: Date.now(),
            isPaused: false,
            isActive: false  // Will be set to true when first scene analysis starts
        };
        // Don't broadcast yet - wait until analysis actually starts

        for (const scene of context.scenes) {
            if (!scene.content || scene.content.length < 50) continue;

            const sceneHash = this.computeHash(scene.content);
            const needsAnalysis = scene.contentHash !== sceneHash || !scene.extractedEntities || scene.extractedEntities.length === 0;

            // Decide if we run analysis
            if (needsAnalysis || (forceAI && scene.extractionSource !== 'ai')) {
                let sceneEntities = [];
                let source = 'heuristic';

                // Try AI
                if (forceAI && aiConfigured) {
                    try {
                        // Update progress tracking - mark as active on first scene
                        if (!this.analysisProgress.isActive) {
                            this.analysisProgress.isActive = true;
                            this.analysisProgress.startTime = Date.now(); // Reset timer on actual start
                        }
                        this.analysisProgress.currentScene = scene.title;
                        this.broadcastDetailedProgress();

                        this.log(`[Consistency] Analisi AI (${scene.title}) [${this.analysisProgress.completed + 1}/${this.analysisProgress.total}]...`, 'info');
                        this.broadcastProgress('running', `Analisi AI: ${scene.title} (${this.analysisProgress.completed + 1}/${this.analysisProgress.total})`, 'Estrazione entità in corso...');

                        const result = await this.analyzeSceneWithAI(scene.content, context.projectTitle, true); // worker=true
                        if (result) {
                            sceneEntities = result;
                            source = 'ai';
                        }

                        // Increment completed count after successful analysis
                        this.analysisProgress.completed++;
                        this.broadcastDetailedProgress();
                    } catch (e) {
                        console.error(`AI Analysis failed for ${scene.title}`, e);
                        // Fallback to empty if AI fails but was forced? Or heuristic?
                        // If forced, we skip heuristic to avoid pollution.
                        source = 'error';
                    }
                } else if (needsAnalysis && (!forceAI || !aiConfigured)) {
                    // Heuristic fallback
                    sceneEntities = this.analyzeSceneHeuristic(scene.content);
                    source = 'heuristic';
                }

                if (source !== 'error') {
                    // --- CHECKPOINT SAVE (Salvataggio Incrementale) ---
                    // Salviamo subito per evitare perdita dati in caso di crash/reload
                    scene.extractedEntities = sceneEntities;
                    scene.extractionSource = source;
                    scene.contentHash = sceneHash;
                    await this.dataManager.saveProjectItem(this.currentProjectId, 'scenes', scene);

                    rawEntitiesBatch.push({
                        scene,                // Reference to modify later (phase 3)
                        entities: sceneEntities,
                        source,
                        newHash: sceneHash
                    });
                    scenesUpdatedCount++;
                }
            } else {
                // If no analysis needed, we still might want to include existing entities for Global Consolidation?
                // Yes, otherwise we miss context from unchanged scenes.
                if (scene.extractedEntities) {
                    rawEntitiesBatch.push({
                        scene,
                        entities: scene.extractedEntities,
                        source: scene.extractionSource || 'previous',
                        newHash: sceneHash,
                        skippedAnalysis: true // Flag to skip save if not needed
                    });
                }
            }
        }

        // PHASE 2: CONSOLIDATION (AI or Merging)
        // We have all entities. Now we consolidate them.
        this.broadcastProgress('running', 'Consolidamento Dati', 'Unificazione duplicati e categorizzazione...');

        let allEntitiesFlat = [];
        rawEntitiesBatch.forEach(item => {
            // Add scene context to each entity
            item.entities.forEach(e => {
                allEntitiesFlat.push({ ...e, sceneId: item.scene.id });
            });
        });

        // If we have new analyses (forceAI), we run the Global Consolidator
        // To avoid HUGE tokens, we might skip this if too many entities, or do it smart.
        // For now, let's implement the logic requested: AI Cleanup.

        let consolidatedMap = new Map(); // Name -> { type, ... }

        if (forceAI && aiConfigured && allEntitiesFlat.length > 0) {
            try {
                this.log(`[Consistency] Consolidamento Finale (${allEntitiesFlat.length} entità grezze)...`);
                const consolidatedList = await this.consolidateEntitiesWithAI(allEntitiesFlat);

                // Build a map for quick lookup
                consolidatedList.forEach(c => {
                    // c should have { name, type, originalNames: [] }
                    // Map ALL original names to this consolidated entry
                    if (c.originalNames) {
                        c.originalNames.forEach(orig => consolidatedMap.set(orig.toLowerCase(), c));
                    }
                    consolidatedMap.set(c.name.toLowerCase(), c);
                });

            } catch (e) {
                console.warn("[Consistency] Consolidation failed, using raw data.", e);
            }
        }

        // PHASE 3: COMMIT & REPORT
        this.broadcastProgress('running', 'Salvataggio', 'Aggiornamento database...');

        // Prepare list of known database items for Ghost Detection
        const knownNames = new Set([
            ...characters.map(c => c.name.toLowerCase()),
            ...locations.map(l => l.name.toLowerCase()),
            ...objects.map(o => o.name.toLowerCase()),
            ...systems.map(s => s.name.toLowerCase())
        ]);


        // Apply back to scenes
        for (const batchItem of rawEntitiesBatch) {
            const { scene, entities, source, newHash, skippedAnalysis } = batchItem;

            // If we have consolidated data, refuse the entities
            let finalEntities = entities;

            if (consolidatedMap.size > 0) {
                finalEntities = entities.map(e => {
                    const cons = consolidatedMap.get(e.name.toLowerCase());
                    if (cons) {
                        return {
                            name: cons.name, // Use canonical name
                            type: cons.type,
                            role: cons.role || e.role,
                            description: cons.description || e.description
                        };
                    }
                    return e;
                });
            }

            // Save if modified
            if (!skippedAnalysis) {
                scene.extractedEntities = finalEntities;
                scene.extractionSource = source;
                scene.contentHash = newHash;
                await this.dataManager.saveScene(scene);
            }

            // Detect Ghosts (Validation)
            // Use finalEntities logic
            finalEntities.forEach(entity => {
                const canonName = entity.name;
                const lowerName = canonName.toLowerCase();

                if (!knownNames.has(lowerName)) {
                    const existingIssue = issues.find(i => i.data.name.toLowerCase() === lowerName);
                    if (existingIssue) {
                        existingIssue.data.count++;
                        existingIssue.message = `"${canonName}" appare in più scene (${existingIssue.data.count}). Non è nel database.`;
                    } else {
                        issues.push({
                            type: 'ghost_character',
                            severity: 'info',
                            projectName: context.projectTitle,
                            projectId: context.projectId,
                            source: source || 'unknown',
                            message: `"${canonName}" rilevato ma non nel database.`,
                            data: { name: canonName, type: entity.type || 'Entità', count: 1 }
                        });
                    }
                }
            });
        }

        // Broadcast that analysis is complete (to hide progress panel)
        this.analysisProgress.isActive = false;
        this.analysisProgress.currentScene = null;
        this.broadcastDetailedProgress();

        return issues;
    }

    async consolidateEntitiesWithAI(flatEntityList) {
        if (!this.aiService) return [];
        // Limit list size to avoid context overflow (approx 1000 items max for now)
        const uniqueNames = [...new Set(flatEntityList.map(e => e.name))];
        if (uniqueNames.length === 0) return [];
        if (uniqueNames.length > 500) {
            console.warn("Too many entities for atomic consolidation. Skipping AI consolidation.");
            return []; // Fallback to raw
        }

        try {
            // Use Background Worker for Consolidation to enable Streaming & Progress Feedback
            // The prompt logic is now inside ai.worker.js (type='consolidation')
            const resultRaw = await this.aiService.analyzeBackground(JSON.stringify(uniqueNames), 'consolidation');

            // Result should be the raw JSON string (or text containing JSON)
            console.log("Consolidation AI Output (Raw):", resultRaw);
            let jsonString = resultRaw.replace(/```json|```/g, '').trim();

            const firstBracket = jsonString.indexOf('[');
            const lastBracket = jsonString.lastIndexOf(']');
            if (firstBracket !== -1 && lastBracket !== -1) {
                jsonString = jsonString.substring(firstBracket, lastBracket + 1);
                return JSON.parse(jsonString);
            }
            return [];

        } catch (e) {
            console.error("Consolidation Error:", e);
            throw e;
        }
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

    async analyzeSceneWithAI(text, projectTitle = '', useWorker = false) {
        if (!this.aiService) return null;
        if (text.length < 50) return null;

        // WORKER PATH (TOON Protocol)
        if (useWorker) {
            try {
                this.log("Accodamento al Worker...", 'info');
                // analyzeBackground ritorna direttamente oggetto TOON: { c:[], l:[], ... }
                const toonData = await this.aiService.analyzeBackground(text, 'extraction');

                if (!toonData) return null;

                // Converter TOON -> Consistency Entity Format [{name, type}]
                // Il motore di consistenza per ora vuole un array piatto semplice per il controllo ghost
                const entities = [];

                // Map Characters (c)
                if (Array.isArray(toonData.c)) {
                    toonData.c.forEach(x => {
                        if (x.n) entities.push({ name: x.n, type: 'Personaggio', role: x.r, description: x.d });
                    });
                }
                // Map Locations (l)
                if (Array.isArray(toonData.l)) {
                    toonData.l.forEach(x => {
                        if (x.n) entities.push({ name: x.n, type: 'Luogo', description: x.d });
                    });
                }
                // Map Objects (o)
                if (Array.isArray(toonData.o)) {
                    toonData.o.forEach(x => {
                        if (x.n) entities.push({ name: x.n, type: 'Oggetto', description: x.d });
                    });
                }
                // Map Systems/Culture (k) -> Sistema
                if (Array.isArray(toonData.k)) {
                    toonData.k.forEach(x => {
                        if (x.n) entities.push({ name: x.n, type: 'Sistema', description: x.d });
                    });
                }

                return entities;

            } catch (err) {
                console.error("Worker Error:", err);
                this.log("Errore Worker: " + err.message, 'error');
                throw err; // Propagate to block heuristic fallback
            }
        }

        // LEGACY PATH (Direct Chat)
        // ... (Vecchio codice se useWorker false, mantenuto per compatibilità)
        const prompt = `
        TASK: Extract Named Entities from the text below as a JSON Array.
        RULES:Output ONLY JSON. Detect: Person (Personaggio), Place (Luogo), Object (Oggetto).
        TEXT: ${text.substring(0, 4000)} 
        `;

        try {
            const response = await this.aiService.chat({
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1
            });
            // ... (simple parsing logica esistente o semplificata)
            let jsonString = response.text.replace(/```json|```/g, '').trim();
            const firstBracket = jsonString.indexOf('[');
            const lastBracket = jsonString.lastIndexOf(']');
            if (firstBracket !== -1 && lastBracket !== -1) {
                jsonString = jsonString.substring(firstBracket, lastBracket + 1);
                return JSON.parse(jsonString);
            }
            return null;
        } catch (error) {
            console.error('[Consistency] Legacy AI Error:', error);
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
