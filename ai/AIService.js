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
        const payload = config.provider === 'openai-compatible'
            ? { model: config.model, temperature, max_tokens: maxTokens, messages: [ system ? { role: 'system', content: system } : null, { role: 'user', content: prompt } ].filter(Boolean) }
            : meta.rawPayload ?? {};
        const res = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: getHeaders(),
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        if (!res.ok) throw new Error(`AI request failed (${res.status})`);
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content ?? '';
        return { text, raw: data };
    },
    async chat({ messages, temperature = 0.7, maxTokens = 800 }) {
        controller = new AbortController();
        const payload = { model: config.model, temperature, max_tokens: maxTokens, messages };
        const res = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST', headers: getHeaders(), body: JSON.stringify(payload), signal: controller.signal
        });
        if (!res.ok) throw new Error(`AI request failed (${res.status})`);
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content ?? '';
        return { text, raw: data };
    },
    abort() { if (controller) controller.abort(); }
};
