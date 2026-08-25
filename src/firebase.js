// Firebase Integration - Handles all Firestore operations
// This replaces mockStorage with real Firebase Firestore for cross-device sync

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import {
  getAuth,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  OAuthProvider,
  linkWithPopup,
  signInAnonymously as firebaseSignInAnonymously,
  linkWithCredential,
  EmailAuthProvider,
  deleteUser,
} from "firebase/auth";
import { firebaseConfig } from "./firebaseConfig";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Create test user for demo/testing
async function initializeTestData() {
  try {
    const testPhone = "9999999999"; // Test phone number
    const testRef = doc(db, "playerProfiles", testPhone);
    const testSnap = await getDoc(testRef);
    
    // Only create if doesn't exist
    if (!testSnap.exists()) {
      const testPasscode = "1234"; // Test passcode
      const hashedPasscode = btoa(testPasscode);
      
      await setDoc(testRef, {
        phone: testPhone,
        email: "test@cricketbuddy.app",
        firstName: "Test",
        lastName: "User",
        passcodeHash: hashedPasscode,
        role: "All-rounder",
        handedness: "Right",
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      
      console.log('[Firebase] ✓ Test user created for demo');
      console.log('[Firebase] Test Login: Phone=9999999999, Passcode=1234');
      console.log('[Firebase] Test Reset: Email=test@cricketbuddy.app');
    }
  } catch (error) {
    console.error('[Firebase] Error initializing test data:', error.message);
  }
}

// Initialize test data on app load
initializeTestData();

// Global variable to store listener unsubscribe functions
const listeners = {};

// ============================================
// OFFLINE QUEUE & RETRY SYSTEM
// ============================================

const RETRY_QUEUE_KEY = 'firebase-retry-queue';

/**
 * Queue failed operations for retry when back online
 */
function queueForRetry(operation, data) {
  try {
    let queue = [];
    const saved = localStorage.getItem(RETRY_QUEUE_KEY);
    if (saved) {
      queue = JSON.parse(saved);
    }
    queue.push({
      operation,
      data,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    });
    localStorage.setItem(RETRY_QUEUE_KEY, JSON.stringify(queue));
    console.log('[Firebase] ✓ Queued for retry:', operation, queue.length, 'items in queue');
  } catch (e) {
    console.error('[Firebase] Failed to queue for retry:', e);
  }
}

/**
 * Process retry queue when connection restored
 */
export async function processRetryQueue() {
  try {
    const saved = localStorage.getItem(RETRY_QUEUE_KEY);
    if (!saved) return { processed: 0, failed: 0 };
    
    let queue = JSON.parse(saved);
    let processed = 0;
    let failed = 0;
    const newQueue = [];
    
    for (const item of queue) {
      try {
        console.log('[Firebase] Processing retry:', item.operation);
        
        if (item.operation === 'playerStats') {
          const result = await savePlayerStats(item.data.playerStats);
          if (result.success) {
            console.log('[Firebase] ✓ Retry successful for playerStats');
            processed++;
          } else {
            item.retryCount++;
            if (item.retryCount < 3) {
              newQueue.push(item);
              failed++;
            } else {
              console.error('[Firebase] Max retries exceeded for playerStats');
            }
          }
        } else if (item.operation === 'liveMatch') {
          const result = await saveLiveMatch(item.data.matchCode, item.data.state);
          if (result.success) {
            console.log('[Firebase] ✓ Retry successful for liveMatch');
            processed++;
          } else {
            item.retryCount++;
            if (item.retryCount < 3) {
              newQueue.push(item);
              failed++;
            }
          }
        }
      } catch (e) {
        console.error('[Firebase] Retry failed:', item.operation, e.message);
        item.retryCount++;
        if (item.retryCount < 3) {
          newQueue.push(item);
        }
        failed++;
      }
    }
    
    if (newQueue.length > 0) {
      localStorage.setItem(RETRY_QUEUE_KEY, JSON.stringify(newQueue));
    } else {
      localStorage.removeItem(RETRY_QUEUE_KEY);
    }
    
    console.log('[Firebase] Retry queue processed:', processed, 'success,', failed, 'failed');
    return { processed, failed, remaining: newQueue.length };
  } catch (error) {
    console.error('[Firebase] Error processing retry queue:', error);
    return { processed: 0, failed: 0 };
  }
}

/**
 * Detect network status and process retries
 */
export function setupNetworkDetection() {
  if (typeof window === 'undefined') return;
  
  window.addEventListener('online', async () => {
    console.log('[Firebase] ✓ Network restored, processing retry queue...');
    const result = await processRetryQueue();
    if (result.processed > 0) {
      console.log('[Firebase] Successfully processed', result.processed, 'queued operations');
    }
  });
  
  window.addEventListener('offline', () => {
    console.log('[Firebase] ⚠️ Network disconnected, queuing future operations');
  });
}

/**
 * Firestore Database Structure:
 * 
 * /players/{playerName}/
 *   ├── matches: number
 *   ├── runs: number
 *   ├── wickets: number
 *   ├── fours: number
 *   ├── sixes: number
 *   ├── highestScore: number
 *   ├── highestWickets: number
 *   ├── innings: number
 *   └── ballsFaced: number
 * 
 * /matches/{matchId}/
 *   ├── teamA: {name, players: [], captain, viceCaptain}
 *   ├── teamB: {name, players: [], captain, viceCaptain}
 *   ├── inning1: [{overs, bowler, runs, wicket, ...}]
 *   ├── inning2: [{overs, bowler, runs, wicket, ...}]
 *   ├── timestamp: Date
 *   └── completed: boolean
 */

// ============================================
// Player Stats Functions
// ============================================

/**
 * Load all player stats from Firestore
 */
export async function loadPlayerStats(globalPlayers) {
  try {
    console.log('[Firebase] loadPlayerStats called with', globalPlayers.length, 'players');
    const stats = {};
    let loadedCount = 0;
    let createdCount = 0;
    
    for (const playerName of globalPlayers) {
      const docRef = doc(db, "players", playerName);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const playerData = docSnap.data();
        stats[playerName] = playerData;
        console.log(`[Firebase] ✓ Loaded stats for "${playerName}":`, playerData);
        loadedCount++;
      } else {
        // Player doesn't exist yet, initialize with zeros
        stats[playerName] = {
          matches: 0,
          runs: 0,
          wickets: 0,
          fours: 0,
          sixes: 0,
          highestScore: 0,
          highestWickets: 0,
          innings: 0,
          ballsFaced: 0,
        };
        console.log(`[Firebase] No existing stats for "${playerName}", initializing with zeros`);
        // Save to Firestore
        await setDoc(docRef, stats[playerName]);
        console.log(`[Firebase] ✓ Initialized "${playerName}" in Firestore`);
        createdCount++;
      }
    }
    
    console.log('[Firebase] ✓ loadPlayerStats complete: Loaded', loadedCount, '| Created', createdCount, '| Total stats:', Object.keys(stats).length);
    console.log('[Firebase] All stats loaded:', stats);
    return stats;
  } catch (error) {
    console.error("Error loading player stats:", error);
    console.error('[Firebase] Returning empty stats object as fallback');
    return {};
  }
}

/**
 * Save player stats to Firestore (called after each match)
 * Uses Promise.allSettled to handle partial failures gracefully
 */
export async function savePlayerStats(playerStats) {
  try {
    console.log('[Firebase] ========== savePlayerStats STARTED ==========');
    console.log('[Firebase] savePlayerStats called');
    console.log('[Firebase] Saving player stats...', Object.keys(playerStats).length, 'players');
    
    if (!playerStats || Object.keys(playerStats).length === 0) {
      console.warn('[Firebase] ⚠️ WARNING: playerStats is empty!');
      return { success: false, message: 'No player stats to save', failedPlayers: [] };
    }
    
    const promises = [];
    const playerNames = [];
    let validCount = 0;
    
    for (const [playerName, stats] of Object.entries(playerStats)) {
      if (!playerName || typeof playerName !== 'string') {
        console.warn('[Firebase] ⚠️ Skipping invalid player name:', playerName);
        continue;
      }
      
      if (!stats || typeof stats !== 'object') {
        console.warn(`[Firebase] ⚠️ Skipping invalid stats for "${playerName}":`, stats);
        continue;
      }
      
      validCount++;
      playerNames.push(playerName);
      const docRef = doc(db, "players", playerName);
      const dataToSave = {
        ...stats,
        updatedAt: new Date().toISOString(),
      };
      console.log(`[Firebase] Queueing write for "${playerName}":`, dataToSave);
      promises.push(
        setDoc(docRef, dataToSave)
          .then(() => {
            console.log(`[Firebase] ✓ Successfully wrote "${playerName}" to Firestore`);
            return { success: true, playerName };
          })
          .catch((err) => {
            console.error(`[Firebase] ✗ Failed to write "${playerName}":`, err.message);
            return { success: false, playerName, error: err.message };
          })
      );
    }
    
    console.log('[Firebase] Executing', promises.length, 'write operations (', validCount, 'valid players)...');
    
    if (promises.length === 0) {
      console.error('[Firebase] ✗ No valid promises to execute!');
      return { success: false, message: 'No valid players to save', failedPlayers: [] };
    }
    
    // Use allSettled instead of all - continues even if some fail
    const results = await Promise.allSettled(promises);
    
    const failedPlayers = results
      .map((result, idx) => ({ result, playerName: playerNames[idx] }))
      .filter(({ result }) => result.status === 'rejected' || (result.value && !result.value.success))
      .map(({ playerName }) => playerName);
    
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
    
    console.log('[Firebase] ✓ Write operations complete! Success:', successCount, '| Failed:', failedPlayers.length);
    
    if (failedPlayers.length === 0) {
      console.log('[Firebase] ========== savePlayerStats SUCCESS ==========');
      return { success: true, message: 'All player stats saved', failedPlayers: [] };
    } else {
      console.warn('[Firebase] ========== savePlayerStats PARTIAL SUCCESS ==========');
      // Queue failed players for retry
      queueForRetry('playerStats', { playerStats: Object.fromEntries(
        Object.entries(playerStats).filter(([name]) => failedPlayers.includes(name))
      )});
      return { success: false, message: `Saved ${successCount}/${results.length} players. Will retry ${failedPlayers.length}.`, failedPlayers };
    }
  } catch (error) {
    console.error('[Firebase] ✗✗✗ Error saving player stats:', error.message);
    // Queue entire batch for retry
    queueForRetry('playerStats', { playerStats });
    return { success: false, message: 'Failed to save player stats. Will retry when online.', failedPlayers: Object.keys(playerStats || {}) };
  }
}

/**
 * Subscribe to real-time player stats updates
 * Calls callback whenever any player's stats change
 */
export function subscribeToPlayerStats(globalPlayers, callback) {
  try {
    console.log('[Firebase] subscribeToPlayerStats called for', globalPlayers.length, 'players');
    const stats = {};
    let initialLoadCount = 0;
    let hasInitialized = false;
    
    // Subscribe to each player's stats document
    globalPlayers.forEach((playerName) => {
      const docRef = doc(db, "players", playerName);
      
      const unsubscribe = onSnapshot(docRef, (docSnap) => {
        const oldStats = stats[playerName];
        
        if (docSnap.exists()) {
          stats[playerName] = docSnap.data();
          if (!oldStats) {
            console.log(`[Firebase] Loaded stats for "${playerName}":`, stats[playerName]);
          } else {
            console.log(`[Firebase] Updated stats for "${playerName}":`, stats[playerName]);
          }
        } else {
          stats[playerName] = {
            matches: 0,
            runs: 0,
            wickets: 0,
            fours: 0,
            sixes: 0,
            highestScore: 0,
            highestWickets: 0,
            innings: 0,
            ballsFaced: 0,
          };
          console.log(`[Firebase] No stats for "${playerName}", using zeros`);
        }
        
        // Track initial load
        if (!hasInitialized) {
          initialLoadCount++;
          if (initialLoadCount === globalPlayers.length) {
            console.log('[Firebase] ✓ Initial load complete for all', globalPlayers.length, 'players');
            hasInitialized = true;
            callback(stats);
          }
        } else {
          // Call callback on every update after initial load
          console.log('[Firebase] Stats updated for', Object.keys(stats).length, 'players');
          callback(stats);
        }
      }, (error) => {
        // Handle permission errors gracefully (e.g., during logout)
        if (error?.code === 'permission-denied') {
          console.warn('[Firebase] Permission denied listening to player stats (user may be logging out)');
        } else {
          console.error('[Firebase] Error listening to player stats:', error);
        }
      });
      
      // Store unsubscribe function to clean up later
      listeners[`player_${playerName}`] = unsubscribe;
    });
  } catch (error) {
    console.error("Error subscribing to player stats:", error);
  }
}

// ============================================
// Match History Functions
// ============================================

/**
 * Sanitize data for Firestore - remove undefined values and circular refs
 */
function sanitizeForFirestore(obj) {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item)).filter(item => item !== undefined);
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue; // Skip undefined values
    if (value === null) continue; // Skip null values
    if (typeof value === 'function') continue; // Skip functions
    
    if (typeof value === 'object') {
      const cleaned = sanitizeForFirestore(value);
      if (cleaned !== null) {
        sanitized[key] = cleaned;
      }
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Save match to Firestore match history
 */
export async function saveMatch(matchData) {
  try {
    const matchId = `match_${Date.now()}`;
    console.log('[Firebase] Saving match...', matchId, matchData);
    const docRef = doc(db, "matches", matchId);
    
    // Ensure timestamp is ISO string for consistency
    const timestamp = matchData.timestamp || new Date().toISOString();
    
    // Sanitize data to remove undefined values and circular references
    const sanitized = sanitizeForFirestore(matchData);
    
    const dataToSave = {
      ...sanitized,
      timestamp: timestamp,
      completed: true,
      savedAt: new Date().toISOString(),
    };
    
    console.log('[Firebase] Sanitized data to save:', dataToSave);
    await setDoc(docRef, dataToSave);
    
    console.log('[Firebase] ✓ Match saved successfully!', matchId);
    return matchId;
  } catch (error) {
    console.error('[Firebase] ✗ Error saving match:', error);
    console.error('[Firebase] Match data was:', matchData);
    return null;
  }
}

/**
 * Load all matches from Firestore
 */
export async function loadMatches() {
  try {
    const matchesRef = collection(db, "matches");
    const snapshot = await getDocs(matchesRef);
    
    const matches = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      console.log('[Firebase] Loaded match:', doc.id, data);
      matches.push({
        id: doc.id,
        ...data,
        // Ensure timestamp is a valid ISO string for parsing
        timestamp: data.timestamp || data.savedAt || new Date().toISOString(),
      });
    });
    
    console.log('[Firebase] ✓ Loaded', matches.length, 'matches');
    return matches;
  } catch (error) {
    console.error('[Firebase] Error loading matches:', error);
    return [];
  }
}

/**
 * Find match by code and subscribe to live updates
 * Used by FollowerView to get live match data
 */
export function subscribeToMatchByCode(code, callback) {
  try {
    console.log('[Firebase] Subscribing to match with code:', code);
    
    // First check localStorage for quick access (works within same browser)
    const localData = localStorage.getItem(`match:${code}`);
    if (localData) {
      try {
        const data = JSON.parse(localData);
        console.log('[Firebase] ✓ Found match in localStorage:', code);
        callback(data);
        
        // Poll localStorage for updates
        const pollInterval = setInterval(() => {
          const updated = localStorage.getItem(`match:${code}`);
          if (updated) {
            try {
              callback(JSON.parse(updated));
            } catch (e) {
              console.error('[Firebase] Error parsing updated match data:', e);
            }
          }
        }, 1000);
        
        return () => clearInterval(pollInterval);
      } catch (e) {
        console.error('[Firebase] Error parsing localStorage match data:', e);
      }
    }
    
    // Fallback to Firestore query
    const matchesRef = collection(db, "matches");
    const q = query(matchesRef, where("code", "==", code));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('[Firebase] Query snapshot for code "' + code + '" - empty:', snapshot.empty, 'docs:', snapshot.size);
      
      if (snapshot.empty) {
        console.log('[Firebase] ✗ No match found with code:', code);
        console.log('[Firebase] Attempting fallback: Loading all matches...');
        
        // Fallback: Query all matches and filter client-side
        const matchesRefFb = collection(db, "matches");
        const fallbackQ = query(matchesRefFb);
        const fallbackUnsub = onSnapshot(fallbackQ, (fallbackSnapshot) => {
          console.log('[Firebase] Fallback scan: Found', fallbackSnapshot.size, 'total matches');
          const allMatches = fallbackSnapshot.docs.map(doc => ({ id: doc.id, code: doc.data().code }));
          console.log('[Firebase] All match codes:', allMatches.map(m => m.code).join(', '));
          
          const matchDoc = fallbackSnapshot.docs.find(doc => doc.data().code === code);
          if (matchDoc) {
            console.log('[Firebase] ✓ Found match via fallback:', matchDoc.id, 'code:', matchDoc.data().code);
            callback({
              id: matchDoc.id,
              ...matchDoc.data(),
            });
          } else {
            console.log('[Firebase] ✗ Still no match found with code:', code);
            callback(null);
          }
        }, (err) => {
          console.error('[Firebase] Fallback query error:', err);
        });
        listeners[`match_code_fallback_${code}`] = fallbackUnsub;
      } else {
        const matchDoc = snapshot.docs[0];
        const matchData = matchDoc.data();
        console.log('[Firebase] ✓ Found live match:', matchDoc.id, 'code:', matchData.code);
        console.log('[Firebase] Match data keys:', Object.keys(matchData).join(', '));
        callback({
          id: matchDoc.id,
          ...matchData,
        });
      }
    }, (error) => {
      console.error('[Firebase] onSnapshot error for code "' + code + '":', error.code, error.message);
      if (error.code === 'failed-precondition') {
        console.error('[Firebase] ⚠️  Firestore index not created for code field. Using fallback query...');
      }
      callback(null);
    });
    
    // Store unsubscribe function for cleanup
    listeners[`match_code_${code}`] = unsubscribe;
    return unsubscribe;
  } catch (error) {
    console.error('[Firebase] Error subscribing to match by code:', error.message);
    callback(null);
    return () => {};
  }
}

// ============================================
// Player Authentication & Profile Functions
// ============================================

/**
 * Register or login a player using phone number
 * Creates profile if doesn't exist, updates last login if does
 */
export async function authenticatePlayer(phoneNumber, playerName) {
  try {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    console.log('[Firebase] Authenticating player:', playerName, 'Phone:', normalizedPhone);
    
    const phoneRef = doc(db, "playerProfiles", normalizedPhone);
    const phoneSnap = await getDoc(phoneRef);
    
    if (phoneSnap.exists()) {
      // Player exists, update last login
      await setDoc(
        phoneRef,
        {
          lastLogin: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      console.log('[Firebase] ✓ Player login successful');
      return {
        phone: normalizedPhone,
        name: phoneSnap.data().name,
        exists: true,
      };
    } else {
      // New player, create profile
      await setDoc(phoneRef, {
        phone: normalizedPhone,
        name: playerName || "Player",
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      });
      console.log('[Firebase] ✓ Player profile created');
      return {
        phone: phoneNumber,
        name: playerName || "Player",
        exists: false,
      };
    }
  } catch (error) {
    console.error('[Firebase] Error authenticating player:', error);
    return null;
  }
}

/**
 * Get player profile by phone number
 */
export async function getPlayerByPhone(phoneNumber) {
  try {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const phoneRef = doc(db, "playerProfiles", normalizedPhone);
    const phoneSnap = await getDoc(phoneRef);
    
    if (phoneSnap.exists()) {
      return {
        phone: normalizedPhone,
        ...phoneSnap.data(),
      };
    }
    return null;
  } catch (error) {
    console.error('[Firebase] Error getting player:', error);
    return null;
  }
}

// ============================================
// Passcode-Based Authentication (Phone + 4-digit PIN)
// ============================================

/**
 * Normalize phone number with international country code support
 * Accepts: +919876543210, +1-202-555-1234, 9876543210 (defaults to +91)
 * Returns: +[countryCode][localNumber] (e.g., +919876543210)
 */
export function normalizePhoneNumber(phone) {
  if (!phone) return "";
  
  // Remove all non-digit characters except leading +
  const input = phone.trim();
  const cleaned = input.replace(/\D/g, "");
  
  if (!cleaned) return "";
  
  // If original has leading +, preserve it in return
  if (input.startsWith("+")) {
    return "+" + cleaned;
  }
  
  // Backward compatibility: 10 digits → assume India (+91)
  if (cleaned.length === 10) {
    return "+91" + cleaned;
  }
  
  // Otherwise return with + prefix (user provides full international number)
  return "+" + cleaned;
}

// ============================================
// NEW: MODERN AUTHENTICATION (Email/Password, Google, Apple)
// ============================================

/**
 * Sign up with email and password
 * Creates Firebase Auth user + player profile
 */
export async function signUpWithEmail(email, password, firstName, lastName, phone = "") {
  try {
    console.log('[Firebase] Signing up with email:', email);
    
    // Validate password strength (8+ chars)
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
    
    // Create Firebase Auth user
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    console.log('[Firebase] ✓ Firebase Auth user created:', user.uid);
    
    // Create player profile document (using email as ID)
    const profileRef = doc(db, "playerProfiles", email);
    const normalizedPhone = phone ? normalizePhoneNumber(phone) : "";
    
    await setDoc(profileRef, {
      email: email,
      firstName: firstName || "Player",
      lastName: lastName || "",
      phone: normalizedPhone,  // Optional contact field
      authProvider: "email",   // Track auth method
      role: null,  // 'batsman', 'bowler', 'allrounder'
      age: null,   // Player age
      city: "",    // City
      country: "", // Country
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stats: {
        matches: 0,
        runs: 0,
        wickets: 0,
      }
    });
    
    console.log('[Firebase] ✓ Player profile created:', email);
    return { success: true, user, email, firstName, lastName };
  } catch (error) {
    console.error('[Firebase] Signup error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Sign in with email and password
 */
export async function signInWithEmail(email, password) {
  try {
    console.log('[Firebase] Signing in with email:', email);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Update last login
    const profileRef = doc(db, "playerProfiles", email);
    await updateDoc(profileRef, {
      lastLogin: new Date().toISOString()
    }).catch(() => {
      // Profile might not exist yet (first login), ignore error
    });
    
    console.log('[Firebase] ✓ Sign in successful:', email);
    return { success: true, user, email };
  } catch (error) {
    console.error('[Firebase] Sign in error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Sign in with Google
 */
export async function signInWithGoogle() {
  try {
    console.log('[Firebase] Signing in with Google...');
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
    console.log('[Firebase] ✓ Google sign in successful:', user.email);
    
    // Create or update player profile if doesn't exist
    const profileRef = doc(db, "playerProfiles", user.email);
    const profileSnap = await getDoc(profileRef);
    
    if (!profileSnap.exists()) {
      // First time Google login - create profile
      const [firstName, ...rest] = user.displayName?.split(" ") || ["Player"];
      const lastName = rest.join(" ") || "";
      
      await setDoc(profileRef, {
        email: user.email,
        firstName: firstName,
        lastName: lastName,
        authProvider: "google",
        role: null,  // 'batsman', 'bowler', 'allrounder'
        age: null,   // Player age
        city: "",    // City
        country: "", // Country
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stats: {
          matches: 0,
          runs: 0,
          wickets: 0,
        }
      });
      
      console.log('[Firebase] ✓ Player profile created for Google user:', user.email);
    } else {
      // Existing user, update last login
      await updateDoc(profileRef, {
        lastLogin: new Date().toISOString()
      });
    }
    
    return { success: true, user, email: user.email };
  } catch (error) {
    console.error('[Firebase] Google sign in error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Sign in with Apple (iOS/Web)
 */
export async function signInWithApple() {
  try {
    console.log('[Firebase] Signing in with Apple...');
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
    console.log('[Firebase] ✓ Apple sign in successful:', user.email);
    
    // Create or update player profile if doesn't exist
    const profileRef = doc(db, "playerProfiles", user.email);
    const profileSnap = await getDoc(profileRef);
    
    if (!profileSnap.exists()) {
      // First time Apple login - create profile
      const [firstName, ...rest] = user.displayName?.split(" ") || ["Player"];
      const lastName = rest.join(" ") || "";
      
      await setDoc(profileRef, {
        email: user.email,
        firstName: firstName,
        lastName: lastName,
        authProvider: "apple",
        role: null,  // 'batsman', 'bowler', 'allrounder'
        age: null,   // Player age
        city: "",    // City
        country: "", // Country
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stats: {
          matches: 0,
          runs: 0,
          wickets: 0,
        }
      });
      
      console.log('[Firebase] ✓ Player profile created for Apple user:', user.email);
    } else {
      // Existing user, update last login
      await updateDoc(profileRef, {
        lastLogin: new Date().toISOString()
      });
    }
    
    return { success: true, user, email: user.email };
  } catch (error) {
    console.error('[Firebase] Apple sign in error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Sign in anonymously (no email/password required)
 * Perfect for users who want to try the app before registering
 */
export async function loginAnonymously() {
  try {
    console.log('[Firebase] Signing in anonymously...');
    const userCredential = await firebaseSignInAnonymously(auth);
    const user = userCredential.user;
    
    console.log('[Firebase] ✓ Anonymous sign in successful:', user.uid);
    
    // Create anonymous player profile using uid as document ID
    const profileRef = doc(db, "playerProfiles", user.uid);
    
    await setDoc(profileRef, {
      uid: user.uid,
      firstName: "Anonymous",
      lastName: "Player",
      isAnonymous: true,
      authProvider: "anonymous",
      role: null,  // 'batsman', 'bowler', 'allrounder'
      age: null,   // Player age
      city: "",    // City
      country: "", // Country
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stats: {
        matches: 0,
        runs: 0,
        wickets: 0,
      }
    });
    
    console.log('[Firebase] ✓ Anonymous player profile created:', user.uid);
    return { success: true, user, uid: user.uid, isAnonymous: true };
  } catch (error) {
    console.error('[Firebase] Anonymous sign in error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Upgrade anonymous account to email/password
 * Links the anonymous account to an email account
 */
export async function upgradeAnonymousToEmail(email, password) {
  try {
    console.log('[Firebase] Upgrading anonymous account to email:', email);
    const currentUser = auth.currentUser;
    
    if (!currentUser || !currentUser.isAnonymous) {
      throw new Error('No anonymous user logged in');
    }
    
    // Link email/password to anonymous account
    const credential = EmailAuthProvider.credential(email, password);
    await linkWithCredential(currentUser, credential);
    
    // Update player profile - migrate from uid-based to email-based
    const oldProfileRef = doc(db, "playerProfiles", currentUser.uid);
    const oldProfile = await getDoc(oldProfileRef);
    
    if (oldProfile.exists()) {
      const data = oldProfile.data();
      delete data.isAnonymous;
      delete data.uid; // Remove uid field
      
      // Create new profile with email
      const newProfileRef = doc(db, "playerProfiles", email);
      await setDoc(newProfileRef, {
        ...data,
        email: email,
        authProvider: "email",
      });
      
      // Delete old anonymous profile (uid-based)
      await deleteDoc(oldProfileRef);
    }
    
    console.log('[Firebase] ✓ Account upgraded to email/password:', email);
    return { success: true, email };
  } catch (error) {
    console.error('[Firebase] Account upgrade error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordReset(email) {
  try {
    console.log('[Firebase] Sending password reset email to:', email);
    await sendPasswordResetEmail(auth, email);
    console.log('[Firebase] ✓ Password reset email sent');
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Password reset error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get current logged-in user
 */
export function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Get current user's email
 */
export function getCurrentUserEmail() {
  return auth.currentUser?.email || null;
}

/**
 * Get player profile by email or uid
 */
export async function getPlayerByEmail(email) {
  try {
    // Handle null email (for anonymous users, use uid instead)
    if (!email) {
      console.warn('[Firebase] getPlayerByEmail called with null email');
      return null;
    }
    
    const profileRef = doc(db, "playerProfiles", email);
    const profileSnap = await getDoc(profileRef);
    
    if (profileSnap.exists()) {
      return {
        email: email,
        ...profileSnap.data()
      };
    }
    return null;
  } catch (error) {
    console.error('[Firebase] Error getting player by email:', error);
    return null;
  }
}

/**
 * Get player profile by uid (for anonymous users)
 */
export async function getPlayerByUid(uid) {
  try {
    if (!uid) {
      console.warn('[Firebase] getPlayerByUid called with null uid');
      return null;
    }
    
    const profileRef = doc(db, "playerProfiles", uid);
    const profileSnap = await getDoc(profileRef);
    
    if (profileSnap.exists()) {
      return {
        uid: uid,
        ...profileSnap.data()
      };
    }
    return null;
  } catch (error) {
    console.error('[Firebase] Error getting player by uid:', error);
    return null;
  }
}

/**
 * Update user profile
 */
export async function updateUserEmailProfile(email, updates) {
  try {
    console.log('[Firebase] Updating profile for:', email);
    const profileRef = doc(db, "playerProfiles", email);
    
    await updateDoc(profileRef, {
      ...updates,
      updatedAt: new Date().toISOString()
    });
    
    console.log('[Firebase] ✓ Profile updated');
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Error updating profile:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Sign out current user
 */
export async function logoutUser() {
  try {
    console.log('[Firebase] Logging out...');
    
    // Clean up all active listeners to prevent permission errors after logout
    Object.values(listeners).forEach((unsubscribe) => {
      try {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      } catch (err) {
        console.warn('[Firebase] Error cleaning up listener:', err.message);
      }
    });
    
    // Clear listeners object (delete all keys instead of reassigning)
    Object.keys(listeners).forEach((key) => {
      delete listeners[key];
    });
    
    // Sign out
    await signOut(auth);
    console.log('[Firebase] ✓ Logout successful');
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Logout error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Listen to authentication state changes
 */
export function subscribeToAuthState(callback) {
  try {
    console.log('[Firebase] Setting up auth state listener');
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        console.log('[Firebase] ✓ User logged in:', user.email || `(anonymous: ${user.uid})`);
        
        // Get player profile
        let profile = null;
        
        try {
          if (user.isAnonymous) {
            // For anonymous users, look up by uid
            profile = await getPlayerByUid(user.uid);
          } else {
            // For email-authenticated users, look up by email
            profile = await getPlayerByEmail(user.email);
          }
        } catch (profileError) {
          console.warn('[Firebase] Error loading profile during auth state change:', profileError.message);
          profile = null;
        }
        
        callback({ user, profile, isLoggedIn: true });
      } else {
        console.log('[Firebase] User logged out');
        callback({ user: null, profile: null, isLoggedIn: false });
      }
    }, (error) => {
      // Handle auth state listener errors gracefully
      if (error?.code === 'permission-denied') {
        console.warn('[Firebase] Permission denied in auth listener (user may be logging out):', error.message);
      } else {
        console.error('[Firebase] Auth state listener error:', error);
      }
    });
    
    return unsubscribe; // Return function to stop listening
  } catch (error) {
    console.error('[Firebase] Error setting up auth listener:', error);
    return () => {}; // Return no-op function
  }
}

/**
 * Register a new user with email, name, phone, passcode, role, and handedness
 */
export async function registerUser(userData) {
  try {
    const { email, firstName, lastName, phone, passcode, role, handedness } = userData;
    
    // Normalize phone number with country code
    const normalizedPhone = normalizePhoneNumber(phone);
    console.log('[Firebase] Registering new user:', email, 'Phone:', normalizedPhone);
    
    // Validate phone format (with country code: minimum 10 digits total)
    // Examples: +919876543210 (India), +12025551234 (USA), +442071838750 (UK)
    const digitsOnly = normalizedPhone.replace(/\D/g, "");
    if (!digitsOnly || digitsOnly.length < 10 || digitsOnly.length > 15) {
      throw new Error('Invalid phone number format. Use format: +91-9876543210 or +1-2025551234');
    }
    
    // Validate passcode is 4 digits
    if (!passcode || passcode.length !== 4 || !/^\d{4}$/.test(passcode)) {
      throw new Error('Passcode must be exactly 4 digits');
    }
    
    // Check if phone already exists
    const phoneRef = doc(db, "playerProfiles", normalizedPhone);
    const phoneSnap = await getDoc(phoneRef);
    if (phoneSnap.exists()) {
      throw new Error('Phone number already registered');
    }
    
    // Check if email already exists
    const usersRef = collection(db, "playerProfiles");
    const emailQuery = query(usersRef, where("email", "==", email));
    const emailSnap = await getDocs(emailQuery);
    if (!emailSnap.empty) {
      throw new Error('Email already registered');
    }
    
    // Create user profile with hashed passcode (simple hash for demo)
    const hashedPasscode = btoa(passcode); // Base64 for demo - use bcrypt in production
    
    // Save as single document with phone as primary ID
    // Email is stored as a field, so queries by email will work
    // Phone is stored with country code (e.g., +919876543210)
    await setDoc(phoneRef, {
      phone: normalizedPhone,
      email,
      firstName,
      lastName,
      passcodeHash: hashedPasscode,
      role, // Batsman/Bowler/All-rounder
      handedness, // Right/Left
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    
    console.log('[Firebase] ✓ User registered successfully:', { phone: normalizedPhone, email });
    return { success: true, phone: normalizedPhone, email };
  } catch (error) {
    console.error('[Firebase] Error registering user:', error.message);
    throw error;
  }
}

/**
 * Login user with phone and 4-digit passcode
 */
export async function loginUser(phone, passcode) {
  try {
    console.log('[Firebase] Logging in user:', phone);
    
    // Validate passcode
    if (!passcode || passcode.length !== 4 || !/^\d{4}$/.test(passcode)) {
      throw new Error('Passcode must be exactly 4 digits');
    }
    
    // Get user profile by phone
    const phoneRef = doc(db, "playerProfiles", phone);
    const userSnap = await getDoc(phoneRef);
    
    if (!userSnap.exists()) {
      throw new Error('Phone number not found. Please register first.');
    }
    
    const userData = userSnap.data();
    
    // Verify passcode
    const hashedPasscode = btoa(passcode);
    if (userData.passcodeHash !== hashedPasscode) {
      throw new Error('Incorrect passcode');
    }
    
    // Update last login
    await setDoc(phoneRef, {
      lastLogin: new Date().toISOString(),
    }, { merge: true });
    
    console.log('[Firebase] ✓ Login successful');
    return {
      success: true,
      user: {
        phone: userData.phone,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
        handedness: userData.handedness,
        createdAt: userData.createdAt,
      }
    };
  } catch (error) {
    console.error('[Firebase] Error logging in:', error.message);
    throw error;
  }
}

/**
 * Verify user credentials (phone + passcode combo check)
 */
export async function verifyUserCredentials(phone, passcode) {
  try {
    const result = await loginUser(phone, passcode);
    return result.success;
  } catch (error) {
    return false;
  }
}

/**
 * Check if phone number is already registered
 */
export async function checkPhoneExists(phone) {
  try {
    const phoneRef = doc(db, "playerProfiles", phone);
    const userSnap = await getDoc(phoneRef);
    return userSnap.exists();
  } catch (error) {
    console.error('[Firebase] Error checking phone:', error);
    return false;
  }
}

/**
 * Check if email is already registered
 */
export async function checkEmailExists(email) {
  try {
    const usersRef = collection(db, "playerProfiles");
    const emailQuery = query(usersRef, where("email", "==", email));
    const emailSnap = await getDocs(emailQuery);
    return !emailSnap.empty;
  } catch (error) {
    console.error('[Firebase] Error checking email:', error);
    return false;
  }
}

/**
 * Request password reset via email or WhatsApp
 * Generates a reset code and stores for demo display
 * method: "email" or "whatsapp"
 * whatsappNumber: required if method is "whatsapp"
 */
export async function requestPasswordReset(email, method = "email", whatsappNumber = null) {
  try {
    console.log('[Firebase] Password reset requested for:', email, 'via', method);
    
    // Validate method
    if (!["email", "whatsapp"].includes(method)) {
      throw new Error('Invalid reset method. Use "email" or "whatsapp"');
    }
    
    // Validate WhatsApp number if method is WhatsApp
    if (method === "whatsapp") {
      if (!whatsappNumber || whatsappNumber.replace(/\D/g, "").length < 10) {
        throw new Error('Please enter a valid WhatsApp number (10+ digits)');
      }
    }
    
    // Find user by email
    console.log('[Firebase] Searching for user with email:', email);
    const usersRef = collection(db, "playerProfiles");
    const emailQuery = query(usersRef, where("email", "==", email));
    const emailSnap = await getDocs(emailQuery);
    
    console.log('[Firebase] Query result - found', emailSnap.size, 'users');
    
    if (emailSnap.empty) {
      // Don't reveal if email exists (security)
      console.log('[Firebase] Email not found - returning silent success for security');
      return { 
        success: true, 
        message: 'If email exists, reset code will be sent',
        testCode: null,
        method: null,
        destination: null
      };
    }
    
    const userData = emailSnap.docs[0].data();
    console.log('[Firebase] User found! Phone:', userData.phone);
    
    // Generate reset code (6 digits)
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store reset code in localStorage with method info
    // In production, send via Twilio/Email service
    localStorage.setItem(`reset_code_${email}`, JSON.stringify({
      code: resetCode,
      phone: userData.phone,
      method: method,
      destination: method === "whatsapp" ? whatsappNumber : email,
      timestamp: Date.now(),
      expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
    }));
    
    console.log('[Firebase] ✓ Reset code generated:', resetCode);
    if (method === "email") {
      console.log('[Firebase] Demo: Send to email:', email);
    } else {
      console.log('[Firebase] Demo: Send to WhatsApp:', whatsappNumber);
    }
    
    return { 
      success: true, 
      message: method === "email" 
        ? 'Reset code generated (displayed below)' 
        : 'Reset code generated and displayed below',
      testCode: resetCode,
      method: method,
      destination: method === "whatsapp" ? whatsappNumber : email
    };
  } catch (error) {
    console.error('[Firebase] Error requesting reset:', error.message);
    throw error;
  }
}

/**
 * Verify email + phone match, then update passcode directly (no reset code needed)
 */
export async function verifyEmailPhoneAndUpdatePasscode(email, phone, newPasscode) {
  try {
    console.log('[Firebase] Verifying email and phone for password reset:', email, phone);
    
    // Validate new passcode
    if (!newPasscode || newPasscode.length !== 4 || !/^\d{4}$/.test(newPasscode)) {
      throw new Error('Passcode must be exactly 4 digits');
    }
    
    // Find user by email
    const usersRef = collection(db, "playerProfiles");
    const emailQuery = query(usersRef, where("email", "==", email));
    const emailSnap = await getDocs(emailQuery);
    
    if (emailSnap.empty) {
      throw new Error('No account found with this email');
    }
    
    const userData = emailSnap.docs[0].data();
    const storedPhone = userData.phone;
    
    // Normalize and verify phone matches
    const normalizePhone = (p) => p.replace(/\D/g, "").slice(-10); // Last 10 digits
    if (normalizePhone(storedPhone) !== normalizePhone(phone)) {
      throw new Error('Email and mobile number do not match our records');
    }
    
    // Update passcode
    const hashedPasscode = btoa(newPasscode); // Base64 for demo - use bcrypt in production
    const phoneRef = doc(db, "playerProfiles", storedPhone);
    
    await setDoc(phoneRef, {
      passcodeHash: hashedPasscode,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    
    console.log('[Firebase] ✓ Passcode updated successfully');
    return { success: true, message: 'Passcode updated successfully' };
  } catch (error) {
    console.error('[Firebase] Error updating passcode:', error.message);
    throw error;
  }
}

/**
 * Verify reset code and update passcode
 */
export async function verifyResetCodeAndUpdatePasscode(email, resetCode, newPasscode) {
  try {
    console.log('[Firebase] Verifying reset code for:', email);
    
    // Validate new passcode
    if (!newPasscode || newPasscode.length !== 4 || !/^\d{4}$/.test(newPasscode)) {
      throw new Error('Passcode must be exactly 4 digits');
    }
    
    // Get stored reset code
    const storedReset = localStorage.getItem(`reset_code_${email}`);
    if (!storedReset) {
      throw new Error('No password reset request found. Request a new reset code.');
    }
    
    const { code, phone, expiresAt } = JSON.parse(storedReset);
    
    // Check if expired
    if (Date.now() > expiresAt) {
      localStorage.removeItem(`reset_code_${email}`);
      throw new Error('Reset code expired. Request a new one.');
    }
    
    // Verify code
    if (resetCode !== code) {
      throw new Error('Invalid reset code');
    }
    
    // Update passcode
    const hashedPasscode = btoa(newPasscode);
    const phoneRef = doc(db, "playerProfiles", phone);
    
    await setDoc(phoneRef, {
      passcodeHash: hashedPasscode,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    
    // Clear reset code
    localStorage.removeItem(`reset_code_${email}`);
    
    console.log('[Firebase] ✓ Passcode reset successfully');
    return { success: true, message: 'Passcode updated successfully' };
  } catch (error) {
    console.error('[Firebase] Error resetting passcode:', error.message);
    throw error;
  }
}

/**
 * Get user profile by phone number
 */
export async function getUserByPhone(phone) {
  try {
    const phoneRef = doc(db, "playerProfiles", phone);
    const userSnap = await getDoc(phoneRef);
    
    if (userSnap.exists()) {
      return userSnap.data();
    }
    return null;
  } catch (error) {
    console.error('[Firebase] Error getting user:', error);
    return null;
  }
}

/**
 * Update user profile (non-passcode fields)
 */
export async function updateUserProfile(phone, updates) {
  try {
    console.log('[Firebase] Updating user profile:', phone);
    const phoneRef = doc(db, "playerProfiles", phone);
    
    // Don't allow passcode updates through this function
    const { passcodeHash, ...safeUpdates } = updates;
    
    await setDoc(
      phoneRef,
      {
        ...safeUpdates,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    
    console.log('[Firebase] ✓ User profile updated');
    return true;
  } catch (error) {
    console.error('[Firebase] Error updating profile:', error);
    return false;
  }
}

// ============================================
// Team Management Functions
// ============================================

/**
 * Create a new team
 */
export async function createTeam(teamName, captainName, clanId = null) {
  try {
    console.log('[Firebase] Creating team:', teamName, 'Captain:', captainName, 'Clan:', clanId);
    
    const teamId = `team_${Date.now()}`;
    const docRef = doc(db, "teams", teamId);
    
    const teamData = {
      id: teamId,
      name: teamName,
      captain: captainName,
      members: [captainName],
      createdAt: new Date().toISOString(),
      description: "",
    };
    
    // Add clanId if team belongs to a clan
    if (clanId) {
      teamData.clanId = clanId;
    }
    
    await setDoc(docRef, teamData);
    
    console.log('[Firebase] ✓ Team created successfully!', teamId);
    return teamId;
  } catch (error) {
    console.error('[Firebase] ✗ Error creating team:', error);
    return null;
  }
}

/**
 * Invite a player to join a team
 */
export async function invitePlayerToTeam(teamId, inviterName, invitedPlayerName) {
  try {
    console.log('[Firebase] Inviting', invitedPlayerName, 'to team', teamId);
    
    const invitationId = `invite_${Date.now()}`;
    const docRef = doc(db, "teamInvitations", invitationId);
    
    // Get team name and clanId
    const teamRef = doc(db, "teams", teamId);
    const teamSnap = await getDoc(teamRef);
    const teamName = teamSnap.exists() ? teamSnap.data().name : "Unknown Team";
    const clanId = teamSnap.exists() ? teamSnap.data().clanId : null;
    
    await setDoc(docRef, {
      id: invitationId,
      teamId,
      teamName,
      from: inviterName,
      to: invitedPlayerName,
      status: "pending",
      clanId: clanId, // Store clan ID for later
      createdAt: new Date().toISOString(),
    });
    
    console.log('[Firebase] ✓ Invitation sent!', invitationId);
    return invitationId;
  } catch (error) {
    console.error('[Firebase] ✗ Error sending invitation:', error);
    return null;
  }
}

/**
 * Get pending invitations for a player
 */
export async function getTeamInvitations(playerName) {
  try {
    const invitationsRef = collection(db, "teamInvitations");
    const q = query(invitationsRef, where("to", "==", playerName), where("status", "==", "pending"));
    const snapshot = await getDocs(q);
    
    const invitations = [];
    snapshot.forEach((doc) => {
      invitations.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    
    console.log('[Firebase] Loaded', invitations.length, 'pending invitations for', playerName);
    return invitations;
  } catch (error) {
    console.error('[Firebase] Error loading invitations:', error);
    return [];
  }
}

/**
 * Accept a team invitation
 */
export async function acceptTeamInvitation(invitationId, playerName) {
  try {
    console.log('[Firebase] Accepting invitation:', invitationId);
    
    // Get the invitation to get teamId
    const inviteRef = doc(db, "teamInvitations", invitationId);
    const inviteSnap = await getDoc(inviteRef);
    
    if (!inviteSnap.exists()) {
      console.error('[Firebase] Invitation not found:', invitationId);
      return false;
    }
    
    const inviteData = inviteSnap.data();
    const { teamId, clanId } = inviteData;
    
    // Update invitation status
    await setDoc(inviteRef, { ...inviteData, status: "accepted" });
    
    // Add player to team members
    const teamRef = doc(db, "teams", teamId);
    const teamSnap = await getDoc(teamRef);
    
    if (teamSnap.exists()) {
      const members = teamSnap.data().members || [];
      if (!members.includes(playerName)) {
        members.push(playerName);
        await setDoc(teamRef, { ...teamSnap.data(), members });
      }
    }
    
    // AUTO-SYNC: If team belongs to a clan, automatically add player to clan
    if (clanId) {
      try {
        await addPlayerToClanDirect(clanId, playerName, playerName);
        console.log('[Firebase] ✓ Player automatically added to clan:', clanId);
      } catch (clanError) {
        console.warn('[Firebase] Could not auto-add player to clan:', clanError.message);
        // Don't fail the team invitation if clan sync fails - team join is still valid
      }
    }
    
    console.log('[Firebase] ✓ Invitation accepted!');
    return true;
  } catch (error) {
    console.error('[Firebase] ✗ Error accepting invitation:', error);
    return false;
  }
}

/**
 * Reject a team invitation
 */
export async function rejectTeamInvitation(invitationId) {
  try {
    console.log('[Firebase] Rejecting invitation:', invitationId);
    
    const inviteRef = doc(db, "teamInvitations", invitationId);
    const inviteSnap = await getDoc(inviteRef);
    
    if (inviteSnap.exists()) {
      await setDoc(inviteRef, { ...inviteSnap.data(), status: "rejected" });
    }
    
    console.log('[Firebase] ✓ Invitation rejected!');
    return true;
  } catch (error) {
    console.error('[Firebase] ✗ Error rejecting invitation:', error);
    return false;
  }
}

/**
 * Get player's current team
 */
export async function getPlayerTeam(playerName) {
  try {
    const teamsRef = collection(db, "teams");
    const q = query(teamsRef, where("members", "array-contains", playerName));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }
    
    const teamDoc = snapshot.docs[0];
    return {
      id: teamDoc.id,
      ...teamDoc.data(),
    };
  } catch (error) {
    console.error('[Firebase] Error getting player team:', error);
    return null;
  }
}

/**
 * Remove player from team (captain only)
 */
export async function removePlayerFromTeam(teamId, playerName, captainName) {
  try {
    console.log('[Firebase] Removing', playerName, 'from team', teamId);
    
    const teamRef = doc(db, "teams", teamId);
    const teamSnap = await getDoc(teamRef);
    
    if (!teamSnap.exists()) {
      console.error('[Firebase] Team not found:', teamId);
      return false;
    }
    
    // Verify captain
    if (teamSnap.data().captain !== captainName) {
      console.error('[Firebase] Only captain can remove players');
      return false;
    }
    
    // Remove player from members
    const members = (teamSnap.data().members || []).filter(m => m !== playerName);
    await setDoc(teamRef, { ...teamSnap.data(), members });
    
    console.log('[Firebase] ✓ Player removed from team!');
    return true;
  } catch (error) {
    console.error('[Firebase] ✗ Error removing player:', error);
    return false;
  }
}

/**
 * Subscribe to team invitations for a player
 */
export function subscribeToTeamInvitations(playerName, callback) {
  try {
    const invitationsRef = collection(db, "teamInvitations");
    const q = query(invitationsRef, where("to", "==", playerName), where("status", "==", "pending"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const invitations = [];
      snapshot.forEach((doc) => {
        invitations.push({
          id: doc.id,
          ...doc.data(),
        });
      });
      console.log('[Firebase] Loaded', invitations.length, 'pending invitations for', playerName);
      callback(invitations);
    }, (error) => {
      // Handle permission errors gracefully (e.g., during logout)
      if (error?.code === 'permission-denied') {
        console.warn('[Firebase] Permission denied loading invitations (user may be logging out)');
      } else {
        console.error('[Firebase] Error subscribing to invitations:', error);
      }
      callback([]);
    });
    
    listeners[`invitations_${playerName}`] = unsubscribe;
    return unsubscribe;
  } catch (error) {
    console.error('[Firebase] Error subscribing to invitations:', error);
    callback([]);
  }
}

/**
 * Load all teams
 */
export async function loadAllTeams() {
  try {
    const teamsRef = collection(db, "teams");
    const snapshot = await getDocs(teamsRef);
    
    const teams = [];
    snapshot.forEach((doc) => {
      teams.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    
    console.log('[Firebase] Loaded', teams.length, 'teams');
    return teams;
  } catch (error) {
    console.error('[Firebase] Error loading teams:', error);
    return [];
  }
}

/**
 * Subscribe to team updates
 */
export function subscribeToTeam(teamId, callback) {
  try {
    const teamRef = doc(db, "teams", teamId);
    
    const unsubscribe = onSnapshot(teamRef, (doc) => {
      if (doc.exists()) {
        callback({
          id: doc.id,
          ...doc.data(),
        });
      } else {
        callback(null);
      }
    }, (error) => {
      // Handle permission errors gracefully (e.g., during logout)
      if (error?.code === 'permission-denied') {
        console.warn('[Firebase] Permission denied subscribing to team (user may be logging out)');
      } else {
        console.error('[Firebase] Error subscribing to team:', error);
      }
      callback(null);
    });
    
    listeners[`team_${teamId}`] = unsubscribe;
    return unsubscribe;
  } catch (error) {
    console.error('[Firebase] Error subscribing to team:', error);
    callback(null);
  }
}

/**
 * Update team captain
 */
export async function updateTeamCaptain(teamId, newCaptainName) {
  try {
    const teamRef = doc(db, "teams", teamId);
    await updateDoc(teamRef, {
      captain: newCaptainName,
      updatedAt: new Date().toISOString(),
    });
    console.log('[Firebase] Team captain updated to:', newCaptainName);
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Error updating team captain:', error);
    throw error;
  }
}

// ============================================
// Cleanup Functions
// ============================================

/**
 * ============================================
 * CLAN MANAGEMENT
 * ============================================
 */

/**
 * Create a new clan
 */
export async function createClan(clanName, creatorPhone, creatorName) {
  try {
    console.log('[Firebase] Creating clan:', clanName, 'by', creatorPhone);
    
    // Validate clan name
    if (!clanName || clanName.trim().length < 3) {
      throw new Error('Clan name must be at least 3 characters');
    }
    
    // Normalize phone number if provided
    const normalizedPhone = creatorPhone ? normalizePhoneNumber(creatorPhone) : null;
    
    // For Google/Apple/Email users without phone, use email or uid
    let creatorId = normalizedPhone || creatorPhone;
    const currentUser = getCurrentUser();
    
    if (!creatorId && currentUser) {
      // Use email for email/google/apple users, or uid for anonymous
      creatorId = currentUser.email || currentUser.uid;
    }
    
    if (!creatorId) {
      throw new Error('Unable to determine creator identity');
    }
    
    // Check if clan already exists
    const clansRef = collection(db, "clans");
    const nameQuery = query(clansRef, where("name", "==", clanName.trim()));
    const nameSnap = await getDocs(nameQuery);
    
    if (!nameSnap.empty) {
      throw new Error('Clan name already exists');
    }
    
    // Create clan document
    const clanRef = doc(clansRef);
    const clanId = clanRef.id;
    
    await setDoc(clanRef, {
      name: clanName.trim(),
      creatorId,
      creatorPhone: normalizedPhone,
      creatorName,
      members: [creatorId], // Creator is first member
      memberDetails: {
        [creatorId]: {
          name: creatorName,
          phone: normalizedPhone,
          email: currentUser?.email || null,
          uid: currentUser?.uid || null,
          role: "creator",
          joinedAt: new Date().toISOString(),
        }
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    
    console.log('[Firebase] ✓ Clan created:', clanId);
    return { success: true, clanId, clanName };
  } catch (error) {
    console.error('[Firebase] Error creating clan:', error.message);
    throw error;
  }
}

/**
 * Invite a player to a clan
 */
export async function invitePlayerToClan(clanId, playerPhone, inviterPhone) {
  try {
    console.log('[Firebase] Inviting', playerPhone, 'to clan', clanId);
    
    // Normalize phone numbers
    const normalizedPlayerPhone = normalizePhoneNumber(playerPhone);
    
    // Check if player exists
    const playerRef = doc(db, "playerProfiles", normalizedPlayerPhone);
    const playerSnap = await getDoc(playerRef);
    
    if (!playerSnap.exists()) {
      throw new Error('Player not found');
    }
    
    // Check if player already in clan
    const clanRef = doc(db, "clans", clanId);
    const clanSnap = await getDoc(clanRef);
    
    if (!clanSnap.exists()) {
      throw new Error('Clan not found');
    }
    
    const clanData = clanSnap.data();
    if (clanData.members.includes(normalizedPlayerPhone)) {
      throw new Error('Player already in clan');
    }
    
    const playerData = playerSnap.data();
    
    // Add player to clan
    await setDoc(clanRef, {
      members: [...clanData.members, normalizedPlayerPhone],
      memberDetails: {
        ...clanData.memberDetails,
        [normalizedPlayerPhone]: {
          name: playerData.firstName + " " + playerData.lastName,
          phone: normalizedPlayerPhone,
          role: "member",
          joinedAt: new Date().toISOString(),
        }
      },
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    
    console.log('[Firebase] ✓ Player invited to clan');
    return { success: true, message: 'Player added to clan' };
  } catch (error) {
    console.error('[Firebase] Error inviting player:', error.message);
    throw error;
  }
}

/**
 * Add a player to a clan directly (internal use for team/clan sync)
 * Called when player joins a team in a clan - automatically adds them to the clan
 */
export async function addPlayerToClanDirect(clanId, playerPhone, playerName) {
  try {
    console.log('[Firebase] Auto-adding player to clan:', playerPhone, 'to clan:', clanId);
    
    // Get clan document
    const clanRef = doc(db, "clans", clanId);
    const clanSnap = await getDoc(clanRef);
    
    if (!clanSnap.exists()) {
      throw new Error('Clan not found');
    }
    
    const clanData = clanSnap.data();
    
    // Check if player already in clan
    if (clanData.members && clanData.members.includes(playerPhone)) {
      console.log('[Firebase] Player already in clan, skipping auto-add');
      return { success: true, message: 'Player already in clan' };
    }
    
    // Add player to clan members
    await setDoc(clanRef, {
      members: [...(clanData.members || []), playerPhone],
      memberDetails: {
        ...(clanData.memberDetails || {}),
        [playerPhone]: {
          name: playerName,
          phone: playerPhone,
          role: "member",
          joinedAt: new Date().toISOString(),
        }
      },
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    
    console.log('[Firebase] ✓ Player auto-added to clan');
    return { success: true, message: 'Player added to clan' };
  } catch (error) {
    console.error('[Firebase] Error auto-adding player to clan:', error.message);
    throw error;
  }
}

/**
 * Get all players in a clan
 */
export async function getClanPlayers(clanId) {
  try {
    const clanRef = doc(db, "clans", clanId);
    const clanSnap = await getDoc(clanRef);
    
    if (!clanSnap.exists()) {
      throw new Error('Clan not found');
    }
    
    const clanData = clanSnap.data();
    return clanData.memberDetails || {};
  } catch (error) {
    console.error('[Firebase] Error getting clan players:', error.message);
    throw error;
  }
}

/**
 * Get all clans for a user
 */
export async function getUserClans(userPhone) {
  try {
    console.log('[Firebase] Getting clans for user:', userPhone);
    
    // Safety check: return empty if userPhone is undefined
    if (!userPhone) {
      console.log('[Firebase] userPhone is undefined, returning empty clans array');
      return [];
    }
    
    const clansRef = collection(db, "clans");
    const userClansQuery = query(clansRef, where("members", "array-contains", userPhone));
    const clansSnap = await getDocs(userClansQuery);
    
    const clans = [];
    clansSnap.forEach(doc => {
      clans.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    
    console.log('[Firebase] ✓ Found', clans.length, 'clans');
    return clans;
  } catch (error) {
    // Silently return empty array on permission errors - new users may not have clans yet
    if (error.code === 'permission-denied') {
      console.log('[Firebase] No clans accessible (permissions or empty), returning []');
      return [];
    }
    console.error('[Firebase] Error getting user clans:', error.message);
    return [];
  }
}

/**
 * Get clan details
 */
export async function getClan(clanId) {
  try {
    const clanRef = doc(db, "clans", clanId);
    const clanSnap = await getDoc(clanRef);
    
    if (!clanSnap.exists()) {
      throw new Error('Clan not found');
    }
    
    return {
      id: clanSnap.id,
      ...clanSnap.data(),
    };
  } catch (error) {
    console.error('[Firebase] Error getting clan:', error.message);
    throw error;
  }
}

/**
 * Generate a shareable invite link/code for a clan
 */
export async function generateClanInviteLink(clanId) {
  try {
    console.log('[Firebase] Generating invite link for clan:', clanId);
    
    // Check if clan exists
    const clanRef = doc(db, "clans", clanId);
    const clanSnap = await getDoc(clanRef);
    
    if (!clanSnap.exists()) {
      throw new Error('Clan not found');
    }
    
    // Generate a unique 6-digit code
    const inviteCode = Math.random().toString().slice(2, 8).padEnd(6, '0');
    
    // Create invite link document
    const inviteRef = doc(collection(db, "clanInvites"), inviteCode);
    await setDoc(inviteRef, {
      clanId,
      clanName: clanSnap.data().name,
      code: inviteCode,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      active: true,
      usageCount: 0,
    });
    
    console.log('[Firebase] ✓ Invite link generated:', inviteCode);
    return { code: inviteCode, clanName: clanSnap.data().name };
  } catch (error) {
    console.error('[Firebase] Error generating invite link:', error.message);
    throw error;
  }
}

/**
 * Get invite link for a clan
 */
export async function getClanInviteLink(clanId) {
  try {
    const invitesRef = collection(db, "clanInvites");
    const inviteQuery = query(invitesRef, where("clanId", "==", clanId), where("active", "==", true));
    const invitesSnap = await getDocs(inviteQuery);
    
    if (invitesSnap.empty) {
      return null; // No active invite link
    }
    
    const invite = invitesSnap.docs[0].data();
    return { code: invite.code, clanName: invite.clanName };
  } catch (error) {
    console.error('[Firebase] Error getting invite link:', error.message);
    return null;
  }
}

/**
 * Join a clan using invite code
 */
export async function joinClanUsingInviteCode(inviteCode, playerPhone, playerName) {
  try {
    console.log('[Firebase] Attempting to join clan with invite code:', inviteCode);
    
    // Get invite link document
    const inviteRef = doc(db, "clanInvites", inviteCode);
    const inviteSnap = await getDoc(inviteRef);
    
    if (!inviteSnap.exists()) {
      throw new Error('Invalid invite code');
    }
    
    const inviteData = inviteSnap.data();
    
    if (!inviteData.active) {
      throw new Error('Invite link is no longer active');
    }
    
    // Check if expired
    if (new Date(inviteData.expiresAt) < new Date()) {
      throw new Error('Invite link has expired');
    }
    
    const clanId = inviteData.clanId;
    
    // Auto-create player profile if doesn't exist
    const playerProfileRef = doc(db, "playerProfiles", playerPhone);
    const profileSnap = await getDoc(playerProfileRef);
    
    if (!profileSnap.exists()) {
      console.log('[Firebase] Creating new player profile for:', playerPhone);
      await setDoc(playerProfileRef, {
        phone: playerPhone,
        firstName: playerName.split(' ')[0] || playerName,
        lastName: playerName.split(' ').slice(1).join(' ') || '',
        email: '',
        passcode: '', // Player should set this after joining
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        profileComplete: false, // Mark as incomplete - needs editing
      });
      console.log('[Firebase] ✓ Player profile created');
    }
    
    // Get clan document
    const clanRef = doc(db, "clans", clanId);
    const clanSnap = await getDoc(clanRef);
    
    if (!clanSnap.exists()) {
      throw new Error('Clan not found');
    }
    
    const clanData = clanSnap.data();
    
    // Check if player already in clan
    if (clanData.members && clanData.members.includes(playerPhone)) {
      throw new Error('You are already a member of this clan');
    }
    
    // Add player to clan
    await setDoc(clanRef, {
      members: [...(clanData.members || []), playerPhone],
      memberDetails: {
        ...clanData.memberDetails,
        [playerPhone]: {
          name: playerName,
          phone: playerPhone,
          role: "member",
          joinedAt: new Date().toISOString(),
        }
      },
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    
    // Increment usage count
    await setDoc(inviteRef, {
      usageCount: (inviteData.usageCount || 0) + 1,
    }, { merge: true });
    
    console.log('[Firebase] ✓ Player joined clan via invite link');
    return { success: true, clanId, clanName: clanData.name, profileComplete: false };
  } catch (error) {
    console.error('[Firebase] Error joining clan with invite code:', error.message);
    throw error;
  }
}

/**
 * Request to join a clan (sends membership request to clan creator)
 */
export async function requestClanMembership(clanId, playerPhone, playerName) {
  try {
    console.log('[Firebase] Player requesting clan membership:', playerPhone, 'for clan:', clanId);
    
    // Check if clan exists
    const clanRef = doc(db, "clans", clanId);
    const clanSnap = await getDoc(clanRef);
    
    if (!clanSnap.exists()) {
      throw new Error('Clan not found');
    }
    
    const clanData = clanSnap.data();
    
    // Check if player already in clan
    if (clanData.members && clanData.members.includes(playerPhone)) {
      throw new Error('You are already a member of this clan');
    }
    
    // Check if request already pending
    const requestsRef = collection(db, "clanMembershipRequests");
    const existingQuery = query(
      requestsRef,
      where("clanId", "==", clanId),
      where("playerPhone", "==", playerPhone),
      where("status", "==", "pending")
    );
    const existingSnap = await getDocs(existingQuery);
    
    if (!existingSnap.empty) {
      throw new Error('Request already pending - please wait for clan creator to respond');
    }
    
    // Create membership request
    const requestRef = doc(requestsRef);
    const requestId = requestRef.id;
    
    await setDoc(requestRef, {
      clanId,
      playerPhone,
      playerName,
      status: "pending",
      requestedAt: new Date().toISOString(),
      creatorPhone: clanData.creatorPhone,
      creatorName: clanData.creatorName,
      clanName: clanData.name,
    });
    
    console.log('[Firebase] ✓ Membership request created:', requestId);
    return { success: true, requestId, message: `Request sent to ${clanData.creatorName}` };
  } catch (error) {
    console.error('[Firebase] Error requesting clan membership:', error.message);
    throw error;
  }
}

/**
 * Get pending membership requests for a clan (for creator)
 */
export async function getPendingClanRequests(clanId) {
  try {
    const requestsRef = collection(db, "clanMembershipRequests");
    const pendingQuery = query(
      requestsRef,
      where("clanId", "==", clanId),
      where("status", "==", "pending")
    );
    const requestsSnap = await getDocs(pendingQuery);
    
    const requests = [];
    requestsSnap.forEach(doc => {
      requests.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    
    return requests;
  } catch (error) {
    console.error('[Firebase] Error getting pending requests:', error.message);
    return [];
  }
}

/**
 * Approve a clan membership request
 */
export async function approveClanMembership(requestId, clanId) {
  try {
    console.log('[Firebase] Approving membership request:', requestId);
    
    // Get the request
    const requestRef = doc(db, "clanMembershipRequests", requestId);
    const requestSnap = await getDoc(requestRef);
    
    if (!requestSnap.exists()) {
      throw new Error('Request not found');
    }
    
    const requestData = requestSnap.data();
    
    if (requestData.status !== "pending") {
      throw new Error('Request is no longer pending');
    }
    
    // Get clan
    const clanRef = doc(db, "clans", clanId);
    const clanSnap = await getDoc(clanRef);
    
    if (!clanSnap.exists()) {
      throw new Error('Clan not found');
    }
    
    const clanData = clanSnap.data();
    
    // Add player to clan
    const playerPhone = requestData.playerPhone;
    const playerName = requestData.playerName;
    
    await setDoc(clanRef, {
      members: [...(clanData.members || []), playerPhone],
      memberDetails: {
        ...clanData.memberDetails,
        [playerPhone]: {
          name: playerName,
          phone: playerPhone,
          role: "member",
          joinedAt: new Date().toISOString(),
        }
      },
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    
    // Update request status
    await setDoc(requestRef, {
      status: "approved",
      respondedAt: new Date().toISOString(),
    }, { merge: true });
    
    console.log('[Firebase] ✓ Membership approved:', playerName);
    return { success: true, message: `${playerName} added to clan` };
  } catch (error) {
    console.error('[Firebase] Error approving membership:', error.message);
    throw error;
  }
}

/**
 * Reject a clan membership request
 */
export async function rejectClanMembership(requestId) {
  try {
    console.log('[Firebase] Rejecting membership request:', requestId);
    
    const requestRef = doc(db, "clanMembershipRequests", requestId);
    const requestSnap = await getDoc(requestRef);
    
    if (!requestSnap.exists()) {
      throw new Error('Request not found');
    }
    
    // Update request status
    await setDoc(requestRef, {
      status: "rejected",
      respondedAt: new Date().toISOString(),
    }, { merge: true });
    
    console.log('[Firebase] ✓ Membership request rejected');
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Error rejecting membership:', error.message);
    throw error;
  }
}

/**
 * Update player profile details
 */
export async function updatePlayerProfile(playerPhone, profileData) {
  try {
    console.log('[Firebase] Updating player profile:', playerPhone);
    
    const playerProfileRef = doc(db, "playerProfiles", playerPhone);
    
    await setDoc(playerProfileRef, {
      ...profileData,
      updatedAt: new Date().toISOString(),
      profileComplete: true,
    }, { merge: true });
    
    console.log('[Firebase] ✓ Player profile updated');
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Error updating player profile:', error.message);
    throw error;
  }
}

/**
 * Unsubscribe from all real-time listeners
 */
export function unsubscribeAllListeners() {
  Object.values(listeners).forEach((unsubscribe) => {
    if (typeof unsubscribe === "function") {
      unsubscribe();
    }
  });
}

/**
 * Save live match state to Firestore for multi-device access
 * Creates or updates a document in the "liveMatches" collection with full game state
 */
/**
 * Sanitize state for Firestore - remove undefined values and handle nested arrays
 */
function sanitizeStateForFirestore(state) {
  // Recursively remove all undefined values at any depth
  function deepClean(obj) {
    if (obj === undefined || obj === null) {
      return undefined;
    }
    
    if (Array.isArray(obj)) {
      // Map and filter to remove undefined values
      return obj
        .map(item => deepClean(item))
        .filter(item => item !== undefined);
    }
    
    if (typeof obj === 'object') {
      const cleaned = {};
      for (const [key, value] of Object.entries(obj)) {
        const cleanedValue = deepClean(value);
        // Only include if value is not undefined
        if (cleanedValue !== undefined) {
          cleaned[key] = cleanedValue;
        }
      }
      return Object.keys(cleaned).length > 0 ? cleaned : undefined;
    }
    
    // Primitive values (string, number, boolean, etc.)
    return obj;
  }
  
  // Remove undo/redo stacks - these are temporary UI state only (stored locally for undo feature)
  // Note: commentary removed entirely to keep app lightweight
  const stateForCloud = { ...state };
  delete stateForCloud.history;
  delete stateForCloud.redoStack;
  delete stateForCloud.commentary;
  
  // 🏏 CRITICAL: Remove ball history to prevent document size explosion
  // Firestore has 1MB limit per document. Only save score snapshot
  // Full history is preserved in localStorage for undo/redo on this device
  // Followers only need: runs, wickets, legalBalls, bowler, striker, phase (not ball-by-ball)
  if (stateForCloud.innings && Array.isArray(stateForCloud.innings)) {
    stateForCloud.innings = stateForCloud.innings.map((inn) => {
      if (!inn) return inn;
      const trimmedInn = { ...inn };
      
      // Remove entire ball history - not needed for followers
      delete trimmedInn.timeline;
      delete trimmedInn.balls;
      
      // Keep only essential innings data for display:
      // runs, wickets, legalBalls, bowler, striker, nonStriker, etc.
      // This reduces document from 1MB+ to ~50KB
      
      return trimmedInn;
    });
    console.log('[Firebase] Removed ball history from innings to reduce document size for Firestore');
  }
  
  const result = deepClean(stateForCloud);
  return result || {};
}

export async function saveLiveMatch(code, state) {
  try {
    if (!code || !state) {
      const msg = 'saveLiveMatch: Missing code or state';
      console.error('[Firebase]', msg);
      return { success: false, message: msg, error: 'INVALID_INPUT' };
    }

    const liveMatchRef = doc(db, "liveMatches", code);
    
    // Sanitize state: removes undefined values and excludes history/redoStack
    // (history/redoStack are local-only for undo feature on scorer device)
    const cleanedState = sanitizeStateForFirestore(state);
    console.log('[Firebase] Syncing match state. Excluded fields: history, redoStack (undo/redo)');
    
    // Double-check: JSON stringify/parse to ensure no undefined values
    // This will convert undefined to null in nested objects
    const stringified = JSON.stringify(cleanedState);
    const finalState = JSON.parse(stringified);
    
    // Get current user's auth info (email or uid)
    const currentUser = auth.currentUser;
    const scorerEmail = currentUser?.email || null;
    const scorerUid = currentUser?.uid || null;
    
    // Save the sanitized state for followers to display properly
    const liveMatchData = {
      code, // Match code for easy lookup
      ...finalState, // Save sanitized state for display
      // Metadata - for scorer transfer feature
      lastUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdAt: state.matchStartedAt || new Date().toISOString(),
      // Scorer info - SUPPORTS all auth types (phone, email, uid)
      scorerPhone: state.scorerPhone || state.starterPhone || null,
      scorerName: state.scorerName || null,
      scorerEmail: scorerEmail,  // NEW: Store email for email-based users
      scorerUid: scorerUid,      // NEW: Store uid for anonymous/all users
      originalScorerPhone: state.originalScorerPhone || state.starterPhone || null,
      originalScorerName: state.originalScorerName || null,
      originalScorerEmail: state.originalScorerEmail || scorerEmail || null,  // NEW
      originalScorerUid: state.originalScorerUid || scorerUid || null,        // NEW
    };

    await setDoc(liveMatchRef, liveMatchData);
    console.log('[Firebase] ✓ Live match synced:', code);
    return { success: true, message: 'Match synced', matchCode: code };
  } catch (error) {
    // Check if network error
    const isNetworkError = error.message.includes('network') || error.message.includes('offline');
    
    console.error('[Firebase] Error saving live match:', error.message);
    console.error('[Firebase] Error code:', error.code);
    
    // Queue for retry if network error
    if (isNetworkError) {
      queueForRetry('liveMatch', { matchCode: code, state });
      return { 
        success: false, 
        message: 'Offline - match will sync when online',
        error: 'NETWORK_ERROR',
        willRetry: true 
      };
    }
    
    return { 
      success: false, 
      message: error.message || 'Failed to sync match',
      error: error.code || 'UNKNOWN_ERROR'
    };
  }
}


/**
 * Get all ongoing matches from Firestore
 * Returns list of active matches that others can follow
 */
export async function getOngoingMatches() {
  try {
    const liveMatchesRef = collection(db, "liveMatches");
    const snapshot = await getDocs(liveMatchesRef);
    
    const ABANDONMENT_TIME_MS = 30 * 60 * 1000; // 30 minutes in milliseconds
    const now = new Date().getTime();
    const matches = [];
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      // Only include matches that are not in setup phase
      if (data.phase && data.phase !== "setup" && data.code) {
        const updatedAtTime = data.updatedAt ? new Date(data.updatedAt).getTime() : now;
        const timeSinceUpdate = now - updatedAtTime;
        
        // Check if match is abandoned (no update for 30 minutes)
        // Skip abandoned matches silently - cleanupAbandonedMatches() will delete them
        if (timeSinceUpdate > ABANDONMENT_TIME_MS) {
          return; // Skip, let cleanup function handle deletion
        }
        
        const currentInning = data.innings && data.innings.length > 0 
          ? data.innings[data.current || 0]
          : null;
          
        matches.push({
          code: data.code,
          teamA: data.teamA?.name || "Team A",
          teamB: data.teamB?.name || "Team B",
          phase: data.phase,
          score: currentInning ? {
            runs: currentInning.runs || 0,
            wickets: currentInning.wickets || 0,
            overs: currentInning.legalBalls || 0,
          } : null,
          updatedAt: data.updatedAt,
          createdAt: data.createdAt,
        });
      }
    });
    
    // Sort by most recently updated first
    matches.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    
    console.log('[Firebase] Found', matches.length, 'ongoing matches');
    return matches;
  } catch (error) {
    // Handle permission errors
    if (error.message.includes('Missing or insufficient permissions')) {
      console.warn('[Firebase] Permission denied - liveMatches collection requires public read access');
      console.warn('[Firebase] To fix: Update Firestore rules to allow public read on liveMatches collection');
      // Return cached matches from localStorage as fallback
      try {
        const cached = localStorage.getItem('ongoingMatches');
        if (cached) {
          const cachedMatches = JSON.parse(cached);
          console.log('[Firebase] Returning cached matches:', cachedMatches.length);
          return cachedMatches;
        }
      } catch (e) {
        // Ignore localStorage errors
      }
    } else {
      console.error('[Firebase] Error getting ongoing matches:', error.message);
    }
    return [];
  }
}

/**
 * Check if a player is actively playing in any ongoing match
 * @param {string} playerName - Player name to check
 * @returns {Promise<{isActive: boolean, matchCode?: string, team?: string}>}
 */
export async function checkPlayerActiveInMatch(playerName) {
  try {
    if (!playerName || !playerName.trim()) {
      return { isActive: false };
    }

    const liveMatchesRef = collection(db, "liveMatches");
    const snapshot = await getDocs(liveMatchesRef);
    
    let matchFound = null;
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      // Only check matches that are ongoing (not setup, not finished)
      if (data.phase && data.phase !== "setup" && data.phase !== "result" && data.code && data.status !== "aborted") {
        // Check if player is in Team A
        if (data.teamA?.players?.includes(playerName)) {
          matchFound = { isActive: true, matchCode: data.code, team: "A" };
          return;
        }
        // Check if player is in Team B
        if (data.teamB?.players?.includes(playerName)) {
          matchFound = { isActive: true, matchCode: data.code, team: "B" };
          return;
        }
      }
    });

    return matchFound || { isActive: false };
  } catch (error) {
    console.error('[Firebase] Error checking player active status:', error);
    return { isActive: false };
  }
}

/**
 * Clean up abandoned matches more than 30 minutes old
 * Deletes matches from Firestore if no recent activity
 * @returns {Promise<{success: boolean, deletedCount: number, message: string}>}
 */
export async function cleanupAbandonedMatches() {
  try {
    const liveMatchesRef = collection(db, "liveMatches");
    const snapshot = await getDocs(liveMatchesRef);
    
    const ABANDONMENT_TIME_MS = 30 * 60 * 1000; // 30 minutes in milliseconds
    const now = new Date().getTime();
    let deletedCount = 0;
    
    const deletePromises = [];
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.code) {
        const updatedAtTime = data.updatedAt ? new Date(data.updatedAt).getTime() : now;
        const timeSinceUpdate = now - updatedAtTime;
        
        // Delete match if abandoned (no update for 30 minutes)
        if (timeSinceUpdate > ABANDONMENT_TIME_MS) {
          console.log(`[Firebase] Deleting abandoned match ${data.code} (${Math.floor(timeSinceUpdate / 60000)} mins old)`);
          const liveMatchRef = doc(db, "liveMatches", data.code);
          deletePromises.push(
            deleteDoc(liveMatchRef)
              .then(() => {
                deletedCount++;
                console.log(`[Firebase] ✓ Deleted abandoned match: ${data.code}`);
              })
              .catch(err => {
                console.warn(`[Firebase] Could not delete abandoned match ${data.code}:`, err.message);
              })
          );
        }
      }
    });
    
    // Wait for all deletions to complete
    await Promise.all(deletePromises);
    
    if (deletedCount > 0) {
      console.log(`[Firebase] ✓ Cleanup complete: Deleted ${deletedCount} abandoned matches`);
    }
    
    return { 
      success: true, 
      deletedCount, 
      message: `Deleted ${deletedCount} abandoned matches` 
    };
  } catch (error) {
    console.error('[Firebase] Error cleaning up abandoned matches:', error.message);
    return { 
      success: false, 
      deletedCount: 0, 
      message: error.message 
    };
  }
}

/**
 * Validate that a player is not already in the other team of this match
 * @param {string} playerName - Player name
 * @param {string} teamKey - Team key ("A" or "B")
 * @param {object} state - Current match state
 * @returns {object} {valid: boolean, message?: string}
 */
export function validatePlayerTeamConflict(playerName, teamKey, state) {
  if (!playerName || !teamKey || !state) {
    return { valid: true };
  }

  const otherTeamKey = teamKey === "A" ? "B" : "A";
  const otherTeam = teamKey === "A" ? state.teamB : state.teamA;

  // Check if player is already in the other team of this match
  if (otherTeam && otherTeam.players && otherTeam.players.includes(playerName)) {
    return {
      valid: false,
      message: `${playerName} is already in ${otherTeam.name}. A player cannot play for both teams in the same match.`
    };
  }

  return { valid: true };
}

/**
 * Subscribe to a live match in real-time
 * Works across devices when match code is known
 */
export function subscribeToLiveMatch(code, callback) {
  try {
    console.log('[Firebase] Subscribing to live match:', code);
    
    const liveMatchRef = doc(db, "liveMatches", code);
    
    const unsubscribe = onSnapshot(liveMatchRef, (snapshot) => {
      if (snapshot.exists()) {
        let data = snapshot.data();
        console.log('[Firebase] ✓ Received live match update:', code);
        
        // Sanitize and validate the state from Firestore
        data = sanitizeStateFromFirestore(data);
        
        callback(data);
      } else {
        console.log('[Firebase] ✗ Live match not found:', code);
        callback(null);
      }
    }, (error) => {
      console.error('[Firebase] Error subscribing to live match:', error.message);
      // On permission denied, try localStorage fallback
      if (error.code === 'permission-denied') {
        const localData = localStorage.getItem(`match:${code}`);
        if (localData) {
          try {
            let parsedData = JSON.parse(localData);
            parsedData = sanitizeStateFromFirestore(parsedData);
            callback(parsedData);
          } catch (e) {
            console.error('[Firebase] Error parsing local match:', e);
          }
        }
      }
      callback(null);
    });
    
    return unsubscribe;
  } catch (error) {
    console.error('[Firebase] Error setting up live match subscription:', error.message);
    return () => {};
  }
}

/**
 * Validate and retrieve a match for resuming scorer
 * Checks if user started the match or if match is stale (can takeover)
 * Supports phone-based users, email-based users, and anonymous users
 * @param {string} code - Match code
 * @param {string} userPhone - User's phone number (optional, for phone-based users)
 * @returns {Promise<{success, message, matchData?, reason?}>}
 */
export async function validateMatchForResume(code, userPhone) {
  try {
    if (!code) {
      return { success: false, message: 'Invalid match code', reason: 'INVALID_INPUT' };
    }

    const liveMatchRef = doc(db, "liveMatches", code);
    const snapshot = await getDoc(liveMatchRef);

    if (!snapshot.exists()) {
      console.log('[Firebase] Match not found:', code);
      return { success: false, message: 'Match code not found or match is complete', reason: 'NOT_FOUND' };
    }

    const matchData = snapshot.data();
    console.log('[Firebase] Match found:', code, 'scorer:', matchData.scorerPhone || matchData.scorerEmail);

    // Check if match is complete
    if (matchData.phase === "result" || matchData.complete) {
      return { success: false, message: 'This match is already complete', reason: 'MATCH_COMPLETE' };
    }

    // Get current user's credentials
    const currentUser = auth.currentUser;
    const userEmail = currentUser?.email || null;
    const userUid = currentUser?.uid || null;

    console.log('[Firebase] Resume validation - userEmail:', userEmail, 'userUid:', userUid, 'userPhone:', userPhone);
    console.log('[Firebase] Match data - scorerEmail:', matchData.scorerEmail, 'scorerUid:', matchData.scorerUid);

    // CHECK 1: Match current scorer by email (for email-based users: Google, Apple, Email)
    const isCurrentScorerByEmail = userEmail && matchData.scorerEmail && userEmail === matchData.scorerEmail;
    
    // CHECK 2: Match current scorer by uid (for anonymous or any user)
    const isCurrentScorerByUid = userUid && matchData.scorerUid && userUid === matchData.scorerUid;
    
    // CHECK 3: Match current scorer by phone (for phone-based users)
    const normalizedUserPhone = userPhone ? (userPhone || '').replace(/\D/g, '').slice(-10) : null;
    const normalizedScorerPhone = matchData.scorerPhone ? (matchData.scorerPhone || '').replace(/\D/g, '').slice(-10) : null;
    const isCurrentScorerByPhone = normalizedUserPhone && normalizedScorerPhone && normalizedUserPhone === normalizedScorerPhone;

    if (isCurrentScorerByEmail || isCurrentScorerByUid || isCurrentScorerByPhone) {
      // Same user resuming on same or different device
      return {
        success: true,
        message: 'Your match loaded - resume scoring',
        matchData,
        matchCode: code,
        reason: 'RESUME_OWN_MATCH'
      };
    }

    // CHECK 4: Match original scorer (if someone took over)
    const isOriginalScorerByEmail = userEmail && matchData.originalScorerEmail && userEmail === matchData.originalScorerEmail;
    const isOriginalScorerByUid = userUid && matchData.originalScorerUid && userUid === matchData.originalScorerUid;
    const normalizedOriginalPhone = matchData.originalScorerPhone ? (matchData.originalScorerPhone || '').replace(/\D/g, '').slice(-10) : null;
    const isOriginalScorerByPhone = normalizedUserPhone && normalizedOriginalPhone && normalizedUserPhone === normalizedOriginalPhone;

    if (isOriginalScorerByEmail || isOriginalScorerByUid || isOriginalScorerByPhone) {
      // Original scorer resuming after someone else took over
      return {
        success: true,
        message: 'Your match loaded - can resume or view',
        matchData,
        matchCode: code,
        reason: 'RESUME_ORIGINAL_MATCH'
      };
    }

    // Different user - check if current scorer is stale (>2 minutes no update)
    const lastUpdateTime = matchData.lastUpdatedAt ? new Date(matchData.lastUpdatedAt) : new Date();
    const now = new Date();
    const minutesSinceUpdate = (now - lastUpdateTime) / 60000;

    if (minutesSinceUpdate > 2) {
      // Match is stale, allow takeover
      return {
        success: true,
        message: 'This match is stale - you can take over scoring',
        matchData,
        matchCode: code,
        reason: 'ALLOW_TAKEOVER',
        minutesSinceUpdate: Math.round(minutesSinceUpdate)
      };
    }

    // Current scorer is still active
    return {
      success: false,
      message: `This match is being scored by ${matchData.scorerName || 'another user'} (updated ${Math.round(minutesSinceUpdate)} min ago)`,
      reason: 'SCORER_ACTIVE',
      matchData // Still provide data to show in UI
    };
  } catch (error) {
    console.error('[Firebase] Error validating match resume:', error.message);
    return { success: false, message: 'Error checking match', reason: 'DATABASE_ERROR', error: error.message };
  }
}

/**
 * Record a scorer transfer (takeover or resume)
 * Updates match metadata with new scorer info
 * @param {string} code - Match code
 * @param {string} userPhone - New scorer's phone
 * @param {string} userName - New scorer's name
 * @param {string} reason - Reason: "RESUME", "TAKEOVER", etc
 * @returns {Promise<{success, message}>}
 */
export async function recordScorerTransfer(code, userPhone, userName, reason = "RESUME") {
  try {
    if (!code || !userPhone) {
      return { success: false, message: 'Missing code or phone', error: 'INVALID_INPUT' };
    }

    const liveMatchRef = doc(db, "liveMatches", code);
    
    // Normalize phone
    const normalizedPhone = (userPhone || '').replace(/\D/g, '').slice(-10);

    const updateData = {
      scorerPhone: userPhone,
      scorerName: userName,
      lastScorerChangeAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Note: scorerHistory would require array-union in production
      // For MVP, just track current scorer
    };

    await updateDoc(liveMatchRef, updateData);
    console.log('[Firebase] Scorer transferred for match', code, 'to', userName, 'reason:', reason);
    
    return { success: true, message: 'Scorer updated' };
  } catch (error) {
    console.error('[Firebase] Error recording scorer transfer:', error.message);
    return { success: false, message: 'Error updating scorer', error: error.message };
  }
}

/**
 * Get all resumable matches for a user (own matches + takeover candidates)
 * Returns ongoing matches categorized by:
 * 1. Matches where user is current scorer (resume)
 * 2. Matches where user is original scorer but someone took over (can resume)
 * 3. Other ongoing matches abandoned >2 mins (can takeover)
 * @param {string} userEmail - User's email (for email-based auth)
 * @param {string} userUid - User's Firebase UID
 * @param {string} userPhone - User's phone number
 * @returns {Promise<{ownMatches, resumeMatches, takeoverMatches}>}
 */
export async function getResumableMatches(userEmail, userUid, userPhone) {
  try {
    const liveMatchesRef = collection(db, "liveMatches");
    const snapshot = await getDocs(liveMatchesRef);
    
    const TAKEOVER_TIME_MS = 2 * 60 * 1000; // 2 minutes
    const now = new Date().getTime();
    
    const ownMatches = [];      // User is current scorer
    const resumeMatches = [];   // User is original scorer (someone took over)
    const takeoverMatches = [];  // Abandoned matches user can takeover
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      
      // Only include ongoing matches
      if (!data.phase || data.phase === "setup" || data.phase === "result" || data.status === "aborted" || !data.code) {
        return;
      }
      
      // Normalize identifiers
      const normalizedUserPhone = userPhone ? (userPhone || '').replace(/\D/g, '').slice(-10) : null;
      const normalizedScorerPhone = data.scorerPhone ? (data.scorerPhone || '').replace(/\D/g, '').slice(-10) : null;
      const normalizedOriginalPhone = data.originalScorerPhone ? (data.originalScorerPhone || '').replace(/\D/g, '').slice(-10) : null;
      
      // Get current inning score for display
      const currentInning = data.innings && data.innings.length > 0 
        ? data.innings[data.current || 0]
        : null;
      
      const matchInfo = {
        code: data.code,
        teamA: data.teamA?.name || "Team A",
        teamB: data.teamB?.name || "Team B",
        phase: data.phase,
        score: currentInning ? {
          runs: currentInning.runs || 0,
          wickets: currentInning.wickets || 0,
          overs: currentInning.legalBalls || 0,
        } : null,
        updatedAt: data.updatedAt,
        scorerName: data.scorerName || "Unknown",
        minutesSinceUpdate: 0
      };
      
      const updatedAtTime = data.updatedAt ? new Date(data.updatedAt).getTime() : now;
      const timeSinceUpdate = now - updatedAtTime;
      matchInfo.minutesSinceUpdate = Math.round(timeSinceUpdate / 60000);
      
      // CHECK 1: Is user the current scorer?
      const isCurrentScorerByEmail = userEmail && data.scorerEmail && userEmail === data.scorerEmail;
      const isCurrentScorerByUid = userUid && data.scorerUid && userUid === data.scorerUid;
      const isCurrentScorerByPhone = normalizedUserPhone && normalizedScorerPhone && normalizedUserPhone === normalizedScorerPhone;
      
      if (isCurrentScorerByEmail || isCurrentScorerByUid || isCurrentScorerByPhone) {
        ownMatches.push({ ...matchInfo, resumeType: 'own' });
        return;
      }
      
      // CHECK 2: Is user the original scorer (someone took over)?
      const isOriginalScorerByEmail = userEmail && data.originalScorerEmail && userEmail === data.originalScorerEmail;
      const isOriginalScorerByUid = userUid && data.originalScorerUid && userUid === data.originalScorerUid;
      const isOriginalScorerByPhone = normalizedUserPhone && normalizedOriginalPhone && normalizedUserPhone === normalizedOriginalPhone;
      
      if (isOriginalScorerByEmail || isOriginalScorerByUid || isOriginalScorerByPhone) {
        resumeMatches.push({ ...matchInfo, resumeType: 'original' });
        return;
      }
      
      // CHECK 3: Can user takeover (match abandoned >2 mins)?
      if (timeSinceUpdate > TAKEOVER_TIME_MS) {
        takeoverMatches.push({ ...matchInfo, resumeType: 'takeover' });
        return;
      }
    });
    
    // Sort by most recently updated first
    const sort = (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt);
    ownMatches.sort(sort);
    resumeMatches.sort(sort);
    takeoverMatches.sort(sort);
    
    console.log('[Firebase] Resumable matches - own:', ownMatches.length, 'original:', resumeMatches.length, 'takeover:', takeoverMatches.length);
    
    return { ownMatches, resumeMatches, takeoverMatches, total: ownMatches.length + resumeMatches.length + takeoverMatches.length };
  } catch (error) {
    console.error('[Firebase] Error getting resumable matches:', error.message);
    return { ownMatches: [], resumeMatches: [], takeoverMatches: [], error: error.message };
  }
}

/**
 * Create a scoring transfer invite for a player
 * @param {string} matchId - The match ID
 * @param {string} matchCode - The match code
 * @param {string} fromPhone - Current scorer's phone
 * @param {string} fromName - Current scorer's name
 * @param {string} toPhone - Recipient's phone
 * @param {string} toName - Recipient's name
 * @returns {Promise<{success, inviteId?}>}
 */
export async function createScoringTransferInvite(matchId, matchCode, fromPhone, fromName, toPhone, toName) {
  try {
    if (!matchCode || !toPhone || !toName) {
      throw new Error('Missing required fields');
    }

    const transfersRef = collection(db, "scoringTransfers");
    const inviteData = {
      matchId,
      matchCode,
      fromPhone,
      fromName,
      toPhone: (toPhone || '').replace(/\D/g, '').slice(-10),
      toName,
      status: "pending",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hour expiry
    };

    const docRef = await addDoc(transfersRef, inviteData);
    console.log('[Firebase] Scoring transfer invite created:', docRef.id);
    return { success: true, inviteId: docRef.id };
  } catch (error) {
    console.error('[Firebase] Error creating scoring transfer invite:', error);
    throw error;
  }
}

/**
 * Get all pending scoring transfer invites for a player
 * @param {string} playerPhone - Player's phone number
 * @returns {Promise<Array>}
 */
export async function getScoringTransferInvites(playerPhone) {
  try {
    if (!playerPhone) return [];

    const normalizedPhone = (playerPhone || '').replace(/\D/g, '').slice(-10);
    const transfersRef = collection(db, "scoringTransfers");
    const q = query(
      transfersRef,
      where("toPhone", "==", normalizedPhone),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(q);
    const invites = [];
    snapshot.forEach((doc) => {
      invites.push({ id: doc.id, ...doc.data() });
    });

    console.log('[Firebase] Loaded', invites.length, 'scoring transfer invites for', normalizedPhone);
    return invites;
  } catch (error) {
    console.error('[Firebase] Error fetching scoring transfer invites:', error);
    return [];
  }
}

/**
 * Accept a scoring transfer invite and take over the match
 * @param {string} inviteId - The invite document ID
 * @param {string} acceptorPhone - Phone of player accepting the invite
 * @returns {Promise<{success, matchCode?}>}
 */
export async function acceptScoringTransferInvite(inviteId, acceptorPhone) {
  try {
    if (!inviteId || !acceptorPhone) {
      throw new Error('Missing invite ID or phone');
    }

    // Get the invite
    const inviteRef = doc(db, "scoringTransfers", inviteId);
    const inviteSnap = await getDoc(inviteRef);

    if (!inviteSnap.exists()) {
      throw new Error('Invite not found');
    }

    const invite = inviteSnap.data();

    // Verify the invite is still pending and for this user
    if (invite.status !== "pending") {
      throw new Error('Invite is no longer valid');
    }

    const normalizedAcceptor = (acceptorPhone || '').replace(/\D/g, '').slice(-10);
    const normalizedInvitee = (invite.toPhone || '').replace(/\D/g, '').slice(-10);

    if (normalizedAcceptor !== normalizedInvitee) {
      throw new Error('This invite is not for you');
    }

    // Update the invite to accepted
    await updateDoc(inviteRef, {
      status: "accepted",
      acceptedAt: new Date().toISOString(),
    });

    // Update the match with new scorer
    const matchRef = doc(db, "liveMatches", invite.matchCode);
    await updateDoc(matchRef, {
      scorerPhone: acceptorPhone,
      scorerName: invite.toName,
      lastScorerChangeAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    console.log('[Firebase] Accepted scoring transfer for match', invite.matchCode);
    return { success: true, matchCode: invite.matchCode };
  } catch (error) {
    console.error('[Firebase] Error accepting scoring transfer:', error);
    throw error;
  }
}

/**
 * Reject a scoring transfer invite
 * @param {string} inviteId - The invite document ID
 * @returns {Promise<{success}>}
 */
export async function rejectScoringTransferInvite(inviteId) {
  try {
    const inviteRef = doc(db, "scoringTransfers", inviteId);
    await updateDoc(inviteRef, {
      status: "rejected",
      rejectedAt: new Date().toISOString(),
    });
    console.log('[Firebase] Rejected scoring transfer invite:', inviteId);
    return { success: true };
  } catch (error) {
    console.error('[Firebase] Error rejecting scoring transfer:', error);
    throw error;
  }
}

/**
 * Find all active matches that a user can takeover using phone number only
 * Returns matches where:
 * 1. User is the original scorer
 * 2. User is current scorer but on different device
 * 3. Match is stale (>3 min) - any squad member can take over
 * @param {string} userPhone - User's phone number
 * @returns {Promise<{matches}>}
 */
export async function findMatchesByPhone(userPhone) {
  try {
    if (!userPhone) {
      return { success: false, message: 'Phone number required', takeoverMatches: [], resumeMatches: [], activeMatches: [] };
    }

    const normalizedUserPhone = (userPhone || '').replace(/\D/g, '').slice(-10);
    
    // Query all ongoing matches from Firestore
    const matchesRef = collection(db, "liveMatches");
    const q = query(matchesRef);
    const snapshot = await getDocs(q);

    const takeoverMatches = [];  // Can take over (stale)
    const resumeMatches = [];    // Can resume (your match)
    const activeMatches = [];    // Being actively scored by someone else

    snapshot.forEach((doc) => {
      const matchData = doc.data();
      
      // Skip completed matches
      if (matchData.phase === "result" || matchData.complete) {
        return;
      }

      const normalizedScorer = (matchData.scorerPhone || '').replace(/\D/g, '').slice(-10);
      const normalizedOriginal = (matchData.originalScorerPhone || '').replace(/\D/g, '').slice(-10);

      // Check if it's the user's match
      if (normalizedUserPhone === normalizedScorer || normalizedUserPhone === normalizedOriginal) {
        const innA = matchData.innings?.[0];
        const innB = matchData.innings?.[1];
        const scoreA = innA ? `${innA.runs}/${innA.wickets}` : "?";
        const scoreB = innB ? `${innB.runs}/${innB.wickets}` : "?";
        
        resumeMatches.push({
          code: matchData.code,
          score: `${matchData.teamA?.name || "Team A"} ${scoreA} vs ${matchData.teamB?.name || "Team B"} ${scoreB}`,
          phase: matchData.phase,
          scorerName: matchData.scorerName || "Unknown",
          isYourMatch: normalizedUserPhone === normalizedScorer,
        });
        return;
      }

      // Check if user can takeover (different scorer, match is stale)
      const lastUpdateTime = matchData.lastUpdatedAt ? new Date(matchData.lastUpdatedAt) : new Date();
      const now = new Date();
      const minutesSinceUpdate = (now - lastUpdateTime) / 60000;

      if (minutesSinceUpdate > 3) {
        const innA = matchData.innings?.[0];
        const innB = matchData.innings?.[1];
        const scoreA = innA ? `${innA.runs}/${innA.wickets}` : "?";
        const scoreB = innB ? `${innB.runs}/${innB.wickets}` : "?";

        takeoverMatches.push({
          code: matchData.code,
          score: `${matchData.teamA?.name || "Team A"} ${scoreA} vs ${matchData.teamB?.name || "Team B"} ${scoreB}`,
          phase: matchData.phase,
          scorerName: matchData.scorerName || "Unknown",
          minutesSinceUpdate: Math.round(minutesSinceUpdate),
        });
        return;
      }

      // Active match (being scored)
      const innA = matchData.innings?.[0];
      const innB = matchData.innings?.[1];
      const scoreA = innA ? `${innA.runs}/${innA.wickets}` : "?";
      const scoreB = innB ? `${innB.runs}/${innB.wickets}` : "?";

      activeMatches.push({
        code: matchData.code,
        score: `${matchData.teamA?.name || "Team A"} ${scoreA} vs ${matchData.teamB?.name || "Team B"} ${scoreB}`,
        phase: matchData.phase,
        scorerName: matchData.scorerName || "Unknown",
        minutesSinceUpdate: Math.round(minutesSinceUpdate),
      });
    });

    return {
      success: true,
      takeoverMatches,  // User can take over these
      resumeMatches,    // User's own matches
      activeMatches,    // Being actively scored by others
    };
  } catch (error) {
    console.error('[Firebase] Error finding matches by phone:', error.message);
    return { 
      success: false, 
      message: 'Error finding matches: ' + error.message,
      takeoverMatches: [],
      resumeMatches: [],
      activeMatches: []
    };
  }
}

/**
 * Sanitize and validate state retrieved from Firestore
 * Ensures all required properties exist with proper defaults
 */
function sanitizeStateFromFirestore(data) {
  if (!data) return null;
  
  // Ensure innings array exists and has valid elements
  if (!Array.isArray(data.innings)) {
    data.innings = [];
  }
  
  // Validate each inning has required properties
  data.innings = data.innings.map((inn, idx) => {
    if (!inn) {
      console.warn(`[Firebase] Innings ${idx} is undefined, creating empty inning`);
      return {
        battingTeam: "A",
        bowlingTeam: "B",
        runs: 0,
        wickets: 0,
        legalBalls: 0,
        timeline: [],
        balls: [],
        batsmen: {},
        bowlers: {},
      };
    }
    
    return {
      battingTeam: inn.battingTeam || "A",
      bowlingTeam: inn.bowlingTeam || "B",
      runs: inn.runs || 0,
      wickets: inn.wickets || 0,
      legalBalls: inn.legalBalls || 0,
      timeline: Array.isArray(inn.timeline) ? inn.timeline : [],
      balls: Array.isArray(inn.balls) ? inn.balls : [],
      batsmen: typeof inn.batsmen === 'object' ? inn.batsmen : {},
      bowlers: typeof inn.bowlers === 'object' ? inn.bowlers : {},
    };
  });
  
  // Ensure other required state properties
  data.teamA = data.teamA || { name: "Team A", players: [], profiles: {}, captain: "", wicketKeeper: "" };
  data.teamB = data.teamB || { name: "Team B", players: [], profiles: {}, captain: "", wicketKeeper: "" };
  data.phase = data.phase || "setup";
  data.current = data.current || 0;
  data.commentary = Array.isArray(data.commentary) ? data.commentary : [];
  
  console.log('[Firebase] ✓ Sanitized state retrieved from Firestore');
  return data;
}

/**
 * End a live match (move from liveMatches to completed matches)
 */
export async function endLiveMatch(code, state) {
  try {
    // Save to completed matches
    await saveMatch(state);
    
    // Delete from live matches
    const liveMatchRef = doc(db, "liveMatches", code);
    await deleteDoc(liveMatchRef);
    
    console.log('[Firebase] ✓ Live match ended and archived:', code);
    return true;
  } catch (error) {
    console.error('[Firebase] Error ending live match:', error.message);
    return false;
  }
}

/**
 * Get Firestore instance (for advanced operations)
 */
export function getDB() {
  return db;
}

/**
 * PLAYER DISCOVERY - Search players globally
 */
export async function searchPlayers(searchTerm) {
  try {
    if (!searchTerm || searchTerm.trim().length === 0) return [];
    
    const term = searchTerm.toLowerCase().trim();
    const playersRef = collection(db, "playerProfiles");
    const prefixMatches = [];
    const substringMatches = [];
    
    // Fetch all players and categorize by match type (like a trie)
    const snapshot = await getDocs(playersRef);
    
    snapshot.forEach(doc => {
      const player = doc.data();
      const fullName = `${player.firstName || ""} ${player.lastName || ""}`.toLowerCase().trim();
      const phone = player.phone || "";
      const firstName = (player.firstName || "").toLowerCase();
      const lastName = (player.lastName || "").toLowerCase();
      
      // Check for PREFIX matches (best matches - like trie)
      const isFirstNamePrefix = firstName.startsWith(term);
      const isLastNamePrefix = lastName.startsWith(term);
      const isPhonePrefix = phone.startsWith(term);
      const isFullNamePrefix = fullName.startsWith(term);
      
      if (isFirstNamePrefix || isLastNamePrefix || isPhonePrefix || isFullNamePrefix) {
        prefixMatches.push({
          phone: player.phone,
          name: `${player.firstName} ${player.lastName}`,
          firstName: player.firstName,
          lastName: player.lastName,
          email: player.email,
          location: player.location || "",
          avatar: player.avatar || 1,
          matchType: "prefix", // For sorting
        });
      } 
      // Check for SUBSTRING matches (secondary)
      else if (fullName.includes(term) || phone.includes(term)) {
        substringMatches.push({
          phone: player.phone,
          name: `${player.firstName} ${player.lastName}`,
          firstName: player.firstName,
          lastName: player.lastName,
          email: player.email,
          location: player.location || "",
          avatar: player.avatar || 1,
          matchType: "substring",
        });
      }
    });
    
    // Combine: prefix matches first, then substring, then limit to 10
    const allResults = [...prefixMatches, ...substringMatches];
    return allResults.slice(0, 10);
  } catch (error) {
    console.error('[Firebase] Error searching players:', error.message);
    return [];
  }
}

/**
 * Get player global profile with stats
 */
export async function getPlayerGlobalProfile(phone) {
  try {
    if (!phone) return null;
    
    const playerRef = doc(db, "playerProfiles", phone);
    const playerSnap = await getDoc(playerRef);
    
    if (!playerSnap.exists()) return null;
    
    const profileData = playerSnap.data();
    
    // Get player stats
    const statsRef = doc(db, "players", `${profileData.firstName} ${profileData.lastName}`);
    const statsSnap = await getDoc(statsRef);
    const stats = statsSnap.exists() ? statsSnap.data() : {};
    
    // Get player's teams
    const teamsRef = collection(db, "teams");
    const teamsQuery = query(teamsRef, where("members", "array-contains", profileData.firstName + " " + profileData.lastName));
    const teamsSnap = await getDocs(teamsQuery);
    const teams = teamsSnap.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
    
    // Get player's clans
    const clansRef = collection(db, "clans");
    const clansSnap = await getDocs(clansRef);
    const clans = [];
    clansSnap.forEach(doc => {
      const clanData = doc.data();
      if (clanData.members?.includes(phone)) {
        clans.push({ id: doc.id, name: clanData.name });
      }
    });
    
    return {
      phone: profileData.phone,
      name: `${profileData.firstName} ${profileData.lastName}`,
      email: profileData.email,
      location: profileData.location || "",
      avatar: profileData.avatar || 1,
      stats: {
        matches: stats.matches || 0,
        runs: stats.runs || 0,
        wickets: stats.wickets || 0,
        highestScore: stats.highestScore || 0,
        fours: stats.fours || 0,
        sixes: stats.sixes || 0,
        ballsFaced: stats.ballsFaced || 0,
        innings: stats.innings || 0,
      },
      teams,
      clans,
    };
  } catch (error) {
    console.error('[Firebase] Error getting player profile:', error.message);
    return null;
  }
}

/**
 * NOTIFICATIONS - Create notification
 */
export async function createNotification(toPhone, type, title, message, data = {}) {
  try {
    const notificationsRef = collection(db, "notifications");
    await setDoc(doc(notificationsRef), {
      toPhone,
      type, // "match_invite" | "clan_request" | "team_invite" | "clan_approved"
      title,
      message,
      data,
      read: false,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    });
    
    console.log('[Firebase] ✓ Notification created for', toPhone);
  } catch (error) {
    console.error('[Firebase] Error creating notification:', error.message);
  }
}

/**
 * Get user notifications
 */
export async function getNotifications(phone) {
  try {
    if (!phone) return [];
    
    const notificationsRef = collection(db, "notifications");
    const q = query(
      notificationsRef,
      where("toPhone", "==", phone),
      where("read", "==", false),
      orderBy("createdAt", "desc")
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('[Firebase] Error getting notifications:', error.message);
    return [];
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationRead(notificationId) {
  try {
    const notifRef = doc(db, "notifications", notificationId);
    await updateDoc(notifRef, { read: true });
  } catch (error) {
    console.error('[Firebase] Error marking notification as read:', error.message);
  }
}

export default {
  // ✨ NEW: Modern Authentication (Email/Password, Google, Apple, Anonymous)
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  signInWithApple,
  loginAnonymously,
  upgradeAnonymousToEmail,
  sendPasswordReset,
  getCurrentUser,
  getCurrentUserEmail,
  getPlayerByEmail,
  getPlayerByUid,
  updateUserEmailProfile,
  logoutUser,
  subscribeToAuthState,
  normalizePhoneNumber,
  
  // Authentication - Phone + Passcode (Backward Compatibility)
  registerUser,
  loginUser,
  checkPhoneExists,
  checkEmailExists,
  requestPasswordReset,
  verifyResetCodeAndUpdatePasscode,
  verifyEmailPhoneAndUpdatePasscode,
  getUserByPhone,
  getPlayerByPhone,
  updateUserProfile,
  // Player Stats
  loadPlayerStats,
  savePlayerStats,
  subscribeToPlayerStats,
  // Match History & Live Matches
  saveMatch,
  loadMatches,
  subscribeToMatchByCode,
  // Live Matches (Multi-device)
  saveLiveMatch,
  validateMatchForResume,
  recordScorerTransfer,
  createScoringTransferInvite,
  getScoringTransferInvites,
  acceptScoringTransferInvite,
  rejectScoringTransferInvite,
  findMatchesByPhone,
  getOngoingMatches,
  checkPlayerActiveInMatch,
  cleanupAbandonedMatches,
  validatePlayerTeamConflict,
  subscribeToLiveMatch,
  endLiveMatch,
  // Teams
  createTeam,
  invitePlayerToTeam,
  getTeamInvitations,
  acceptTeamInvitation,
  rejectTeamInvitation,
  getPlayerTeam,
  removePlayerFromTeam,
  subscribeToTeamInvitations,
  loadAllTeams,
  subscribeToTeam,
  updateTeamCaptain,
  // Clans
  createClan,
  invitePlayerToClan,
  addPlayerToClanDirect,
  getClanPlayers,
  getUserClans,
  getClan,
  generateClanInviteLink,
  getClanInviteLink,
  joinClanUsingInviteCode,
  requestClanMembership,
  getPendingClanRequests,
  approveClanMembership,
  rejectClanMembership,
  // Player Discovery & Notifications
  searchPlayers,
  getPlayerGlobalProfile,
  createNotification,
  getNotifications,
  markNotificationRead,
  updatePlayerProfile,
  // Utilities
  unsubscribeAllListeners,
  getDB,
};
