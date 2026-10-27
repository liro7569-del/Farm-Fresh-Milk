/**
 * FARM FRESH CHOCOLATE MILK - FIREBASE AUTH & FIRESTORE INTEGRATION
 * Handles User Sign In, Sign Up, Profile Data Persistence, and Order Checkout
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

// User's Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBsPx7bUck1F-ANZxGDVw3mLVpw5NEk79o",
  authDomain: "farm-fresh-chocolate-milk.firebaseapp.com",
  projectId: "farm-fresh-chocolate-milk",
  storageBucket: "farm-fresh-chocolate-milk.firebasestorage.app",
  messagingSenderId: "1053586187298",
  appId: "1:1053586187298:web:e21fa1e7fad141c7b3167b"
};

// Diagnostic Logging
const DIAGNOSTIC_TAG = "[FarmFresh Auth]";
function logDiag(operation, status, details = {}) {
  const timestamp = new Date().toISOString();
  console.log(`${DIAGNOSTIC_TAG} [${timestamp}] [${operation}] -> ${status}`, details);
}

// Initialize Firebase App & Services
logDiag("Initialization", "START", { projectId: firebaseConfig.projectId, authDomain: firebaseConfig.authDomain });
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
logDiag("Initialization", "SUCCESS", { authReady: !!auth, firestoreReady: !!db });

// Current User & Profile State
let currentUser = null;
let currentUserProfile = null;
let pendingOrderAction = null;

// Concurrency Prevention Flags
let isSubmittingSignUp = false;
let isSubmittingSignIn = false;
let isSubmittingGoogle = false;

/**
 * Mask email for secure diagnostic logging (Never logs passwords or tokens)
 */
function maskEmail(email) {
  if (!email) return '';
  const parts = email.split('@');
  if (parts.length < 2) return '***';
  const name = parts[0];
  const maskedName = name.length > 2 ? name.substring(0, 2) + '***' : name + '***';
  return `${maskedName}@${parts[1]}`;
}

/**
 * Local Profile Storage Helpers (Guarantees responsive UI and preserved sessions)
 */
function saveLocalProfile(uid, profile) {
  currentUserProfile = profile;
  try {
    localStorage.setItem(`ff_user_${uid}`, JSON.stringify(profile));
  } catch (e) {
    console.warn("Could not save to localStorage:", e);
  }
}

function getLocalProfile(uid) {
  try {
    const cached = localStorage.getItem(`ff_user_${uid}`);
    if (cached) return JSON.parse(cached);
  } catch (e) {}
  return null;
}

/**
 * Safe Firestore SetDoc with Diagnostic Timeout
 * Does NOT block or hang indefinitely if Firestore database is unprovisioned (404) or network retries
 */
async function safeFirestoreSetDoc(docRef, data, timeoutMs = 4000) {
  const opStart = performance.now();
  logDiag("Firestore:setDoc", "START", { path: docRef.path });

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        const duration = (performance.now() - opStart).toFixed(1) + 'ms';
        logDiag("Firestore:setDoc", "TIMEOUT", {
          path: docRef.path,
          duration,
          note: `Firestore write timed out after ${timeoutMs}ms. Database may not be provisioned in Firebase Console or network retrying.`
        });
        reject(new Error(`Firestore write timed out after ${timeoutMs}ms. Please check if Cloud Firestore database is created in Firebase Console.`));
      }
    }, timeoutMs);

    setDoc(docRef, data, { merge: true })
      .then((res) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          const duration = (performance.now() - opStart).toFixed(1) + 'ms';
          logDiag("Firestore:setDoc", "SUCCESS", { path: docRef.path, duration });
          resolve(res);
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          const duration = (performance.now() - opStart).toFixed(1) + 'ms';
          logDiag("Firestore:setDoc", "ERROR", { path: docRef.path, duration, code: err.code, message: err.message });
          reject(err);
        }
      });
  });
}

/**
 * Safe Firestore GetDoc with Diagnostic Timeout
 */
async function safeFirestoreGetDoc(docRef, timeoutMs = 4000) {
  const opStart = performance.now();
  logDiag("Firestore:getDoc", "START", { path: docRef.path });

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        const duration = (performance.now() - opStart).toFixed(1) + 'ms';
        logDiag("Firestore:getDoc", "TIMEOUT", {
          path: docRef.path,
          duration,
          note: `Firestore read timed out after ${timeoutMs}ms.`
        });
        reject(new Error(`Firestore getDoc timed out after ${timeoutMs}ms.`));
      }
    }, timeoutMs);

    getDoc(docRef)
      .then((snap) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          const duration = (performance.now() - opStart).toFixed(1) + 'ms';
          logDiag("Firestore:getDoc", "SUCCESS", { path: docRef.path, exists: snap.exists(), duration });
          resolve(snap);
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          const duration = (performance.now() - opStart).toFixed(1) + 'ms';
          logDiag("Firestore:getDoc", "ERROR", { path: docRef.path, duration, code: err.code, message: err.message });
          reject(err);
        }
      });
  });
}

// ==========================================
// AUTHENTICATION FUNCTIONS
// ==========================================

/**
 * BUG 1 FIX: Register a new user with Email, Password, Name, Phone & Address
 * Separates Firebase Auth account creation from Firestore profile creation.
 * If Auth succeeds but Firestore fails, preserves the authenticated session and reports clearly.
 */
export async function signUpUser(email, password, name, phone = '', address = '') {
  if (isSubmittingSignUp) {
    logDiag("signUpUser", "BLOCKED_CONCURRENT_SUBMISSION");
    return { success: false, error: new Error("Registration already in progress") };
  }
  isSubmittingSignUp = true;
  const opStart = performance.now();
  logDiag("signUpUser", "START", { emailMasked: maskEmail(email) });

  let userCredential = null;
  let user = null;

  // STAGE 1: Firebase Authentication
  try {
    userCredential = await createUserWithEmailAndPassword(auth, email, password);
    user = userCredential.user;
    const authDuration = (performance.now() - opStart).toFixed(1) + 'ms';
    logDiag("signUpUser:Auth", "SUCCESS", { uid: user.uid, authDuration });

    if (name) {
      await updateProfile(user, { displayName: name }).catch((err) => {
        logDiag("signUpUser:updateProfile", "WARN", { error: err.message });
      });
    }
  } catch (authError) {
    isSubmittingSignUp = false;
    const duration = (performance.now() - opStart).toFixed(1) + 'ms';
    logDiag("signUpUser:Auth", "FAILED", { code: authError.code, message: authError.message, duration });
    const friendlyMsg = getFriendlyErrorMessage(authError);
    showNotification(friendlyMsg, "error");
    showAuthAlert(friendlyMsg, "error");
    return { success: false, stage: 'auth', error: authError, message: friendlyMsg };
  }

  // Cache user profile in memory and localStorage immediately
  const profileData = {
    uid: user.uid,
    name: name || user.email.split('@')[0],
    email: user.email,
    phone: phone || '',
    address: address || '',
    role: 'customer',
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString()
  };
  saveLocalProfile(user.uid, profileData);

  // Authentication succeeded -> Close the auth dialog immediately & update navbar
  closeAuthModal();
  updateNavbarAuthState(user);
  isSubmittingSignUp = false;

  showNotification(`Welcome to Farm Fresh, ${profileData.name}! Account created.`, "success");

  // STAGE 2: Firestore User Profile Creation (Non-blocking background sync)
  (async () => {
    try {
      await safeFirestoreSetDoc(doc(db, "users", user.uid), {
        ...profileData,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp()
      }, 3500);
      logDiag("signUpUser:Firestore", "SUCCESS", { uid: user.uid });
    } catch (fsErr) {
      logDiag("signUpUser:Firestore", "WARN", {
        uid: user.uid,
        code: fsErr.code,
        message: fsErr.message,
        note: "Authentication session preserved. Profile stored locally."
      });
      showNotification(`Note: Cloud Firestore profile write pending (${fsErr.message})`, "warning");
    }
  })();

  return {
    success: true,
    user,
    profile: profileData
  };
}

/**
 * BUG 2 FIX: Sign in existing user with Email and Password
 * Awaits operations correctly, resets loading state on every failure path,
 * closes dialog after authentication, and never leaves dialog stuck if profile document is missing.
 */
export async function signInUser(email, password) {
  if (isSubmittingSignIn) {
    logDiag("signInUser", "BLOCKED_CONCURRENT_SUBMISSION");
    return { success: false, error: new Error("Sign in already in progress") };
  }
  isSubmittingSignIn = true;
  const opStart = performance.now();
  logDiag("signInUser", "START", { emailMasked: maskEmail(email) });

  let userCredential = null;
  let user = null;

  try {
    userCredential = await signInWithEmailAndPassword(auth, email, password);
    user = userCredential.user;
    const authDuration = (performance.now() - opStart).toFixed(1) + 'ms';
    logDiag("signInUser:Auth", "SUCCESS", { uid: user.uid, authDuration });
  } catch (authError) {
    isSubmittingSignIn = false;
    const duration = (performance.now() - opStart).toFixed(1) + 'ms';
    logDiag("signInUser:Auth", "FAILED", { code: authError.code, message: authError.message, duration });
    const friendlyMsg = getFriendlyErrorMessage(authError);
    showNotification(friendlyMsg, "error");
    showAuthAlert(friendlyMsg, "error");
    return { success: false, error: authError, message: friendlyMsg };
  }

  // Authentication succeeded -> Close modal immediately and update UI
  closeAuthModal();
  updateNavbarAuthState(user);

  // Load cached profile or build fallback
  try {
    let profile = getLocalProfile(user.uid);
    if (!profile) {
      profile = {
        uid: user.uid,
        name: user.displayName || user.email.split('@')[0],
        email: user.email,
        phone: '',
        address: '',
        role: 'customer'
      };
      saveLocalProfile(user.uid, profile);
    }

    // Attempt profile fetch from Firestore with safe timeout
    safeFirestoreGetDoc(doc(db, "users", user.uid), 3500)
      .then((docSnap) => {
        if (docSnap && docSnap.exists()) {
          const remoteData = docSnap.data();
          saveLocalProfile(user.uid, { ...profile, ...remoteData });
          updateNavbarAuthState(user);
        }
      })
      .catch((err) => {
        logDiag("signInUser:fetchProfile", "WARN", { error: err.message });
      });

    // Update lastLogin in Firestore (non-blocking)
    safeFirestoreSetDoc(doc(db, "users", user.uid), {
      lastLogin: serverTimestamp()
    }, 3000).catch(() => {});

    showNotification(`Welcome back, ${profile.name}!`, "success");
  } finally {
    isSubmittingSignIn = false;
  }

  return { success: true, user };
}

/**
 * BUG 3 FIX: Sign in / Sign up with Google OAuth Popup
 * Connects GoogleAuthProvider with prompt: 'select_account', catches error codes,
 * dismisses modal immediately on user return, and handles profile sync safely.
 */
export async function signInWithGoogle() {
  if (isSubmittingGoogle) {
    logDiag("signInWithGoogle", "BLOCKED_CONCURRENT_SUBMISSION");
    return { success: false, error: new Error("Google sign-in already in progress") };
  }
  isSubmittingGoogle = true;
  const opStart = performance.now();
  logDiag("signInWithGoogle", "START");

  const googleBtn = document.getElementById('btn-google-login');
  let origBtnHtml = '';
  if (googleBtn) {
    origBtnHtml = googleBtn.innerHTML;
    googleBtn.disabled = true;
    googleBtn.innerHTML = `
      <span class="spinner-sm" style="margin-right:8px;"></span>
      <span>Connecting to Google...</span>
    `;
  }

  let result = null;
  let user = null;

  try {
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    result = await signInWithPopup(auth, googleProvider);
    user = result.user;
    const authDuration = (performance.now() - opStart).toFixed(1) + 'ms';
    logDiag("signInWithGoogle:Popup", "SUCCESS", { uid: user.uid, authDuration });
  } catch (popupError) {
    isSubmittingGoogle = false;
    if (googleBtn && origBtnHtml) {
      googleBtn.disabled = false;
      googleBtn.innerHTML = origBtnHtml;
    }
    const duration = (performance.now() - opStart).toFixed(1) + 'ms';
    logDiag("signInWithGoogle:Popup", "FAILED", { code: popupError.code, message: popupError.message, duration });
    const friendlyMsg = getFriendlyErrorMessage(popupError);
    showNotification(friendlyMsg, "error");
    showAuthAlert(friendlyMsg, "error");
    return { success: false, error: popupError, message: friendlyMsg };
  }

  // Google Authentication Succeeded -> Dismiss modal immediately
  closeAuthModal();
  if (googleBtn && origBtnHtml) {
    googleBtn.disabled = false;
    googleBtn.innerHTML = origBtnHtml;
  }

  // Prepare profile and cache locally
  let existingProfile = getLocalProfile(user.uid);
  const googleProfile = {
    uid: user.uid,
    name: user.displayName || user.email.split('@')[0],
    email: user.email,
    phone: user.phoneNumber || existingProfile?.phone || '',
    address: existingProfile?.address || '',
    photoURL: user.photoURL || '',
    role: 'customer',
    lastLogin: new Date().toISOString()
  };
  saveLocalProfile(user.uid, googleProfile);
  updateNavbarAuthState(user);
  showNotification(`Signed in as ${googleProfile.name}!`, "success");

  // Sync with Firestore asynchronously with timeout (does not overwrite existing custom data)
  (async () => {
    try {
      const userDocRef = doc(db, "users", user.uid);
      const docSnap = await safeFirestoreGetDoc(userDocRef, 3500);
      if (docSnap && docSnap.exists()) {
        logDiag("signInWithGoogle:Firestore", "EXISTING_USER", { uid: user.uid });
        await safeFirestoreSetDoc(userDocRef, { lastLogin: serverTimestamp() }, 3000);
        saveLocalProfile(user.uid, { ...googleProfile, ...docSnap.data() });
        updateNavbarAuthState(user);
      } else {
        logDiag("signInWithGoogle:Firestore", "NEW_USER_CREATE", { uid: user.uid });
        await safeFirestoreSetDoc(userDocRef, {
          ...googleProfile,
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp()
        }, 3500);
      }
    } catch (fsErr) {
      logDiag("signInWithGoogle:Firestore", "WARN", { error: fsErr.message });
    } finally {
      isSubmittingGoogle = false;
    }
  })();

  isSubmittingGoogle = false;
  return { success: true, user };
}

/**
 * Sign Out current user
 */
export async function signOutUser() {
  try {
    logDiag("signOutUser", "START");
    await signOut(auth);
    currentUser = null;
    currentUserProfile = null;
    updateNavbarAuthState(null);
    showNotification("Signed out successfully", "info");
    logDiag("signOutUser", "SUCCESS");
    return { success: true };
  } catch (error) {
    logDiag("signOutUser", "FAILED", { error: error.message });
    showNotification(error.message, "error");
    return { success: false, error };
  }
}

// ==========================================
// ORDERS & DATA STORAGE
// ==========================================

/**
 * Place a chilled drink order and store in Firestore with local backup
 */
export async function placeOrder(orderData) {
  if (!currentUser) {
    showNotification("Please sign in or create an account to order drinks", "warning");
    openAuthModal();
    return { success: false, error: "Not authenticated" };
  }

  try {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `FF-${new Date().getFullYear()}-${randomSuffix}`;

    const orderPayload = {
      orderId: orderNumber,
      userId: currentUser.uid,
      userName: orderData.userName || currentUser.displayName || currentUserProfile?.name || 'Valued Customer',
      userEmail: currentUser.email,
      phone: orderData.phone || currentUserProfile?.phone || '',
      deliveryAddress: orderData.deliveryAddress || currentUserProfile?.address || '',
      drinkFlavor: orderData.flavor || 'Chocolate Flavoured Milk',
      packType: orderData.packType || 'Chill Pack of 6',
      quantity: parseInt(orderData.quantity || 1, 10),
      totalPrice: orderData.totalPrice || '$11.90',
      deliveryNotes: orderData.notes || '',
      status: 'Confirmed — Cold-Chain Packing',
      createdAt: new Date().toISOString()
    };

    // Store in local backup immediately so user never loses order
    try {
      const localOrders = JSON.parse(localStorage.getItem(`ff_orders_${currentUser.uid}`) || '[]');
      localOrders.unshift(orderPayload);
      localStorage.setItem(`ff_orders_${currentUser.uid}`, JSON.stringify(localOrders));

      // Also record in ff_all_orders for Admin Portal
      const allOrders = JSON.parse(localStorage.getItem('ff_all_orders') || '[]');
      const existingIdx = allOrders.findIndex(o => o.orderId === orderNumber);
      if (existingIdx >= 0) {
        allOrders[existingIdx] = orderPayload;
      } else {
        allOrders.unshift(orderPayload);
      }
      localStorage.setItem('ff_all_orders', JSON.stringify(allOrders));
    } catch (e) {}

    // Store order in root orders collection with safe timeout
    let docId = 'local-' + Date.now();
    try {
      const orderPromise = addDoc(collection(db, "orders"), {
        ...orderPayload,
        createdAt: serverTimestamp()
      });
      const orderRef = await Promise.race([
        orderPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 4000))
      ]);
      docId = orderRef.id;
      logDiag("placeOrder", "FIRESTORE_SUCCESS", { orderId: orderNumber, docId });
    } catch (fsErr) {
      logDiag("placeOrder", "FIRESTORE_TIMEOUT_SAVED_LOCALLY", { orderId: orderNumber, error: fsErr.message });
    }

    // Also update user's address/phone if provided
    if (orderData.deliveryAddress || orderData.phone) {
      safeFirestoreSetDoc(doc(db, "users", currentUser.uid), {
        phone: orderData.phone || currentUserProfile?.phone || '',
        address: orderData.deliveryAddress || currentUserProfile?.address || '',
        lastOrderAt: serverTimestamp()
      }, 3000).catch(() => {});
    }

    showNotification(`Order ${orderNumber} placed successfully!`, "success");
    return { success: true, orderId: orderNumber, docId };
  } catch (error) {
    console.error("Order placement error:", error);
    showNotification("Failed to save order: " + error.message, "error");
    return { success: false, error };
  }
}

/**
 * Get all past orders for current user from Firestore or local cache
 */
export async function getUserOrders() {
  if (!currentUser) return [];

  let orders = [];

  // Try Firestore first
  try {
    const q = query(
      collection(db, "orders"),
      where("userId", "==", currentUser.uid),
      orderBy("createdAt", "desc")
    );
    const querySnapshot = await Promise.race([
      getDocs(q),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3500))
    ]);
    querySnapshot.forEach((doc) => {
      orders.push({ id: doc.id, ...doc.data() });
    });
  } catch (error) {
    try {
      const qFallback = query(collection(db, "orders"), where("userId", "==", currentUser.uid));
      const snap = await Promise.race([
        getDocs(qFallback),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
      ]);
      snap.forEach((doc) => {
        orders.push({ id: doc.id, ...doc.data() });
      });
    } catch (e) {}
  }

  // Fallback to local storage
  if (orders.length === 0) {
    try {
      const local = JSON.parse(localStorage.getItem(`ff_orders_${currentUser.uid}`) || '[]');
      if (local.length > 0) orders = local;
    } catch (e) {}
  }

  return orders;
}

// ==========================================
// ADMIN PORTAL & ORDER MANAGEMENT
// ==========================================

export const ADMIN_EMAIL = 'liro7569@gmail.com';

export function isAdminUser(userOrEmail) {
  if (!userOrEmail) return false;
  const email = typeof userOrEmail === 'string' ? userOrEmail : (userOrEmail.email || '');
  return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

/**
 * Get ALL orders across all customers for Admin Portal
 * Fetches from Firestore and merges with local backups (ff_all_orders & ff_orders_*)
 */
export async function getAdminAllOrders() {
  logDiag("getAdminAllOrders", "START");
  const ordersMap = new Map();

  // 1. Gather any orders cached in localStorage ff_all_orders
  try {
    const cachedAll = JSON.parse(localStorage.getItem('ff_all_orders') || '[]');
    cachedAll.forEach(o => {
      if (o && o.orderId) ordersMap.set(o.orderId, o);
    });
  } catch (e) {}

  // 2. Also scan all user order arrays in localStorage (ff_orders_*)
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('ff_orders_')) {
        const userOrders = JSON.parse(localStorage.getItem(key) || '[]');
        userOrders.forEach(o => {
          if (o && o.orderId && !ordersMap.has(o.orderId)) {
            ordersMap.set(o.orderId, o);
          }
        });
      }
    }
  } catch (e) {}

  // 3. Fetch from Firestore root orders collection
  try {
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const snap = await Promise.race([
      getDocs(q),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 3500))
    ]);
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const id = data.orderId || docSnap.id;
      ordersMap.set(id, { id: docSnap.id, docId: docSnap.id, ...data });
    });
    logDiag("getAdminAllOrders", "FIRESTORE_SUCCESS", { count: snap.size });
  } catch (err) {
    logDiag("getAdminAllOrders", "FIRESTORE_FALLBACK_LOCAL", { error: err.message });
  }

  const allOrders = Array.from(ordersMap.values());
  // Sort by createdAt descending
  allOrders.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  // Sync back to ff_all_orders so local cache stays fresh
  try {
    localStorage.setItem('ff_all_orders', JSON.stringify(allOrders));
  } catch (e) {}

  return allOrders;
}

/**
 * Admin updates status of any order (e.g. Approved, In Transit, Delivered, Cancelled)
 */
export async function adminUpdateOrderStatus(orderId, newStatus) {
  logDiag("adminUpdateOrderStatus", "START", { orderId, newStatus });
  let updatedInFirestore = false;

  // 1. Update in Firestore collection "orders"
  try {
    const q = query(collection(db, "orders"), where("orderId", "==", orderId));
    const snap = await Promise.race([
      getDocs(q),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ]);
    if (!snap.empty) {
      const docRef = snap.docs[0].ref;
      await updateDoc(docRef, {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      updatedInFirestore = true;
      logDiag("adminUpdateOrderStatus", "FIRESTORE_UPDATED", { orderId, docId: docRef.id });
    }
  } catch (e) {
    logDiag("adminUpdateOrderStatus", "FIRESTORE_WARN", { error: e.message });
  }

  // 2. Update in localStorage ff_all_orders
  try {
    const allOrders = JSON.parse(localStorage.getItem('ff_all_orders') || '[]');
    const idx = allOrders.findIndex(o => o.orderId === orderId);
    if (idx >= 0) {
      allOrders[idx].status = newStatus;
      allOrders[idx].updatedAt = new Date().toISOString();
      localStorage.setItem('ff_all_orders', JSON.stringify(allOrders));
    }
  } catch (e) {}

  // 3. Update in customer's local storage ff_orders_*
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('ff_orders_')) {
        const userOrders = JSON.parse(localStorage.getItem(key) || '[]');
        let modified = false;
        userOrders.forEach(o => {
          if (o && o.orderId === orderId) {
            o.status = newStatus;
            o.updatedAt = new Date().toISOString();
            modified = true;
          }
        });
        if (modified) {
          localStorage.setItem(key, JSON.stringify(userOrders));
        }
      }
    }
  } catch (e) {}

  return { success: true, orderId, newStatus, updatedInFirestore };
}

/**
 * Admin adds a new order directly from the Admin Portal
 */
export async function adminCreateOrder(orderData) {
  logDiag("adminCreateOrder", "START", { customer: orderData.userName });
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const orderNumber = `FF-${new Date().getFullYear()}-${randomSuffix}`;

  const orderPayload = {
    orderId: orderNumber,
    userId: orderData.userId || 'admin-created',
    userName: orderData.userName || 'Direct / Walk-in Customer',
    userEmail: orderData.userEmail || 'customer@direct.com',
    phone: orderData.phone || '',
    deliveryAddress: orderData.deliveryAddress || 'Direct Depot Pickup',
    drinkFlavor: orderData.flavor || 'Chocolate Flavoured Milk',
    packType: orderData.packType || 'Chill Pack of 6',
    quantity: parseInt(orderData.quantity || 1, 10),
    totalPrice: orderData.totalPrice || '$11.90',
    deliveryNotes: orderData.notes || 'Created via Admin Portal',
    status: orderData.status || 'Approved & Cold Packing',
    createdSource: 'admin_portal',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // 1. Save in localStorage ff_all_orders
  try {
    const allOrders = JSON.parse(localStorage.getItem('ff_all_orders') || '[]');
    allOrders.unshift(orderPayload);
    localStorage.setItem('ff_all_orders', JSON.stringify(allOrders));
  } catch (e) {}

  // 2. Save in Firestore
  let docId = 'local-' + Date.now();
  try {
    const orderPromise = addDoc(collection(db, "orders"), {
      ...orderPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    const orderRef = await Promise.race([
      orderPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3500))
    ]);
    docId = orderRef.id;
    logDiag("adminCreateOrder", "FIRESTORE_SUCCESS", { orderId: orderNumber, docId });
  } catch (fsErr) {
    logDiag("adminCreateOrder", "FIRESTORE_FALLBACK_LOCAL", { error: fsErr.message });
  }

  return { success: true, orderId: orderNumber, docId, order: orderPayload };
}

/**
 * Admin deletes an order
 */
export async function adminDeleteOrder(orderId) {
  logDiag("adminDeleteOrder", "START", { orderId });

  // 1. Delete from Firestore
  try {
    const q = query(collection(db, "orders"), where("orderId", "==", orderId));
    const snap = await Promise.race([
      getDocs(q),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
    ]);
    if (!snap.empty) {
      await deleteDoc(snap.docs[0].ref);
      logDiag("adminDeleteOrder", "FIRESTORE_DELETED", { orderId });
    }
  } catch (e) {
    logDiag("adminDeleteOrder", "FIRESTORE_WARN", { error: e.message });
  }

  // 2. Remove from localStorage ff_all_orders
  try {
    let allOrders = JSON.parse(localStorage.getItem('ff_all_orders') || '[]');
    allOrders = allOrders.filter(o => o.orderId !== orderId);
    localStorage.setItem('ff_all_orders', JSON.stringify(allOrders));
  } catch (e) {}

  // 3. Remove from user orders in localStorage
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('ff_orders_')) {
        let userOrders = JSON.parse(localStorage.getItem(key) || '[]');
        userOrders = userOrders.filter(o => o.orderId !== orderId);
        localStorage.setItem(key, JSON.stringify(userOrders));
      }
    }
  } catch (e) {}

  return { success: true, orderId };
}

// ==========================================
// UI STATE & MODAL CONTROLLERS
// ==========================================

// Auth State Changed Observer
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    logDiag("onAuthStateChanged", "USER_ACTIVE", { uid: user.uid, email: maskEmail(user.email) });
    closeAuthModal();

    let profile = getLocalProfile(user.uid);
    if (!profile) {
      profile = {
        uid: user.uid,
        name: user.displayName || user.email?.split('@')[0] || 'Member',
        email: user.email || '',
        phone: '',
        address: '',
        role: 'customer'
      };
      saveLocalProfile(user.uid, profile);
    }
    updateNavbarAuthState(user);

    // Refresh profile in background from Firestore
    safeFirestoreGetDoc(doc(db, "users", user.uid), 3000)
      .then((docSnap) => {
        if (docSnap && docSnap.exists()) {
          saveLocalProfile(user.uid, { ...profile, ...docSnap.data() });
          updateNavbarAuthState(user);
        }
      })
      .catch(() => {});

    // If user clicked order before signing in, continue to order modal
    if (pendingOrderAction) {
      const action = pendingOrderAction;
      pendingOrderAction = null;
      openOrderModal(action);
    }
  } else {
    logDiag("onAuthStateChanged", "NO_USER");
    currentUserProfile = null;
    updateNavbarAuthState(null);
  }
});

/**
 * BUG 4 FIX: Navbar State Rendering
 * Strictly preserves the horizontal row where User Button / Profile is immediately to the LEFT of Replay
 */
function updateNavbarAuthState(user) {
  const userProfileSlot = document.getElementById('navbar-user-slot');
  if (!userProfileSlot) return;

  if (user) {
    const displayName = user.displayName || currentUserProfile?.name || user.email?.split('@')[0] || 'Member';
    const initial = (displayName.charAt(0) || 'U').toUpperCase();

    userProfileSlot.innerHTML = `
      <div class="user-profile-badge" id="btn-user-dropdown" title="Account Menu" style="height: 38px; display: inline-flex; align-items: center; gap: 8px;">
        <div class="user-avatar">${initial}</div>
        <span class="user-name">${displayName}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      <div class="user-dropdown-menu hidden" id="user-dropdown-menu">
        <div class="dropdown-header">
          <strong>${displayName}</strong>
          <span>${user.email || ''}</span>
        </div>
        <hr class="dropdown-divider">
        ${isAdminUser(user) ? `
        <a href="admin.html" class="dropdown-item" style="color: #f7d08b; font-weight: 600; text-decoration: none;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
          </svg>
          Admin Portal
        </a>
        ` : ''}
        <button class="dropdown-item" id="btn-view-orders">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <path d="M16 10a4 4 0 0 1-8 0"></path>
          </svg>
          My Chilled Orders
        </button>
        <button class="dropdown-item" id="btn-signout">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          Sign Out
        </button>
      </div>
    `;

    // Dropdown toggle listeners
    const dropdownBtn = document.getElementById('btn-user-dropdown');
    const dropdownMenu = document.getElementById('user-dropdown-menu');
    dropdownBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownMenu?.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      dropdownMenu?.classList.add('hidden');
    });

    document.getElementById('btn-view-orders')?.addEventListener('click', () => {
      openMyOrdersModal();
    });

    document.getElementById('btn-signout')?.addEventListener('click', () => {
      signOutUser();
    });

  } else {
    userProfileSlot.innerHTML = `
      <button class="btn btn-outline-gold btn-sm" id="btn-nav-signin" onclick="openAuthModal()" style="height: 38px; display: inline-flex; align-items: center; gap: 8px;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
        <span>Sign In</span>
      </button>
    `;

  }
}

// Friendly Firebase Error Messages with explicit actionable solutions and exact code/message preservation
function getFriendlyErrorMessage(error) {
  const code = error?.code || 'auth/unknown';
  const rawMsg = error?.message || 'Authentication error';
  let friendly = '';

  if (code === 'auth/email-already-in-use') {
    friendly = 'This email address is already registered. Please click "Sign In" above to log in.';
  } else if (code === 'auth/wrong-password') {
    friendly = 'Incorrect password. Please verify your credentials and try again.';
  } else if (code === 'auth/user-not-found') {
    friendly = 'No account found with this email. Please click "Create Account" above to register.';
  } else if (code === 'auth/invalid-credential') {
    friendly = 'Invalid email or password credentials. Please check your credentials or register a new account.';
  } else if (code === 'auth/weak-password') {
    friendly = 'Password is too weak. Firebase requires at least 6 characters.';
  } else if (code === 'auth/invalid-email') {
    friendly = 'Please enter a valid email address.';
  } else if (code === 'auth/too-many-requests') {
    friendly = 'Access temporarily disabled due to multiple failed attempts. Please wait a moment.';
  } else if (code === 'auth/popup-closed-by-user') {
    friendly = 'Google sign-in popup was closed before completion.';
  } else if (code === 'auth/cancelled-popup-request') {
    friendly = 'Previous Google sign-in request was cancelled.';
  } else if (code === 'auth/popup-blocked') {
    friendly = 'Google sign-in popup was blocked by your browser. Please allow popups for localhost and try again.';
  } else if (code === 'auth/operation-not-allowed') {
    friendly = 'This sign-in method is disabled in Firebase Console. Please enable it under Authentication > Sign-in method.';
  } else if (code === 'auth/unauthorized-domain') {
    friendly = 'Domain is not authorized in Firebase. Add "localhost" under Firebase Console > Authentication > Settings > Authorized Domains.';
  } else if (code === 'auth/account-exists-with-different-credential') {
    friendly = 'An account already exists with this email using a different sign-in method.';
  } else if (code === 'auth/network-request-failed') {
    friendly = 'Network connection failed. Please check your internet connection.';
  } else {
    friendly = rawMsg;
  }

  return `${friendly} [${code}]`;
}

// In-Modal Alert Box for immediate feedback
function showAuthAlert(message, type = 'error') {
  const alertBox = document.getElementById('auth-alert-box');
  if (alertBox) {
    alertBox.className = `auth-alert-box ${type}`;
    alertBox.textContent = message;
    alertBox.classList.remove('hidden');
  }
}

function clearAuthAlert() {
  const alertBox = document.getElementById('auth-alert-box');
  if (alertBox) {
    alertBox.textContent = '';
    alertBox.className = 'auth-alert-box hidden';
  }
}

// Toast Notifications
function showNotification(message, type = 'info') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast-pill toast-${type}`;

  let icon = '✦';
  if (type === 'success') icon = '✓';
  if (type === 'error') icon = '✕';
  if (type === 'warning') icon = '⚠';

  toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg">${message}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('visible');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 4500);
}

// ==========================================
// MODAL DIALOG CONTROLS
// ==========================================

export function openAuthModal(pendingAction = null) {
  if (pendingAction) {
    pendingOrderAction = pendingAction;
  }
  clearAuthAlert();
  const modal = document.getElementById('auth-modal');
  if (modal) {
    if (!modal.open) {
      modal.showModal();
    }
    // Ensure submit buttons are active and not stuck
    const btnIn = document.getElementById('btn-signin-submit');
    const btnUp = document.getElementById('btn-signup-submit');
    if (btnIn) {
      btnIn.disabled = false;
      btnIn.innerHTML = '<span>Sign In to Continue</span>';
    }
    if (btnUp) {
      btnUp.disabled = false;
      btnUp.innerHTML = '<span>Create Account & Save Profile</span>';
    }
  }
}

export function closeAuthModal() {
  clearAuthAlert();
  const modal = document.getElementById('auth-modal');
  if (modal && modal.open) {
    modal.close();
  }
}

/**
 * Enhanced Order Modal: Gatechecks Auth First!
 */
export function openOrderModal(customOrderPreset = null) {
  // If not signed in, require Sign In / Sign Up first!
  if (!currentUser) {
    showNotification("Please Sign In or Create an Account to order drinks", "warning");
    openAuthModal(customOrderPreset || { flavor: 'Chocolate Flavoured Milk' });
    return;
  }

  const modal = document.getElementById('order-modal');
  if (!modal) return;

  // Pre-fill user data in order checkout
  const nameInput = document.getElementById('checkout-name');
  const emailInput = document.getElementById('checkout-email');
  const phoneInput = document.getElementById('checkout-phone');
  const addressInput = document.getElementById('checkout-address');

  if (nameInput) nameInput.value = currentUser.displayName || currentUserProfile?.name || '';
  if (emailInput) emailInput.value = currentUser.email || '';
  if (phoneInput) phoneInput.value = currentUserProfile?.phone || '';
  if (addressInput) addressInput.value = currentUserProfile?.address || '';

  if (customOrderPreset?.flavor) {
    const flavorSelect = document.getElementById('checkout-flavor');
    if (flavorSelect) flavorSelect.value = customOrderPreset.flavor;
  }

  if (!modal.open) modal.showModal();
}

export function closeOrderModal() {
  const modal = document.getElementById('order-modal');
  if (modal && modal.open) modal.close();
}

/**
 * My Orders Modal
 */
export async function openMyOrdersModal() {
  const modal = document.getElementById('my-orders-modal');
  if (!modal) return;

  if (!modal.open) modal.showModal();
  const listContainer = document.getElementById('my-orders-list');
  if (listContainer) {
    listContainer.innerHTML = `<div class="orders-loading">Fetching your fresh orders...</div>`;
    const orders = await getUserOrders();
    if (orders.length === 0) {
      listContainer.innerHTML = `
        <div class="orders-empty">
          <p>No orders found yet.</p>
          <button class="btn btn-gold btn-sm" onclick="closeMyOrdersModal(); openOrderModal();">Order Your First Bottle</button>
        </div>
      `;
    } else {
      listContainer.innerHTML = orders.map((o) => `
        <div class="order-history-card">
          <div class="order-card-header">
            <span class="order-id">${o.orderId}</span>
            <span class="order-status-badge">${o.status || 'Confirmed'}</span>
          </div>
          <div class="order-card-body">
            <strong>${o.drinkFlavor}</strong> &bull; ${o.packType} (Qty: ${o.quantity})
            <p class="order-address">📍 Deliver to: ${o.deliveryAddress || 'Address on file'}</p>
          </div>
          <div class="order-card-footer">
            <span>Total: <strong>${o.totalPrice}</strong></span>
          </div>
        </div>
      `).join('');
    }
  }
}

export function closeMyOrdersModal() {
  const modal = document.getElementById('my-orders-modal');
  if (modal && modal.open) modal.close();
}

// Bind ALL functions to window for HTML inline access
window.signUpUser = signUpUser;
window.signInUser = signInUser;
window.signInWithGoogle = signInWithGoogle;
window.signOutUser = signOutUser;
window.placeOrder = placeOrder;
window.getUserOrders = getUserOrders;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.openOrderModal = openOrderModal;
window.closeOrderModal = closeOrderModal;
window.openMyOrdersModal = openMyOrdersModal;
window.closeMyOrdersModal = closeMyOrdersModal;
window.clearAuthAlert = clearAuthAlert;
window.showAuthAlert = showAuthAlert;
window.ADMIN_EMAIL = ADMIN_EMAIL;
window.isAdminUser = isAdminUser;
window.getAdminAllOrders = getAdminAllOrders;
window.adminUpdateOrderStatus = adminUpdateOrderStatus;
window.adminCreateOrder = adminCreateOrder;
window.adminDeleteOrder = adminDeleteOrder;
