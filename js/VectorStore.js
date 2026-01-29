import { openDB } from '../node_modules/idb/build/index.js';

const DB_NAME = 'writers-nexus-rag';
const STORE_NAME = 'vectors';

async function getDB() {
    return openDB(DB_NAME, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        },
    });
}

// Simple hash for content deduplication
async function hashContent(text) {
    const enc = new TextEncoder();
    const data = enc.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const VectorStore = {
    async saveAnalysis(id, content, analysis) {
        const db = await getDB();
        const hash = await hashContent(content);
        await db.put(STORE_NAME, {
            id,
            hash,
            analysis,
            timestamp: Date.now()
        });
    },

    async getCachedAnalysis(id, content) {
        const db = await getDB();
        const entry = await db.get(STORE_NAME, id);
        if (!entry) return null;

        // Check if content changed
        const currentHash = await hashContent(content);
        if (entry.hash !== currentHash) return null; // Cache miss

        return entry.analysis;
    },

    async clear() {
        const db = await getDB();
        await db.clear(STORE_NAME);
    }
};
