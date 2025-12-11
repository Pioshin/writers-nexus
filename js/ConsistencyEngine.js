export class ConsistencyEngine {
    constructor(dataManager, toast, aiService) { // Injected aiService
        this.dataManager = dataManager;
        this.toast = toast;
        this.aiService = aiService;
        this.issues = [];
        this.isRunning = false;
        this.rules = [
            this.checkGhostCharacters.bind(this),
            this.checkAbandonedPlotlines.bind(this),
            this.checkEmptyScenes.bind(this)
        ];
    }

    init() {
        // Listen for data changes to re-run checks
        window.addEventListener('datachanged', () => this.scheduleRun());
        // Initial run
        setTimeout(() => this.run(), 2000);
    }

    scheduleRun() {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.run(), 5000); // 5s debounce
    }

    async run() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.issues = [];
        console.log('[ConsistencyEngine] Starting audit...');

        try {
            const projectId = await this.dataManager.getCurrentProjectId();
            if (!projectId) {
                this.isRunning = false;
                return;
            }

            const [scenes, characters, locations, objects, systems, plotlines] = await Promise.all([
                this.dataManager.getProjectItems(projectId, 'scenes'),
                this.dataManager.getProjectItems(projectId, 'characters'),
                this.dataManager.getProjectItems(projectId, 'locations'),
                this.dataManager.getProjectItems(projectId, 'objects'),
                this.dataManager.getProjectItems(projectId, 'systems'),
                this.dataManager.getProjectItems(projectId, 'plotlines')
            ]);

            const project = await this.dataManager.getProject(projectId); // Fetch project details
            const context = { scenes, characters, locations, objects, systems, plotlines, projectId, projectTitle: project.title };

            for (const rule of this.rules) {
                const ruleIssues = await rule(context);
                if (ruleIssues && ruleIssues.length) {
                    // Attach project name to each issue
                    const enrichedIssues = ruleIssues.map(i => ({ ...i, projectName: project.title, projectId: project.id }));
                    this.issues.push(...enrichedIssues);
                }
            }

            this.broadcastIssues();
        } catch (error) {
            console.error('[ConsistencyEngine] Error during audit:', error);
        } finally {
            this.isRunning = false;
        }
    }

    broadcastIssues() {
        console.log('[ConsistencyEngine] Audit complete. Issues:', this.issues.length);
        const event = new CustomEvent('consistency-issues-updated', { detail: { issues: this.issues } });
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

    async checkGhostCharacters(context) {
        const issues = [];
        const { scenes, characters, locations, objects, systems } = context;

        // 1. Build a Set of known names (normalized)
        const knownNames = new Set([
            ...characters.map(c => c.name.toLowerCase()),
            ...locations.map(l => l.name.toLowerCase()),
            ...objects.map(o => o.name.toLowerCase()),
            ...systems.map(s => s.name.toLowerCase())
        ]);

        // 2. Iterate scenes and perform AI Analysis if needed
        for (const scene of scenes) {
            if (!scene.content || scene.content.length < 50) continue;

            const sceneHash = this.computeHash(scene.content);
            let entities = scene.extractedEntities || [];

            // Incremental Check: If hash changed or no entities, Re-Analyze
            if (scene.contentHash !== sceneHash || !scene.extractedEntities || scene.extractedEntities.length === 0) {
                try {
                    console.log(`[Consistency] Analyzing scene "${scene.title}" with AI...`);
                    entities = await this.analyzeSceneWithAI(scene.content);

                    // FALLBACK: If AI returns null (meaning it failed or wasn't available), use heuristic
                    if (entities === null) {
                        console.warn(`[Consistency] AI unavailable. Falling back to Heuristic for "${scene.title}"`);
                        entities = this.analyzeSceneHeuristic(scene.content);
                    }

                    // Persist results
                    scene.extractedEntities = entities;
                    scene.contentHash = sceneHash;
                    await this.dataManager.saveScene(context.projectId, scene); // Ensure saveScene supports ID or object
                } catch (err) {
                    console.warn(`[Consistency] Analysis failed for scene ${scene.title}:`, err);
                    // Fallback to heuristic on crash
                    entities = this.analyzeSceneHeuristic(scene.content);
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
                            message: `"${entity.name}" rilevato nel testo ma non nel database.`,
                            data: { name: entity.name, type: entity.type || 'Entità', count: 1 }
                        });
                    }
                }
            });
        }

        return issues;
    }

    async analyzeSceneWithAI(text) {
        if (!this.aiService) return null; // Signal fallback

        // Short-circuit if text is too short for AI to be useful
        if (text.length < 50) return null;

        const prompt = `
        Analizza il seguente testo narrativo ed estrai un elenco JSON delle entità uniche menzionate.
        Categorie: Personaggio, Luogo, Oggetto, Sistema.
        Ignora nomi comuni, pronomi (es. "Lui", "Lei") o parole generiche. Estrai solo Nomi Propri rilevanti.
        Se non trovi nulla, restituisci array vuoto [].
        
        Output atteso (array JSON puro):
        [{"name": "Nome", "type": "Personaggio"}, {"name": "Luogo", "type": "Luogo"}]

        TESTO:
        ${text.substring(0, 4000)} 
        `;

        try {
            const response = await this.aiService.chat([
                { role: 'system', content: 'Sei un analista letterario esperto in Named Entity Recognition. Rispondi solo con JSON.' },
                { role: 'user', content: prompt }
            ], { jsonMode: true });

            const jsonStr = response.content.match(/\[.*\]/s)?.[0];
            if (!jsonStr) return null; // Parse error -> Fallback
            return JSON.parse(jsonStr);
        } catch (e) {
            console.error("AI Analysis Error:", e);
            return null; // Error -> Fallback
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
            'Mio', 'Tuo', 'Suo', 'Nostro', 'Vostro', 'Loro', 'Mia', 'Tua', 'Sua', 'Nostra', 'Vostra',
            'Qui', 'Qua', 'Lì', 'Là', 'Su', 'Giù', 'Dentro', 'Fuori',
            'Eccolo', 'Eccola', 'Disse', 'Rispose', 'Signore', 'Signora', 'Re', 'Regina', 'C', 'Era'
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
