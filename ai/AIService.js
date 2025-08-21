// Simple pluggable AI service wrapper
// Contract:
// - init({ provider, apiKey, baseUrl, model, headers })
// - complete({ prompt, system, temperature, maxTokens, meta }) -> { text, raw }
// - chat({ messages, temperature, maxTokens }) -> { text, raw }
// - abort()

let controller = null;
let config = { provider: 'openai-compatible', baseUrl: '', apiKey: '', model: '' , headers: {} };

function getHeaders() {
    const headers = { 'Content-Type': 'application/json', ...config.headers };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
    return headers;
}

export const AIService = {
    init(opts = {}) {
        config = { ...config, ...opts };
    },
    getConfig() { return { ...config }; },
    async complete({ prompt, system, temperature = 0.7, maxTokens = 800, meta = {} }) {
        controller = new AbortController();
        let url = `${config.baseUrl}/chat/completions`;
        let payload = {};
        if (config.provider === 'openai-compatible' || config.provider === 'ollama') {
            payload = { model: config.model, temperature, max_tokens: maxTokens, messages: [ system ? { role: 'system', content: system } : null, { role: 'user', content: prompt } ].filter(Boolean) };
            if (config.provider === 'ollama') {
                // Ollama uses different endpoint for chat
                url = `${config.baseUrl}/v1/chat/completions`;
            }
        } else if (config.provider === 'google') {
            // Vertex/Gemini HTTP compatibility varies; expect baseUrl points to a proxy exposing /chat/completions
            payload = { model: config.model, temperature, max_tokens: maxTokens, messages: [ system ? { role: 'system', content: system } : null, { role: 'user', content: prompt } ].filter(Boolean) };
        } else if (config.provider === 'anthropic') {
            url = `${config.baseUrl}/messages`;
            payload = { model: config.model, max_tokens: maxTokens, temperature, messages: [ { role: 'user', content: prompt } ], system };
        } else {
            payload = meta.rawPayload ?? {};
        }
        const res = await fetch(url, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        if (!res.ok) throw new Error(`AI request failed (${res.status})`);
        const data = await res.json();
        let text = '';
        if (config.provider === 'anthropic') {
            text = data?.content?.[0]?.text ?? '';
        } else {
            text = data?.choices?.[0]?.message?.content ?? data?.response ?? '';
        }
        return { text, raw: data };
    },
    async chat({ messages, temperature = 0.7, maxTokens = 800 }) {
        controller = new AbortController();
        let url = `${config.baseUrl}/chat/completions`;
        let payload = { model: config.model, temperature, max_tokens: maxTokens, messages };
        if (config.provider === 'anthropic') {
            url = `${config.baseUrl}/messages`;
            payload = { model: config.model, max_tokens: maxTokens, temperature, messages };
        } else if (config.provider === 'ollama') {
            url = `${config.baseUrl}/v1/chat/completions`;
        }
        const res = await fetch(url, {
            method: 'POST', headers: getHeaders(), body: JSON.stringify(payload), signal: controller.signal
        });
        if (!res.ok) throw new Error(`AI request failed (${res.status})`);
        const data = await res.json();
        const text = config.provider === 'anthropic' ? (data?.content?.[0]?.text ?? '') : (data?.choices?.[0]?.message?.content ?? '');
        return { text, raw: data };
    },
    abort() { if (controller) controller.abort(); }
};
