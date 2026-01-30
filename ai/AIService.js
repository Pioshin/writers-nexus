import { GoogleGenerativeAI } from '@google/generative-ai';

// Worker-based AI Service
// Handles off-loading of heavy tasks to ai.worker.js
// Standard chat/complete calls are proxied or handled directly depending on type.

let worker = null;
let workerCallbacks = new Map();
let config = {
  provider: 'openai-compatible', // Default per compatibilità locale
  baseUrl: 'http://127.0.0.1:11434',
  apiKey: '',
  model: 'gemma:2b',
  headers: {},
};
let genAI = null;

function initWorker() {
  if (worker) return;
  worker = new Worker(new URL('ai.worker.js', import.meta.url), { type: 'module' });

  worker.onmessage = (e) => {
    const { type, id, result, error, message } = e.data;

    // Handle Connection Check explicitly
    if (type === 'CONNECTION_OK' || type === 'CONNECTION_ERROR') {
      if (workerCallbacks.has(id)) {
        const { resolve, reject } = workerCallbacks.get(id);
        type === 'CONNECTION_OK' ? resolve(true) : reject(new Error(error));
        workerCallbacks.delete(id);
      }
      return;
    }

    if (workerCallbacks.has(id)) {
      const callbackObj = workerCallbacks.get(id);
      const { resolve, reject, timeoutId } = callbackObj;

      // Reset Watchdog on Progress
      if (type === 'JOB_PROGRESS') {
        // Reset timeout
        if (timeoutId) clearTimeout(timeoutId);
        callbackObj.timeoutId = setTimeout(() => {
          reject(new Error('AI Analysis Timed Out (Stalled)'));
          workerCallbacks.delete(id);
        }, 120000); // 2 minutes inactivity allowance

        // Forward progress event for UI feedback
        // Pass 'token' for live streaming monitor
        window.dispatchEvent(new CustomEvent('consistency-progress', {
          detail: {
            status: 'running',
            message: message || 'Ricezione dati...',
            details: 'Analisi in corso...',
            token: e.data.token // Raw token from LLM
          }
        }));
        return;
      }

      // Final States
      if (type === 'JOB_COMPLETED' || type === 'JOB_FAILED') {
        if (timeoutId) clearTimeout(timeoutId);
        if (type === 'JOB_COMPLETED') resolve(result);
        else reject(new Error(error));

        workerCallbacks.delete(id);
      }
    }
  };

  // Sync initial config
  worker.postMessage({ type: 'CONFIG', payload: config });
}

function normalizeGoogleModel(model) {
  if (!model || typeof model !== 'string') return 'gemini-1.5-flash';
  const m = model.trim();
  const cleanModel = m.startsWith('models/') ? m.replace('models/', '') : m;
  const modelMap = {
    'gemini-pro': 'gemini-1.5-pro',
    'gemini-1.5-flash-latest': 'gemini-1.5-flash',
  };
  return modelMap[cleanModel] || cleanModel;
}

function getHeaders() {
  const headers = { 'Content-Type': 'application/json', ...config.headers };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
  return headers;
}

export const AIService = {
  init(opts = {}) {
    config = { ...config, ...opts };
    if (config.provider === 'google') {
      config.model = normalizeGoogleModel(config.model);
      genAI = new GoogleGenerativeAI(config.apiKey);
    }

    // Always init worker for background tasks
    initWorker();
    if (worker) worker.postMessage({ type: 'CONFIG', payload: config });
  },

  getConfig() {
    return { ...config };
  },

  async checkConnection() {
    if (!worker) initWorker();
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      workerCallbacks.set(id, { resolve, reject, timeoutId: setTimeout(() => reject(new Error("Connection check timed out")), 5000) });
      worker.postMessage({ type: 'CHECK_CONNECTION', id });
    });
  },

  // Standard interactive completion (still main thread for responsiveness in chat)
  async complete({ prompt, system, temperature = 0.7, maxTokens = 800 }) {
    if (config.provider === 'google') {
      if (!genAI) throw new Error('Google AI not initialized.');
      const model = genAI.getGenerativeModel({
        model: config.model,
        systemInstruction: system
      });
      const result = await model.generateContent(prompt, {
        generationConfig: { temperature, maxOutputTokens: maxTokens }
      });
      return { text: result.response.text(), raw: result.response };
    }

    // Fallback standard fetch (Ollama / OpenAI)
    return this._fetchCompletion(prompt, system, temperature, maxTokens);
  },

  // Background optimized analysis (Worker)
  async analyzeBackground(chunk, type = 'extraction', context = 'general') {
    if (!worker) initWorker();

    // Check connection first if using local LLM to avoid silent failures
    if (config.provider === 'ollama') {
      try {
        await this.checkConnection();
      } catch (e) {
        console.warn("AI Connection Failed:", e);
        throw new Error("Impossibile connettersi a Ollama. Assicurati che sia attivo.");
      }
    }

    const TIMEOUT_MS = 120000; // 2 minutes initial

    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();

      // Store callback with watchdog timer
      workerCallbacks.set(id, {
        resolve,
        reject,
        timeoutId: setTimeout(() => {
          reject(new Error('AI Analysis Timed Out (No start)'));
          workerCallbacks.delete(id);
        }, TIMEOUT_MS)
      });

      worker.postMessage({
        type: 'ENQUEUE_ANALYSIS',
        id,
        payload: {
          chunk,
          type,
          context
        }
      });
    });
  },

  async chat({ messages, temperature = 0.7, maxTokens = 800 }) {
    if (config.provider === 'google') {
      if (!genAI) throw new Error('Google AI not initialized');
      const model = genAI.getGenerativeModel({ model: config.model });
      const chat = model.startChat({
        history: messages.slice(0, -1).map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }))
      });
      const result = await chat.sendMessage(messages[messages.length - 1].content);
      return { text: result.response.text() };
    }

    // Std fetch
    let url = `${config.baseUrl}/chat/completions`;
    if (config.provider === 'ollama') url = `${config.baseUrl}/v1/chat/completions`;

    const payload = {
      model: config.model,
      temperature,
      messages
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
    return { text, raw: data };
  },

  // Internal helper
  async _fetchCompletion(prompt, system, temperature, maxTokens) {
    let url = `${config.baseUrl}/chat/completions`;
    if (config.provider === 'ollama') url = `${config.baseUrl}/v1/chat/completions`;

    const payload = {
      model: config.model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        system ? { role: 'system', content: system } : null,
        { role: 'user', content: prompt }
      ].filter(Boolean)
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`AI error: ${res.status}`);
    const data = await res.json();
    return {
      text: data?.choices?.[0]?.message?.content || "",
      raw: data
    };
  }
};
