/**
 * AIWorldbuilding - Centralized AI generation service for worldbuilding elements
 * 
 * This service provides AI generation capabilities for:
 * - Characters
 * - Locations
 * - Objects
 * - Systems
 * - Geography
 * - History
 * - Culture
 * 
 * It can work with open modals or independently.
 */

import { AIService } from './AIService.js';
import { DataManager } from '../DataManager.js';
import { toast } from '../views/shared/toast.js';

class AIWorldbuildingService {
    constructor() {
        this.currentElementType = null;
        this.isGenerating = false;
        this.lastOutput = null;
    }

    // ============== ELEMENT TYPE CONFIGURATIONS ==============

    getElementConfig(elementType) {
        const configs = {
            character: {
                displayName: 'Personaggio',
                modalId: 'character-modal',
                fields: ['name', 'role', 'appearance', 'psychology', 'past', 'voice', 'archetype', 'narrativeRole', 'importance'],
                jsonSchema: `{
  "name": string,
  "role": string,
  "appearance": string,
  "psychology": string,
  "past": string,
  "voice": string,
  "archetype": string,
  "narrativeRole": string,
  "importance": string,
  "relationships": [{ "targetName": string, "type": string }]
}`,
                createPrompt: 'Crea un personaggio interessante e coerente con le istruzioni.',
                improvePrompt: 'Migliora/Completa questo personaggio mantenendo i campi già buoni e armonizzando il resto.',
                fieldMapping: {
                    'name': 'char-name',
                    'role': 'char-role',
                    'appearance': 'char-appearance',
                    'psychology': 'char-psychology',
                    'past': 'char-past',
                    'voice': 'char-voice',
                    'archetype': 'char-archetype',
                    'narrativeRole': 'char-narrative-role',
                    'importance': 'char-importance',
                }
            },
            location: {
                displayName: 'Luogo',
                modalId: 'location-modal',
                fields: ['name', 'description', 'history', 'role'],
                jsonSchema: `{
  "name": string,
  "description": string,
  "history": string,
  "role": string
}`,
                createPrompt: 'Crea un luogo narrativo interessante con descrizione, atmosfera e ruolo nella storia.',
                improvePrompt: 'Migliora/Completa questo luogo mantenendo coerenza.',
                fieldMapping: {
                    'name': 'loc-name',
                    'description': 'loc-description',
                    'history': 'loc-history',
                    'role': 'loc-role',
                }
            },
            object: {
                displayName: 'Oggetto',
                modalId: 'object-modal',
                fields: ['name', 'description', 'importance'],
                jsonSchema: `{
  "name": string,
  "description": string,
  "importance": string
}`,
                createPrompt: 'Crea un oggetto narrativo iconico con descrizione, storia e importanza nella trama.',
                improvePrompt: 'Migliora/Completa questo oggetto senza perdere coerenza.',
                fieldMapping: {
                    'name': 'obj-name',
                    'description': 'obj-description',
                    'importance': 'obj-importance',
                }
            },
            system: {
                displayName: 'Sistema',
                modalId: 'system-modal',
                fields: ['name', 'rules', 'role'],
                jsonSchema: `{
  "name": string,
  "rules": string,
  "role": string
}`,
                createPrompt: 'Crea un sistema (magia, tecnologia, ecc.) coerente con regole, costi e limiti.',
                improvePrompt: 'Migliora/Completa questo sistema mantenendo coerenza.',
                fieldMapping: {
                    'name': 'sys-name',
                    'rules': 'sys-rules',
                    'role': 'sys-role',
                }
            },
            geography: {
                displayName: 'Elemento Geografico',
                modalId: 'geography-modal',
                fields: ['name', 'description'],
                jsonSchema: `{
  "name": string,
  "description": string
}`,
                createPrompt: 'Crea un elemento geografico con impatto sul mondo e la trama.',
                improvePrompt: 'Migliora/Completa questo elemento mantenendo coerenza.',
                fieldMapping: {
                    'name': 'geo-name',
                    'description': 'geo-description',
                }
            },
            history: {
                displayName: 'Evento Storico',
                modalId: 'history-modal',
                fields: ['title', 'narration'],
                jsonSchema: `{
  "title": string,
  "narration": string
}`,
                createPrompt: 'Crea un evento storico o leggenda coerente col mondo.',
                improvePrompt: 'Migliora/Completa questo elemento mantenendo coerenza.',
                fieldMapping: {
                    'title': 'hist-title',
                    'narration': 'hist-narration',
                }
            },
            culture: {
                displayName: 'Elemento Culturale',
                modalId: 'culture-modal',
                fields: ['name', 'details'],
                jsonSchema: `{
  "name": string,
  "details": string
}`,
                createPrompt: 'Crea un elemento culturale completo (ruoli, valori, rituali, conflitti interni).',
                improvePrompt: 'Migliora/Completa questo elemento mantenendo coerenza.',
                fieldMapping: {
                    'name': 'cult-name',
                    'details': 'cult-details',
                }
            }
        };
        return configs[elementType] || null;
    }

    // ============== MODAL DETECTION ==============

    detectOpenModal() {
        const modalTypes = ['character', 'location', 'object', 'system', 'geography', 'history', 'culture'];
        for (const type of modalTypes) {
            const config = this.getElementConfig(type);
            const modal = document.getElementById(config.modalId);
            if (modal && !modal.classList.contains('hidden')) {
                return type;
            }
        }
        return null;
    }

    // ============== CONTEXT BUILDING ==============

    async buildProjectContext() {
        const projectId = await DataManager.getCurrentProjectId();
        if (!projectId) return '';

        const project = await DataManager.getProject(projectId);
        if (!project) return '';

        return `Progetto: ${project.title}\nPremessa: ${project.premise || ''}\nGenere: ${project.genre || ''}\nTono: ${project.tone || ''}`;
    }

    async buildManuscriptContext(elementName = '') {
        const projectId = await DataManager.getCurrentProjectId();
        if (!projectId) return '';

        try {
            const [scenes, ideas, plotlines] = await Promise.all([
                DataManager.getProjectItems(projectId, 'scenes'),
                DataManager.getProjectItems(projectId, 'ideas'),
                DataManager.getProjectItems(projectId, 'plotlines'),
            ]);

            // Score and filter relevant scenes
            const name = (elementName || '').trim();
            const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const tokens = name ? name.split(/\s+|-/).filter(t => t.length >= 3) : [];
            const fullRe = name ? new RegExp(`\\b${esc(name)}\\b`, 'i') : null;
            const tokenRes = tokens.map(t => new RegExp(`\\b${esc(t)}\\b`, 'i'));

            const scoreText = txt => {
                if (!txt) return 0;
                let sc = 0;
                if (fullRe && fullRe.test(txt)) sc += 5;
                for (const r of tokenRes) if (r.test(txt)) sc += 2;
                return sc;
            };

            const center = (txt, maxLen = 500) => {
                if (!txt) return '';
                let idx = -1;
                if (fullRe) {
                    const m = txt.match(fullRe);
                    if (m) idx = txt.indexOf(m[0]);
                }
                if (idx === -1) {
                    for (const r of tokenRes) {
                        const m = txt.match(r);
                        if (m) { idx = txt.indexOf(m[0]); break; }
                    }
                }
                if (idx === -1) return txt.slice(0, maxLen);
                const w = Math.floor(maxLen / 2);
                const st = Math.max(0, idx - w);
                const en = Math.min(txt.length, idx + w);
                return (st > 0 ? '...' : '') + txt.slice(st, en) + (en < txt.length ? '...' : '');
            };

            // Score scenes
            const scored = scenes.map(s => {
                const t = [s.title, s.synopsis, s.content].filter(Boolean).join('\n');
                return { s, t, sc: scoreText(t) };
            });
            scored.sort((a, b) => b.sc - a.sc || (a.s.order || 0) - (b.s.order || 0));
            const selectedScenes = scored.filter(x => x.sc > 0).slice(0, 5);

            // Build context string
            const parts = [];

            if (plotlines.length > 0) {
                parts.push('Linee narrative:');
                plotlines.slice(0, 5).forEach(pl => {
                    parts.push(`- ${pl.name}${pl.description ? ': ' + String(pl.description).slice(0, 120) : ''}`);
                });
            }

            if (selectedScenes.length > 0) {
                parts.push('Scene correlate:');
                selectedScenes.forEach(x => {
                    parts.push(`- ${x.s.title ? '[' + x.s.title + '] ' : ''}${center(x.t)}`);
                });
            }

            const ideaHits = ideas.filter(i => scoreText(i.content || '') > 0).slice(0, 4);
            if (ideaHits.length > 0) {
                parts.push('Idee correlate:');
                ideaHits.forEach(it => parts.push(`- ${center(it.content || '', 300)}`));
            }

            return parts.join('\n');
        } catch (e) {
            console.warn('Failed to build manuscript context', e);
            return '';
        }
    }

    // ============== FIELD OPERATIONS ==============

    getFieldValues(elementType) {
        const config = this.getElementConfig(elementType);
        if (!config) return {};

        const values = {};
        for (const [fieldName, fieldId] of Object.entries(config.fieldMapping)) {
            const el = document.getElementById(fieldId);
            if (el) {
                values[fieldName] = el.value?.trim() || '';
            }
        }
        return values;
    }

    applyToFields(elementType, data) {
        const config = this.getElementConfig(elementType);
        if (!config) return false;

        let applied = false;
        for (const [fieldName, fieldId] of Object.entries(config.fieldMapping)) {
            if (data[fieldName]) {
                const el = document.getElementById(fieldId);
                if (el) {
                    el.value = data[fieldName];
                    applied = true;
                }
            }
        }
        return applied;
    }

    // ============== JSON REPAIR ==============

    repairJson(str) {
        if (!str) return '';
        let s = String(str).trim();
        // Strip code fences
        s = s.replace(/^```[a-z]*\n?/i, '').replace(/```\s*$/i, '');
        // Fix trailing commas
        s = s.replace(/,\s*([}\]])/g, '$1');
        // Extract JSON object
        const a = s.indexOf('{');
        const b = s.lastIndexOf('}');
        if (a !== -1 && b !== -1) s = s.slice(a, b + 1);
        return s;
    }

    // ============== GENERATION ==============

    async generate(elementType, mode = 'create', options = {}) {
        const config = this.getElementConfig(elementType);
        if (!config) {
            throw new Error(`Tipo elemento non supportato: ${elementType}`);
        }

        this.isGenerating = true;
        this.currentElementType = elementType;

        try {
            // Build system prompt
            const systemPrompt = `Sei un assistente di worldbuilding per scrittori. Rispondi SOLO con JSON valido usando questo schema:
${config.jsonSchema}
Non aggiungere testo prima o dopo il JSON.`;

            // Build user prompt
            const projectContext = await this.buildProjectContext();
            const currentValues = this.getFieldValues(elementType);
            const basePrompt = mode === 'create' ? config.createPrompt : config.improvePrompt;

            let userPromptParts = [basePrompt];

            if (options.instructions) {
                userPromptParts.push(`Istruzioni specifiche: ${options.instructions}`);
            }

            if (projectContext) {
                userPromptParts.push(`Contesto progetto:\n${projectContext}`);
            }

            const hasValues = Object.values(currentValues).some(v => v);
            if (hasValues) {
                userPromptParts.push(`Dati attuali:\n${JSON.stringify(currentValues, null, 2)}`);
            }

            // Optional: add manuscript context
            if (options.useContext !== false) {
                const nameField = currentValues.name || currentValues.title || '';
                const manuscriptCtx = await this.buildManuscriptContext(nameField);
                if (manuscriptCtx) {
                    userPromptParts.push(`Contesto dal romanzo:\n${manuscriptCtx}`);
                }
            }

            const prompt = userPromptParts.join('\n\n');

            // Call AI
            const temperature = options.temperature ?? 0.7;
            const maxTokens = options.maxTokens ?? 700;

            const { text } = await AIService.complete({
                prompt,
                system: systemPrompt,
                temperature,
                maxTokens,
            });

            this.lastOutput = text;
            return { success: true, raw: text, elementType };

        } catch (error) {
            console.error('AI Worldbuilding error:', error);
            throw error;
        } finally {
            this.isGenerating = false;
        }
    }

    async generateAndApply(elementType, mode = 'create', options = {}) {
        const result = await this.generate(elementType, mode, options);

        if (result.success && result.raw) {
            const repaired = this.repairJson(result.raw);
            try {
                const data = JSON.parse(repaired);
                const applied = this.applyToFields(elementType, data);
                if (applied) {
                    toast.success(`${this.getElementConfig(elementType).displayName} generato con successo!`);
                }
                return { ...result, parsed: data, applied };
            } catch (e) {
                toast.error('Risposta AI non valida. Controlla l\'output.');
                return { ...result, parseError: e.message };
            }
        }
        return result;
    }

    // ============== ABORT ==============

    abort() {
        AIService.abort();
        this.isGenerating = false;
    }

    // ============== STATUS ==============

    getStatus() {
        return {
            isGenerating: this.isGenerating,
            currentElementType: this.currentElementType,
            openModal: this.detectOpenModal(),
            lastOutput: this.lastOutput,
        };
    }
}

// Singleton export
export const AIWorldbuilding = new AIWorldbuildingService();
