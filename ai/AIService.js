import { GoogleGenerativeAI } from "@google/generative-ai";

// Simple pluggable AI service wrapper
// Contract:
// - init({ provider, apiKey, baseUrl, model, headers })
// - complete({ prompt, system, temperature, maxTokens, meta }) -> { text, raw }
// - chat({ messages, temperature, maxTokens }) -> { text, raw }
// - abort()

let controller = null;
let config = { provider: 'openai-compatible', baseUrl: '', apiKey: '', model: '' , headers: {} };
let genAI = null;

function getHeaders() {
    const headers = { 'Content-Type': 'application/json', ...config.headers };
    if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
    return headers;
}

export const AIService = {
    init(opts = {}) {
        config = { ...config, ...opts };
        if (config.provider === 'google') {
            // The client gets the API key from the environment variable `GEMINI_API_KEY` if not passed directly.
            genAI = new GoogleGenerativeAI(config.apiKey);
        }
    },
    getConfig() { return { ...config }; },
    async complete({ prompt, system, temperature = 0.7, maxTokens = 800, meta = {} }) {
        controller = new AbortController();

        if (config.provider === 'google') {
            if (!genAI) throw new Error("Google AI not initialized. Call init first.");
            const model = genAI.getGenerativeModel({
                model: config.model,
                systemInstruction: system,
            });
            const result = await model.generateContent(prompt, {
                temperature: temperature,
                maxOutputTokens: maxTokens,
                signal: controller.signal
            });
            const response = result.response;
            const text = response.text();
            return { text, raw: response };
        }

        let url = `${config.baseUrl}/chat/completions`;
        let payload = {};
        if (config.provider === 'openai-compatible' || config.provider === 'ollama') {
            payload = { model: config.model, temperature, max_tokens: maxTokens, messages: [ system ? { role: 'system', content: system } : null, { role: 'user', content: prompt } ].filter(Boolean) };
            if (config.provider === 'ollama') {
                // Ollama uses different endpoint for chat
                url = `${config.baseUrl}/v1/chat/completions`;
            }
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

        if (config.provider === 'google') {
            if (!genAI) throw new Error("Google AI not initialized. Call init first.");
            const model = genAI.getGenerativeModel({ model: config.model });
            const chat = model.startChat({
                history: messages.slice(0, -1).map(m => ({ role: m.role, parts: [{ text: m.content }] })),
                temperature: temperature,
                maxOutputTokens: maxTokens,
            });
            const lastMessage = messages[messages.length - 1];
            const result = await chat.sendMessage(lastMessage.content, { signal: controller.signal });
            const response = result.response;
            const text = response.text();
            return { text, raw: response };
        }

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
