import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged as fbOnAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, setDoc, doc, getDoc, collection, getDocs, writeBatch, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let auth, db;
let currentUserId = null;
const STORE_NAMES = ['projects', 'ideas', 'characters', 'locations', 'objects', 'systems', 'settings'];

// Funzione helper per convertire i dati per Firestore (es. timestamp)
function toFirestoreData(obj) {
    const data = { ...obj };
    if (data.createdAt && !(data.createdAt instanceof Timestamp)) {
        data.createdAt = Timestamp.fromMillis(data.createdAt);
    }
    if (data.lastModified && !(data.lastModified instanceof Timestamp)) {
        data.lastModified = Timestamp.fromMillis(data.lastModified);
    }
    return data;
}

// Funzione helper per convertire i dati da Firestore (es. timestamp)
function fromFirestoreData(doc) {
    const data = doc.data();
    if (data.createdAt && data.createdAt.toMillis) {
        data.createdAt = data.createdAt.toMillis();
    }
    if (data.lastModified && data.lastModified.toMillis) {
        data.lastModified = data.lastModified.toMillis();
    }
    return data;
}

export const FirebaseSync = {
    async initFirebase(firebaseConfig) {
        try {
            const app = initializeApp(firebaseConfig);
            auth = getAuth(app);
            db = getFirestore(app);
            return { success: true };
        } catch (error) {
            console.error("Firebase initialization failed:", error);
            return { success: false, error: error.message };
        }
    },

    async checkConnection() {
        if (!db || !currentUserId) return false;
        try {
            // Prova a leggere un documento leggero per verificare la connessione
            const userDocRef = doc(db, "users", currentUserId);
            await getDoc(userDocRef);
            return true;
        } catch (error) {
            console.warn("Firebase connection check failed:", error.code);
            return false;
        }
    },

    onAuthStateChanged(callback) {
        if (!auth) return;
        fbOnAuthStateChanged(auth, (user) => {
            currentUserId = user ? user.uid : null;
            callback(user);
        });
    },

    async login(email, password) {
        // ... (codice esistente, invariato)
    },

    async register(email, password) {
        // ... (codice esistente, invariato)
    },

    async logout() {
        // ... (codice esistente, invariato)
    },

    isAuthenticated() {
        return currentUserId !== null;
    },

    async getRemoteTimestamps() {
        if (!currentUserId || !db) return null;
        console.log("Fetching remote timestamps...");
        const timestamps = {};
        try {
            for (const storeName of STORE_NAMES) {
                timestamps[storeName] = {};
                const collRef = collection(db, "users", currentUserId, storeName);
                const snapshot = await getDocs(collRef);
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.lastModified) {
                        timestamps[storeName][doc.id] = data.lastModified.toMillis();
                    }
                });
            }
            return timestamps;
        } catch (error) {
            console.error("Error fetching remote timestamps:", error);
            return null;
        }
    },

    async downloadData() {
        if (!currentUserId || !db) return null;
        console.log("Downloading all data from Firestore...");
        const allData = {};
        try {
            for (const storeName of STORE_NAMES) {
                allData[storeName] = [];
                const collRef = collection(db, "users", currentUserId, storeName);
                const snapshot = await getDocs(collRef);
                snapshot.forEach(doc => {
                    allData[storeName].push(fromFirestoreData(doc));
                });
            }
            return allData;
        } catch (error) {
            console.error("Error downloading data:", error);
            return null;
        }
    },

    async uploadData(dataManager) {
        if (!currentUserId || !db) return { success: false, error: "User not authenticated or DB not ready." };
        console.log("Uploading all local data to Firestore...");
        const batch = writeBatch(db);

        try {
            for (const storeName of STORE_NAMES) {
                let items = [];
                if (storeName === 'settings') {
                    items.push(await dataManager.getSettings());
                } else {
                    // Per gli altri store, dobbiamo recuperare tutti i progetti e poi i loro item
                    const projects = await dataManager.getProjects();
                    if (storeName === 'projects') {
                        items = projects;
                    } else {
                        for (const project of projects) {
                            const projectItems = await dataManager.getProjectItems(project.id, storeName);
                            items.push(...projectItems);
                        }
                    }
                }

                for (const item of items) {
                    const docRef = doc(db, "users", currentUserId, storeName, item.id);
                    batch.set(docRef, toFirestoreData(item));
                }
            }

            await batch.commit();
            console.log("Upload completed successfully.");
            return { success: true };
        } catch (error) {
            console.error("Error uploading data:", error);
            return { success: false, error: error.message };
        }
    }
};