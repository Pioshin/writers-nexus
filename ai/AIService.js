import { GoogleGenerativeAI } from '@google/generative-ai';

// Simple pluggable AI service wrapper
// Contract:
// - init({ provider, apiKey, baseUrl, model, headers })
// - complete({ prompt, system, temperature, maxTokens, meta }) -> { text, raw }
// - chat({ messages, temperature, maxTokens }) -> { text, raw }
// - abort()

let controller = null;
let config = {
  provider: 'openai-compatible',
  baseUrl: '',
  apiKey: '',
  model: '',
  headers: {},
};
let genAI = null;

function normalizeGoogleModel(model) {
  if (!model || typeof model !== 'string') return 'gemini-1.5-flash'; // fallback sicuro
  const m = model.trim();

  // Rimuovi prefissi "models/" se presenti
  const cleanModel = m.startsWith('models/') ? m.replace('models/', '') : m;

  // Mappature per compatibilità AI Studio
  const modelMap = {
    'gemini-pro': 'gemini-1.5-pro',
    'gemini-pro-vision': 'gemini-1.5-pro',
    // Rimuovi suffissi -latest che possono causare problemi
    'gemini-1.5-pro-latest': 'gemini-1.5-pro',
    'gemini-1.5-flash-latest': 'gemini-1.5-flash',
    'gemini-1.0-pro-latest': 'gemini-1.0-pro',
    // Varianti comuni che potrebbero non funzionare
    'gemini-1.5-pro-002': 'gemini-1.5-pro',
    'gemini-1.5-flash-001': 'gemini-1.5-flash',
  };

  return modelMap[cleanModel] || cleanModel;
}

function getHeaders() {
  const headers = { 'Content-Type': 'application/json', ...config.headers };
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;
  return headers;
}

function initGenAI() {
  if (config.apiKey) {
    genAI = new GoogleGenerativeAI(config.apiKey);
  } else {
    console.warn('[AIService] No API Key for Gemini. Init skipped.');
  }
}

export const AIService = {
  init(opts = {}) {
    config = { ...config, ...opts };
    if (config.provider === 'google') {
      config.model = normalizeGoogleModel(config.model);
    }
    if (config.provider === 'google') {
      // The client gets the API key from the environment variable `GEMINI_API_KEY` if not passed directly.
      genAI = new GoogleGenerativeAI(config.apiKey);
    }
    initGenAI(); // Initialize genAI client on init
  },
  getConfig() {
    return { ...config };
  },
  async complete({
    prompt,
    system,
    temperature = 0.7,
    maxTokens = 800,
    meta = {},
  }) {
    controller = new AbortController();

    if (config.provider === 'google') {
      if (!genAI)
        throw new Error('Google AI not initialized. Call init first.');
      const modelName = normalizeGoogleModel(config.model);
      console.debug(
        `[Gemini] Original model: ${config.model} → Normalized: ${modelName}`
      );

      try {
        const model = genAI.getGenerativeModel({
          model: normalizeGoogleModel(config.model), // Use normalizeGoogleModel directly
          ...(system ? { systemInstruction: system } : {}), // Keep system instruction for complete
        });

        // Gemini Multimodal input
        let promptInput = [];
        promptInput.push(prompt); // The 'prompt' argument is the user's text

        if (inlineData) {
          promptInput.push({
            inlineData: {
              data: inlineData.data,
              mimeType: inlineData.mimeType
            }
          });
        }

        const result = await model.generateContent(promptInput, {
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          },
          signal: controller.signal,
        });

        const response = result.response;
        const text = response.text();
        return { text, raw: response };
      } catch (error) {
        console.error(`[Gemini] Complete Error:`, error); // Updated error message
        throw error;
      }
    }

    let url = `${config.baseUrl}/chat/completions`;
    let payload = {};
    if (
      config.provider === 'openai-compatible' ||
      config.provider === 'ollama'
    ) {
      payload = {
        model: config.model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          system ? { role: 'system', content: system } : null,
          { role: 'user', content: prompt },
        ].filter(Boolean),
      };
      if (config.provider === 'ollama') {
        // Ollama uses different endpoint for chat
        url = `${config.baseUrl}/v1/chat/completions`;
      }
    } else if (config.provider === 'anthropic') {
      url = `${config.baseUrl}/messages`;
      payload = {
        model: config.model,
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: 'user', content: prompt }],
        system,
      };
    } else {
      payload = meta.rawPayload ?? {};
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
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
  async chat({ messages, temperature = 0.7, maxTokens = 800, inlineData = null }) {
    controller = new AbortController();

    if (config.provider === 'google') {
      // Attempt to initialize genAI if it's null and model is Gemini/Flash
      if (!genAI && (config.model.includes('gemini') || config.model.includes('flash'))) {
        initGenAI();
      }
      if (!genAI) {
        throw new Error('Google AI not initialized. Call init first.');
      }
      const modelName = normalizeGoogleModel(config.model);
      console.debug(
        `[Gemini Chat] Original model: ${config.model} → Normalized: ${modelName}, messages: ${messages.length}`
      );

      try {
        const systemMessage = messages.find(m => m.role === 'system');
        const model = genAI.getGenerativeModel({
          model: modelName,
          ...(systemMessage
            ? { systemInstruction: systemMessage.content }
            : {}),
        });

        const history = messages
          .filter(m => m.role !== 'system') // Rimuovi i messaggi system dalla history
          .map(m => ({
            role: m.role === 'assistant' ? 'model' : m.role, // Gemini usa 'model' invece di 'assistant'
            parts: [{ text: m.content }],
          }));

        if (history.length === 0) {
          throw new Error('No non-system messages found for chat');
        }

        const last = history[history.length - 1];
        const prior = history.slice(0, -1);

        const chat = model.startChat({
          history: prior,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          },
        });

        const result = await chat.sendMessage(last.parts[0].text, {
          signal: controller.signal,
        });

        const response = result.response;
        const text = response.text();
        return { text, raw: response };
      } catch (error) {
        console.error(`[Gemini Chat] Error with model ${modelName}:`, error);
        throw error;
      }
    }

    let url = `${config.baseUrl}/chat/completions`;
    let payload = {
      model: config.model,
      temperature,
      max_tokens: maxTokens,
      messages,
    };
    if (config.provider === 'anthropic') {
      url = `${config.baseUrl}/messages`;
      payload = {
        model: config.model,
        max_tokens: maxTokens,
        temperature,
        messages,
      };
    } else if (config.provider === 'ollama') {
      url = `${config.baseUrl}/v1/chat/completions`;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`AI request failed (${res.status})`);
    const data = await res.json();
    const text =
      config.provider === 'anthropic'
        ? (data?.content?.[0]?.text ?? '')
        : (data?.choices?.[0]?.message?.content ?? '');
    return { text, raw: data };
  },
  abort() {
    if (controller) controller.abort();
  },
};

// Helpful error hinting: wrap Google 404s with guidance
const _origComplete = AIService.complete;
AIService.complete = async function wrappedComplete(args) {
  try {
    return await _origComplete.call(AIService, args);
  } catch (e) {
    const msg = String(e?.message || e);
    if (config.provider === 'google' && /404/.test(msg)) {
      const suggestion = msg.includes('-latest')
        ? 'I modelli con suffisso "-latest" non sono sempre supportati. Prova senza "-latest".'
        : 'Prova modelli stabili come "gemini-1.5-flash" o "gemini-1.5-pro".';
      throw new Error(
        `${msg}\nSuggerimento: ${suggestion} Assicurati di usare una API Key di AI Studio (non Vertex AI).`
      );
    }
    throw e;
  }
};
