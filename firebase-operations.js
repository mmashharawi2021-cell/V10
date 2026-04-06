// firebase-operations.js
import { doc, setDoc, getDocs, collection, query, where, deleteDoc } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { users as localUsers } from './users.js';

let authInstance = null;
let authReadyPromise = null;

function normalizeGovernorateValue(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item || '').trim()).filter(Boolean);
    }

    const raw = String(value || '').trim();
    if (!raw || raw.toLowerCase() === 'all') return 'all';

    const items = raw.split(/[,،]/).map((item) => item.trim()).filter(Boolean);
    if (!items.length) return 'all';
    return items.length === 1 ? items[0] : items;
}

function normalizeIdentifier(value) {
    return String(value || '').trim().toLowerCase();
}

function normalizeUserRecord(userData = {}, docId = '') {
    const email = (userData.email || docId || '').trim().toLowerCase();
    const username = (userData.username || (email.includes('@') ? email.split('@')[0] : email) || '').trim();

    return {
        ...userData,
        id: userData.id || docId || email || username,
        name: userData.name || userData.fullName || username || email || 'مستخدم',
        fullName: userData.fullName || userData.name || username || email || 'مستخدم',
        email,
        username,
        role: userData.role || 'viewer',
        governorate: normalizeGovernorateValue(userData.governorate || userData.governorates || 'all'),
        active: userData.active !== false,
        showHome: userData.showHome !== false,
        showStats: userData.showStats !== false,
        showFlow: userData.showFlow !== false,
        showStyle: userData.showStyle !== false,
        showPersonas: userData.showPersonas !== false,
        canDraw: userData.role === 'admin' ? true : userData.canDraw === true,
        canEditData: userData.role === 'admin' ? true : userData.canEditData === true,
        canEditStatus: userData.role === 'admin' ? true : userData.canEditStatus === true,
        canExport: userData.role === 'admin' ? true : userData.canExport === true,
        canManageUsers: userData.role === 'admin' ? true : userData.canManageUsers === true,
        canEditGeometry: userData.role === 'admin' ? true : userData.canEditGeometry === true,
        canDeleteGeometry: userData.role === 'admin' ? true : userData.canDeleteGeometry === true
    };
}

async function queryUsersByField(field, value) {
    if (!window.db || !value) return [];
    const q = query(collection(window.db, 'users'), where(field, '==', value));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((snapshot) => normalizeUserRecord(snapshot.data(), snapshot.id));
}

function findLocalUser(identifier) {
    const normalizedIdentifier = normalizeIdentifier(identifier);
    const match = localUsers.find((user) => {
        const normalizedEmail = normalizeIdentifier(user.email);
        const normalizedUsername = normalizeIdentifier(user.username);
        return normalizedIdentifier === normalizedEmail || normalizedIdentifier === normalizedUsername;
    });
    return match ? normalizeUserRecord(match, match.email || match.username) : null;
}

export async function initializeFirebase(app) {
    if (authReadyPromise) return authReadyPromise;

    authReadyPromise = (async () => {
        authInstance = getAuth(app);
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

export async function authenticateUser(identifier, password) {
    const cleanedIdentifier = String(identifier || '').trim();
    const cleanedPassword = String(password || '');

    if (!cleanedIdentifier || !cleanedPassword) {
        return { success: false, message: 'يرجى إدخال اسم المستخدم أو البريد الإلكتروني وكلمة المرور' };
    }

    try {
        if (window.firebaseInit) await window.firebaseInit;

        const normalizedIdentifier = normalizeIdentifier(cleanedIdentifier);
        let users = [];

        if (cleanedIdentifier.includes('@')) {
            users = await queryUsersByField('email', normalizedIdentifier);
        }

        if (!users.length) {
            users = await queryUsersByField('username', cleanedIdentifier.trim());
        }

        if (!users.length) {
            const localUser = findLocalUser(cleanedIdentifier);
            if (localUser) users = [localUser];
        }

        if (!users.length) {
            return { success: false, message: 'بيانات الاعتماد غير صالحة' };
        }

        const userData = users[0];

        if (userData.active === false) {
            return { success: false, message: 'هذا الحساب معطل حالياً. يرجى مراجعة المسؤول.' };
        }

        if (!userData.password) {
            return { success: false, message: 'لا يمكن تسجيل الدخول لهذا الحساب قبل تعيين كلمة مرور من المسؤول.' };
        }

        if (userData.password !== cleanedPassword) {
            return { success: false, message: 'بيانات الاعتماد غير صالحة' };
        }

        return { success: true, user: normalizeUserRecord(userData, userData.email || userData.username) };
    } catch (error) {
        console.error('Auth error:', error);
        const localUser = findLocalUser(cleanedIdentifier);
        if (localUser && localUser.password === cleanedPassword && localUser.active !== false) {
            return { success: true, user: localUser };
        }
        return { success: false, message: 'تعذر التحقق من بيانات الاعتماد. تحقق من الاتصال أو بيانات المستخدم.' };
    }
}

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

export async function loadAllZoneUpdates() {
    try {
        if (window.firebaseInit) await window.firebaseInit;

        const querySnapshot = await getDocs(collection(window.db, 'zone_updates'));
        const updates = {};
        querySnapshot.forEach((snapshot) => {
            updates[snapshot.id] = snapshot.data();
        });

        return updates;
    } catch (error) {
        console.error('Error loading zone updates:', error);
        return {};
    }
}

export async function getAllUsers() {
    try {
        if (window.firebaseInit) await window.firebaseInit;
        if (!window.db) throw new Error('Firestore not initialized');

        const querySnapshot = await getDocs(collection(window.db, 'users'));
        const users = [];
        querySnapshot.forEach((snapshot) => {
            users.push(normalizeUserRecord(snapshot.data(), snapshot.id));
        });

        return users.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    } catch (error) {
        console.error('Error loading users:', error);
        return localUsers.map((user) => normalizeUserRecord(user, user.email || user.username));
    }
}

export async function saveUserToFirestore(userData) {
    try {
        if (window.firebaseInit) await window.firebaseInit;

        const normalized = normalizeUserRecord(userData, userData.email);
        if (!normalized.email) {
            return { success: false, message: 'البريد الإلكتروني مطلوب لحفظ المستخدم' };
        }

        let payload = { ...normalized };

        if (!payload.password) {
            try {
                const existingUsers = await queryUsersByField('email', payload.email);
                if (existingUsers.length && existingUsers[0].password) {
                    payload.password = existingUsers[0].password;
                } else {
                    return { success: false, message: 'يجب إدخال كلمة مرور للمستخدم الجديد أو للحساب الذي لا يملك كلمة مرور حالياً' };
                }
            } catch (lookupError) {
                return { success: false, message: 'تعذر التحقق من كلمة المرور الحالية لهذا المستخدم' };
            }
        }

        payload.updatedAt = new Date().toISOString();
        const userRef = doc(window.db, 'users', payload.email);
        await setDoc(userRef, payload, { merge: true });

        console.log(`User ${payload.email} saved successfully`);
        return { success: true };
    } catch (error) {
        console.error('Error saving user:', error);
        return { success: false, message: error.message };
    }
}

export async function deleteUserFromFirestore(email) {
    try {
        if (window.firebaseInit) await window.firebaseInit;
        if (!email) return { success: false, message: 'البريد الإلكتروني مطلوب للحذف' };
        
        const userRef = doc(window.db, 'users', email);
        await deleteDoc(userRef);
        return { success: true };
    } catch (error) {
        console.error('Error deleting user:', error);
        return { success: false, message: error.message };
    }
}

export async function saveZoneDataToFirebase(data) {
    return { success: false, message: 'Legacy method disabled' };
}

export async function loadZoneDataFromFirebase() {
    return null;
}
