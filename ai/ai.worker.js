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

    // Debug logging
    console.log(`[AI Worker] Job ${jobId} - Type: ${type}, Chunk length: ${chunk?.length || 0}, Config:`, config);

    if (type === 'extraction') {
        // Prompt compatto stile TOON - più efficiente per modelli locali
        const systemMsg = `Output JSON only. Extract entities from narrative text. Format: {"c":[{"n":"Name","d":"desc","r":"role"}],"l":[{"n":"Name","d":"desc"}],"o":[{"n":"Name","d":"desc"}],"k":[{"n":"Name","d":"desc"}]} where c=characters,l=locations,o=objects,k=concepts. n=proper name, d=max 10 words, r=narrative role. Skip dates/numbers.`;

        const userPrompt = `TEXT:\n${chunk}\n\nJSON:`;

        return await callLLM(userPrompt, systemMsg, jobId);
    }

    if (type === 'consolidation') {
        const systemMsg = "Sei un editor esperto. Rispondi esclusivamente con JSON valido e completo.";
        const listStr = chunk;
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

    // Fallback for unknown types
    return await callLLM(chunk, "Rispondi in modo conciso.", jobId);
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
        let processedIds = new Set(); // Track processed message IDs to avoid duplicates

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
                if (!trimmed) continue; // Skip empty lines

                if (trimmed.startsWith('data: ')) {
                    const dataStr = trimmed.substring(6).trim(); // More efficient than replace
                    if (dataStr === '[DONE]') continue;

                    try {
                        const json = JSON.parse(dataStr);

                        // Skip if we've already processed this response ID (prevents duplicates)
                        const msgId = json.id || json.created;
                        const chunkIdx = json.choices?.[0]?.index ?? 0;
                        const uniqueKey = `${msgId}-${chunkIdx}-${json.choices?.[0]?.delta?.content?.length || 0}`;

                        if (msgId && processedIds.has(uniqueKey)) {
                            continue; // Skip duplicate
                        }
                        if (msgId) processedIds.add(uniqueKey);

                        const content = json.choices?.[0]?.delta?.content || "";
                        if (content) {
                            fullText += content;
                            self.postMessage({
                                type: 'JOB_PROGRESS',
                                id: jobId,
                                message: 'Elaborazione...',
                                token: content,
                                count: fullText.length
                            });
                        }
                    } catch (e) {
                        // ignore parse errors for partial chunks
                    }
                }
            }
        }

        // Process any remaining buffer
        if (buffer.trim() && buffer.trim().startsWith('data: ')) {
            try {
                const dataStr = buffer.trim().substring(6).trim();
                if (dataStr !== '[DONE]') {
                    const json = JSON.parse(dataStr);
                    const content = json.choices?.[0]?.delta?.content || "";
                    if (content) fullText += content;
                }
            } catch (e) { /* ignore */ }
        }

        return fullText;

    } catch (e) {
        // If streaming failed, throw.
        throw e;
    }
}
