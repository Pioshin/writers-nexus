/*
 * AI Worker - Background processing for Writers Nexus
 * Handles queue management, RAG (retrieval), and API calls to LLMs.
 */

// Simple state
let config = {
    provider: 'openai-compatible',
    baseUrl: '',
    apiKey: '',
    model: '',
};

// Queue management
const queue = [];
let isProcessing = false;

self.onmessage = async (e) => {
    const { type, payload, id } = e.data;

    if (type === 'CONFIG') {
        config = { ...config, ...payload };
        self.postMessage({ type: 'CONFIG_UPDATED', id });
        return;
    }

    if (type === 'ENQUEUE_ANALYSIS') {
        queue.push({ id, parsedPayload: payload });
        processQueue();
        return;
    }
    if (type === 'CHECK_CONNECTION') {
        try {
            // Simple ping to Ollama
            const url = config.provider === 'ollama' ? `${config.baseUrl}/api/tags` : `${config.baseUrl}/models`;
            const res = await fetch(url);
            if (res.ok) self.postMessage({ type: 'CONNECTION_OK', id });
            else throw new Error(res.statusText);
        } catch (e) {
            self.postMessage({ type: 'CONNECTION_ERROR', id, error: e.message });
        }
        return;
    }
};

async function processQueue() {
    if (isProcessing || queue.length === 0) return;
    isProcessing = true;

    const job = queue.shift();
    const { id, parsedPayload } = job;

    try {
        self.postMessage({ type: 'JOB_STARTED', id });
        // Pass job ID to allow progress reporting inside runAnalysisStep
        const result = await runAnalysisStep(parsedPayload, id);
        self.postMessage({ type: 'JOB_COMPLETED', id, result });
    } catch (error) {
        self.postMessage({ type: 'JOB_FAILED', id, error: error.message });
    } finally {
        isProcessing = false;
        setTimeout(processQueue, 50);
    }
}

async function runAnalysisStep(payload, jobId) {
    const { chunk, type, context } = payload;
    let systemMsg = "Rispondi esclusivamente con JSON valido e completo.";

    if (type === 'extraction') {
        systemMsg += " Format: JSON { c: [{n,d,r}], l: [{n,d}], o: [{n,d}], k: [{n,d}] } where c=chars, l=locs, o=objs, k=knowledge. Key map: n=name, d=desc, r=role. " +
            "RULES: 1. precision: 'n' must be a Proper Name (Capitalized). Ignore verbs, measurements (e.g. '10°'), dates or common nouns. " +
            "2. brevity: 'd' max 10 words. " +
            "3. output: pure JSON only.";
    }

    if (type === 'consolidation') {
        systemMsg = "Sei un editor esperto. Rispondi esclusivamente con JSON valido e completo.";
        const listStr = chunk; // The stringified list of entities
        const prompt = `
        TASK: Consolidate and Categorize this list of entities extracted from a novel.
        INPUT LIST: ${listStr}
        
        INSTRUCTIONS:
        1. Merge aliases/typos (e.g. "Bob", "Bobby" -> "Robert").
        2. Assign strict category from: [Personaggio, Luogo, Oggetto, Sistema, Geografia, Storia, Cultura].
        3. Output JSON Array: [{ "name": "Canonical Name", "type": "Category", "originalNames": ["Bob", "Bobby"] }]
        `;
        return await callLLM(prompt, systemMsg, jobId);
    }

    // Call API logic with streaming support monitoring
    const response = await callLLM(chunk, systemMsg, jobId);

    // Validate JSON roughly before returning?
    // If empty or invalid, it might throw later, but here we just return text.
    return response;
}

// Streaming-enabled fetch wrapper
async function callLLM(prompt, system, jobId) {
    try {
        let url = `${config.baseUrl}/chat/completions`;
        let isOllama = config.provider === 'ollama';

        if (isOllama) {
            url = `${config.baseUrl}/v1/chat/completions`;
        }

        const body = {
            model: config.model,
            temperature: 0.1,
            stream: true, // ENABLE STREAMING
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: prompt }
            ]
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {})
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) throw new Error(`AI Request failed: ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullText = "";
        let buffer = "";

        // Report initial contact
        self.postMessage({ type: 'JOB_PROGRESS', id: jobId, message: 'Connesso, ricezione dati...' });

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // Process SSE lines (data: {...})
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.startsWith('data: ')) {
                    const dataStr = trimmed.replace('data: ', '').trim();
                    if (dataStr === '[DONE]') continue;

                    try {
                        const json = JSON.parse(dataStr);
                        const content = json.choices?.[0]?.delta?.content || "";
                        if (content) {
                            fullText += content;
                            // Heartbeat: report progress every ~50 chars or just "Alive"
                            // To avoid spamming main thread, maybe throttle?
                            // For now, let's just send 'Alive' signal occasionally or purely implicitly?
                            // User wants EVIDENCE. Sending "token received" is good evidence.
                            // But postMessage is expensive. Send every 10 tokens?
                            // Minimal: Send update every 1s? Or just rely on visual activity if we forward chunk length.
                            // Send EVERY token chunk for smooth Matrix UI (or throttle slightly if very fast)
                            // Sending every chunk allows "typing" effect.
                            self.postMessage({
                                type: 'JOB_PROGRESS',
                                id: jobId,
                                message: 'Elaborazione...',
                                token: content, // The raw token for display
                                count: fullText.length
                            });
                        }
                    } catch (e) {
                        // ignore parse errors for partial chunks
                    }
                }
            }
        }

        return fullText;

    } catch (e) {
        // Fallback for non-streaming providers or errors?
        // If streaming failed, throw.
        throw e;
    }
}
