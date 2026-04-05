// firebase-operations.js
import { doc, setDoc, getDoc, getDocs, collection, query, where } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';

let authInstance = null;
let authReadyPromise = null;

export async function initializeFirebase(app) {
    if (authReadyPromise) return authReadyPromise;

    authReadyPromise = (async () => {
        authInstance = getAuth(app);
        // We log the current user for debugging but don't force a sign-in here to avoid 400 errors
        // if Anonymous Auth is disabled in the Firebase Console.
        if (authInstance.currentUser) {
            console.log('Firebase user found:', authInstance.currentUser.uid);
        } else {
            console.log('No Firebase user signed in - Firestore will use current permissions.');
        }

        onAuthStateChanged(authInstance, (user) => {
            if (user) {
                console.log('Firebase auth state changed: signed in', user.uid);
            } else {
                console.log('Firebase auth state changed: signed out');
            }
        });

        return authInstance;
    })();

    return authReadyPromise;
}

/**
 * Authenticates any user from Firestore
 */
export async function authenticateUser(email, password) {
    try {
        if (window.firebaseInit) await window.firebaseInit;
        
        const q = query(collection(window.db, "users"), where("email", "==", email));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            const userData = querySnapshot.docs[0].data();
            
            // Check if account is active
            if (userData.active === false) {
                return { success: false, message: "هذا الحساب معطل حالياً. يرجى مراجعة المسؤول." };
            }

            // In the screenshot, there was no password field. 
            // We assume for now that if the user provides the correct email, we check a 'password' field if it exists.
            if (!userData.password || userData.password === password) {
                return { success: true, user: userData };
            }
        }
        return { success: false, message: "بيانات الاعتماد غير صالحة" };
    } catch (error) {
        console.error("Auth error:", error);
        return { success: false, message: error.message };
    }
}


/**
 * Saves specific zone data to the zone_updates collection
 */
export async function saveZoneUpdate(zoneCode, data) {
    try {
        if (window.firebaseInit) await window.firebaseInit;

        const docRef = doc(window.db, 'zone_updates', zoneCode);
        await setDoc(docRef, {
            ...data,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        
        console.log(`Zone ${zoneCode} updated successfully`);
        return { success: true };
    } catch (error) {
        console.error('Error saving zone update:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Loads all zone updates from the zone_updates collection
 */
export async function loadAllZoneUpdates() {
    try {
        if (window.firebaseInit) await window.firebaseInit;

        const querySnapshot = await getDocs(collection(window.db, "zone_updates"));
        const updates = {};
        querySnapshot.forEach((doc) => {
            updates[doc.id] = doc.data();
        });
        
        return updates;
    } catch (error) {
        console.error('Error loading zone updates:', error);
        return {};
    }
}

/**
 * Loads all users from the users collection
 */
export async function getAllUsers() {
    try {
        if (window.firebaseInit) await window.firebaseInit;

        const querySnapshot = await getDocs(collection(window.db, "users"));
        const users = [];
        querySnapshot.forEach((doc) => {
            users.push({ id: doc.id, ...doc.data() });
        });
        
        return users;
    } catch (error) {
        console.error('Error loading users:', error);
        return [];
    }
}

/**
 * Saves or updates a user in the users collection
 */
export async function saveUserToFirestore(userData) {
    try {
        if (window.firebaseInit) await window.firebaseInit;

        const userRef = doc(window.db, 'users', userData.email);
        await setDoc(userRef, {
            ...userData,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        
        console.log(`User ${userData.email} saved successfully`);
        return { success: true };
    } catch (error) {
        console.error('Error saving user:', error);
        return { success: false, message: error.message };
    }
}

// Legacy support placeholders
export async function saveZoneDataToFirebase(data) {
    return { success: false, message: "Legacy method disabled" };
}

export async function loadZoneDataFromFirebase() {
    return null;
}
