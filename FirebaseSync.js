import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged as fbOnAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, setDoc, doc, getDoc, collection, addDoc, onSnapshot, query, Timestamp, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

let auth, db, GEMINI_API_KEY;
let currentUserId = null;

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

    onAuthStateChanged(callback) {
        if (!auth) return;
        fbOnAuthStateChanged(auth, (user) => {
            if (user) {
                currentUserId = user.uid;
            } else {
                currentUserId = null;
            }
            callback(user);
        });
    },

    async login(email, password) {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            return { success: true, user: userCredential.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async register(email, password) {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await setDoc(doc(db, "users", userCredential.user.uid), { email: userCredential.user.email, createdAt: Timestamp.now() });
            return { success: true, user: userCredential.user };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    async logout() {
        try {
            await signOut(auth);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    },

    isAuthenticated() {
        return currentUserId !== null;
    },

    getCurrentUserEmail() {
        return auth.currentUser ? auth.currentUser.email : null;
    },

    setGeminiApiKey(key) {
        GEMINI_API_KEY = key;
    },

    async callGeminiApi(prompt) {
        if (!GEMINI_API_KEY) {
            return { success: false, error: "Gemini API Key not configured." };
        }
        console.log("Calling Gemini API with prompt:", prompt);
        try {
            const response = await new Promise(resolve => setTimeout(() => {
                resolve(`AI response for: "${prompt}". This is a simulated response.`);
            }, 1000));
            return { success: true, response: response };
        } catch (error) {
            console.error("Gemini API call failed:", error);
            return { success: false, error: error.message };
        }
    },

    async pushAllData(dataManager) {
        if (!currentUserId) return { success: false, error: "User not authenticated." };
        if (!db) return { success: false, error: "Firestore not initialized." };

        console.log("Pushing all local data to Firebase...");
        try {
            const projects = await dataManager.getProjects();
            for (const project of projects) {
                const projectRef = doc(db, "users", currentUserId, "projects", project.id);
                await setDoc(projectRef, project, { merge: true });

                const itemTypes = ['ideas', 'characters', 'locations', 'objects', 'systems'];
                for (const itemType of itemTypes) {
                    const items = await dataManager.getProjectItems(project.id, itemType);
                    for (const item of items) {
                        const itemRef = doc(db, "users", currentUserId, "projects", project.id, itemType, item.id);
                        await setDoc(itemRef, item, { merge: true });
                    }
                }
            }
            console.log("All data pushed successfully.");
            return { success: true };
        } catch (error) {
            console.error("Failed to push data:", error);
            return { success: false, error: error.message };
        }
    },

    async pullAllData(dataManager) {
        if (!currentUserId) return { success: false, error: "User not authenticated." };
        if (!db) return { success: false, error: "Firestore not initialized." };
        console.log("Pulling all data from Firebase...");
        // Implementation to be added
        return { success: false, error: "Pull functionality not yet implemented." };
    }
};