import React, { useReducer, useState, useMemo, useEffect, useRef } from "react";
import {
  // ✨ NEW: Modern Authentication
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  signInWithApple,
  loginAnonymously,
  upgradeAnonymousToEmail,
  sendPasswordReset,
  getCurrentUserEmail,
  getPlayerByEmail,
  logoutUser,
  subscribeToAuthState,
  updateUserEmailProfile,
  
  // Existing functions
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
  loadPlayerStats,
  savePlayerStats,
  subscribeToPlayerStats,
  saveMatch,
  loadMatches,
  subscribeToMatchByCode,
  saveLiveMatch,
  validateMatchForResume,
  recordScorerTransfer,
  createScoringTransferInvite,
  getScoringTransferInvites,
  acceptScoringTransferInvite,
  rejectScoringTransferInvite,
  getOngoingMatches,
  getResumableMatches,
  checkPlayerActiveInMatch,
  cleanupAbandonedMatches,
  validatePlayerTeamConflict,
  subscribeToLiveMatch,
  endLiveMatch,
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
  unsubscribeAllListeners,
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
  updatePlayerProfile,
  setupNetworkDetection,
  processRetryQueue,
  searchPlayers,
  getPlayerGlobalProfile,
  getNotifications,
  markNotificationRead,
  createNotification,
} from "./firebase";

function genCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/*  NEW: Generate human-readable commentary for each ball */
function generateCommentary(payload, striker, bowler, ballNumber) {
  let text = "";
  const ballLabel = `Ball ${ballNumber}`;
  
  if (payload.kind === "run") {
    text = `${ballLabel}: ${striker} scores ${payload.runs} run${payload.runs > 1 ? "s" : ""} off ${bowler}`;
  } else if (payload.kind === "wide") {
    const extra = payload.extraRuns || 0;
    text = `${ballLabel}: WIDE!${extra > 0 ? ` + ${extra} extra` : ""}`.trim();
  } else if (payload.kind === "noball") {
    const batRuns = payload.batRuns || 0;
    text = `${ballLabel}: NO BALL!${batRuns > 0 ? ` ${striker} scores ${batRuns}` : ""} (free hit next)`.trim();
  } else if (payload.kind === "bye") {
    text = `${ballLabel}: BYE! ${payload.runs} run${payload.runs > 1 ? "s" : ""}`;
  } else if (payload.kind === "legbye") {
    text = `${ballLabel}: LEG BYE! ${payload.runs} run${payload.runs > 1 ? "s" : ""}`;
  } else if (payload.kind === "wicket") {
    const batRuns = payload.batRuns || 0;
    const how = payload.how === "bowled" ? "bowled" :
                payload.how === "caught" ? `caught by ${payload.fielder || "?"}` :
                payload.how === "lbw" ? "lbw" :
                payload.how === "stumped" ? `stumped by ${payload.fielder || "?"}` :
                payload.how === "runout" ? `run out by ${payload.fielder || "?"}` :
                "out";
    text = `${ballLabel}: WICKET! ${how}${batRuns > 0 ? ` (${batRuns} run${batRuns > 1 ? "s" : ""})` : ""}`;
  } else {
    text = `${ballLabel}: Dot ball`;
  }
  
  return text;
}

/* ---------------------------------------------------------------
   DESIGN TOKENS  "stadium under lights" scoreboard aesthetic
---------------------------------------------------------------- */
const C = {
  night: "#0B1D26",
  nightSoft: "#132B38",
  grass: "#163D2C",
  grassLight: "#1F5C3F",
  amber: "#FFB627",
  amberSoft: "#FFD98A",
  chalk: "#F6F3EA",
  chalkDim: "#DCD6C6",
  ink: "#12211C",
  crimson: "#E4572E",
  sky: "#4FA3D1",
  slate: "#6C7B76",
  line: "#25424B",
};

const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Grotesk:wght@400;500;600;700&display=swap');";

const display = { fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.03em" };
const body = { fontFamily: "'Space Grotesk', sans-serif" };

/* ---------------------------------------------------------------
   ERROR BOUNDARY - Catches rendering errors and shows friendly UI
---------------------------------------------------------------- */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);
    this.setState({ error, errorInfo });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center" style={{ background: C.night }}>
          <style>{`${FONT_IMPORT} * { box-sizing: border-box; }`}</style>
          <div className="max-w-md mx-auto p-6 text-center">
            <div style={{ ...display, fontSize: 48, color: C.crimson, marginBottom: 16 }}>⚠️</div>
            <div style={{ ...display, fontSize: 24, color: C.chalk, marginBottom: 12 }}>
              Something went wrong
            </div>
            <div style={{ ...body, color: C.chalkDim, marginBottom: 20, lineHeight: 1.6 }}>
              The app encountered an unexpected error. But don't worry, you can continue using CricketBuddy!
            </div>
            <div style={{ ...body, fontSize: 12, color: C.slate, marginBottom: 24, padding: 12, background: C.nightSoft, borderRadius: 8, maxHeight: 120, overflow: 'auto', textAlign: 'left' }}>
              {this.state.error && <div><strong>Error:</strong> {this.state.error.toString()}</div>}
              {this.state.errorInfo && (
                <div style={{ marginTop: 8, fontSize: 10 }}>
                  <strong>Details:</strong>
                  <pre style={{ margin: '4px 0 0 0', overflow: 'auto', maxHeight: 60 }}>{this.state.errorInfo.componentStack}</pre>
                </div>
              )}
            </div>
            <button
              onClick={this.handleRetry}
              className="px-6 py-3 rounded-lg font-bold w-full"
              style={{
                background: C.amber,
                color: C.night,
                cursor: 'pointer',
                ...display,
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 rounded-lg font-bold w-full mt-2"
              style={{
                background: C.nightSoft,
                color: C.chalk,
                border: `1px solid ${C.line}`,
                cursor: 'pointer',
                ...display,
              }}
            >
              Refresh App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/* ---------------------------------------------------------------
   GLOBAL ERROR HANDLERS - Catch uncaught exceptions gracefully
---------------------------------------------------------------- */

// Catch synchronous errors in event handlers, callbacks, etc.
if (typeof window !== 'undefined') {
  window.onerror = function(msg, url, lineNo, colNo, error) {
    console.error('[Global Error Handler] Uncaught exception:', {
      message: msg,
      source: url,
      line: lineNo,
      column: colNo,
      error: error?.stack || error
    });
    // Don't prevent default - just log for now
    return false;
  };

  // Catch unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Unhandled Rejection]', event.reason);
    // Don't prevent default - let it fail gracefully
  });
}

/* ---------------------------------------------------------------
   HELPERS
---------------------------------------------------------------- */
const oversStr = (legalBalls) => `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
const rr = (runs, legalBalls) => (legalBalls === 0 ? "0.00" : ((runs / legalBalls) * 6).toFixed(2));
const clone = (o) => JSON.parse(JSON.stringify(o));

// Remove history/redoStack before storing to prevent exponential growth
// When cloning entire state for undo/redo, we only need the match data, not the metadata
const sanitizeForHistory = (state) => {
  const { history, redoStack, ...sanitized } = state;
  return sanitized;
};

const maxWicketsFor = (players) => Math.max(1, players.length - 1);

// 🛡️ Safe event handler wrapper - catches errors in onClick, onChange, etc.
const safe = (handler, context = "event") => {
  if (!handler) return () => {};
  return (...args) => {
    try {
      return handler(...args);
    } catch (err) {
      console.error(`[SafeHandler] Error in ${context}:`, err.message);
      console.error(err.stack);
      // Show toast-like notification (optional)
      // Could dispatch an action here to show error message
      return undefined;
    }
  };
};

// Shuffle array for balancing teams
function shuffleArray(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

/* ---- Player profiles: photo resize + shared directory of profiles+stats ---- */
function resizeImageFile(file, maxSize = 160, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("image load failed"));
      img.onload = () => {
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const DIRECTORY_KEY = "players-directory";

// Use localStorage directly for profiles and session data (non-critical)
async function storageGet(key, isShared = true) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch (e) {
    console.warn(`[Storage] Failed to get ${key}:`, e);
    return null;
  }
}

async function storageSet(key, value, isShared = true) {
  try {
    // Handle both string and object values
    const dataToStore = typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(key, dataToStore);
    return { success: true };
  } catch (e) {
    // Detect quota exceeded errors
    const isQuotaExceeded = 
      e.name === 'QuotaExceededError' || 
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      e.message.includes('QuotaExceededError') ||
      e.message.includes('exceeded the quota');
    
    if (isQuotaExceeded) {
      console.error(`[Storage] ✗ QUOTA EXCEEDED for ${key} (${(value?.toString?.().length || 0)} bytes)`);
      return { success: false, error: 'QUOTA_EXCEEDED' };
    }
    
    console.warn(`[Storage] Failed to set ${key}:`, e.message);
    return { success: false, error: e.message };
  }
}

function emptyProfileStats() {
  return {
    matches: 0,
    wins: 0,
    runs: 0,
    ballsFaced: 0,
    fours: 0,
    sixes: 0,
    highScore: 0,
    wickets: 0,
    runsConceded: 0,
    ballsBowled: 0,
    bestBowling: { wickets: 0, runs: 0 },
  };
}

async function loadDirectory() {
  try {
    const res = await storageGet(DIRECTORY_KEY, true);
    return res && res.value ? JSON.parse(res.value) : {};
  } catch (e) {
    logEvent("error", "Failed to load player directory: " + e.message);
    return {};
  }
}
async function saveDirectory(dir) {
  try {
    await storageSet(DIRECTORY_KEY, JSON.stringify(dir), true);
  } catch (e) {
    logEvent("error", "Failed to save player directory: " + e.message);
  }
}

/**
 * Normalize phone number with country code support
 * Accepts formats: +91-9876543210, +1-2025551234, 9876543210, +919876543210
 * Returns normalized format with country code (e.g., +919876543210)
 */
function normalizePhone(phone) {
  if (!phone) return "";
  
  // Remove all non-digit characters except leading +
  const cleaned = phone.replace(/\D/g, "");
  if (!cleaned) return "";
  
  // If already has country code prefix (starts with +), preserve it
  if (phone.trimStart().startsWith("+")) {
    return "+" + cleaned;
  }
  
  // If no country code, assume it's a complete number with country code
  // For backward compatibility: if exactly 10 digits, prepend +91 (India default)
  // Otherwise, treat as-is (user should provide full international number)
  if (cleaned.length === 10) {
    return "+91" + cleaned; // Default to India
  }
  
  // For other lengths, assume country code is included
  return "+" + cleaned;
}

/* ---- lightweight in-app diagnostics log (session-only, for troubleshooting) ---- */
const logStore = { entries: [], listeners: new Set() };
function logEvent(level, message) {
  const entry = { time: new Date().toLocaleTimeString(), level, message };
  logStore.entries = [entry, ...logStore.entries].slice(0, 200);
  logStore.listeners.forEach((fn) => fn());
}
function useLogs() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((x) => x + 1);
    logStore.listeners.add(fn);
    return () => logStore.listeners.delete(fn);
  }, []);
  return logStore.entries;
}

/* ---- co-scoring: a second scorer submits actions into a shared queue that
   the primary scorer's device picks up and applies, keeping one source of truth ---- */
async function pushQueueAction(code, action) {
  try {
    const key = `queue:${code}`;
    let arr = [];
    try {
      const res = await storageGet(key, true);
      arr = res && res.value ? JSON.parse(res.value) : [];
    } catch (e) {
      arr = [];
    }
    arr.push({ ...action, _id: Math.random().toString(36).slice(2), _ts: Date.now() });
    await storageSet(key, JSON.stringify(arr), true);
    logEvent("info", `Sent co-scorer action: ${action.type}`);
  } catch (e) {
    logEvent("error", "Failed to send co-scorer action: " + e.message);
  }
}

/* ---- match history: last 10 completed matches, named by the date played ---- */
const HISTORY_KEY = "match-history";
const ADMIN_KEY = "admin-settings";

function formatMatchTitle(date, sameDayCount) {
  const weekday = date.toLocaleDateString(undefined, { weekday: "long" });
  const day = date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  return sameDayCount > 0 ? `${weekday} Match  ${day} (#${sameDayCount + 1})` : `${weekday} Match  ${day}`;
}

function buildMatchSummary(state, awards, resultText) {
  const now = new Date();
  const trim = (inn) => {
    if (!inn) {
      return {
        battingTeam: "A",
        runs: 0,
        wickets: 0,
        legalBalls: 0,
        batsmen: {},
        bowlers: {},
        battedOrder: [],
      };
    }
    return {
      battingTeam: inn.battingTeam,
      runs: inn.runs || 0,
      wickets: inn.wickets || 0,
      legalBalls: inn.legalBalls || 0,
      batsmen: inn.batsmen || {},
      bowlers: inn.bowlers || {},
      battedOrder: inn.battedOrder || [],
    };
  };
  return {
    id: `${now.getTime()}`,
    dateISO: now.toISOString(),
    teamAName: state.teamA.name,
    teamBName: state.teamB.name,
    oversLimit: state.oversLimit,
    venue: state.venue,
    resultText,
    awards,
    innings: [trim(state.innings[0]), trim(state.innings[1])],
  };
}

async function pushMatchHistory(state, awards, resultText) {
  try {
    logEvent("info", `[History] Starting to save match: ${state.teamA.name} vs ${state.teamB.name}`);
    // Try to load from both shared and local storage
    let res = await storageGet(HISTORY_KEY, true).catch(() => null);
    if (!res || !res.value) {
      res = await storageGet(HISTORY_KEY, false).catch(() => null);
    }
    logEvent("info", `[History] Retrieved existing history`);
    if (!res || typeof res !== "object") {
      logEvent("error", "Invalid storage response for history retrieval");
      return;
    }
    const list = res.value ? JSON.parse(res.value) : [];
    logEvent("info", `[History] Current history has ${list.length} entries`);
    const now = new Date();
    const sameDay = list.filter((m) => new Date(m.dateISO).toDateString() === now.toDateString()).length;
    const summary = buildMatchSummary(state, awards, resultText);
    summary.title = formatMatchTitle(now, sameDay);
    logEvent("info", `[History] Created summary: ${summary.title}`);
    const updated = [summary, ...list].slice(0, 10);
    logEvent("info", `[History] Saving ${updated.length} total entries`);
    // Save to BOTH shared and local storage for persistence
    const setResult = await storageSet(HISTORY_KEY, JSON.stringify(updated), true);
    await storageSet(HISTORY_KEY, JSON.stringify(updated), false);
    if (setResult && typeof setResult === "object") {
      logEvent("info", `[History]  Saved match to history: ${summary.title}`);
    } else {
      logEvent("error", "Failed to save match history: Invalid response type");
    }
  } catch (e) {
    logEvent("error", "Failed to save match history: " + e.message);
  }
}

/* After a match completes, roll each linked player's performance into their
   persistent profile stats in the shared directory. */
async function syncStatsToDirectory(state) {
  try {
    logEvent("info", "[Stats] Starting stats sync for match");
    const inn1 = state.innings[0];
    const inn2 = state.innings[1];
    if (!inn1 || !inn2) {
      logEvent("error", "[Stats] Missing innings data");
      return;
    }
    const winnerKey =
      inn2.runs > inn1.runs ? inn2.battingTeam : inn2.runs < inn1.runs ? inn1.battingTeam : null;

    const dir = await loadDirectory();
    logEvent("info", `[Stats] Loaded directory with ${Object.keys(dir).length} profiles`);
    const teams = [
      { ...state.teamA, __key: "A" },
      { ...state.teamB, __key: "B" },
    ];

    let statsUpdated = 0;
    for (const team of teams) {
      const profiles = team.profiles || {};
      logEvent("info", `[Stats] Processing team ${team.name} with ${Object.keys(profiles).length} linked players`);
      for (const [playerName, link] of Object.entries(profiles)) {
        const phone = normalizePhone(link.phone);
        if (!phone) {
          logEvent("warn", `[Stats] No valid phone for player ${playerName}`);
          continue;
        }
        if (!dir[phone]) {
          logEvent("info", `[Stats] Creating new profile for ${playerName} (${phone})`);
          dir[phone] = { phone, name: link.name || playerName, stats: emptyProfileStats() };
        }
        const entry = dir[phone];
        entry.name = link.name || entry.name;
        const st = entry.stats;

        let batted = false;
        let bowled = false;
        for (const inn of [inn1, inn2]) {
          const b = inn.batsmen[playerName];
          if (b) {
            batted = true;
            st.runs += b.runs;
            st.ballsFaced += b.balls;
            st.fours += b.fours;
            st.sixes += b.sixes;
            st.highScore = Math.max(st.highScore, b.runs);
            logEvent("info", `[Stats] ${playerName} batting: ${b.runs} runs (${b.balls} balls)`);
          }
          const bw = inn.bowlers[playerName];
          if (bw) {
            bowled = true;
            st.wickets += bw.wickets;
            st.runsConceded += bw.runs;
            st.ballsBowled += bw.legalBalls;
            if (
              bw.wickets > st.bestBowling.wickets ||
              (bw.wickets === st.bestBowling.wickets && (st.bestBowling.runs === 0 || bw.runs < st.bestBowling.runs))
            ) {
              if (bw.wickets > 0 || st.bestBowling.wickets === 0) {
                st.bestBowling = { wickets: bw.wickets, runs: bw.runs };
              }
            }
            logEvent("info", `[Stats] ${playerName} bowling: ${bw.wickets}/${bw.runs}`);
          }
        }
        if (batted || bowled) {
          st.matches += 1;
          if (winnerKey && winnerKey === team.__key) st.wins += 1;
          statsUpdated++;
          logEvent("info", `[Stats] Updated ${playerName}: ${st.matches} matches, ${st.wins} wins, ${st.runs} runs`);
        }
      }
    }
    await saveDirectory(dir);
    logEvent("info", `[Stats]  Successfully synced stats for ${statsUpdated} players`);
  } catch (e) {
    logEvent("error", "[Stats] Sync failed: " + e.message);
  }
}

/* Simple Player-of-the-Match heuristic: runs + wickets weighted */
function computeAwards(state) {
  const inn1 = state.innings[0];
  const inn2 = state.innings[1];
  if (!inn1 || !inn2) return null;
  const points = {}; // name -> { pts, lines, team }
  
  // Add batsmen stats only (don't add bowlers here to avoid duplication)
  const considerBatsmen = (inn, teamName) => {
    for (const [name, b] of Object.entries(inn.batsmen)) {
      points[name] = points[name] || { pts: 0, lines: [], team: teamName };
      points[name].pts += b.runs + (b.fours + b.sixes) * 0.5;
      points[name].lines.push(`${b.runs} (${b.balls})`);
    }
  };
  
  // Add bowlers stats only
  const considerBowlers = (bowlers, teamName) => {
    for (const [name, bw] of Object.entries(bowlers)) {
      points[name] = points[name] || { pts: 0, lines: [], team: teamName };
      points[name].pts += bw.wickets * 22 - bw.runs * 0.2;
      points[name].lines.push(`${bw.wickets}/${bw.runs}`);
    }
  };
  
  // Add batsmen from both innings with their batting team names
  considerBatsmen(inn1, teamOf(state, inn1.battingTeam).name);
  considerBatsmen(inn2, teamOf(state, inn2.battingTeam).name);
  
  // Add bowlers from both innings with their bowling team names (only once per bowler)
  considerBowlers(inn1.bowlers, teamOf(state, inn1.bowlingTeam).name);
  considerBowlers(inn2.bowlers, teamOf(state, inn2.bowlingTeam).name);

  let best = null;
  for (const [name, p] of Object.entries(points)) {
    if (!best || p.pts > best.pts) best = { name, ...p };
  }
  if (!best) return null;
  return { name: best.name, team: best.team, line: best.lines.join(" & ") };
}

function extrasSummary(inn) {
  const s = { wides: 0, noballs: 0, byes: 0, legbyes: 0 };
  // Safety check: timeline must be an array
  if (!inn || !Array.isArray(inn.timeline)) {
    return s;
  }
  for (const b of inn.timeline) {
    if (b.kind === "wide") s.wides += 1;
    else if (b.kind === "noball") s.noballs += 1;
    else if (b.kind === "bye") s.byes += 1;
    else if (b.kind === "legbye") s.legbyes += 1;
  }
  return s;
}

function newBatsman() {
  return { runs: 0, balls: 0, fours: 0, sixes: 0, out: false, howOut: null, retiredHurt: false };
}
function newBowler() {
  return { legalBalls: 0, runs: 0, wickets: 0 };
}

function makeInnings(battingTeam, bowlingTeam, target) {
  return {
    battingTeam,
    bowlingTeam,
    runs: 0,
    wickets: 0,
    legalBalls: 0,
    target: target || null,
    batsmen: {},
    bowlers: {},
    battedOrder: [],
    striker: null,
    nonStriker: null,
    bowler: null,
    lastOverBowler: null,
    timeline: [],
    complete: false,
    completionReason: null,
  };
}

function ensureBatsman(inn, name) {
  if (!inn.batsmen[name]) {
    inn.batsmen[name] = newBatsman();
    inn.battedOrder.push(name);
  }
}
function ensureBowler(inn, name) {
  if (!inn.bowlers[name]) inn.bowlers[name] = newBowler();
}

function currentOverNumber(legalBalls) {
  // 1-indexed overs: Over 1 is balls 1-6, Over 2 is balls 7-12, etc.
  return legalBalls === 0 ? 0 : Math.ceil(legalBalls / 6);
}

/* Apply one ball to an innings (pure). Returns { innings, needBatsman, needBowler } */
function applyBall(innIn, payload, maxWickets, oversLimit, isChasing, isFreeHit = false) {
  const inn = clone(innIn);
  ensureBatsman(inn, inn.striker);
  ensureBatsman(inn, inn.nonStriker);
  ensureBowler(inn, inn.bowler);

  let legal = true;
  let batRuns = 0;
  let teamRuns = 0;
  let bowlerRuns = 0;
  let strikerFaced = true;
  let isWicket = false;
  let label = "";
  let kindTag = payload.kind;
  let setFreeHit = false; // Flag to set free-hit for next ball

  // 🏏 FREE HIT RULES:
  // - If current ball is a free hit and it's a no-ball → free hit continues
  // - If current ball is a free hit and it's legal → runs count, free hit ends
  // - On free hit, can't be out (except run out)

  if (payload.kind === "run") {
    batRuns = payload.runs;
    teamRuns = payload.runs;
    bowlerRuns = payload.runs;
    label = String(payload.runs);
  } else if (payload.kind === "wide") {
    legal = false;
    strikerFaced = false;
    teamRuns = 1 + (payload.extraRuns || 0);
    bowlerRuns = teamRuns;
    label = teamRuns > 1 ? `Wd+${teamRuns - 1}` : "Wd";
    // Note: Wide does NOT give a free hit (only no-ball does)
  } else if (payload.kind === "noball") {
    legal = false;
    batRuns = payload.batRuns || 0;
    teamRuns = 1 + batRuns;
    bowlerRuns = teamRuns;
    label = batRuns > 0 ? `Nb+${batRuns}` : "Nb";
    // After no-ball, next ball is a FREE-HIT
    // If we're already on a free hit and it's another no-ball, keep free hit
    setFreeHit = true;
  } else if (payload.kind === "bye" || payload.kind === "legbye") {
    strikerFaced = true;  // 🔧 FIX: Batsman faced the delivery
    teamRuns = payload.runs;
    bowlerRuns = 0;
    label = `${payload.kind === "bye" ? "B" : "Lb"}${payload.runs}`;
  } else if (payload.kind === "wicket") {
    isWicket = true;
    batRuns = payload.batRuns || 0;
    teamRuns = batRuns;
    bowlerRuns = payload.how === "runout" ? 0 : 0;
    label = "W";
    
    // 🏏 FREE HIT RULE: Can't be out on free hit (except run out)
    if (isFreeHit && payload.how !== "runout") {
      console.log('[BALL] Free hit in effect - wicket not out (only run out allowed)');
      isWicket = false; // Ignore wicket, treat as legal delivery
      // Treat as normal legal delivery - no runs scored, batsman not out
      batRuns = 0;
      teamRuns = 0;
      bowlerRuns = 0;
      label = "Free-hit dot";
    }
  }

  const striker = inn.striker;
  const bowlerName = inn.bowler;

  if (strikerFaced) inn.batsmen[striker].balls += 1;
  if (payload.kind === "run" || payload.kind === "noball") {
    inn.batsmen[striker].runs += batRuns;
    if (batRuns === 4) inn.batsmen[striker].fours += 1;
    if (batRuns === 6) inn.batsmen[striker].sixes += 1;
  }

  inn.runs += teamRuns;
  if (legal) inn.legalBalls += 1;
  if (legal) inn.bowlers[bowlerName].legalBalls += 1;
  inn.bowlers[bowlerName].runs += bowlerRuns;

  if (isWicket) {
    console.log('[WICKET] Wicket recorded! Before: wickets=' + inn.wickets + ', kind=' + payload.kind + ', how=' + payload.how + ', isFreeHit=' + isFreeHit);
    console.log('[WICKET] Wicket details - strikerFaced=' + strikerFaced + ', batRuns=' + batRuns + ', teamRuns=' + teamRuns);
    
    // Determine which batsman is out (for runout, could be striker or non-striker)
    let outBatsman = inn.striker;
    if (payload.runoutBatsman === "nonStriker") {
      outBatsman = inn.nonStriker;
      console.log('[WICKET] Non-striker out: ' + outBatsman);
    } else {
      console.log('[WICKET] Striker out: ' + outBatsman);
    }
    
    // 🏏 RETIRED HURT RULE: Does NOT count as a wicket dismissal
    // Player can return later after another dismissal or another retirement hurt
    if (payload.how === "retiredHurt") {
      console.log('[WICKET] Retired hurt recorded for ' + outBatsman + ' - NOT counted as wicket');
      inn.batsmen[outBatsman].retiredHurt = true;
      inn.batsmen[outBatsman].out = false;  // NOT marked as out, allows potential return
      inn.batsmen[outBatsman].howOut = "retired hurt";
    } else {
      // Only increment wickets for actual dismissals (not retired hurt)
      inn.wickets += 1;
      console.log('[WICKET] After increment: wickets=' + inn.wickets + ', completed=' + (inn.wickets >= maxWickets));
      
      inn.batsmen[outBatsman].out = true;
      console.log('[WICKET] Batsman ' + outBatsman + ' marked out');
      
      if (payload.how !== "runout") {
        console.log('[WICKET] Bowler ' + bowlerName + ' gets credit for wicket. Before: ' + (inn.bowlers[bowlerName]?.wickets || 0));
        inn.bowlers[bowlerName].wickets += 1;
        console.log('[WICKET] Bowler ' + bowlerName + ' after increment: ' + inn.bowlers[bowlerName].wickets);
      } else {
        console.log('[WICKET] Runout - no bowler credit');
      }
      
      const howLabel =
        payload.how === "bowled" ? `b ${bowlerName}` :
        payload.how === "caught" ? `c ${payload.fielder || "?"} b ${bowlerName}` :
        payload.how === "lbw" ? `lbw b ${bowlerName}` :
        payload.how === "stumped" ? `st ${payload.fielder || "?"} b ${bowlerName}` :
        payload.how === "runout" ? `run out (${payload.fielder || "?"})` : "out";
      inn.batsmen[outBatsman].howOut = howLabel;
      console.log('[WICKET] How out: ' + howLabel);
    }
    
    //  FIX #1: Clear the out batsman from current position BEFORE end-of-over swap
    // This prevents the "phantom batsman" bug where an out player stays in playing position
    if (outBatsman === inn.striker) {
      inn.striker = null;  // Striker is out/retired, will need replacement
      console.log('[WICKET] Striker position cleared, awaiting new batsman');
    } else if (outBatsman === inn.nonStriker) {
      inn.nonStriker = null;  // Non-striker is out/retired, will need replacement
      console.log('[WICKET] Non-striker position cleared, awaiting new batsman');
    }
  }

  const overBeforeBall = currentOverNumber(inn.legalBalls);
  inn.timeline.push({
    over: overBeforeBall,
    label,
    kind: isWicket ? "wicket" : payload.kind,
    legal,
    isFreeHit: isFreeHit && !legal, // Mark if this was a free hit no-ball
  });

  // ⭐ ADD THE BALL TO THE BALLS ARRAY (THIS WAS MISSING!)
  if (!inn.balls) inn.balls = []; // Ensure balls array exists
  inn.balls.push({
    striker: inn.striker,
    bowler: bowlerName,
    batRuns: batRuns,
    runs: teamRuns,
    kind: payload.kind,
    how: payload.how,
    fielder: payload.fielder,
    isFreeHit: isFreeHit && !legal, // Record if this was a free hit
    over: Math.floor((inn.legalBalls - 1) / 6), // Track which over this ball belongs to (use -1 because legalBalls was already incremented)
    legalBalls: inn.legalBalls, // Also track legal ball count for filtering
  });

  // strike change on odd runs
  const oddRuns =
    (payload.kind === "run" && batRuns % 2 === 1) ||
    (payload.kind === "noball" && batRuns % 2 === 1) ||
    (payload.kind === "wide" && (payload.extraRuns || 0) % 2 === 1) ||  // 🔧 FIX: Add wide to odd runs check
    ((payload.kind === "bye" || payload.kind === "legbye") && teamRuns % 2 === 1);
  if (oddRuns && !isWicket) {
    const tmp = inn.striker;
    inn.striker = inn.nonStriker;
    inn.nonStriker = tmp;
  }

  let overComplete = false;
  if (legal && inn.legalBalls % 6 === 0) {
    overComplete = true;
    console.log('[OVER] Over ' + Math.ceil(inn.legalBalls / 6) + ' complete! Legal balls: ' + inn.legalBalls);
    inn.lastOverBowler = inn.bowler;
    //  FIX #1: Only swap if both batsmen positions are filled (not null after wicket)
    if (inn.striker !== null && inn.nonStriker !== null) {
      const tmp = inn.striker;
      inn.striker = inn.nonStriker;
      inn.nonStriker = tmp;
    }
    //  FIXED: Trigger auto-select bowler immediately after over complete
    console.log('[BALL] Over complete, auto-selecting next bowler');
  }

  // completion checks
  let complete = false;
  let reason = null;
  if (inn.wickets >= maxWickets) {
    complete = true;
    reason = "All out";
  } else if (inn.legalBalls >= oversLimit * 6) {
    complete = true;
    reason = "Overs completed";
  } else if (isChasing && inn.target !== null && inn.runs >= inn.target) {
    complete = true;
    reason = "Target reached";
  }
  inn.complete = complete;
  inn.completionReason = reason;

  // 🏏 Free hit logic:
  // - If no-ball or wide was just bowled → setFreeHit = true
  // - If we were on a free hit and it's a legal delivery → free hit ends (setFreeHit = false)
  // - If we were on a free hit and it's another no-ball → free hit continues (setFreeHit = true)
  
  // 🔧 FIX: Reset free hit if current ball is legal and was on free hit
  const resetFreeHit = legal && isFreeHit && !setFreeHit;

  // 🏏 BOWLER CHANGE RULE:
  // - After every complete legal over (6 legal balls), bowler MUST change
  // - This is enforced even if there's a wicket on the last ball of the over
  // - needBowler=true triggers selectBowler phase, ensuring no bowler bowls consecutive overs
  return {
    innings: inn,
    needBatsman: isWicket && !complete,
    needBowler: overComplete && !complete, // Ensure bowler change after every complete over
    nextBallIsFreeHit: resetFreeHit ? false : setFreeHit, // 🔧 FIX: Explicit reset of free hit after legal delivery
  };
}

// Initialize player stats from localStorage or create fresh
async function initializePlayerStats(globalPlayers) {
  // Load from Firebase Firestore (accessible to all devices)
  const stats = await loadPlayerStats(globalPlayers);
  return stats;
}

const initialState = {
  phase: "setup", // setup -> toss -> openers1 -> live -> break -> openers2 -> live -> result
  matchID: null, //  NEW: Unique ID for this match (generated when match starts)
  teamA: { name: "Team A", players: [], profiles: {}, captain: "", wicketKeeper: "", teamId: null, mode: "manual" }, // mode: "manual" (add players) or "team" (select from existing team)
  teamB: { name: "Team B", players: [], profiles: {}, captain: "", wicketKeeper: "", teamId: null, mode: "manual" },
  currentScorer: null, // Name of the current scorer (from batting team)
  scorerAuthToken: null, // Simple lock to prevent multiple scorers
  globalPlayers: [],
  clanPlayers: [], // Players from selected clan (if match started from a clan)
  playerStats: {}, // Will be populated by Firebase on component mount
  playerRequests: [], // Pending player requests
  oversLimit: 10,
  powerplayOvers: 6, // Number of overs for powerplay (usually 6 for T20)
  maxOversPerBowler: 4, // Max overs a bowler can bowl (usually 4 for T20)
  venue: "",
  tossWinner: "A",
  tossDecision: "bat",
  battingFirst: "A",
  starterPhone: "",
  innings: [],
  current: 0,
  history: [], // For UNDO - stores previous inning states
  redoStack: [], // For REDO - stores undone states
  testMode: false,
  nextBallIsFreeHit: false, // Flag set after no-ball (next ball is a free-hit)
  matchStartedAt: null, // Timestamp when match started (for sorting multiple ongoing matches)
  commentary: [], //  NEW: Ball-by-ball commentary (last 30 balls)
};

/* ================================================================
   RESILIENCE LAYER: Validation, Error Handling, State Recovery
   Ensures scoring is bulletproof with zero runtime exceptions
================================================================ */

// Validate state integrity and recover from corrupted state
function validateState(state) {
  // Ensure critical properties exist
  if (!state) return false;
  if (!Array.isArray(state.innings)) state.innings = [];
  if (typeof state.current !== 'number') state.current = 0;
  if (state.current < 0 || state.current >= state.innings.length) state.current = 0;
  if (!state.history) state.history = [];
  if (!state.redoStack) state.redoStack = [];
  if (!state.commentary) state.commentary = [];
  if (typeof state.phase !== 'string') state.phase = 'setup';
  return true;
}

// Safely get current inning with fallback
function getCurrentInning(state) {
  if (!state?.innings?.[state.current]) {
    console.warn('[Resilience] Current inning missing, returning null');
    return null;
  }
  return state.innings[state.current];
}

// Safe dispatch wrapper that catches errors and logs them
function makeSafeDispatch(dispatch) {
  return (action) => {
    try {
      if (!action || !action.type) {
        console.error('[SafeDispatch] Invalid action:', action);
        return;
      }
      dispatch(action);
    } catch (err) {
      console.error('[SafeDispatch] Dispatch failed for action:', action.type, 'Error:', err.message);
      console.error(err.stack);
      // Don't re-throw - allow scoring to continue
    }
  };
}

function teamOf(state, key) {
  return key === "A" ? state.teamA : key === "B" ? state.teamB : null;
}

function reducer(state, action) {
  // 🛡️ SAFETY: Validate state before processing any action
  validateState(state);
  
  // 🛡️ SAFETY: Guard against null/undefined actions
  if (!action || !action.type) {
    console.warn('[Reducer] Invalid action received:', action);
    return state;
  }
  
  try {
    switch (action.type) {
    case "LOAD_STATE": {
      // Load a complete match state (used for resuming)
      if (action.state) {
        console.log('[Reducer] Loading saved state from resume');
        return action.state;
      }
      return state;
    }
    case "SET_TEAM_NAME":
      return { ...state, [action.team === "A" ? "teamA" : "teamB"]: { ...teamOf(state, action.team), name: action.name } };
    case "SET_CAPTAIN":
      return { ...state, [action.team === "A" ? "teamA" : "teamB"]: { ...teamOf(state, action.team), captain: action.name } };
    case "SET_WICKET_KEEPER":
      return { ...state, [action.team === "A" ? "teamA" : "teamB"]: { ...teamOf(state, action.team), wicketKeeper: action.name } };
    case "SET_TEAM_MODE": {
      // Set team selection mode (manual or team)
      const mode = action.mode || "manual";
      const team = teamOf(state, action.team);
      return {
        ...state,
        [action.team === "A" ? "teamA" : "teamB"]: {
          ...team,
          mode,
          // Reset players if switching to team mode
          ...(mode === "team" ? { players: [], captain: "", wicketKeeper: "", teamId: null } : {}),
        },
      };
    }
    case "SELECT_TEAM_BY_ID": {
      // Select a team by ID and populate players from that team
      const team = teamOf(state, action.team);
      const players = action.teamData?.members || [];
      const teamId = action.teamId;
      const teamName = action.teamData?.name || `Team ${action.team}`;
      
      return {
        ...state,
        [action.team === "A" ? "teamA" : "teamB"]: {
          ...team,
          teamId,
          name: teamName,
          players,
          mode: "team",
          captain: action.teamData?.captain || (players.length > 0 ? players[0] : ""),
          wicketKeeper: action.teamData?.captain || (players.length > 0 ? players[0] : ""),
        },
      };
    }
    case "SET_SCORER": {
      // 🛡️ SAFETY: Validate current inning exists
      const inn = getCurrentInning(state);
      if (!inn) {
        console.warn('[SET_SCORER] No current inning, cannot set scorer');
        return state;
      }
      // Captain of batting team assigns the scorer
      const battingTeamKey = inn.battingTeam;
      const battingTeam = teamOf(state, battingTeamKey);
      if (!battingTeam) {
        console.warn('[SET_SCORER] Invalid batting team:', battingTeamKey);
        return state;
      }
      const isAuthorized = action.captain === battingTeam.captain;
      if (!isAuthorized) {
        console.warn("Only batting team captain can assign scorer");
        return state;
      }
      // Allow scorer to adjust powerplay and max overs per bowler before starting
      return { 
        ...state, 
        currentScorer: action.scorer, 
        phase: "live",
        powerplayOvers: action.powerplayOvers || state.powerplayOvers,
        maxOversPerBowler: action.maxOversPerBowler || state.maxOversPerBowler,
      };
    }
    case "CHANGE_WICKET_KEEPER": {
      // Scorer can change wicket keeper at any time during game
      if (state.currentScorer !== action.scorerName) {
        console.warn("Only current scorer can change wicket keeper");
        return state;
      }
      // Update the BOWLING team's wicket keeper (the team that's fielding)
      const bowlingTeamKey = state.innings[state.current].bowlingTeam;
      return {
        ...state,
        [bowlingTeamKey === "A" ? "teamA" : "teamB"]: {
          ...teamOf(state, bowlingTeamKey),
          wicketKeeper: action.newWicketKeeper,
        },
      };
    }
    case "ADD_PLAYER": {
      const t = teamOf(state, action.team);
      const name = (action.name || "").trim();
      if (!name || t.players.includes(name)) return state;
      const profiles = { ...(t.profiles || {}) };
      if (action.phone) {
        profiles[name] = { phone: action.phone, name };
      }
      return {
        ...state,
        [action.team === "A" ? "teamA" : "teamB"]: { ...t, players: [...t.players, name], profiles },
      };
    }
    case "REMOVE_PLAYER": {
      const t = teamOf(state, action.team);
      const removedName = t.players[action.index];
      const players = t.players.filter((_, i) => i !== action.index);
      const profiles = { ...(t.profiles || {}) };
      delete profiles[removedName];
      return { ...state, [action.team === "A" ? "teamA" : "teamB"]: { ...t, players, profiles } };
    }
    case "SET_OVERS":
      return { ...state, oversLimit: action.value };
    case "SET_POWERPLAY":
      return { ...state, powerplayOvers: action.value };
    case "SET_MAX_OVERS_PER_BOWLER":
      return { ...state, maxOversPerBowler: action.value };
    case "SET_VENUE":
      return { ...state, venue: action.value };
    case "GENERATE_MATCH_ID": {
      //  NEW: Generate unique matchID (can be called manually if needed)
      if (!state.matchID) {
        return { ...state, matchID: genCode() + "-" + Date.now().toString(36).toUpperCase() };
      }
      return state;
    }
    case "SET_CLAN_PLAYERS": {
      // Store clan players for auto-balance from selected clan
      return { ...state, clanPlayers: action.players || [] };
    }
    case "ADD_GLOBAL_PLAYER": {
      const playerName = (action.name || "").trim();
      if (!playerName || state.globalPlayers.includes(playerName)) return state;
      return { ...state, globalPlayers: [...state.globalPlayers, playerName].sort() };
    }
    case "REQUEST_PLAYER": {
      const playerName = (action.name || "").trim();
      if (!playerName || state.playerRequests.includes(playerName)) return state;
      return { ...state, playerRequests: [...state.playerRequests, playerName] };
    }
    case "APPROVE_PLAYER_REQUEST": {
      const playerName = action.name;
      const updated = { ...state };
      updated.globalPlayers = [...state.globalPlayers, playerName].sort();
      updated.playerRequests = state.playerRequests.filter(p => p !== playerName);
      return updated;
    }
    case "REJECT_PLAYER_REQUEST": {
      return { ...state, playerRequests: state.playerRequests.filter(p => p !== action.name) };
    }
    case "SET_STARTER_PHONE":
      return { ...state, starterPhone: action.value };
    case "SET_TEST_MODE":
      return { ...state, testMode: action.value };
    case "SET_TOSS":
      return { ...state, tossWinner: action.winner, tossDecision: action.decision };
    case "PROCEED_TO_TOSS":
      return { ...state, phase: "toss" };
    case "PROCEED_TO_OPENERS": {
      const battingFirst =
        (state.tossWinner === "A" && state.tossDecision === "bat") ||
        (state.tossWinner === "B" && state.tossDecision === "bowl")
          ? "A"
          : "B";
      const bowlingFirst = battingFirst === "A" ? "B" : "A";
      const inn1 = makeInnings(battingFirst, bowlingFirst, null);
      const newMatchID = !state.matchID ? genCode() + "-" + Date.now().toString(36).toUpperCase() : state.matchID;
      return { ...state, matchID: newMatchID, battingFirst, innings: [inn1], current: 0, phase: "openers1", matchStartedAt: new Date().toISOString() };
    }
    case "START_MATCH": {
      console.log('[MATCH] START_MATCH triggered');
      const battingFirst =
        (state.tossWinner === "A" && state.tossDecision === "bat") ||
        (state.tossWinner === "B" && state.tossDecision === "bowl")
          ? "A"
          : "B";
      const bowlingFirst = battingFirst === "A" ? "B" : "A";
      const inn1 = makeInnings(battingFirst, bowlingFirst, null);
      console.log('[MATCH] Created inn1 with battingTeam:', battingFirst, 'bowlingTeam:', bowlingFirst);
      //  NEW: Generate unique matchID when match starts
      const newMatchID = !state.matchID ? genCode() + "-" + Date.now().toString(36).toUpperCase() : state.matchID;
      return { ...state, matchID: newMatchID, battingFirst, innings: [inn1], current: 0, phase: "openers1", matchStartedAt: new Date().toISOString() };
    }
    case "SET_OPENERS": {
      const innings = clone(state.innings);
      const inn = innings[state.current];
      inn.striker = action.striker;
      inn.nonStriker = action.nonStriker;
      inn.bowler = action.bowler;
      ensureBatsman(inn, inn.striker);
      ensureBatsman(inn, inn.nonStriker);
      ensureBowler(inn, inn.bowler);
      //  FIXED: Skip scorer selection and go directly to live phase
      // ⭐ FIX: Add to history so SET_OPENERS is undo/redo-able
      const history = [...state.history, clone(sanitizeForHistory(state))].slice(-40);
      return { ...state, innings, phase: "live", history, redoStack: [] };
    }
    case "BALL": {
      // 🛡️ SAFETY: Validate current inning exists and has required fields
      const inn = getCurrentInning(state);
      if (!inn) {
        console.error('[BALL] No current inning to score on!');
        return state; // Silently fail
      }
      
      // 🛡️ SAFETY: Validate payload
      if (!action.payload || !action.payload.kind) {
        console.error('[BALL] Invalid payload:', action.payload);
        return state;
      }
      
      console.log('[BALL] Ball recorded. Current inning:', state.current, 'Total balls so far:', inn?.balls?.length || 0);
      const prevWickets = inn?.wickets || 0;
      
      // Handle auto-select bowler phase
      if (state.phase === "autoSelectBowler") {
        console.log('[BALL] Dispatching AUTO_SELECT_BOWLER action');
        return state; // Will be handled by AUTO_SELECT_BOWLER action
      }
      
      const battingTeamKey = inn.battingTeam;
      const battingTeam = teamOf(state, battingTeamKey);
      if (!battingTeam) {
        console.error('[BALL] Invalid batting team:', battingTeamKey);
        return state;
      }
      const battingPlayers = battingTeam.players;
      const maxW = maxWicketsFor(battingPlayers);
      const isChasing = state.current === 1;
      const { innings: newInn, needBatsman, needBowler, nextBallIsFreeHit } = applyBall(
        state.innings[state.current],
        action.payload,
        maxW,
        state.oversLimit,
        isChasing,
        state.nextBallIsFreeHit  // Pass free hit flag from previous no-ball
      );
      
      const wicketChange = newInn.wickets - prevWickets;
      if (wicketChange !== 0) {
        console.log('[BALL] WICKET CHANGE:', prevWickets, '→', newInn.wickets, '(+' + wicketChange + ')', 'Kind:', action.payload.kind, 'How:', action.payload.how);
      }
      
      const innings = clone(state.innings);
      innings[state.current] = newInn;
      console.log('[BALL] After applyBall - inning', state.current, 'now has', newInn.balls?.length || 0, 'balls');
      // ⭐ FIX: Store ENTIRE state in history for proper undo/redo, not just innings
      const history = [...state.history, clone(sanitizeForHistory(state))].slice(-40);
      
      //  NEW: Generate and add commentary (keep last 30 balls)
      // Calculate ball number within the over (1-6), not total legal ball count
      const ballNumberInOver = newInn.legalBalls === 0 ? 0 : (newInn.legalBalls - 1) % 6 + 1;
      const commentary = generateCommentary(action.payload, state.innings[state.current].striker, state.innings[state.current].bowler, ballNumberInOver);
      const updatedCommentary = [...state.commentary, { ballNumber: ballNumberInOver, commentary, over: currentOverNumber(newInn.legalBalls) }].slice(-30);

      let phase = "live";
      // 🏏 Free hit logic:
      // nextBallIsFreeHit is set by applyBall:
      // - true if the current ball was a no-ball/wide (next is free hit)
      // - true if we were on free hit and it was another no-ball (free hit continues)
      // - false if we were on free hit and it was legal (free hit ends)
      let newNextBallIsFreeHit = nextBallIsFreeHit;

      if (newInn.complete) {
        console.log('[BALL] Inning', state.current, 'complete! Balls recorded:', newInn.balls?.length || 0);
        if (state.current === 0) {
          phase = "break";
          //  NEW: Reset scorer between innings
          return { ...state, innings, history, phase, nextBallIsFreeHit: newNextBallIsFreeHit, redoStack: [], currentScorer: null, commentary: updatedCommentary };
        } else if (state.current === 2) {
          // 🏏 Super over inning 1 complete (Team A batted). Now Team B needs to bat their super over.
          console.log('[BALL] Super over inning 1 complete. Creating inning 2 for super over.');
          const inn1 = state.innings[0];
          const inn2 = state.innings[1];
          const superOverInn1 = state.innings[2];
          
          // Team A batted in super over, so Team B needs to chase the super over score
          const superOverInn2 = {
            battingTeam: inn2.battingTeam, // Second team bats in super over inning 2
            bowlingTeam: inn1.battingTeam, // First team bowls
            runs: 0,
            wickets: 0,
            legalBalls: 0,
            bowler: null,
            striker: null,
            nonStriker: null,
            timeline: [],
            balls: [],
            batsmen: {},
            bowlers: {},
            battedOrder: [],
            target: superOverInn1.runs + 1, // Need to beat super over 1 score
            lastOverBowler: null,
          };
          
          // Append second super over inning and switch to it
          innings.push(superOverInn2);
          
          // Switch to super over inning 2 and select batsmen
          return { ...state, innings, history, phase: "openers2", nextBallIsFreeHit: newNextBallIsFreeHit, redoStack: [], current: 3, currentScorer: null, commentary: updatedCommentary };
        } else {
          phase = "result";
        }
      } else if (needBatsman) {
        phase = "selectBatsman";
      } else if (needBowler) {
        phase = "selectBowler";
      }
      return { ...state, innings, history, phase, nextBallIsFreeHit: newNextBallIsFreeHit, redoStack: [], commentary: updatedCommentary };
    }
    case "NEXT_BATSMAN": {
      const innings = clone(state.innings);
      const inn = innings[state.current];
      
      //  FIX #2: Smart batsman placement - replace the empty position
      // After a wicket, either striker or non-striker might be null
      if (inn.striker === null) {
        inn.striker = action.name;
        console.log('[NEXT_BATSMAN] New batsman ' + action.name + ' placed as STRIKER');
      } else if (inn.nonStriker === null) {
        inn.nonStriker = action.name;
        console.log('[NEXT_BATSMAN] New batsman ' + action.name + ' placed as NON-STRIKER');
      } else {
        // Safety fallback: if somehow both occupied, replace striker
        console.log('[NEXT_BATSMAN] FALLBACK: Both positions occupied! Replacing STRIKER with ' + action.name);
        inn.striker = action.name;
      }
      
      console.log('[NEXT_BATSMAN] Current state - Striker=' + inn.striker + ', Non-Striker=' + inn.nonStriker);
      ensureBatsman(inn, inn.striker);
      ensureBatsman(inn, inn.nonStriker);
      
      // 🏏 RETIRED HURT RETURN: If player was retired hurt and is now returning, clear the flag
      if (action.isReturningFromRetiredHurt && inn.batsmen[action.name]?.retiredHurt) {
        inn.batsmen[action.name].retiredHurt = false;
        console.log('[NEXT_BATSMAN] Player ' + action.name + ' returning from retired hurt - flag cleared');
      }
      
      // 🏏 CRITICAL FIX: If a wicket occurs on the last ball of an over:
      // - A new batsman comes in (NEXT_BATSMAN)
      // - THEN a new bowler must be selected (selectBowler)
      // This ensures no bowler bowls consecutive overs, even with end-of-over wickets
      const atNewOverStart = inn.legalBalls % 6 === 0;
      const needBowlerChange = atNewOverStart && inn.bowler === inn.lastOverBowler;
      const nextPhase = needBowlerChange ? "selectBowler" : "live";
      
      if (needBowlerChange) {
        console.log('[NEXT_BATSMAN] Over was just completed. Moving to selectBowler phase to enforce bowler change');
      }
      
      // ⭐ FIX: Store ENTIRE state in history for proper undo/redo
      const history = [...state.history, clone(sanitizeForHistory(state))].slice(-40);
      return { ...state, innings, phase: nextPhase, history, redoStack: [] };
    }
    case "NEXT_BOWLER": {
      const innings = clone(state.innings);
      const inn = innings[state.current];
      
      // 🏏 VALIDATION: Ensure bowler is different from last over bowler
      if (action.name === inn.lastOverBowler) {
        console.warn('[NEXT_BOWLER] ERROR: Cannot assign same bowler (' + action.name + ') for consecutive overs! Rejecting.');
        return state; // Reject the action
      }
      
      inn.bowler = action.name;
      ensureBowler(inn, inn.bowler);
      console.log('[NEXT_BOWLER] Bowler changed to', action.name, 'from', inn.lastOverBowler);
      
      // ⭐ FIX: Store ENTIRE state in history for proper undo/redo
      const history = [...state.history, clone(sanitizeForHistory(state))].slice(-40);
      return { ...state, innings, phase: "live", history, redoStack: [] };
    }
    case "AUTO_SELECT_BOWLER": {
      //  FIXED: Auto-select bowler after over complete (skip selectBowler phase)
      const innings = clone(state.innings);
      const inn = innings[state.current];
      const bowlingTeam = teamOf(state, inn.bowlingTeam);
      
      // Filter: not lastOverBowler AND not exceeded max overs per bowler
      const available = bowlingTeam.players.filter((p) => {
        const isLastBowler = p === inn.lastOverBowler && bowlingTeam.players.length > 1;
        const bowlerStats = inn.bowlers[p];
        const oversCount = bowlerStats ? Math.ceil(bowlerStats.legalBalls / 6) : 0;
        const hasExceededMax = oversCount >= state.maxOversPerBowler;
        
        return !isLastBowler && !hasExceededMax;
      });
      
      if (available.length > 0) {
        // Auto-select first available bowler (different from lastOverBowler, not exceeding max)
        const newBowler = available[0];
        inn.bowler = newBowler;
        ensureBowler(inn, inn.bowler);
        console.log('[AUTO_SELECT_BOWLER] Auto-selected', newBowler, 'to replace', inn.lastOverBowler);
        // ⭐ FIX: Store ENTIRE state in history for proper undo/redo
        const history = [...state.history, clone(sanitizeForHistory(state))].slice(-40);
        return { ...state, innings, phase: "live", history, redoStack: [] };
      }
      console.warn('[AUTO_SELECT_BOWLER] No available bowlers! (lastOverBowler=' + inn.lastOverBowler + ')');
      return state;
    }
    case "START_SECOND_INNINGS": {
      console.log('[MATCH] START_SECOND_INNINGS triggered');
      console.log('[MATCH] Inn1 balls recorded:', state.innings[0]?.balls?.length || 0);
      const inn1 = state.innings[0];
      const battingFirst = state.battingFirst;
      const bowlingFirst = battingFirst === "A" ? "B" : "A";
      const inn2 = makeInnings(bowlingFirst, battingFirst, inn1.runs + 1);
      console.log('[MATCH] Created inn2 with battingTeam:', bowlingFirst, 'bowlingTeam:', battingFirst);
      //  NEW: Reset scorer and commentary for new innings
      return { ...state, innings: [state.innings[0], inn2], current: 1, phase: "openers2", currentScorer: null, commentary: [] };
    }
    case "UNDO": {
      if (state.history.length === 0) return state;
      const history = [...state.history];
      const prevState = history.pop(); // Pop ENTIRE state, not just innings
      const redoStack = [...state.redoStack, clone(sanitizeForHistory(state))]; // Push CURRENT state to redo stack
      
      // ⭐ FIX: Properly restore ALL state properties from history
      // Only force phase to live for selection phases; preserve other phases
      let phase = prevState.phase || state.phase;
      if (phase === "selectBatsman" || phase === "selectBowler" || phase === "break" || phase === "result") {
        phase = "live";
      }
      
      console.log('[UNDO] Restoring state. Phase:', prevState.phase, '→', phase, 'History remaining:', history.length);
      return {
        ...prevState,
        history,
        redoStack,
        phase, // Override with computed phase
      };
    }
    case "REDO": {
      if (state.redoStack.length === 0) return state;
      const redoStack = [...state.redoStack];
      const nextState = redoStack.pop(); // Pop ENTIRE state
      const history = [...state.history, clone(sanitizeForHistory(state))]; // Push CURRENT state to history
      
      // ⭐ FIX: Properly restore ALL state properties when redoing
      console.log('[REDO] Restoring state. History length after:', history.length);
      return {
        ...nextState,
        history,
        redoStack,
      };
    }
    case "SET_PLAYER_STATS":
      console.log('[Reducer] SET_PLAYER_STATS dispatch received');
      console.log('[Reducer] New stats for', Object.keys(action.payload).length, 'players');
      console.log('[Reducer] Stats payload:', action.payload);
      return { ...state, playerStats: action.payload };
    case "UPDATE_PLAYER_STATS": {
      // Called when match ends - updates stats for all players in both teams
      console.log('\n\n');
      console.log('='.repeat(80));
      console.log('[UPDATE_PLAYER_STATS]  MATCH COMPLETED - PROCESSING STATS');
      console.log('='.repeat(80));
      console.log('[UPDATE_PLAYER_STATS] Action received:', { code: action.code, teamA: state.teamA.captain, teamB: state.teamB.captain });
      
      // Initialize stats with all players from both teams to ensure data saves even on first match
      const stats = { ...state.playerStats };
      const allTeamPlayers = [...state.teamA.players, ...state.teamB.players];
      console.log('[UPDATE_PLAYER_STATS] All team players:', allTeamPlayers.length, '', allTeamPlayers);
      
      // Ensure all players exist in stats with baseline values
      allTeamPlayers.forEach((player) => {
        if (!player) return; // Skip null or undefined players
        if (!stats[player]) {
          stats[player] = { 
            matches: 0, 
            runs: 0, 
            wickets: 0, 
            fours: 0, 
            sixes: 0, 
            highestScore: 0, 
            highestWickets: 0, 
            innings: 0, 
            ballsFaced: 0 
          };
          console.log(`[UPDATE_PLAYER_STATS]  Initialized "${player}" with baseline stats`);
        }
      });
      
      const inn1 = state.innings && state.innings[0] ? state.innings[0] : null;
      const inn2 = state.innings && state.innings[1] ? state.innings[1] : null;
      
      console.log('[UPDATE_PLAYER_STATS] state.innings array:', state.innings);
      console.log('[UPDATE_PLAYER_STATS] state.innings.length:', state.innings?.length || 0);
      console.log('[UPDATE_PLAYER_STATS] Innings 1 exists?', !!inn1);
      console.log('[UPDATE_PLAYER_STATS] Innings 1 full object:', inn1);
      console.log('[UPDATE_PLAYER_STATS] Innings 1 battingTeam:', inn1?.battingTeam);
      console.log('[UPDATE_PLAYER_STATS] Innings 1 bowlingTeam:', inn1?.bowlingTeam);
      console.log('[UPDATE_PLAYER_STATS] Innings 1 runs/wickets:', inn1?.runs, '/', inn1?.wickets);
      console.log('[UPDATE_PLAYER_STATS] Innings 1 balls array:', inn1?.balls);
      console.log('[UPDATE_PLAYER_STATS] Innings 1 balls count:', inn1?.balls?.length || 0);
      console.log('[UPDATE_PLAYER_STATS] -----');
      console.log('[UPDATE_PLAYER_STATS] Innings 2 exists?', !!inn2);
      console.log('[UPDATE_PLAYER_STATS] Innings 2 full object:', inn2);
      console.log('[UPDATE_PLAYER_STATS] Innings 2 battingTeam:', inn2?.battingTeam);
      console.log('[UPDATE_PLAYER_STATS] Innings 2 bowlingTeam:', inn2?.bowlingTeam);
      console.log('[UPDATE_PLAYER_STATS] Innings 2 runs/wickets:', inn2?.runs, '/', inn2?.wickets);
      console.log('[UPDATE_PLAYER_STATS] Innings 2 balls array:', inn2?.balls);
      console.log('[UPDATE_PLAYER_STATS] Innings 2 balls count:', inn2?.balls?.length || 0);
      
      // Update stats for Innings 1 (batting team)
      if (inn1 && inn1.balls && inn1.balls.length > 0) {
        console.log('[UPDATE_PLAYER_STATS]  Processing Innings 1 with', inn1.balls.length, 'balls');
        const battingTeam = teamOf(state, inn1.battingTeam);
        const bowlingTeam = teamOf(state, inn1.bowlingTeam);
        
        // Batting team stats
        battingTeam.players.forEach((batter) => {
          if (!batter) return; // Skip null batters
          if (!stats[batter]) stats[batter] = { matches: 0, runs: 0, wickets: 0, fours: 0, sixes: 0, highestScore: 0, highestWickets: 0, innings: 0, ballsFaced: 0 };
          stats[batter].matches += 1;
          stats[batter].innings += 1;
        });
        
        // Bowling team stats
        bowlingTeam.players.forEach((bowler) => {
          if (!bowler) return; // Skip null bowlers
          if (!stats[bowler]) stats[bowler] = { matches: 0, runs: 0, wickets: 0, fours: 0, sixes: 0, highestScore: 0, highestWickets: 0, innings: 0, ballsFaced: 0 };
          stats[bowler].matches += 1;
        });
        
        // Track batter scores and bowler stats per innings
        const batterScores = {};
        const bowlerWickets = {};
        
        inn1.balls.forEach((ball) => {
          const striker = ball.striker;
          const bowler = ball.bowler;
          
          // Skip balls with null striker or bowler (can happen at end of innings)
          if (!striker || !bowler) return;
          
          if (!batterScores[striker]) batterScores[striker] = { runs: 0, fours: 0, sixes: 0, balls: 0 };
          if (!bowlerWickets[bowler]) bowlerWickets[bowler] = 0;
          
          batterScores[striker].balls += 1;
          batterScores[striker].runs += ball.batRuns || 0;
          
          if (ball.batRuns === 4) batterScores[striker].fours += 1;
          if (ball.batRuns === 6) batterScores[striker].sixes += 1;
          
          // Extras
          if (ball.kind === "wide" || ball.kind === "noball") {
            batterScores[striker].runs += (ball.batRuns || 0);
          } else if (ball.kind === "bye") {
            batterScores[striker].runs += ball.runs || 0;
          } else if (ball.kind === "legbye") {
            batterScores[striker].runs += ball.runs || 0;
          }
          
          if (ball.kind === "wicket") {
            bowlerWickets[bowler] += 1;
          }
        });
        
        // Update batter stats
        Object.keys(batterScores).forEach((batter) => {
          if (!batter || !stats[batter]) return; // Safety check
          const score = batterScores[batter];
          stats[batter].runs += score.runs;
          stats[batter].fours += score.fours;
          stats[batter].sixes += score.sixes;
          stats[batter].ballsFaced += score.balls;
          if (score.runs > stats[batter].highestScore) {
            stats[batter].highestScore = score.runs;
          }
          console.log(`[UPDATE_PLAYER_STATS] Batter "${batter}" Inning 1: ${score.runs}(${score.balls}) 4s:${score.fours} 6s:${score.sixes}`);
        });
        
        // Update bowler stats
        Object.keys(bowlerWickets).forEach((bowler) => {
          if (!bowler || !stats[bowler]) return; // Safety check
          stats[bowler].wickets += bowlerWickets[bowler];
          if (bowlerWickets[bowler] > stats[bowler].highestWickets) {
            stats[bowler].highestWickets = bowlerWickets[bowler];
          }
          console.log(`[UPDATE_PLAYER_STATS] Bowler "${bowler}" Inning 1: ${bowlerWickets[bowler]} wickets`);
        });
      }
      
      // Update stats for Innings 2 (same process)
      if (inn2 && inn2.balls && inn2.balls.length > 0) {
        console.log('[UPDATE_PLAYER_STATS]  Processing Innings 2 with', inn2.balls.length, 'balls');
        const battingTeam = teamOf(state, inn2.battingTeam);
        const bowlingTeam = teamOf(state, inn2.bowlingTeam);
        
        battingTeam.players.forEach((batter) => {
          if (!batter) return; // Skip null batters
          if (!stats[batter]) stats[batter] = { matches: 0, runs: 0, wickets: 0, fours: 0, sixes: 0, highestScore: 0, highestWickets: 0, innings: 0, ballsFaced: 0 };
          stats[batter].innings += 1;
        });
        
        const batterScores = {};
        const bowlerWickets = {};
        
        inn2.balls.forEach((ball) => {
          const striker = ball.striker;
          const bowler = ball.bowler;
          
          // Skip balls with null striker or bowler (can happen at end of innings)
          if (!striker || !bowler) return;
          
          if (!batterScores[striker]) batterScores[striker] = { runs: 0, fours: 0, sixes: 0, balls: 0 };
          if (!bowlerWickets[bowler]) bowlerWickets[bowler] = 0;
          
          batterScores[striker].balls += 1;
          batterScores[striker].runs += ball.batRuns || 0;
          
          if (ball.batRuns === 4) batterScores[striker].fours += 1;
          if (ball.batRuns === 6) batterScores[striker].sixes += 1;
          
          if (ball.kind === "wicket") {
            bowlerWickets[bowler] += 1;
          }
        });
        
        Object.keys(batterScores).forEach((batter) => {
          if (!batter || !stats[batter]) return; // Safety check
          const score = batterScores[batter];
          stats[batter].runs += score.runs;
          stats[batter].fours += score.fours;
          stats[batter].sixes += score.sixes;
          stats[batter].ballsFaced += score.balls;
          if (score.runs > stats[batter].highestScore) {
            stats[batter].highestScore = score.runs;
          }
          console.log(`[UPDATE_PLAYER_STATS] Batter "${batter}" Inning 2: ${score.runs}(${score.balls}) 4s:${score.fours} 6s:${score.sixes}`);
        });
        
        Object.keys(bowlerWickets).forEach((bowler) => {
          if (!bowler || !stats[bowler]) return; // Safety check
          stats[bowler].wickets += bowlerWickets[bowler];
          if (bowlerWickets[bowler] > stats[bowler].highestWickets) {
            stats[bowler].highestWickets = bowlerWickets[bowler];
          }
          console.log(`[UPDATE_PLAYER_STATS] Bowler "${bowler}" Inning 2: ${bowlerWickets[bowler]} wickets`);
        });
      }
      
      // Save match to Firebase history
      const matchData = {
        code: action.code,
        teamA: state.teamA,
        teamB: state.teamB,
        inning1: state.innings[0],
        inning2: state.innings[1],
        timestamp: new Date().toISOString(),
      };
      console.log('[UPDATE_PLAYER_STATS] Match data to save - CODE:', action.code);
      console.log('[UPDATE_PLAYER_STATS] Match data to save:', matchData);
      console.log('[UPDATE_PLAYER_STATS] Calling saveMatch()...');
      saveMatch(matchData).then((matchId) => {
        console.log('[UPDATE_PLAYER_STATS]  Match saved successfully:', matchId);
      }).catch((err) => {
        console.error('[UPDATE_PLAYER_STATS]  Error saving match:', err);
      });
      
      // Save player stats to Firebase Firestore (accessible to all devices)
      // IMPORTANT: Only save stats for REGISTERED players (those who existed before match)
      const registeredPlayers = Object.keys(state.playerStats); // Players registered before match
      const statsToSave = {};
      
      // Filter to only include registered players
      Object.entries(stats).forEach(([playerName, playerStats]) => {
        if (registeredPlayers.includes(playerName)) {
          statsToSave[playerName] = playerStats;
        }
      });
      
      console.log('[UPDATE_PLAYER_STATS] ========================================');
      console.log('[UPDATE_PLAYER_STATS] PLAYER STATS READY TO SAVE');
      console.log('[UPDATE_PLAYER_STATS] Registered players (will be saved):', registeredPlayers.length, registeredPlayers);
      console.log('[UPDATE_PLAYER_STATS] Total players in match:', Object.keys(stats).length);
      console.log('[UPDATE_PLAYER_STATS] Players to save to Firebase:', Object.keys(statsToSave).length);
      console.log('[UPDATE_PLAYER_STATS] Unregistered players (NOT saved):', 
        Object.keys(stats).filter(p => !registeredPlayers.includes(p)).join(', ') || 'None'
      );
      console.log('[UPDATE_PLAYER_STATS] Stats to save summary:');
      Object.entries(statsToSave).forEach(([playerName, playerStats]) => {
        console.log(`  "${playerName}": matches=${playerStats.matches} runs=${playerStats.runs} wkts=${playerStats.wickets} 4s=${playerStats.fours} 6s=${playerStats.sixes}`);
      });
      console.log('[UPDATE_PLAYER_STATS] ========================================');
      console.log('[UPDATE_PLAYER_STATS] Calling savePlayerStats() now...');
      
      savePlayerStats(statsToSave).then((success) => {
        if (success) {
          console.log('[UPDATE_PLAYER_STATS]  Player stats saved successfully to Firestore!');
        } else {
          console.error('[UPDATE_PLAYER_STATS]  Failed to save player stats - savePlayerStats returned false');
        }
      }).catch((err) => {
        console.error('[UPDATE_PLAYER_STATS]  Error saving player stats:', err);
      });
      
      console.log('='.repeat(80));
      console.log('[UPDATE_PLAYER_STATS]  STATE UPDATE COMPLETE\n\n');
      
      return { ...state, playerStats: stats };
    }
    case "START_SUPER_OVER":
      // 🏏 Start super over (tiebreaker) - 1 over per team
      // Super over is 2 separate innings: each team bats 1 over to break the tie
      console.log('[START_SUPER_OVER] Starting super over after tie - Team 1 to bat first');
      const inn1 = state.innings[0];
      const inn2 = state.innings[1];
      
      // Create first super over inning - team from first inning bats first
      const superOverInn1 = {
        battingTeam: inn1.battingTeam, // First team bats in super over inning 1
        bowlingTeam: inn2.battingTeam, // Second team bowls
        runs: 0,
        wickets: 0,
        legalBalls: 0,
        bowler: null,
        striker: null,
        nonStriker: null,
        timeline: [],
        balls: [],
        batsmen: {},
        bowlers: {},
        battedOrder: [],
        target: inn2.runs + 1, // Need to beat main match score in super over
        lastOverBowler: null,
      };
      return {
        ...state,
        innings: [...state.innings, superOverInn1],
        current: 2, // Switch to super over inning 1
        phase: "openers2", // Need to select openers for super over
        oversLimit: 1, // Super over is only 1 over (6 balls)
      };
    case "RESET":
      return initialState;
    default:
      return state;
    }
  } catch (err) {
    // 🛡️ CRITICAL: Catch any errors in reducer and log them
    // Return current state unchanged to prevent app crash
    console.error('[Reducer] Critical error processing action:', action.type);
    console.error('[Reducer] Error details:', err.message);
    console.error('[Reducer] Stack:', err.stack);
    console.warn('[Reducer] Returning unchanged state to prevent crash');
    return state; // Return unchanged state - scoring continues
  }
}

/* ---------------------------------------------------------------
   UI PRIMITIVES
---------------------------------------------------------------- */
function Chip({ children, kind }) {
  const map = {
    run: { bg: C.grassLight, fg: C.chalk },
    0: { bg: C.line, fg: C.chalkDim },
    wide: { bg: "transparent", fg: C.amber, border: C.amber },
    noball: { bg: "transparent", fg: C.amber, border: C.amber },
    bye: { bg: "transparent", fg: C.sky, border: C.sky },
    legbye: { bg: "transparent", fg: C.sky, border: C.sky },
    wicket: { bg: C.crimson, fg: C.chalk },
  };
  const style = map[kind] || map[0];
  return (
    <div
      className="flex items-center justify-center rounded-full text-xs font-semibold shrink-0"
      style={{
        width: 30,
        height: 30,
        background: style.bg,
        color: style.fg,
        border: style.border ? `2px solid ${style.border}` : "none",
        ...body,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Display the current over's deliveries in a compact format
 */
function CurrentOverDisplay({ state }) {
  if (!state || !state.innings || state.innings.length === 0) return null;
  const inn = state.innings[state.current];
  if (!inn || !inn.balls || inn.balls.length === 0) return null;
  // Safety check: timeline might be undefined when following a live match
  if (!inn.timeline || inn.timeline.length === 0) return null;

  // Get the current over number based on legal balls bowled (1-indexed: Over 1, 2, 3...)
  // Using floor division is more explicit: over = floor((ballNumber - 1) / 6) + 1
  const overNum = inn.legalBalls === 0 ? 0 : Math.floor((inn.legalBalls - 1) / 6) + 1;
  
  // Get all balls from the timeline that belong to the current over
  const currentOverBalls = (inn.timeline || []).filter((t, idx) => {
    // Count legal balls up to this index
    const legalBallsUpToNow = inn.timeline.slice(0, idx + 1).filter(x => x.legal).length;
    // Use the same formula to ensure consistency
    const ballOver = legalBallsUpToNow === 0 ? 0 : Math.floor((legalBallsUpToNow - 1) / 6) + 1;
    return ballOver === overNum;
  });

  if (currentOverBalls.length === 0) return null;

  return (
    <div className="mx-4 mb-3 p-3 rounded-lg" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
      <div className="text-xs uppercase mb-2" style={{ color: C.slate, ...body, letterSpacing: "0.1em" }}>
        Current Over {overNum} · {currentOverBalls.length} deliveries
      </div>
      <div className="flex gap-2 flex-wrap">
        {currentOverBalls.map((b, i) => (
          <Chip key={i} kind={b.kind}>
            {b.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function PadButton({ children, onClick, tone = "default", small }) {
  const tones = {
    default: { bg: C.nightSoft, fg: C.chalk, border: C.line, active: C.night },
    run: { bg: C.grassLight, fg: C.chalk, border: C.grassLight, active: C.grass },
    four: { bg: C.amber, fg: C.ink, border: C.amber, active: C.amberSoft },
    six: { bg: C.amber, fg: C.ink, border: C.amber, active: C.amberSoft },
    wicket: { bg: C.crimson, fg: C.chalk, border: C.crimson, active: C.crimsonDim || "rgba(220, 38, 38, 0.7)" },
    extra: { bg: "transparent", fg: C.amberSoft, border: C.amber, active: "rgba(217, 119, 6, 0.2)" },
    highlight: { bg: C.sky, fg: C.ink, border: C.sky, active: C.skyDim || "rgba(14, 165, 233, 0.7)" },
  };
  const t = tones[tone] || tones.default; // Fallback to default if tone not found
  //  NEW: Track if button is actively pressed for visual feedback
  const [isPressed, setIsPressed] = React.useState(false);
  
  return (
    <button
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      onClick={onClick}
      className={`rounded-xl font-bold active:scale-95 transition-all ${small ? "py-2 text-sm" : "py-3 text-lg"}`}
      style={{
        background: isPressed ? t.active : t.bg,
        color: t.fg,
        border: `1.5px solid ${t.border}`,
        ...display,
        letterSpacing: "0.04em",
        boxShadow: isPressed ? `inset 0 2px 4px rgba(0, 0, 0, 0.3)` : "none",
        transform: isPressed ? "scale(0.96)" : "scale(1)",
        transition: "all 0.1s ease"
      }}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------
   SETUP SCREEN
---------------------------------------------------------------- */
// Avatar styles - simple predefined avatars
const AVATAR_STYLES = [
  { id: 1, name: "Green Player", color: C.grassLight, icon: "person" },
  { id: 2, name: "Amber Star", color: C.amber, icon: "star" },
  { id: 3, name: "Sky Shield", color: C.sky, icon: "shield" },
  { id: 4, name: "Crimson Fire", color: C.crimson, icon: "flame" },
  { id: 5, name: "Purple Crown", color: "#9D6FD6", icon: "crown" },
  { id: 6, name: "Teal Diamond", color: "#17B8A0", icon: "diamond" },
];

function Avatar({ name, size = 28, avatarStyle = 1 }) {
  const style = AVATAR_STYLES.find(s => s.id === avatarStyle) || AVATAR_STYLES[0];
  
  const renderIcon = () => {
    switch (style.icon) {
      case "star":
        return (
          <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill={C.chalk}>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        );
      case "shield":
        return (
          <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill={C.chalk}>
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
          </svg>
        );
      case "flame":
        return (
          <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill={C.chalk}>
            <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 2.08 13.5.67z" />
          </svg>
        );
      case "crown":
        return (
          <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill={C.chalk}>
            <path d="M12 2l3 7H3l3-7m0 9v9h10v-9" />
          </svg>
        );
      case "diamond":
        return (
          <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill={C.chalk}>
            <path d="M12 2l5 9-5 11-5-11 5-9z" />
          </svg>
        );
      default: // person
        return (
          <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4.2" fill={C.chalk} />
            <path d="M4 20.5c0-4.4 3.6-7.5 8-7.5s8 3.1 8 7.5" stroke={C.chalk} strokeWidth="2.4" strokeLinecap="round" fill="none" />
          </svg>
        );
    }
  };

  return (
    <div
      className="flex items-center justify-center shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: style.color,
        flexShrink: 0,
      }}
      title={name}
    >
      {renderIcon()}
    </div>
  );
}


function TeamEditor({ label, team, teamKey, dispatch, globalPlayers, otherTeamPlayers, clanMembers }) {
  const [playerInput, setPlayerInput] = useState("");
  const profiles = team.profiles || {};
  
  // Prioritize clan members: if clan has members, show only them; if no clan members, show globalPlayers for custom entry
  const availableMembers = clanMembers && clanMembers.length > 0 
    ? clanMembers.filter(p => !team.players.includes(p) && !otherTeamPlayers.includes(p))
    : globalPlayers.filter(p => !team.players.includes(p) && !otherTeamPlayers.includes(p));
  
  // Filter based on input
  const filteredPlayers = availableMembers.filter(p => p.toLowerCase().includes(playerInput.toLowerCase()));
  
  // Determine if custom entry is allowed
  const allowCustomEntry = !clanMembers || clanMembers.length === 0;

  const handleAddPlayer = (playerName) => {
    if (playerName.trim() && !team.players.includes(playerName.trim()) && !otherTeamPlayers.includes(playerName.trim())) {
      dispatch({ type: "ADD_PLAYER", team: teamKey, name: playerName.trim() });
      setPlayerInput("");
    }
  };

  const handleAddCustom = () => {
    // Only allow custom entry if no clan members exist
    if (!allowCustomEntry) {
      console.warn('[TeamEditor] Cannot add custom players when clan members are available');
      return;
    }
    if (playerInput.trim()) {
      handleAddPlayer(playerInput.trim());
    }
  };

  return (
    <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
      {label && (
        <div className="flex items-center mb-2">
          <div className="text-xs uppercase" style={{ color: C.slate, ...body, letterSpacing: "0.1em" }}>
            {label}
          </div>
        </div>
      )}
      <input
        value={team.name}
        onChange={(e) => dispatch({ type: "SET_TEAM_NAME", team: teamKey, name: e.target.value })}
        className="w-full mb-3 px-3 py-2 rounded-lg text-xl outline-none"
        style={{ background: C.night, color: C.chalk, ...display, letterSpacing: "0.04em" }}
        placeholder="Team name"
      />
      
      {/* Unified Add Player */}
      <div style={{ ...body, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div className="text-xs uppercase" style={{ color: C.sky, letterSpacing: "0.08em" }}>
          {clanMembers && clanMembers.length > 0 ? "Select Clan Member" : "Add Player"}
        </div>
        {clanMembers && clanMembers.length > 0 && (
          <div className="text-[10px] px-2 py-1 rounded" style={{ background: C.grass, color: C.chalk }}>
            👥 From Clan ({clanMembers.length})
          </div>
        )}
      </div>
      <div className="mb-3">
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={playerInput}
            onChange={(e) => setPlayerInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && (allowCustomEntry ? handleAddCustom() : null)}
            placeholder={clanMembers && clanMembers.length > 0 ? "Search clan member..." : "Type player name..."}
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: C.night, color: C.chalk, ...body, border: `1px solid ${C.line}` }}
          />
          <button
            onClick={handleAddCustom}
            disabled={!playerInput.trim() || (!allowCustomEntry && playerInput.trim())}
            className="px-3 rounded-lg font-semibold text-sm"
            style={{ background: (playerInput.trim() && allowCustomEntry) ? C.amber : C.slate, color: C.ink, ...body, opacity: (playerInput.trim() && allowCustomEntry) ? 1 : 0.5 }}
          >
            Add
          </button>
        </div>

        {/* Helper text for clan restriction */}
        {clanMembers && clanMembers.length > 0 && (
          <div className="text-[10px] px-2 py-1 rounded mb-2" style={{ background: C.grassLight, color: C.chalk, ...body }}>
            ℹ️ Select from clan members to add to your team
          </div>
        )}

        {/* Show filtered suggestions from registered players */}
        {playerInput.trim() && filteredPlayers.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {filteredPlayers.slice(0, 5).map((p) => (
              <button
                key={p}
                onClick={() => handleAddPlayer(p)}
                className="px-3 py-1 rounded-full text-xs font-semibold active:scale-95 transition-all"
                style={{ background: C.night, color: C.sky, border: `1px solid ${C.sky}`, ...body }}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {team.players.map((p, i) => {
          const playerName = typeof p === "string" ? p : p.name;
          return (
            <span
              key={i}
              className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full text-sm"
              style={{ background: C.night, color: C.chalk, ...body }}
            >
              <Avatar name={playerName} size={20} />
              {playerName}
              <button onClick={() => dispatch({ type: "REMOVE_PLAYER", team: teamKey, index: i })} style={{ color: C.crimson }}>
                ×
              </button>
            </span>
          );
        })}
        {team.players.length === 0 && (
          <span className="text-sm" style={{ color: C.slate, ...body }}>
            No players yet
          </span>
        )}
      </div>

      <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.line}` }}>
        <div className="text-xs uppercase mb-2" style={{ color: C.amber, ...body, letterSpacing: "0.1em" }}>
           Captain
        </div>
        <select
          value={team.captain || ""}
          onChange={(e) => dispatch({ type: "SET_CAPTAIN", team: teamKey, name: e.target.value })}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-4"
          style={{ background: C.night, color: C.chalk, ...body, border: `1px solid ${C.line}` }}
        >
          <option value="">Select captain...</option>
          {team.players.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <div className="text-xs uppercase mb-2" style={{ color: C.chalk, ...body, letterSpacing: "0.1em" }}>
           Wicket-Keeper
        </div>
        <select
          value={team.wicketKeeper || ""}
          onChange={(e) => dispatch({ type: "SET_WICKET_KEEPER", team: teamKey, name: e.target.value })}
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: C.night, color: C.chalk, ...body, border: `1px solid ${C.line}` }}
        >
          <option value="">Select wicket-keeper...</option>
          {team.players.map((p) => (
            <option key={p} value={p} disabled={p === team.captain}>
              {p}
              {p === team.captain ? " (Captain)" : ""}
            </option>
          ))}
        </select>

        {team.captain && (
          <div className="mt-3 p-2 rounded-lg text-sm" style={{ background: C.night, color: C.chalk, ...body }}>
            <span style={{ color: C.amber }}>Captain: {team.captain}</span>
            {team.wicketKeeper && <div style={{ color: C.chalk }}>Wicket-Keeper: {team.wicketKeeper}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerStatsDisplay({ playerStats }) {
  const [sortBy, setSortBy] = useState("runs");
  
  console.log('[PlayerStatsDisplay] Component rendered');
  console.log('[PlayerStatsDisplay] playerStats prop received:', playerStats);
  console.log('[PlayerStatsDisplay] playerStats type:', typeof playerStats);
  console.log('[PlayerStatsDisplay] playerStats keys:', playerStats ? Object.keys(playerStats) : 'null/undefined');
  console.log('[PlayerStatsDisplay] playerStats length:', playerStats ? Object.keys(playerStats).length : 0);
  
  const statsArray = Object.entries(playerStats || {}).map(([name, stats]) => ({
    name,
    ...stats,
    average: stats.innings > 0 ? (stats.runs / stats.innings).toFixed(2) : 0,
    strikeRate: stats.ballsFaced > 0 ? ((stats.runs / stats.ballsFaced) * 100).toFixed(2) : 0,
  }));
  
  console.log('[PlayerStatsDisplay] statsArray created with', statsArray.length, 'players');
  console.log('[PlayerStatsDisplay] statsArray:', statsArray);
  
  const sorted = [...statsArray].sort((a, b) => {
    if (sortBy === "runs") return b.runs - a.runs;
    if (sortBy === "wickets") return b.wickets - a.wickets;
    if (sortBy === "average") return b.average - a.average;
    if (sortBy === "strikeRate") return b.strikeRate - a.strikeRate;
    if (sortBy === "fours") return b.fours - a.fours;
    if (sortBy === "sixes") return b.sixes - a.sixes;
    return 0;
  });
  
  console.log('[PlayerStatsDisplay] sorted array:', sorted);
  console.log('[PlayerStatsDisplay] will render', sorted.length, 'rows');

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-center">
        <div style={{ ...display, fontSize: 32, color: C.amber, lineHeight: 1 }}>PLAYER STATS</div>
        <div className="text-xs" style={{ color: C.amberSoft, ...body }}> Shared Across All Devices</div>
      </div>

      <div className="flex gap-2 flex-wrap justify-center">
        {[
          { key: "runs", label: "Runs" },
          { key: "wickets", label: "Wickets" },
          { key: "average", label: "Average" },
          { key: "strikeRate", label: "Strike Rate" },
          { key: "fours", label: "Fours" },
          { key: "sixes", label: "Sixes" },
        ].map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            className="px-3 py-1 rounded text-xs font-semibold"
            style={{
              background: sortBy === opt.key ? C.amber : C.night,
              color: sortBy === opt.key ? C.ink : C.chalk,
              ...body,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ color: C.chalk, ...body }}>
          <thead>
            <tr style={{ background: C.night, borderBottom: `1px solid ${C.line}` }}>
              <th className="p-2 text-left">Player</th>
              <th className="p-2 text-center">Matches</th>
              <th className="p-2 text-center">Runs</th>
              <th className="p-2 text-center">Avg</th>
              <th className="p-2 text-center">SR</th>
              <th className="p-2 text-center">4s</th>
              <th className="p-2 text-center">6s</th>
              <th className="p-2 text-center">Wkts</th>
              <th className="p-2 text-center">Best Batting</th>
              <th className="p-2 text-center">Best Bowling</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.name} style={{ borderBottom: `1px solid ${C.line}` }}>
                <td className="p-2 font-semibold">{p.name}</td>
                <td className="p-2 text-center">{p.matches}</td>
                <td className="p-2 text-center" style={{ color: C.amber }}>{p.runs}</td>
                <td className="p-2 text-center">{p.average}</td>
                <td className="p-2 text-center">{p.strikeRate}%</td>
                <td className="p-2 text-center" style={{ color: C.chalk }}>{p.fours}</td>
                <td className="p-2 text-center" style={{ color: C.crimson }}>{p.sixes}</td>
                <td className="p-2 text-center" style={{ color: C.amberSoft }}>{p.wickets}</td>
                <td className="p-2 text-center">{p.highestScore > 0 ? p.highestScore : "-"}</td>
                <td className="p-2 text-center">{p.highestWickets > 0 ? p.highestWickets : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SetupScreen({ state, dispatch, isGuest, clanPlayers }) {
  const [validationError, setValidationError] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [userTeams, setUserTeams] = useState([]);
  const [teamsLoaded, setTeamsLoaded] = useState(false);

  // Load user's teams on mount (SKIP FOR GUEST MODE)
  useEffect(() => {
    if (isGuest) {
      // Guest mode: No team selection allowed
      setTeamsLoaded(true);
      return;
    }
    
    (async () => {
      try {
        const teams = await getUserClans() || [];
        setUserTeams(teams);
      } catch (err) {
        console.error('Error loading teams:', err);
      }
      setTeamsLoaded(true);
    })();
  }, [isGuest]);
  
  const canStart = state.teamA.players.length >= 2 && state.teamB.players.length >= 2 && state.oversLimit > 0 && state.teamA.players.length === state.teamB.players.length && state.teamA.captain && state.teamB.captain;
  
  const handleStartMatch = async () => {
    setValidationError("");
    setIsValidating(true);
    
    try {
      // Check if any player from both teams is already playing in an ongoing match
      const allPlayers = [...state.teamA.players, ...state.teamB.players];
      const uniquePlayers = [...new Set(allPlayers)];
      
      for (const playerName of uniquePlayers) {
        const activeMatch = await checkPlayerActiveInMatch(playerName);
        if (activeMatch.isActive) {
          setValidationError(`❌ ${playerName} is already playing in match ${activeMatch.matchCode}. A player cannot play in two matches simultaneously.`);
          setIsValidating(false);
          return;
        }
      }
      
      // All validations passed - proceed to toss
      dispatch({ type: "PROCEED_TO_TOSS" });
    } catch (err) {
      console.error('Error validating players:', err);
      setValidationError("Error checking player availability. Please try again.");
    } finally {
      setIsValidating(false);
    }
  };

  const renderTeamSetup = (teamKey) => {
    const team = teamOf(state, teamKey);
    const isTeamMode = team.mode === "team";
    
    return (
      <div key={teamKey} className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase" style={{ color: C.slate, ...body, letterSpacing: "0.1em" }}>
            {teamKey === "A" ? "Team A" : "Team B"}
          </div>
          {/* Team mode toggle - DISABLED for guest mode */}
          {!isGuest && (
            <div className="flex gap-1">
              <button
                onClick={() => dispatch({ type: "SET_TEAM_MODE", team: teamKey, mode: "manual" })}
                className="px-2 py-1 text-xs rounded"
                style={{
                  background: !isTeamMode ? C.amber : C.night,
                  color: !isTeamMode ? C.ink : C.chalk,
                  ...body,
                }}
              >
                Add Players
              </button>
              <button
                onClick={() => dispatch({ type: "SET_TEAM_MODE", team: teamKey, mode: "team" })}
                className="px-2 py-1 text-xs rounded"
                style={{
                  background: isTeamMode ? C.amber : C.night,
                  color: isTeamMode ? C.ink : C.chalk,
                  ...body,
                }}
              >
                Select Team
              </button>
            </div>
          )}
          {/* Guest mode badge */}
          {isGuest && (
            <div className="text-xs px-2 py-1 rounded" style={{ background: C.crimson, color: C.chalk, ...body }}>
              GUEST MODE
            </div>
          )}
        </div>

        {isTeamMode && !isGuest ? (
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs uppercase mb-2 block" style={{ color: C.sky, ...body, letterSpacing: "0.08em" }}>
                Select from your teams
              </label>
              <select
                value={team.teamId || ""}
                onChange={(e) => {
                  const selectedTeamId = e.target.value;
                  const selectedTeam = userTeams.find(t => t.id === selectedTeamId);
                  if (selectedTeam) {
                    dispatch({
                      type: "SELECT_TEAM_BY_ID",
                      team: teamKey,
                      teamId: selectedTeamId,
                      teamData: selectedTeam,
                    });
                  }
                }}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: C.night, color: C.chalk, ...body, border: `1px solid ${C.line}` }}
              >
                <option value="">-- Select a team --</option>
                {userTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.members?.length || 0} members)
                  </option>
                ))}
              </select>
            </div>

            {team.teamId && (
              <div className="rounded-lg p-3" style={{ background: C.night, border: `1px solid ${C.amber}` }}>
                <div className="text-xs uppercase mb-2" style={{ color: C.amber, ...body, letterSpacing: "0.1em" }}>
                  Selected: {team.name}
                </div>
                <div className="text-xs mb-2" style={{ color: C.chalk, ...body }}>
                  {team.players.length} players • Captain: {team.captain}
                </div>
                <div className="flex flex-wrap gap-1">
                  {team.players.map((p) => (
                    <span
                      key={p}
                      className="px-2 py-1 rounded text-xs"
                      style={{
                        background: C.nightSoft,
                        color: p === team.captain ? C.amber : C.chalk,
                        ...body,
                        border: `1px solid ${C.line}`,
                      }}
                    >
                      {p} {p === team.captain ? "👑" : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <TeamEditor label={null} team={team} teamKey={teamKey} dispatch={dispatch} globalPlayers={Object.keys(state.playerStats).sort()} otherTeamPlayers={teamKey === "A" ? state.teamB.players : state.teamA.players} clanMembers={clanPlayers} />
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <div className="text-center pt-2 pb-1">
        <div style={{ ...display, fontSize: 40, color: C.amber, lineHeight: 1 }}>NEW MATCH</div>
        <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
          Set up your teams, then get scoring  no more scribbled scorecards.
        </div>
      </div>

      {renderTeamSetup("A")}
      {renderTeamSetup("B")}

      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
        <div className="text-xs uppercase mb-2" style={{ color: C.slate, ...body, letterSpacing: "0.1em" }}>
          Overs per innings (1-50)
        </div>
        <input
          type="number"
          min={1}
          max={50}
          value={state.oversLimit}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 1;
            const clamped = Math.max(1, Math.min(50, val));
            dispatch({ type: "SET_OVERS", value: clamped });
          }}
          className="w-24 px-3 py-2 rounded-lg text-xl outline-none"
          style={{ background: C.night, color: C.amber, ...display }}
        />
        <div className="text-[10px] mt-2" style={{ color: C.slate, ...body }}>
          Enter value between 1 and 50
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-3" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
          <div className="text-xs uppercase mb-2" style={{ color: C.slate, ...body, letterSpacing: "0.08em" }}>
            Powerplay Overs
          </div>
          <input
            type="number"
            min={1}
            max={Math.min(10, state.oversLimit)}
            value={state.powerplayOvers}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 1;
              const clamped = Math.max(1, Math.min(state.oversLimit, val));
              dispatch({ type: "SET_POWERPLAY", value: clamped });
            }}
            className="w-full px-2 py-1 rounded-lg text-lg outline-none"
            style={{ background: C.night, color: C.amber, ...display }}
          />
          <div className="text-[9px] mt-1" style={{ color: C.slate, ...body }}>
            Usually 6 for T20
          </div>
        </div>

        <div className="rounded-2xl p-3" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
          <div className="text-xs uppercase mb-2" style={{ color: C.slate, ...body, letterSpacing: "0.08em" }}>
            Max Overs/Bowler
          </div>
          <input
            type="number"
            min={1}
            max={state.oversLimit}
            value={state.maxOversPerBowler}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 1;
              const clamped = Math.max(1, Math.min(state.oversLimit, val));
              dispatch({ type: "SET_MAX_OVERS_PER_BOWLER", value: clamped });
            }}
            className="w-full px-2 py-1 rounded-lg text-lg outline-none"
            style={{ background: C.night, color: C.amber, ...display }}
          />
          <div className="text-[9px] mt-1" style={{ color: C.slate, ...body }}>
            Usually 4 for T20
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
        <div className="text-xs uppercase mb-2" style={{ color: C.slate, ...body, letterSpacing: "0.1em" }}>
          Venue
        </div>
        <input
          type="text"
          value={state.venue}
          onChange={(e) => dispatch({ type: "SET_VENUE", value: e.target.value })}
          className="w-full px-3 py-2 rounded-lg text-lg outline-none"
          style={{ background: C.night, color: C.chalk, ...body, border: `1px solid ${C.line}` }}
          placeholder="e.g., Local Ground, Park"
        />
      </div>

      <button
        disabled={!canStart || isValidating}
        onClick={handleStartMatch}
        className="w-full py-4 rounded-2xl text-2xl mt-2 font-bold active:scale-95 transition-all"
        style={{
          background: canStart && !isValidating ? C.amber : C.line,
          color: canStart && !isValidating ? C.ink : C.slate,
          ...display,
          letterSpacing: "0.06em",
          opacity: canStart && !isValidating ? 1 : 0.5,
          cursor: canStart && !isValidating ? "pointer" : "not-allowed",
          boxShadow: canStart && !isValidating ? "0 2px 8px rgba(217, 119, 6, 0.3)" : "none",
        }}
      >
        {isValidating ? "Checking players..." : "Proceed to Toss"}
      </button>
      {validationError && (
        <div className="rounded-xl p-3 text-center text-sm" style={{ background: C.crimson, color: C.chalk, ...body }}>
          {validationError}
        </div>
      )}
      {!canStart && !validationError && (
        <div className="text-center text-xs" style={{ color: C.slate, ...body }}>
          {state.teamA.players.length !== state.teamB.players.length 
            ? "Teams must have equal players." 
            : state.teamA.players.length < 2 || state.teamB.players.length < 2
            ? "Add at least 2 players per team."
            : !state.teamA.captain || !state.teamB.captain
            ? "Select captain and wicket-keeper for both teams."
            : "Set overs to begin."}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   OPENERS SCREEN (used for both innings)
---------------------------------------------------------------- */
function OpenersScreen({ state, dispatch }) {
  const inn = state.innings[state.current];
  const battingTeam = teamOf(state, inn.battingTeam);
  const bowlingTeam = teamOf(state, inn.bowlingTeam);
  const [striker, setStriker] = useState("");
  const [nonStriker, setNonStriker] = useState("");
  const [bowler, setBowler] = useState("");

  const ready = striker && nonStriker && striker !== nonStriker && bowler;

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <div className="text-center pt-2">
        <div style={{ ...display, fontSize: 32, color: C.amber }}>
          {state.current === 0 ? "1st INNINGS" : "2nd INNINGS"}
        </div>
        <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
          {battingTeam.name} bat · {bowlingTeam.name} bowl
        </div>
        {state.current === 1 && (
          <div className="text-sm mt-1" style={{ color: C.amberSoft, ...body }}>
            Target: {inn.target} runs
          </div>
        )}
      </div>

      <PickerBlock title="Striker" options={battingTeam.players} value={striker} onChange={setStriker} exclude={nonStriker} />
      <PickerBlock title="Non-striker" options={battingTeam.players} value={nonStriker} onChange={setNonStriker} exclude={striker} />
      <PickerBlock title="Opening bowler" options={bowlingTeam.players} value={bowler} onChange={setBowler} />

      <button
        disabled={!ready}
        onClick={() => dispatch({ type: "SET_OPENERS", striker, nonStriker, bowler })}
        className="w-full py-4 rounded-2xl text-2xl mt-2 font-bold active:scale-95 transition-all"
        style={{
          background: ready ? C.amber : C.line,
          color: ready ? C.ink : C.slate,
          ...display,
          letterSpacing: "0.06em",
          opacity: ready ? 1 : 0.5,
          cursor: ready ? "pointer" : "not-allowed",
          boxShadow: ready ? "0 2px 8px rgba(217, 119, 6, 0.3)" : "none",
        }}
      >
         Begin Innings
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------
   TOSS SCREEN (after teams setup, before openers)
---------------------------------------------------------------- */
function TossScreen({ state, dispatch }) {
  const teamA = teamOf(state, "A");
  const teamB = teamOf(state, "B");
  const captainA = teamA.captain;
  const captainB = teamB.captain;

  const handleTossWinner = (winner) => {
    dispatch({ type: "SET_TOSS", winner, decision: state.tossDecision });
  };

  const handleTossDecision = (decision) => {
    dispatch({ type: "SET_TOSS", winner: state.tossWinner, decision });
  };

  const canProceed = state.tossWinner && state.tossDecision;

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <div className="text-center pt-2">
        <div style={{ ...display, fontSize: 36, color: C.amber, lineHeight: 1 }}>🪙 TOSS</div>
        <div className="text-sm mt-3" style={{ color: C.chalkDim, ...body }}>
          Let's decide who bats first
        </div>
      </div>

      {/* Team Captains Info */}
      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
        <div className="text-xs uppercase mb-3" style={{ color: C.slate, ...body, letterSpacing: "0.08em" }}>
          Team Captains
        </div>
        <div className="flex gap-2">
          <div className="flex-1 p-3 rounded-lg text-center" style={{ background: C.night, border: `1px solid ${C.amber}` }}>
            <div style={{ ...display, color: C.amber, fontSize: 20 }}>{teamA.name}</div>
            <div className="text-xs mt-1" style={{ color: C.chalk, ...body }}>
              Captain: <span style={{ color: C.amberSoft, fontWeight: "bold" }}>{captainA}</span>
            </div>
          </div>
          <div className="flex items-center justify-center" style={{ color: C.slate, ...body, fontSize: 12 }}>
            vs
          </div>
          <div className="flex-1 p-3 rounded-lg text-center" style={{ background: C.night, border: `1px solid ${C.sky}` }}>
            <div style={{ ...display, color: C.sky, fontSize: 20 }}>{teamB.name}</div>
            <div className="text-xs mt-1" style={{ color: C.chalk, ...body }}>
              Captain: <span style={{ color: C.amberSoft, fontWeight: "bold" }}>{captainB}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Toss Winner Selection */}
      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
        <div className="text-xs uppercase mb-3" style={{ color: C.chalk, ...body, letterSpacing: "0.08em" }}>
          Who won the toss?
        </div>
        <div className="flex gap-3">
          {["A", "B"].map((k) => {
            const team = teamOf(state, k);
            return (
              <button
                key={k}
                onClick={() => handleTossWinner(k)}
                className="flex-1 py-3 rounded-xl font-semibold transition-all"
                style={{
                  background: state.tossWinner === k ? (k === "A" ? C.amber : C.sky) : C.night,
                  color: state.tossWinner === k ? C.ink : C.chalk,
                  ...display,
                  fontSize: 16,
                  border: `2px solid ${state.tossWinner === k ? (k === "A" ? C.amber : C.sky) : C.line}`,
                  boxShadow: state.tossWinner === k ? `0 2px 8px ${k === "A" ? "rgba(217, 119, 6, 0.4)" : "rgba(79, 163, 209, 0.4)"}` : "none",
                }}
              >
                {team.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Toss Decision (Bat or Bowl) */}
      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
        <div className="text-xs uppercase mb-3" style={{ color: C.chalk, ...body, letterSpacing: "0.08em" }}>
          {state.tossWinner ? `${teamOf(state, state.tossWinner).name} elects to...` : "Select winner first"}
        </div>
        <div className="flex gap-3">
          {["bat", "bowl"].map((decision) => (
            <button
              key={decision}
              onClick={() => handleTossDecision(decision)}
              disabled={!state.tossWinner}
              className="flex-1 py-3 rounded-xl font-semibold capitalize transition-all text-lg"
              style={{
                background: state.tossDecision === decision ? C.grassLight : C.night,
                color: state.tossDecision === decision ? C.ink : C.chalk,
                ...display,
                border: `2px solid ${state.tossDecision === decision ? C.grassLight : C.line}`,
                boxShadow: state.tossDecision === decision ? `0 2px 8px rgba(34, 197, 94, 0.4)` : "none",
                opacity: !state.tossWinner ? 0.5 : 1,
                cursor: !state.tossWinner ? "not-allowed" : "pointer",
              }}
            >
              {decision === "bat" ? "🏏 Bat" : "🎯 Bowl"}
            </button>
          ))}
        </div>
      </div>

      {/* Summary */}
      {canProceed && (
        <div className="rounded-2xl p-4" style={{ background: C.night, border: `1px solid ${C.grassLight}` }}>
          <div className="text-sm text-center" style={{ color: C.chalk, ...body }}>
            <div className="font-bold mb-2">Toss Summary</div>
            <div style={{ color: C.amberSoft }}>
              🏆 {teamOf(state, state.tossWinner).name} won the toss
            </div>
            <div style={{ color: C.amberSoft, marginTop: 4 }}>
              {state.tossDecision === "bat" 
                ? `🏏 ${teamOf(state, state.tossWinner).name} will bat first`
                : `🎯 ${teamOf(state, state.tossWinner === "A" ? "B" : "A").name} will bat first`}
            </div>
          </div>
        </div>
      )}

      {/* Proceed Button */}
      <button
        disabled={!canProceed}
        onClick={() => dispatch({ type: "PROCEED_TO_OPENERS" })}
        className="w-full py-4 rounded-2xl text-2xl mt-2 font-bold active:scale-95 transition-all"
        style={{
          background: canProceed ? C.amber : C.line,
          color: canProceed ? C.ink : C.slate,
          ...display,
          letterSpacing: "0.06em",
          opacity: canProceed ? 1 : 0.5,
          cursor: canProceed ? "pointer" : "not-allowed",
          boxShadow: canProceed ? "0 2px 8px rgba(217, 119, 6, 0.3)" : "none",
        }}
      >
         Start Match
      </button>
    </div>
  );
}

function PickerBlock({ title, options, value, onChange, exclude }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
      <div className="text-xs uppercase mb-2" style={{ color: C.slate, ...body, letterSpacing: "0.1em" }}>
        {title}
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const playerName = typeof opt === "string" ? opt : opt.name;
          return (
            <button
              key={playerName}
              disabled={playerName === exclude}
              onClick={() => onChange(playerName)}
              className="px-3 py-2 rounded-lg text-sm font-medium active:scale-95 transition-all"
              style={{
                background: value === playerName ? C.amber : C.night,
                color: value === playerName ? C.ink : playerName === exclude ? C.slate : C.chalk,
                opacity: playerName === exclude ? 0.4 : 1,
                cursor: playerName === exclude ? "not-allowed" : "pointer",
                boxShadow: value === playerName ? `0 2px 6px rgba(217, 119, 6, 0.4)` : "none",
                border: `1px solid ${value === playerName ? C.amber : C.line}`,
                ...body,
              }}
            >
              {playerName}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   SCORER SELECTION SCREEN (after openers selection)
---------------------------------------------------------------- */
function ScorerSelectionScreen({ state, dispatch }) {
  const inn = state.innings[state.current];
  const battingTeam = teamOf(state, inn.battingTeam);
  const captain = battingTeam.captain;
  const [selectedScorer, setSelectedScorer] = useState("");
  const [powerplayOvers, setPowerplayOvers] = useState(state.powerplayOvers || 6);
  const [maxOversPerBowler, setMaxOversPerBowler] = useState(state.maxOversPerBowler || 4);

  const ready = selectedScorer && selectedScorer !== "";

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <div className="text-center pt-2">
        <div style={{ ...display, fontSize: 28, color: C.amber }}>
           ASSIGN SCORER
        </div>
        <div className="text-sm mt-2" style={{ color: C.chalkDim, ...body }}>
          Captain: <span style={{ color: C.amber, fontWeight: "bold" }}>{captain}</span>
        </div>
        <div className="text-sm mt-1" style={{ color: C.chalkDim, ...body }}>
          Select one of the batting team members to score this inning
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
        <div className="text-xs uppercase mb-3" style={{ color: C.slate, ...body, letterSpacing: "0.1em" }}>
          Scoring Team: {battingTeam.name}
        </div>
        <div className="flex flex-wrap gap-2">
          {battingTeam.players.map((player) => (
            <button
              key={player}
              onClick={() => setSelectedScorer(player)}
              className="px-3 py-2 rounded-lg text-sm font-medium"
              style={{
                background: selectedScorer === player ? C.sky : C.night,
                color: selectedScorer === player ? C.ink : C.chalk,
                ...body,
              }}
            >
              {player}
            </button>
          ))}
        </div>
      </div>

      {/* Match Settings - Powerplay & Max Overs */}
      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
        <div className="text-xs uppercase mb-3" style={{ color: C.slate, ...body, letterSpacing: "0.1em" }}>
          ⚙️ Match Settings (Confirm/Adjust)
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs" style={{ color: C.chalkDim, ...body }}>
              Powerplay Overs
            </label>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => setPowerplayOvers(Math.max(1, powerplayOvers - 1))}
                className="px-2 py-1 rounded text-sm"
                style={{ background: C.night, color: C.amber, ...body }}
              >
                −
              </button>
              <input
                type="number"
                value={powerplayOvers}
                onChange={(e) => setPowerplayOvers(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 px-2 py-1 rounded text-center text-sm outline-none"
                style={{ background: C.night, color: C.amber, ...display }}
                min="1"
              />
              <button
                onClick={() => setPowerplayOvers(Math.min(state.oversLimit, powerplayOvers + 1))}
                className="px-2 py-1 rounded text-sm"
                style={{ background: C.night, color: C.amber, ...body }}
              >
                +
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs" style={{ color: C.chalkDim, ...body }}>
              Max Overs/Bowler
            </label>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => setMaxOversPerBowler(Math.max(1, maxOversPerBowler - 1))}
                className="px-2 py-1 rounded text-sm"
                style={{ background: C.night, color: C.amber, ...body }}
              >
                −
              </button>
              <input
                type="number"
                value={maxOversPerBowler}
                onChange={(e) => setMaxOversPerBowler(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 px-2 py-1 rounded text-center text-sm outline-none"
                style={{ background: C.night, color: C.amber, ...display }}
                min="1"
              />
              <button
                onClick={() => setMaxOversPerBowler(Math.min(state.oversLimit, maxOversPerBowler + 1))}
                className="px-2 py-1 rounded text-sm"
                style={{ background: C.night, color: C.amber, ...body }}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="text-xs mt-2" style={{ color: C.chalkDim, ...body }}>
          Total overs in match: <span style={{ color: C.chalk, fontWeight: 600 }}>{state.oversLimit}</span>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
        <div className="text-xs uppercase mb-2" style={{ color: C.chalk, ...body, letterSpacing: "0.1em" }}>
          ️ Scorer Responsibilities
        </div>
        <div className="text-xs" style={{ color: C.chalkDim, ...body, lineHeight: "1.5" }}>
           Only ONE scorer can access scoring interface at a time<br/>
           Scorer can change wicket-keeper during the match<br/>
           ✓ Scorer CAN also play as a batsman or bowler<br/>
           Changes between innings
        </div>
      </div>

      <button
        disabled={!ready}
        onClick={() => dispatch({ type: "SET_SCORER", scorer: selectedScorer, captain, powerplayOvers, maxOversPerBowler })}
        className="w-full py-4 rounded-2xl text-2xl mt-4 font-bold active:scale-95 transition-all"
        style={{
          background: ready ? C.sky : C.line,
          color: ready ? C.ink : C.slate,
          ...display,
          letterSpacing: "0.06em",
          opacity: ready ? 1 : 0.5,
          cursor: ready ? "pointer" : "not-allowed",
          boxShadow: ready ? "0 2px 8px rgba(15, 155, 207, 0.3)" : "none",
        }}
      >
         Assign Scorer
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------
   SCOREBOARD (signature element)
---------------------------------------------------------------- */
function Scoreboard({ state }) {
  // Safety check for incomplete state
  if (!state || !state.innings || !state.innings[state.current]) {
    return null;
  }
  
  const inn = state.innings[state.current];
  const battingTeam = teamOf(state, inn.battingTeam);
  const overLabel = `${oversStr(inn.legalBalls)} / ${state.oversLimit}`;
  const ballsLeft = state.oversLimit * 6 - inn.legalBalls;
  
  // Safe calculation for need and reqRR - handle NaN/undefined
  const need = (inn.target !== null && inn.target !== undefined && inn.runs !== undefined) 
    ? Math.max(0, inn.target - inn.runs) 
    : null;
  const reqRR = (inn.target !== null && inn.target !== undefined && ballsLeft > 0 && need !== null) 
    ? ((need / ballsLeft) * 6).toFixed(2) 
    : null;

  const overNum = currentOverNumber(inn.legalBalls);
  // Safety check: timeline might be undefined when following a live match
  const thisOverBalls = (inn.timeline || []).filter((b) => b.over === overNum);

  return (
    <div className="rounded-2xl p-4 mb-3" style={{ background: C.night, border: `1px solid ${C.line}` }}>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
            {battingTeam.name}
          </div>
          <div className="flex items-baseline gap-2">
            <span style={{ ...display, fontSize: 52, color: C.amber, lineHeight: 1 }}>
              {inn.runs}-{inn.wickets}
            </span>
            <span style={{ ...display, fontSize: 20, color: C.chalkDim }}>({overLabel} ov)</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs" style={{ color: C.slate, ...body }}>
            RUN RATE
          </div>
          <div style={{ ...display, fontSize: 24, color: C.chalk }}>{rr(inn.runs, inn.legalBalls)}</div>
        </div>
      </div>

      {need !== null && reqRR !== null && (
        <div className="mt-2 pt-2 text-sm flex justify-between" style={{ borderTop: `1px solid ${C.line}`, color: C.amberSoft, ...body }}>
          <span>
            Need {need} off {ballsLeft} balls
          </span>
          <span>RRR {reqRR}</span>
        </div>
      )}

      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {thisOverBalls.length === 0 && (
          <span className="text-xs" style={{ color: C.slate, ...body }}>
            New over
          </span>
        )}
        {thisOverBalls.map((b, i) => (
          <Chip key={i} kind={b.kind}>
            {b.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/*  NEW: Ball-by-ball commentary display (last 30 balls) */
function CommentaryPanel({ state }) {
  if (!state.commentary || state.commentary.length === 0) {
    return (
      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
        <div className="text-xs" style={{ color: C.slate, ...body }}>
          Commentary will appear here as the match progresses...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-4 mb-3" style={{ background: C.night, border: `1px solid ${C.line}` }}>
      <div className="text-xs uppercase mb-3" style={{ color: C.slate, ...body, letterSpacing: "0.1em" }}>
         Ball-by-Ball Commentary (Last {state.commentary.length} balls)
      </div>
      
      <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
        {[...state.commentary].reverse().map((entry, idx) => (
          <div 
            key={idx}
            className="text-xs px-2 py-1.5 rounded"
            style={{
              background: C.nightSoft,
              color: entry.commentary && entry.commentary.includes("WICKET") ? C.crimson : C.chalk,
              fontWeight: entry.commentary && entry.commentary.includes("WICKET") ? "bold" : "normal",
              borderLeft: entry.commentary && entry.commentary.includes("WICKET") ? `3px solid ${C.crimson}` : `3px solid ${C.amber}`,
              ...body,
            }}
          >
            <div style={{ color: C.amberSoft, fontSize: "10px", marginBottom: "0.25rem" }}>
              Over {entry.over}  Ball {entry.ballNumber}
            </div>
            <div>{entry.commentary || "No commentary available"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/*  Commentary Tab: Last 6 balls in reverse chronological order */
function CommentaryTabLast6({ state }) {
  if (!state.commentary || state.commentary.length === 0) {
    return (
      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
        <div className="text-xs" style={{ color: C.slate, ...body }}>
          No balls bowled yet. Commentary will appear here as the match progresses...
        </div>
      </div>
    );
  }

  // Get last 6 balls and reverse for display (most recent first)
  const last6Balls = state.commentary.slice(-6).reverse();

  return (
    <div className="flex flex-col gap-3">
      <div style={{ ...display, fontSize: 18, color: C.amber, marginBottom: 8 }}>
        Last 6 Balls
      </div>
      
      {last6Balls.length === 0 ? (
        <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
          <div className="text-xs" style={{ color: C.slate, ...body }}>
            No commentary available yet...
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {last6Balls.map((entry, idx) => (
            <div 
              key={idx}
              className="rounded-lg p-3 transition-all"
              style={{
                background: entry.commentary && entry.commentary.includes("WICKET") ? `${C.crimson}20` : C.nightSoft,
                color: entry.commentary && entry.commentary.includes("WICKET") ? C.crimson : C.chalk,
                fontWeight: entry.commentary && entry.commentary.includes("WICKET") ? "bold" : "normal",
                border: entry.commentary && entry.commentary.includes("WICKET") ? `2px solid ${C.crimson}` : `1px solid ${C.line}`,
                ...body,
              }}
            >
              <div className="flex items-start justify-between mb-1">
                <div style={{ color: C.amberSoft, fontSize: "11px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Over {entry.over} • Ball {entry.ballNumber}
                </div>
                {entry.runs !== undefined && (
                  <div style={{ ...display, fontSize: "16px", color: C.amber }}>
                    {entry.runs} {entry.kind && `(${entry.kind})`}
                  </div>
                )}
              </div>
              <div style={{ fontSize: "13px", lineHeight: "1.5", color: C.chalk }}>
                {entry.commentary || "No commentary"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BatBowlLine({ state }) {
  // Safety check for incomplete state
  if (!state || !state.innings || !state.innings[state.current]) {
    return null;
  }
  
  const inn = state.innings[state.current];
  
  //  FIX #3: Validate batsmen are not out before displaying
  // Shows waiting message if either batsman position is empty or out
  if (!inn.striker || !inn.nonStriker) {
    return (
      <div className="rounded-2xl p-4 mb-3 text-sm" style={{ background: C.nightSoft, border: `1px solid ${C.line}`, ...body }}>
        <div style={{ color: '#fbbf24', fontStyle: 'italic' }}> Waiting for next batsman...</div>
      </div>
    );
  }
  
  const s = inn.batsmen[inn.striker];
  const n = inn.batsmen[inn.nonStriker];
  
  // Safety check for null batsman objects
  if (!s || !n) {
    return (
      <div className="rounded-2xl p-4 mb-3 text-sm" style={{ background: C.nightSoft, border: `1px solid ${C.line}`, ...body }}>
        <div style={{ color: '#ef4444' }}>️ Invalid batsman data</div>
      </div>
    );
  }
  
  // Check if batsmen are out (shouldn't happen with Fix #1, but defensive)
  if (s.out || n.out) {
    return (
      <div className="rounded-2xl p-4 mb-3 text-sm" style={{ background: C.nightSoft, border: `1px solid ${C.line}`, ...body }}>
        <div style={{ color: '#fbbf24', fontStyle: 'italic' }}> Waiting for new batsman...</div>
      </div>
    );
  }
  
  const b = inn.bowlers && inn.bowler ? inn.bowlers[inn.bowler] : null;
  if (!b) {
    return (
      <div className="rounded-2xl p-4 mb-3 text-sm" style={{ background: C.nightSoft, border: `1px solid ${C.line}`, ...body }}>
        <div style={{ color: C.chalkDim }}>Loading bowler data...</div>
      </div>
    );
  }
  
  return (
    <div className="rounded-2xl p-4 mb-3" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
      {/* Batting Section Header */}
      <div className="text-xs uppercase mb-2" style={{ color: C.amber, ...body, letterSpacing: "0.08em" }}>
        Batting
      </div>
      
      {/* Current Batsmen */}
      <div className="flex flex-col gap-1 mb-3">
        <Row name={`${inn.striker} *`} stat={`${s.runs} (${s.balls})`} label="Striker" highlight />
        <Row name={inn.nonStriker} stat={`${n.runs} (${n.balls})`} label="Non-Striker" />
      </div>
      
      {/* Bowling Section Header */}
      <div className="text-xs uppercase mt-3 mb-2" style={{ color: C.amberSoft, ...body, letterSpacing: "0.08em", borderTop: `1px solid ${C.line}`, paddingTop: "8px" }}>
        Bowling
      </div>
      
      {/* Current Bowler Stats */}
      <div className="flex justify-between items-start text-sm" style={{ color: C.chalk }}>
        <div>
          <div style={{ color: C.chalkDim, fontSize: "11px", marginBottom: "2px" }}>Bowler</div>
          <div style={{ ...display, fontSize: "16px" }}>{inn.bowler}</div>
        </div>
        <div className="text-right">
          <div style={{ color: C.chalkDim, fontSize: "11px", marginBottom: "2px" }}>O-R-W</div>
          <div style={{ ...display, fontSize: "16px" }}>
            {oversStr(b.legalBalls)}-{b.runs}-{b.wickets}
          </div>
        </div>
      </div>
    </div>
  );
}
function Row({ name, stat, label, highlight }) {
  return (
    <div className="flex justify-between py-1" style={{ color: highlight ? C.chalk : C.chalkDim, fontWeight: highlight ? 700 : 400 }}>
      <div className="flex-1">
        <div style={{ fontSize: "11px", color: highlight ? C.amberSoft : C.slate, marginBottom: "2px" }}>{label}</div>
        <div>{name}</div>
      </div>
      <div className="text-right">
        <div style={{ fontSize: "11px", color: C.slate, marginBottom: "2px" }}>Runs (Balls)</div>
        <div style={{ ...display, fontSize: "18px" }}>{stat}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   SQUADS DISPLAY (Both teams)
---------------------------------------------------------------- */
function SquadsDisplay({ state }) {
  if (!state.teamA || !state.teamB) return null;

  const maxPlayers = Math.max(state.teamA.players?.length || 0, state.teamB.players?.length || 0);
  const teamAPlayers = state.teamA.players || [];
  const teamBPlayers = state.teamB.players || [];

  return (
    <div className="px-4 py-6">
      {/* Header with team names */}
      <div className="flex gap-4 mb-4">
        <div className="flex-1">
          <div style={{ ...display, fontSize: 20, color: C.amber, textAlign: "center" }}>
            {state.teamA.name}
          </div>
        </div>
        <div className="flex-1">
          <div style={{ ...display, fontSize: 20, color: C.amber, textAlign: "center" }}>
            {state.teamB.name}
          </div>
        </div>
      </div>

      {/* Players in two-column layout */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: maxPlayers }).map((_, idx) => {
          const playerA = teamAPlayers[idx];
          const playerB = teamBPlayers[idx];

          return (
            <div key={idx} className="flex gap-4">
              {/* Team A Player */}
              <div className="flex-1">
                {playerA ? (
                  <div
                    className="px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: playerA === state.teamA.captain ? C.amberSoft : C.nightSoft,
                      color: playerA === state.teamA.captain ? C.ink : C.chalk,
                      border: `1px solid ${C.line}`,
                      ...body,
                    }}
                  >
                    {playerA}
                    {playerA === state.teamA.captain && <span style={{ marginLeft: "0.3rem" }}>👨‍💼</span>}
                    {playerA === state.teamA.wicketKeeper && <span style={{ marginLeft: "0.3rem" }}>🧤</span>}
                  </div>
                ) : (
                  <div
                    className="px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: C.nightSoft,
                      color: C.slate,
                      border: `1px solid ${C.line}`,
                      ...body,
                    }}
                  />
                )}
              </div>

              {/* Team B Player */}
              <div className="flex-1">
                {playerB ? (
                  <div
                    className="px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: playerB === state.teamB.captain ? C.amberSoft : C.nightSoft,
                      color: playerB === state.teamB.captain ? C.ink : C.chalk,
                      border: `1px solid ${C.line}`,
                      ...body,
                    }}
                  >
                    {playerB}
                    {playerB === state.teamB.captain && <span style={{ marginLeft: "0.3rem" }}>👨‍💼</span>}
                    {playerB === state.teamB.wicketKeeper && <span style={{ marginLeft: "0.3rem" }}>🧤</span>}
                  </div>
                ) : (
                  <div
                    className="px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: C.nightSoft,
                      color: C.slate,
                      border: `1px solid ${C.line}`,
                      ...body,
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   SCORING PAD
---------------------------------------------------------------- */
function ScoringPad({ state, dispatch }) {
  const [mode, setMode] = useState(null); // null | 'noball' | 'bye' | 'legbye' | 'wicket' | 'wide' | 'changeWK' | 'transfer'
  const [howType, setHowType] = useState(null);
  const [fielder, setFielder] = useState("");
  const [runoutBatsman, setRunoutBatsman] = useState(null); // 'striker' or 'nonStriker' for runout selection
  const [runoutRuns, setRunoutRuns] = useState(0); // Runs scored on runout ball

  const autoSentRef = useRef(false); // Track if we've already auto-sent stumped wicket

  const send = (payload) => {
    // 🛡️ SAFETY: Validate payload before dispatching
    try {
      if (!payload || !payload.kind) {
        console.error('[ScoringPad] Invalid payload - cannot send:', payload);
        setMode(null); // Reset mode to prevent stuck state
        return;
      }
      // ✅ VERIFIED: Payload is valid, dispatch it
      dispatch({ type: "BALL", payload });
    } catch (err) {
      console.error('[ScoringPad] Dispatch error:', err.message);
      // Don't reset mode - allow retry
    } finally {
      // Always clear mode to prevent stuck UI
      setMode(null);
      setHowType(null);
      setFielder("");
      setRunoutBatsman(null);
      setRunoutRuns(0);
    }
  };

  // Auto-send stumped wicket if pre-selected wicket keeper exists (after render, not during)
  useEffect(() => {
    if (mode === "wicket" && howType === "stumped" && !autoSentRef.current && state.current !== undefined && state.innings && state.innings[state.current]) {
      const bowlingTeamKey = state.innings[state.current].bowlingTeam;
      const bowlingTeamName = bowlingTeamKey === "A" ? "teamA" : bowlingTeamKey === "B" ? "teamB" : bowlingTeamKey;
      const bowlingTeamData = state[bowlingTeamName];
      
      if (bowlingTeamData?.wicketKeeper) {
        autoSentRef.current = true;
        send({ kind: "wicket", how: "stumped", batRuns: 0, fielder: bowlingTeamData.wicketKeeper, runoutBatsman: null });
      }
    }
  }, [howType, mode, state]);

  // Auto-send bowled/lbw/other/retiredHurt wickets (after render, not during)
  useEffect(() => {
    try {
      if (mode === "wicket" && howType && !autoSentRef.current) {
        const bowsWithoutFielder = ["bowled", "lbw", "other", "retiredHurt"];
        if (bowsWithoutFielder.includes(howType)) {
          console.log('[ScoringPad] Auto-sending wicket:', howType);
          autoSentRef.current = true;
          send({ kind: "wicket", how: howType, batRuns: 0, fielder: null, runoutBatsman: null });
        }
      }
    } catch (err) {
      console.error('[ScoringPad] Auto-send error:', err.message);
      autoSentRef.current = true; // Prevent infinite retry
    }
  }, [howType, mode]);

  // Reset ref when mode changes away from wicket
  useEffect(() => {
    if (mode !== "wicket") {
      autoSentRef.current = false;
    }
  }, [mode]);

  if (mode === "wicket") {
    const hows = [
      { k: "bowled", l: "Bowled" },
      { k: "caught", l: "Caught" },
      { k: "lbw", l: "LBW" },
      { k: "stumped", l: "Stumped" },
      { k: "runout", l: "Run Out" },
      { k: "retiredHurt", l: "Retired Hurt" },
      { k: "other", l: "Other" },
    ];
    
    // Check if next ball is a free-hit (after no-ball)
    const isFreeHit = state.nextBallIsFreeHit === true;
    // On free-hit, only run-out is allowed
    const allowedHows = isFreeHit ? hows.filter(h => h.k === "runout") : hows;
    
    // Safety checks for incomplete state
    if (!state || !state.innings || state.innings.length === 0 || state.current === undefined || !state.innings[state.current]) {
      return <div style={{ color: C.chalk }}>Loading game state...</div>;
    }
    
    const bowlingTeamKey = state.innings[state.current].bowlingTeam;
    // Convert "A"/"B" to "teamA"/"teamB"
    const bowlingTeamName = bowlingTeamKey === "A" ? "teamA" : bowlingTeamKey === "B" ? "teamB" : bowlingTeamKey;
    const bowlingTeamData = state[bowlingTeamName];
    
    if (!bowlingTeamName || !bowlingTeamData || !bowlingTeamData.players) {
      console.error('[ScoringPad] Invalid bowling team:', { bowlingTeamKey, bowlingTeamName, bowlingTeamData });
      return <div style={{ color: C.chalk }}>Team data error...</div>;
    }
    
    const inn = state.innings[state.current];
    const fielders = bowlingTeamData.players;

    if (howType) {
      // For runout, first ask which batsman (striker or non-striker)
      if (howType === "runout" && !runoutBatsman) {
        return (
          <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.crimson}` }}>
            <div className="text-xs uppercase mb-2" style={{ color: C.crimson, ...body }}>
              Who was run out?
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <PadButton
                key="striker"
                tone="default"
                small
                onClick={() => {
                  console.log('[RUNOUT] STEP 1: Striker selected as run out batsman');
                  setRunoutBatsman("striker");
                }}
              >
                Striker: {inn.striker}
              </PadButton>
              <PadButton
                key="nonStriker"
                tone="default"
                small
                onClick={() => {
                  console.log('[RUNOUT] STEP 1: Non-striker selected as run out batsman');
                  setRunoutBatsman("nonStriker");
                }}
              >
                Non-Striker: {inn.nonStriker}
              </PadButton>
            </div>
            <button
              onClick={() => {
                setHowType(null);
              }}
              className="text-xs"
              style={{ color: C.slate, ...body }}
            >
              Back
            </button>
          </div>
        );
      }

      // Show runs input for runout (after fielder selection)
      if (howType === "runout" && runoutBatsman && fielder) {
        return (
          <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.crimson}` }}>
            <div className="text-xs uppercase mb-2" style={{ color: C.crimson, ...body }}>
              Runs on the ball?
            </div>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {[0, 1, 2, 3, 4, 5, 6].map((r) => (
                <PadButton
                  key={r}
                  tone={runoutRuns === r ? "highlight" : "default"}
                  small
                  onClick={() => {
                    console.log('[RUNOUT] STEP 3: Sending runout - batsman=' + (runoutBatsman === "striker" ? inn.striker : inn.nonStriker) + ', fielder=' + fielder + ', runs=' + r);
                    send({ kind: "wicket", how: howType, batRuns: r, fielder: fielder, runoutBatsman });
                  }}
                >
                  {r}
                </PadButton>
              ))}
            </div>
            <button
              onClick={() => {
                setFielder("");
                setHowType(null);
                setRunoutBatsman(null);
              }}
              className="text-xs"
              style={{ color: C.slate, ...body }}
            >
              Back
            </button>
          </div>
        );
      }

      // Handle stumped wicket - use pre-selected wicket keeper if available
      // (useEffect handles auto-send, so just wait for dispatch)
      if (howType === "stumped" && bowlingTeamData.wicketKeeper) {
        return null; // Auto-sent by useEffect, component will re-render after dispatch
      }

      // Show fielder selection for caught/stumped/runout
      const needsFielder = ["caught", "stumped", "runout"].includes(howType);
      if (needsFielder) {
        return (
          <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.crimson}` }}>
            <div className="text-xs uppercase mb-2" style={{ color: C.crimson, ...body }}>
              {howType === "caught" && "Who caught?"}
              {howType === "stumped" && "Wicketkeeper?"}
              {howType === "runout" && `Who ran out ${runoutBatsman === "striker" ? inn.striker : inn.nonStriker}?`}
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {fielders.map((f) => (
                <PadButton
                  key={f}
                  tone="default"
                  small
                  onClick={() => {
                    if (howType === "runout") {
                      // For runout, store fielder and ask for runs next
                      console.log('[RUNOUT] STEP 2: Fielder ' + f + ' ran out ' + (runoutBatsman === "striker" ? inn.striker : inn.nonStriker));
                      setFielder(f);
                    } else {
                      // For caught/stumped, send immediately
                      send({ kind: "wicket", how: howType, batRuns: 0, fielder: f, runoutBatsman: null });
                    }
                  }}
                >
                  {f}
                </PadButton>
              ))}
            </div>
            <button
              onClick={() => {
                setHowType(null);
                setRunoutBatsman(null);
              }}
              className="text-xs"
              style={{ color: C.slate, ...body }}
            >
              Back
            </button>
          </div>
        );
      }
      
      // For bowled/lbw/other/retiredHurt, send is handled by useEffect
      // Show waiting message while processing
      return (
        <div className="rounded-2xl p-4 text-center" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
          <div className="text-xs" style={{ color: C.chalkDim, ...body }}>
            Recording {howType}...
          </div>
        </div>
      );
    }

    // Show how out selection
    return (
      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.crimson}` }}>
        <div className="text-xs uppercase mb-2" style={{ color: C.crimson, ...body }}>
          {isFreeHit ? " FREE HIT - Only Run Out allowed" : "How out?"}
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {allowedHows.map((h) => (
            <PadButton key={h.k} tone="wicket" small onClick={() => setHowType(h.k)}>
              {h.l}
            </PadButton>
          ))}
        </div>
        <button onClick={() => setMode(null)} className="text-xs" style={{ color: C.slate, ...body }}>
          Cancel
        </button>
      </div>
    );
  }

  if (mode === "noball") {
    return (
      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.amber}` }}>
        <div className="text-xs uppercase mb-2" style={{ color: C.amber, ...body }}>
          No ball  runs off the bat?
        </div>
        <div className="grid grid-cols-4 gap-2 mb-2">
          {[0, 1, 2, 3, 4, 6].map((r) => (
            <PadButton key={r} tone={r === 6 ? "six" : r === 4 ? "four" : "run"} small onClick={() => send({ kind: "noball", batRuns: r })}>
              {r}
            </PadButton>
          ))}
        </div>
        <button onClick={() => setMode(null)} className="text-xs" style={{ color: C.slate, ...body }}>
          Cancel
        </button>
      </div>
    );
  }

  if (mode === "bye") {
    return (
      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.sky}` }}>
        <div className="text-xs uppercase mb-2" style={{ color: C.chalk, ...body }}>
          Byes  runs off the bat?
        </div>
        <div className="grid grid-cols-4 gap-2 mb-2">
          {[0, 1, 2, 3, 4].map((r) => (
            <PadButton key={r} tone={r === 4 ? "four" : r > 4 ? "six" : "run"} small onClick={() => send({ kind: "bye", runs: r })}>
              {r}
            </PadButton>
          ))}
        </div>
        <button onClick={() => setMode(null)} className="text-xs" style={{ color: C.slate, ...body }}>
          Cancel
        </button>
      </div>
    );
  }

  if (mode === "legbye") {
    return (
      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.sky}` }}>
        <div className="text-xs uppercase mb-2" style={{ color: C.chalk, ...body }}>
          Leg byes  runs off the bat?
        </div>
        <div className="grid grid-cols-4 gap-2 mb-2">
          {[0, 1, 2, 3, 4].map((r) => (
            <PadButton key={r} tone={r === 4 ? "four" : r > 4 ? "six" : "run"} small onClick={() => send({ kind: "legbye", runs: r })}>
              {r}
            </PadButton>
          ))}
        </div>
        <button onClick={() => setMode(null)} className="text-xs" style={{ color: C.slate, ...body }}>
          Cancel
        </button>
      </div>
    );
  }

  if (mode === "wide") {
    return (
      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.amber}` }}>
        <div className="text-xs uppercase mb-2" style={{ color: C.amber, ...body }}>
          Wide  runs off the bat?
        </div>
        <div className="grid grid-cols-5 gap-2 mb-2">
          {[0, 1, 2, 3, 4].map((r) => (
            <PadButton key={r} tone={r === 4 ? "four" : r > 4 ? "six" : "extra"} small onClick={() => send({ kind: "wide", extraRuns: r })}>
              {r}
            </PadButton>
          ))}
        </div>
        <button onClick={() => setMode(null)} className="text-xs" style={{ color: C.slate, ...body }}>
          Cancel
        </button>
      </div>
    );
  }

  if (mode === "changeWK") {
    //  NEW: Change wicket-keeper interface (only for current scorer)
    if (state.currentScorer !== state.innings[state.current].striker && 
        state.currentScorer !== state.innings[state.current].nonStriker) {
      // Scorer is typically not batting, so check authorization by name
    }
    
    const bowlingTeamKey = state.innings[state.current].bowlingTeam;
    const bowlingTeam = teamOf(state, bowlingTeamKey);
    const currentWK = bowlingTeam.wicketKeeper;
    
    return (
      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.sky}` }}>
        <div className="text-xs uppercase mb-2" style={{ color: C.chalk, ...body }}>
           Change Wicket-Keeper
        </div>
        <div className="text-xs mb-3" style={{ color: C.chalkDim, ...body }}>
          Current: <span style={{ fontWeight: "bold" }}>{currentWK || "Not selected"}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {bowlingTeam.players.map((player) => (
            <PadButton
              key={player}
              tone={player === currentWK ? "wicket" : "default"}
              small
              onClick={() => {
                dispatch({ type: "CHANGE_WICKET_KEEPER", scorerName: state.currentScorer, newWicketKeeper: player });
                setMode(null);
              }}
            >
              {player}
              {player === currentWK && " "}
            </PadButton>
          ))}
        </div>
        <button onClick={() => setMode(null)} className="text-xs" style={{ color: C.slate, ...body }}>
          Cancel
        </button>
      </div>
    );
  }



  return (
    <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
      {/* 🏏 FREE HIT INDICATOR */}
      {state.nextBallIsFreeHit && (
        <div className="mb-3 p-2 rounded-lg text-center text-sm font-bold" style={{ background: C.amber, color: C.ink, ...body }}>
          ⚡ FREE HIT - Runs Count! (Next Legal Delivery)
        </div>
      )}
      
      <div className="grid grid-cols-3 gap-2 mb-2">
        {[0, 1, 2, 3].map((r) => (
          <PadButton key={r} tone="run" onClick={() => send({ kind: "run", runs: r })}>
            {r}
          </PadButton>
        ))}
        <PadButton tone="four" onClick={() => send({ kind: "run", runs: 4 })}>
          4
        </PadButton>
        <PadButton tone="four" onClick={() => send({ kind: "run", runs: 6 })}>
          6
        </PadButton>
      </div>
      <div className="grid grid-cols-4 gap-2 mb-2">
        <PadButton tone="extra" small onClick={() => setMode("wide")}>
          Wide
        </PadButton>
        <PadButton tone="extra" small onClick={() => setMode("noball")}>
          No Ball
        </PadButton>
        <PadButton tone="extra" small onClick={() => setMode("bye")}>
          Bye
        </PadButton>
        <PadButton tone="extra" small onClick={() => setMode("legbye")}>
          Leg Bye
        </PadButton>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PadButton tone="wicket" onClick={() => setMode("wicket")}>
          Wicket
        </PadButton>
        <PadButton
          tone="default"
          onClick={() => dispatch({ type: "UNDO" })}
          disabled={state.history.length === 0}
        >
           Undo
        </PadButton>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PadButton
          tone="default"
          onClick={() => dispatch({ type: "REDO" })}
          disabled={state.redoStack.length === 0}
        >
           Redo
        </PadButton>
        <PadButton tone="extra" onClick={() => setMode(null)}>
          Clear
        </PadButton>
      </div>
      {state.currentScorer && (
        <div className="grid grid-cols-1 gap-2 mt-2">
          <PadButton
            tone="extra"
            small
            onClick={() => setMode("changeWK")}
          >
             Change Wicket-Keeper
          </PadButton>
          <PadButton
            tone="extra"
            small
            onClick={() => setMode("transfer")}
          >
            📱 Transfer Scoring
          </PadButton>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   SELECT NEXT BATSMAN / BOWLER
---------------------------------------------------------------- */
function SelectBatsman({ state, dispatch }) {
  const inn = state.innings[state.current];
  const battingTeam = teamOf(state, inn.battingTeam);
  
  // Get available batsmen
  let available = battingTeam.players.filter((p) => {
    const batsmanData = inn.batsmen[p];
    // Include if:
    // 1. Not batted yet, OR
    // 2. Retired hurt (can return after another dismissal)
    return !batsmanData || batsmanData.retiredHurt;
  });
  
  // Filter out non-striker and current striker
  available = available.filter((p) => p !== inn.nonStriker && p !== inn.striker);
  
  // Separate retired hurt players to show them differently
  const retiredHurtPlayers = available.filter(p => inn.batsmen[p]?.retiredHurt);
  const freshBatsmen = available.filter(p => !inn.batsmen[p]?.retiredHurt);
  
  // Reorder: fresh batsmen first, then retired hurt with labels
  let displayOptions = [
    ...freshBatsmen,
    ...retiredHurtPlayers.map(p => p + " (returned)")
  ];
  
  // Create mapping for display names back to actual player names
  const optionMap = {};
  freshBatsmen.forEach(p => optionMap[p] = p);
  retiredHurtPlayers.forEach(p => optionMap[p + " (returned)"] = p);
  
  return (
    <div className="p-4">
      <div className="text-center mb-3" style={{ ...display, fontSize: 28, color: C.crimson }}>
        WICKET!
      </div>
      <PickerBlock 
        title="Next batsman" 
        options={displayOptions} 
        value="" 
        onChange={(displayName) => {
          const actualName = optionMap[displayName];
          dispatch({ type: "NEXT_BATSMAN", name: actualName, isReturningFromRetiredHurt: inn.batsmen[actualName]?.retiredHurt || false });
        }} 
      />
      
      {/* Undo/Redo buttons */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={() => dispatch({ type: "UNDO" })}
          disabled={state.history.length === 0}
          className="flex-1 py-2 rounded-lg font-semibold text-sm"
          style={{
            background: state.history.length > 0 ? C.sky : C.slate,
            color: state.history.length > 0 ? C.ink : C.chalkDim,
            ...body,
            opacity: state.history.length > 0 ? 1 : 0.5,
          }}
        >
          ↶ Undo
        </button>
        <button
          onClick={() => dispatch({ type: "REDO" })}
          disabled={state.redoStack.length === 0}
          className="flex-1 py-2 rounded-lg font-semibold text-sm"
          style={{
            background: state.redoStack.length > 0 ? C.sky : C.slate,
            color: state.redoStack.length > 0 ? C.ink : C.chalkDim,
            ...body,
            opacity: state.redoStack.length > 0 ? 1 : 0.5,
          }}
        >
          ↷ Redo
        </button>
      </div>
    </div>
  );
}
function SelectBowler({ state, dispatch }) {
  const inn = state.innings[state.current];
  const bowlingTeam = teamOf(state, inn.bowlingTeam);
  
  // Filter bowlers: not the last bowler AND not exceeded max overs
  const available = bowlingTeam.players.filter((p) => {
    const isLastBowler = p === inn.lastOverBowler && bowlingTeam.players.length > 1;
    const bowlerStats = inn.bowlers[p];
    const oversCount = bowlerStats ? Math.ceil(bowlerStats.legalBalls / 6) : 0;
    const hasExceededMax = oversCount >= state.maxOversPerBowler;
    
    return !isLastBowler && !hasExceededMax;
  });

  return (
    <div className="p-4">
      <div className="text-center mb-3" style={{ ...display, fontSize: 28, color: C.amber }}>
        OVER COMPLETE
      </div>
      
      {/* Display bowler overs stats */}
      <div className="mb-3 rounded-lg p-2" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
        <div className="text-xs uppercase mb-2" style={{ color: C.chalkDim, ...body, letterSpacing: "0.1em" }}>
          Bowler Overs Used
        </div>
        <div className="flex flex-wrap gap-1">
          {bowlingTeam.players.map((bowler) => {
            const bowlerStats = inn.bowlers[bowler];
            const oversCount = bowlerStats ? Math.ceil(bowlerStats.legalBalls / 6) : 0;
            const hasExceededMax = oversCount >= state.maxOversPerBowler;
            const isAvailable = available.includes(bowler);
            
            return (
              <span
                key={bowler}
                className="px-2 py-1 rounded text-xs"
                style={{
                  background: hasExceededMax ? C.crimson : (isAvailable ? C.grassLight : C.slate),
                  color: hasExceededMax ? C.chalk : (isAvailable ? C.ink : C.chalkDim),
                  ...body,
                  fontWeight: 600,
                }}
              >
                {bowler.split(" ")[0]}: {oversCount}/{state.maxOversPerBowler}
              </span>
            );
          })}
        </div>
      </div>
      
      {available.length > 0 ? (
        <PickerBlock title="Next bowler" options={available} value="" onChange={(name) => dispatch({ type: "NEXT_BOWLER", name })} />
      ) : (
        <div className="mb-3 p-3 rounded-lg text-center" style={{ background: C.crimson, ...body }}>
          <div style={{ color: C.chalk, fontSize: 14 }}>
            ⚠️ All bowlers have reached max {state.maxOversPerBowler} overs limit!
          </div>
        </div>
      )}
      
      {/* Undo/Redo buttons */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={() => dispatch({ type: "UNDO" })}
          disabled={state.history.length === 0}
          className="flex-1 py-2 rounded-lg font-semibold text-sm"
          style={{
            background: state.history.length > 0 ? C.sky : C.slate,
            color: state.history.length > 0 ? C.ink : C.chalkDim,
            ...body,
            opacity: state.history.length > 0 ? 1 : 0.5,
          }}
        >
          ↶ Undo
        </button>
        <button
          onClick={() => dispatch({ type: "REDO" })}
          disabled={state.redoStack.length === 0}
          className="flex-1 py-2 rounded-lg font-semibold text-sm"
          style={{
            background: state.redoStack.length > 0 ? C.sky : C.slate,
            color: state.redoStack.length > 0 ? C.ink : C.chalkDim,
            ...body,
            opacity: state.redoStack.length > 0 ? 1 : 0.5,
          }}
        >
          ↷ Redo
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   BREAK / RESULT
---------------------------------------------------------------- */
function InningsBreak({ state, dispatch }) {
  const inn1 = state.innings[0];
  const battingTeam = teamOf(state, inn1.battingTeam);
  const bowlingTeam = teamOf(state, inn1.bowlingTeam);
  const [pressed, setPressed] = useState(false); //  NEW: Visual feedback for button press
  
  return (
    <div className="p-4 flex flex-col gap-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 200px)" }}>
      {/*  NEW: Match ID and Header */}
      <div className="text-center pt-2">
        <div style={{ ...body, fontSize: 12, color: C.slate, letterSpacing: "0.05em" }}>
          Match ID: <span style={{ color: C.amber, fontWeight: 700 }}>{state.matchID}</span>
        </div>
      </div>
      
      {/* Innings break title */}
      <div className="text-center">
        <div style={{ ...display, fontSize: 30, color: C.amber }}>INNINGS BREAK</div>
        <div className="mt-2" style={{ ...display, fontSize: 46, color: C.chalk }}>
          {battingTeam.name} {inn1.runs}-{inn1.wickets}
        </div>
        <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
          ({oversStr(inn1.legalBalls)} overs)
        </div>
        <div className="mt-3 text-lg" style={{ color: C.amberSoft, ...body }}>
          {bowlingTeam.name} need {inn1.runs + 1} runs to win
        </div>
      </div>
      
      {/*  NEW: Full Scorecard */}
      <div className="mt-3">
        <ScoreCardTable inn={inn1} teamName={battingTeam.name} team={battingTeam} />
      </div>

      {/* Undo/Redo buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => dispatch({ type: "UNDO" })}
          disabled={state.history.length === 0}
          className="flex-1 py-2 rounded-lg font-semibold text-sm"
          style={{
            background: state.history.length > 0 ? C.sky : C.slate,
            color: state.history.length > 0 ? C.ink : C.chalkDim,
            ...body,
            opacity: state.history.length > 0 ? 1 : 0.5,
          }}
        >
          ↶ Undo
        </button>
        <button
          onClick={() => dispatch({ type: "REDO" })}
          disabled={state.redoStack.length === 0}
          className="flex-1 py-2 rounded-lg font-semibold text-sm"
          style={{
            background: state.redoStack.length > 0 ? C.sky : C.slate,
            color: state.redoStack.length > 0 ? C.ink : C.chalkDim,
            ...body,
            opacity: state.redoStack.length > 0 ? 1 : 0.5,
          }}
        >
          ↷ Redo
        </button>
      </div>
      
      {/*  NEW: Button with visual feedback (active:scale-95 for pressed state) */}
      <button
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onMouseLeave={() => setPressed(false)}
        onClick={() => dispatch({ type: "START_SECOND_INNINGS" })}
        className="w-full py-4 rounded-2xl text-2xl font-bold active:scale-95 transition-transform"
        style={{
          background: pressed ? C.amberSoft : C.amber,
          color: C.ink,
          ...display,
          letterSpacing: "0.06em",
          transform: pressed ? "scale(0.95)" : "scale(1)",
          transition: "all 0.1s ease"
        }}
      >
         Start 2nd Innings
      </button>
    </div>
  );
}

/**
 * Calculate bowler figures including maidens
 * Returns { overs, balls, maidens, runs, wickets }
 */
function calculateBowlerFigures(inn, bowlerName) {
  const bowler = inn.bowlers[bowlerName];
  if (!bowler) return { overs: 0, balls: 0, maidens: 0, runs: 0, wickets: 0 };

  const totalOvers = Math.floor(bowler.legalBalls / 6);
  const remainingBalls = bowler.legalBalls % 6;
  
  // Find all balls bowled by this bowler
  const bowlerBalls = (inn.balls || []).filter((b) => b.bowler === bowlerName);
  
  // Track legal ball count to know which over each ball belongs to
  let legalBallCount = 0;
  let maidens = 0;
  let currentOverRuns = 0;
  
  // Go through all bowler's balls and count maidens
  for (const ball of bowlerBalls) {
    // Wide and noballs don't count as legal balls
    const isLegal = ball.kind !== "wide" && ball.kind !== "noball";
    
    if (isLegal) {
      const ballInOver = legalBallCount % 6;
      
      // Add runs from this ball to current over
      currentOverRuns += (ball.runs || 0);
      
      // If we've completed an over (reached ball 6)
      if (ballInOver === 5) {
        if (currentOverRuns === 0) {
          maidens++;
        }
        currentOverRuns = 0;
      }
      
      legalBallCount++;
    }
  }
  
  return {
    overs: totalOvers,
    balls: remainingBalls,
    maidens,
    runs: bowler.runs,
    wickets: bowler.wickets,
  };
}

function ScoreCardTable({ inn, teamName, team }) {
  // Safety checks for undefined data when following a live match
  if (!inn) return null;
  
  const profiles = (team && team.profiles) || {};
  const battedOrder = inn.battedOrder || [];
  const batsmen = inn.batsmen || {};
  const bowlers = inn.bowlers || {};
  
  return (
    <div className="mb-4">
      <div className="text-sm mb-1" style={{ color: C.amberSoft, ...body, fontWeight: 700 }}>
        {teamName}  {inn.runs}/{inn.wickets} ({oversStr(inn.legalBalls)} ov)
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
        {battedOrder.map((name) => {
          const b = batsmen[name];
          if (!b) return null; // Skip if batsman data missing
          return (
            <div
              key={name}
              className="flex flex-col px-3 py-1.5 text-xs"
              style={{ background: C.nightSoft, borderBottom: `1px solid ${C.line}`, color: C.chalk, ...body }}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Avatar name={name} size={18} />
                  {name}
                </span>
                <span>
                  {b.runs} ({b.balls})
                </span>
              </div>
              {b.out && (
                <div className="mt-1" style={{ color: C.amberSoft, fontSize: "10px" }}>
                  {b.howOut}
                </div>
              )}
              {!b.out && (
                <div className="mt-1" style={{ color: C.slate, fontSize: "10px" }}>
                  not out
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="rounded-xl overflow-hidden mt-2" style={{ border: `1px solid ${C.line}` }}>
        {Object.entries(bowlers).map(([name, b]) => {
          if (!b) return null; // Skip if bowler data missing
          const figures = calculateBowlerFigures(inn, name);
          const oversDisplay = figures.balls > 0 
            ? `${figures.overs}.${figures.balls}` 
            : figures.overs;
          return (
            <div
              key={name}
              className="flex justify-between px-3 py-1.5 text-xs"
              style={{ background: C.night, borderBottom: `1px solid ${C.line}`, color: C.chalkDim, ...body }}
            >
              <span>{name}</span>
              <span>
                {oversDisplay}-{figures.maidens}-{figures.runs}-{figures.wickets}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResultScreen({ state, dispatch, readOnly, onHome }) {
  const [activeTab, setActiveTab] = useState("side-by-side");
  const inn1 = state.innings && state.innings[0] ? state.innings[0] : null;
  const inn2 = state.innings && state.innings[1] ? state.innings[1] : null;
  
  // Safety check - if we don't have both innings, show error
  if (!inn1 || !inn2) {
    return (
      <div className="text-center pt-6">
        <div style={{ ...display, fontSize: 28, color: C.crimson }}>Error Loading Match Result</div>
        <div className="mt-2" style={{ ...body, color: C.slate }}>Both innings are required to display result</div>
        {onHome && (
          <button onClick={onHome} className="mt-4 px-4 py-2 rounded" style={{ background: C.amber, color: C.night }}>
            Go Home
          </button>
        )}
      </div>
    );
  }
  
  // 🏏 Check if super over was played (4 innings total)
  const hasSuperOver = state.innings && state.innings.length === 4;
  const inn3 = state.innings && state.innings[2] ? state.innings[2] : null;
  const inn4 = state.innings && state.innings[3] ? state.innings[3] : null;
  
  // Display super over results if super over was played, otherwise main match results
  let resultInn1 = inn1;
  let resultInn2 = inn2;
  let resultText = "";
  
  if (hasSuperOver && inn3 && inn4) {
    // Super over was played - display super over results
    resultInn1 = inn3;
    resultInn2 = inn4;
    const team1SO = teamOf(state, inn3.battingTeam);
    const team2SO = teamOf(state, inn4.battingTeam);
    
    if (inn4.runs >= inn3.runs + 1) {
      const wLeft = maxWicketsFor(team2SO.players) - inn4.wickets;
      resultText = `🏏 SUPER OVER - ${team2SO.name} won by ${wLeft} wicket${wLeft === 1 ? "" : "s"}`;
    } else if (inn4.runs === inn3.runs) {
      resultText = "🏏 SUPER OVER - Still tied! (Rare outcome)";
    } else {
      resultText = `🏏 SUPER OVER - ${team1SO.name} won by ${inn3.runs - inn4.runs} run${inn3.runs - inn4.runs === 1 ? "" : "s"}`;
    }
  } else {
    // No super over - display main match results
    const team1 = teamOf(state, inn1.battingTeam);
    const team2 = teamOf(state, inn2.battingTeam);
    
    if (inn2.runs >= inn1.runs + 1) {
      const wLeft = maxWicketsFor(team2.players) - inn2.wickets;
      resultText = `${team2.name} won by ${wLeft} wicket${wLeft === 1 ? "" : "s"}`;
    } else if (inn2.runs === inn1.runs) {
      resultText = "Match tied";
    } else {
      resultText = `${team1.name} won by ${inn1.runs - inn2.runs} run${inn1.runs - inn2.runs === 1 ? "" : "s"}`;
    }
  }
  
  const team1 = teamOf(state, resultInn1.battingTeam);
  const team2 = teamOf(state, resultInn2.battingTeam);

  const awards = useMemo(() => computeAwards(state), [state]);
  const extras1 = extrasSummary(resultInn1);
  const extras2 = extrasSummary(resultInn2);
  const boundaries = (inn) =>
    Object.values(inn.batsmen).reduce((acc, b) => ({ fours: acc.fours + b.fours, sixes: acc.sixes + b.sixes }), {
      fours: 0,
      sixes: 0,
    });
  const b1 = boundaries(resultInn1);
  const b2 = boundaries(resultInn2);
  const potmProfile =
    awards &&
    ((team1.profiles && team1.profiles[awards.name]) || (team2.profiles && team2.profiles[awards.name]));

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="text-center pt-4">
        <div style={{ ...display, fontSize: 28, color: C.amber }}>MATCH RESULT</div>
        <div className="mt-2" style={{ ...display, fontSize: 32, color: C.chalk, lineHeight: 1.2 }}>
          {resultText}
        </div>
      </div>

      {awards && (
        <div
          className="rounded-2xl p-4 flex items-center gap-3"
          style={{ background: `linear-gradient(135deg, ${C.grass}, ${C.nightSoft})`, border: `1px solid ${C.amber}` }}
        >
          <Avatar name={awards.name} size={48} />
          <div>
            <div className="text-[10px] uppercase" style={{ color: C.amberSoft, ...body, letterSpacing: "0.1em" }}>
              Player of the Match
            </div>
            <div style={{ ...display, fontSize: 22, color: C.chalk }}>{awards.name}</div>
            <div className="text-xs" style={{ color: C.chalkDim, ...body }}>
              {awards.team} · {awards.line}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-xs" style={{ ...body }}>
        <div className="rounded-xl p-3" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
          <div style={{ color: C.amberSoft, fontWeight: 700, marginBottom: 4 }}>{team1.name}</div>
          <div style={{ color: C.chalkDim }}>
            Boundaries: {b1.fours}×4, {b1.sixes}×6
          </div>
          <div style={{ color: C.chalkDim }}>
            Extras: {extras1.wides + extras1.noballs + extras1.byes + extras1.legbyes} (wd {extras1.wides}, nb{" "}
            {extras1.noballs}, b {extras1.byes}, lb {extras1.legbyes})
          </div>
        </div>
        <div className="rounded-xl p-3" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
          <div style={{ color: C.amberSoft, fontWeight: 700, marginBottom: 4 }}>{team2.name}</div>
          <div style={{ color: C.chalkDim }}>
            Boundaries: {b2.fours}×4, {b2.sixes}×6
          </div>
          <div style={{ color: C.chalkDim }}>
            Extras: {extras2.wides + extras2.noballs + extras2.byes + extras2.legbyes} (wd {extras2.wides}, nb{" "}
            {extras2.noballs}, b {extras2.byes}, lb {extras2.legbyes})
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setActiveTab("side-by-side")}
          className="flex-1 py-2 rounded-lg text-xs font-bold"
          style={{
            background: activeTab === "side-by-side" ? C.amber : C.line,
            color: activeTab === "side-by-side" ? C.ink : C.chalk,
            ...body
          }}
        >
           Both
        </button>
        <button
          onClick={() => setActiveTab("team1")}
          className="flex-1 py-2 rounded-lg text-xs font-bold"
          style={{
            background: activeTab === "team1" ? C.amber : C.line,
            color: activeTab === "team1" ? C.ink : C.chalk,
            ...body
          }}
        >
          {team1.name}
        </button>
        <button
          onClick={() => setActiveTab("team2")}
          className="flex-1 py-2 rounded-lg text-xs font-bold"
          style={{
            background: activeTab === "team2" ? C.amber : C.line,
            color: activeTab === "team2" ? C.ink : C.chalk,
            ...body
          }}
        >
          {team2.name}
        </button>
      </div>

      {activeTab === "side-by-side" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ScoreCardTable inn={resultInn1} teamName={team1.name} team={team1} />
          <ScoreCardTable inn={resultInn2} teamName={team2.name} team={team2} />
        </div>
      )}
      {activeTab === "team1" && (
        <ScoreCardTable inn={resultInn1} teamName={team1.name} team={team1} />
      )}
      {activeTab === "team2" && (
        <ScoreCardTable inn={resultInn2} teamName={team2.name} team={team2} />
      )}

      {/* 🏏 Undo/Redo buttons for editing last ball (when not in read-only mode) */}
      {!readOnly && (
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => dispatch({ type: "UNDO" })}
            className="flex-1 py-3 rounded-xl text-sm font-bold"
            style={{
              background: C.nightSoft,
              color: C.amberSoft,
              border: `1px solid ${C.amber}`,
              cursor: 'pointer',
              ...body
            }}
          >
            ↶ Undo Last Ball
          </button>
          <button
            onClick={() => dispatch({ type: "REDO" })}
            className="flex-1 py-3 rounded-xl text-sm font-bold"
            style={{
              background: C.nightSoft,
              color: C.chalkDim,
              border: `1px solid ${C.slate}`,
              cursor: 'pointer',
              ...body
            }}
          >
            ↷ Redo
          </button>
        </div>
      )}

      {/* Match action buttons */}
      {!readOnly && (
        <div className="flex flex-col gap-2">
          {/* Share Match Summary Button */}
          <button
            onClick={() => {
              const summary = `🏏 ${resultText}\n\n${team1.name}: ${resultInn1.runs}/${resultInn1.wickets} (${Math.ceil((resultInn1.balls.length || 0) / 6)}.${((resultInn1.balls.length || 0) % 6)} overs)\n${team2.name}: ${resultInn2.runs}/${resultInn2.wickets} (${Math.ceil((resultInn2.balls.length || 0) / 6)}.${((resultInn2.balls.length || 0) % 6)} overs)\n\n🏆 Player of the Match: ${awards?.name || "N/A"}`;
              if (navigator.share) {
                navigator.share({ title: 'Match Result', text: summary });
              } else {
                navigator.clipboard.writeText(summary);
                alert('Match summary copied to clipboard!');
              }
            }}
            className="w-full py-3 rounded-xl text-sm font-semibold"
            style={{ background: C.grassLight, color: C.ink, ...body }}
          >
            📸 Share Result
          </button>

          {/* Undo/Redo buttons for last-minute corrections */}
          <div className="flex gap-2">
            <button
              onClick={() => dispatch({ type: "UNDO" })}
              disabled={state.history.length === 0}
              className="flex-1 py-2 rounded-lg font-semibold text-sm"
              style={{
                background: state.history.length > 0 ? C.sky : C.slate,
                color: state.history.length > 0 ? C.ink : C.chalkDim,
                ...body,
                opacity: state.history.length > 0 ? 1 : 0.5,
              }}
            >
              ↶ Undo
            </button>
            <button
              onClick={() => dispatch({ type: "REDO" })}
              disabled={state.redoStack.length === 0}
              className="flex-1 py-2 rounded-lg font-semibold text-sm"
              style={{
                background: state.redoStack.length > 0 ? C.sky : C.slate,
                color: state.redoStack.length > 0 ? C.ink : C.chalkDim,
                ...body,
                opacity: state.redoStack.length > 0 ? 1 : 0.5,
              }}
            >
              ↷ Redo
            </button>
          </div>

          {/* If main match is tied AND no super over played yet, offer super over option */}
          {!hasSuperOver && inn1.runs === inn2.runs && (
            <button
              onClick={() => dispatch({ type: "START_SUPER_OVER" })}
              className="w-full py-4 rounded-2xl text-2xl"
              style={{ background: C.amber, color: C.ink, ...display, letterSpacing: "0.06em" }}
            >
              ⚡ Super Over
            </button>
          )}
          
          {/* If not tied, show New Match button */}
          {/* Show New Match button if: main match had a winner, OR super over was played */}
          {(hasSuperOver || inn1.runs !== inn2.runs) && (
            <button
              onClick={() => {
                dispatch({ type: "RESET" });
                if (onHome) onHome();
              }}
              className="w-full py-4 rounded-2xl text-2xl"
              style={{ background: C.amber, color: C.ink, ...display, letterSpacing: "0.06em" }}
            >
              New Match
            </button>
          )}
          
          <button
            onClick={() => {
              dispatch({ type: "RESET" });
              if (onHome) onHome();
            }}
            className="w-full py-3 rounded-2xl text-lg"
            style={{ background: C.nightSoft, color: C.chalk, border: `1px solid ${C.slate}`, ...display }}
          >
             Home
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   LIVE SHARING  match code banner, role picker, follower view
---------------------------------------------------------------- */
function MatchCodeBanner({ code }) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      className="mx-4 mb-3 rounded-xl px-3 py-2 flex items-center justify-between"
      style={{ background: C.nightSoft, border: `1px dashed ${C.amber}` }}
    >
      <div>
        <div className="text-[10px] uppercase" style={{ color: C.slate, ...body, letterSpacing: "0.1em" }}>
          Share this code to follow live
        </div>
        <div style={{ ...display, fontSize: 22, color: C.amber, letterSpacing: "0.15em" }}>{code}</div>
      </div>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch (e) {
            // clipboard not available  ignore, code is visible to copy manually
          }
        }}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold"
        style={{ background: C.amber, color: C.ink, ...body }}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

/* Ball-by-ball display for the current over */
function BallByBallDisplay({ state }) {
  // Safety check - if state or innings is undefined, return null
  if (!state || !state.innings || !Array.isArray(state.innings) || state.innings.length === 0) {
    return null;
  }
  
  const inn = state.innings[state.current];
  if (!inn) return null;

  // Get the current over number - must match the calculation used when storing balls
  const currentOver = Math.floor((inn.legalBalls - 1) / 6);

  // Extract balls from timeline (or balls array if available) that belong to the current over
  const ballsArray = inn.timeline || inn.balls || [];
  const currentOverBalls = ballsArray.filter((b) => {
    // Timeline has "over" property, balls array has "legalBalls" property
    if (b.over !== undefined) {
      return b.over === currentOver;
    }
    if (b.legalBalls !== undefined) {
      // Use same formula as when saving: (legalBalls - 1) / 6
      const ballOver = Math.floor((b.legalBalls - 1) / 6);
      return ballOver === currentOver;
    }
    return false;
  });

  if (currentOverBalls.length === 0) {
    return (
      <div className="mx-4 mb-3 rounded-xl p-3" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
        <div className="text-[10px] uppercase mb-2" style={{ color: C.slate, ...body, letterSpacing: "0.1em" }}>
          Over {currentOver} · New over
        </div>
      </div>
    );
  }

  const getBallDisplay = (ball) => {
    if (ball.kind === "run") return `${ball.runs}`;
    if (ball.kind === "wide") return `W${ball.extraRuns || 0}`;
    if (ball.kind === "noball") return `NB${ball.batRuns}`;
    if (ball.kind === "bye") return `B${ball.runs}`;
    if (ball.kind === "legbye") return `LB${ball.runs}`;
    if (ball.kind === "wicket") return `W`;
    return "?";
  };

  const getBallColor = (ball) => {
    if (ball.kind === "wicket") return C.crimson;
    if (ball.kind === "wide" || ball.kind === "noball") return C.amber;
    if (ball.kind === "bye" || ball.kind === "legbye") return C.sky;
    return C.chalk;
  };

  return (
    <div className="mx-4 mb-3 rounded-xl p-3" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
      <div className="text-[10px] uppercase mb-2" style={{ color: C.slate, ...body, letterSpacing: "0.1em" }}>
        Over {currentOver} · {currentOverBalls.length} balls
      </div>
      <div className="flex gap-2 flex-wrap">
        {currentOverBalls.map((b, i) => (
          <div
            key={i}
            className="w-8 h-8 flex items-center justify-center rounded-lg font-bold text-xs"
            style={{
              background: C.night,
              color: getBallColor(b),
              border: `1px solid ${C.line}`,
            }}
          >
            {getBallDisplay(b)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   MATCHES MENU - Shows match history, ongoing, resume, transfer options
---------------------------------------------------------------- */
function MatchesMenuView({ onPick, onBack }) {
  const menuItems = [
    {
      id: "scheduled",
      label: "Upcoming Matches",
      description: "Browse and join upcoming matches",
      icon: "📅",
      action: () => onPick("scheduled"),
      color: C.chalk,
    },
    {
      id: "createSchedule",
      label: "Schedule a Match",
      description: "Schedule a new match and share with others",
      icon: "📝",
      action: () => onPick("schedule"),
      color: C.chalk,
    },
    {
      id: "ongoing",
      label: "Ongoing Matches",
      description: "Follow live matches being scored",
      icon: "🔴",
      action: () => onPick("ongoing"),
      color: C.chalk,
    },
    {
      id: "resume",
      label: "Resume Scoring",
      description: "Continue scoring a match from this device",
      icon: "↻",
      action: () => onPick("resumeScore"),
      color: C.chalk,
    },

  ];

  return (
    <div className="flex flex-col gap-4 p-4 pt-8 pb-8">
      <button onClick={onBack} className="text-xs self-start" style={{ color: C.slate, ...body }}>
         Back
      </button>
      <div className="text-center mb-2">
        <div style={{ ...display, fontSize: 32, color: C.amber }}>MATCHES</div>
        <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
          Choose what you want to do with matches
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={item.action}
            className="rounded-2xl p-4 text-left active:scale-95 transition-all"
            style={{
              background: C.nightSoft,
              border: `1px solid ${C.line}`,
              cursor: 'pointer',
            }}
          >
            <div className="flex items-start gap-3">
              <div style={{ fontSize: 24 }}>{item.icon}</div>
              <div className="flex-1">
                <div style={{ ...display, fontSize: 18, color: item.color }}>
                  {item.label}
                </div>
                <div className="text-xs mt-1" style={{ color: C.chalkDim, ...body }}>
                  {item.description}
                </div>
              </div>
              <div style={{ color: C.amber, fontSize: 14, ...display }}>→</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ScheduledMatchesView({ onBack, onJoinMatch }) {
  const [scheduledMatches, setScheduledMatches] = useState([]);

  useEffect(() => {
    // Load scheduled matches from localStorage
    const matches = JSON.parse(localStorage.getItem("scheduled-matches") || "[]");
    setScheduledMatches(matches);
  }, []);

  const formatDateTime = (date, time) => {
    const d = new Date(`${date}T${time}`);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col gap-4 p-4 pt-8 pb-8">
      <button onClick={onBack} className="text-xs self-start" style={{ color: C.slate, ...body }}>
         Back
      </button>
      <div className="text-center mb-2">
        <div style={{ ...display, fontSize: 32, color: C.grassLight }}>📅 Upcoming Matches</div>
        <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
          {scheduledMatches.length} upcoming matches
        </div>
      </div>

      {scheduledMatches.length === 0 ? (
        <div className="rounded-2xl p-6 text-center" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
          <div className="text-3xl mb-2">📭</div>
          <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
            No upcoming matches yet. Ask your captain to schedule one!
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {scheduledMatches.map((match) => (
            <div
              key={match.id}
              className="rounded-2xl p-4"
              style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}
            >
              <div style={{ ...display, fontSize: 18, color: C.amber, marginBottom: 4 }}>
                {match.title}
              </div>
              <div className="text-xs space-y-1 mb-3" style={{ color: C.chalkDim, ...body }}>
                <div>📅 {formatDateTime(match.date, match.time)}</div>
                <div>📍 {match.venue || "Venue TBD"}</div>
                <div>🏏 {match.teamA} vs {match.teamB} ({match.overs} overs)</div>
                <div>👥 {match.joined?.length || 0} joined</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`https://cricketbuddy.web.app/match/${match.id}`);
                    alert("Match link copied!");
                  }}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: C.line, color: C.chalk, ...body }}
                >
                  📋 Copy Link
                </button>
                <button
                  onClick={() => onJoinMatch(match)}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: C.grassLight, color: C.ink, ...body }}
                >
                  ✓ Join
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleMatchScreen({ onBack }) {
  const [matchTitle, setMatchTitle] = useState("");
  const [matchDate, setMatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [matchTime, setMatchTime] = useState("10:00");
  const [teamAName, setTeamAName] = useState("Team A");
  const [teamBName, setTeamBName] = useState("Team B");
  const [oversLimit, setOversLimit] = useState(10);
  const [venue, setVenue] = useState("");
  const [createdLink, setCreatedLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleScheduleMatch = async () => {
    if (!matchTitle.trim() || !matchDate || !matchTime) {
      alert("Please fill in match title, date, and time");
      return;
    }

    setLoading(true);
    try {
      const scheduledMatchId = `sched-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(7)}`;
      const scheduledMatch = {
        id: scheduledMatchId,
        title: matchTitle.trim(),
        date: matchDate,
        time: matchTime,
        teamA: teamAName.trim(),
        teamB: teamBName.trim(),
        overs: oversLimit,
        venue: venue.trim(),
        createdAt: new Date().toISOString(),
        createdBy: localStorage.getItem("my-name") || "Unknown",
        joined: [],
      };

      // Save to localStorage
      const scheduled = JSON.parse(localStorage.getItem("scheduled-matches") || "[]");
      scheduled.push(scheduledMatch);
      localStorage.setItem("scheduled-matches", JSON.stringify(scheduled));

      // Generate shareable link (HTTPS format for browsers)
      const link = `https://cricketbuddy.web.app/match/${scheduledMatchId}`;
      setCreatedLink(link);
      setLoading(false);
    } catch (err) {
      console.error("Error scheduling match:", err);
      alert("Failed to schedule match");
      setLoading(false);
    }
  };

  if (createdLink) {
    return (
      <div className="flex flex-col gap-4 p-4 pb-8">
        <div className="text-center pt-4">
          <div style={{ ...display, fontSize: 32, color: C.grassLight }}>✓ Match Scheduled!</div>
          <div className="text-sm mt-2" style={{ color: C.chalkDim, ...body }}>
            {matchTitle} on {matchDate} at {matchTime}
          </div>
        </div>

        <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
          <div className="text-xs uppercase mb-2" style={{ color: C.sky, ...body, letterSpacing: "0.1em" }}>
            📤 Share This Link
          </div>
          <div className="text-xs mb-2" style={{ color: C.chalkDim, ...body }}>
            People can use this link from WhatsApp or messaging to register and join your match:
          </div>
          <div className="font-mono text-xs px-3 py-2 rounded mb-2 break-all" style={{ background: C.night, color: C.amber, ...body, border: `1px solid ${C.line}` }}>
            {createdLink}
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(createdLink);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="w-full py-2 rounded-lg font-semibold text-sm mb-2"
            style={{ background: C.grassLight, color: C.ink, ...body }}
          >
            {copied ? "✓ Copied!" : "📋 Copy Link"}
          </button>

          {navigator.share && (
            <button
              onClick={() => {
                navigator.share({
                  title: `Join ${matchTitle}`,
                  text: `Join my cricket match: ${matchTitle} on ${matchDate} at ${matchTime}`,
                  url: createdLink
                });
              }}
              className="w-full py-2 rounded-lg font-semibold text-sm"
              style={{ background: C.amber, color: C.ink, ...body }}
            >
              🔗 Share Match
            </button>
          )}
        </div>

        <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
          <div className="text-xs uppercase mb-2" style={{ color: C.amber, ...body, letterSpacing: "0.1em" }}>
            📋 Match Details
          </div>
          <div className="text-xs space-y-1" style={{ color: C.chalkDim, ...body }}>
            <div><span style={{ color: C.chalk, fontWeight: 600 }}>Title:</span> {matchTitle}</div>
            <div><span style={{ color: C.chalk, fontWeight: 600 }}>When:</span> {matchDate} at {matchTime}</div>
            <div><span style={{ color: C.chalk, fontWeight: 600 }}>Venue:</span> {venue || "Not specified"}</div>
            <div><span style={{ color: C.chalk, fontWeight: 600 }}>Teams:</span> {teamAName} vs {teamBName}</div>
            <div><span style={{ color: C.chalk, fontWeight: 600 }}>Overs:</span> {oversLimit}</div>
          </div>
        </div>

        <button
          onClick={() => {
            setCreatedLink("");
            setMatchTitle("");
            setMatchDate(new Date().toISOString().split('T')[0]);
            setMatchTime("10:00");
            setTeamAName("Team A");
            setTeamBName("Team B");
            setOversLimit(10);
            setVenue("");
          }}
          className="w-full py-3 rounded-xl font-semibold"
          style={{ background: C.nightSoft, color: C.chalk, border: `1px solid ${C.line}`, ...body }}
        >
          Schedule Another Match
        </button>

        <button
          onClick={onBack}
          className="w-full py-3 rounded-xl font-semibold"
          style={{ background: C.amber, color: C.ink, ...display }}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <div className="text-center pt-4">
        <div style={{ ...display, fontSize: 32, color: C.grassLight }}>📅 Schedule Match</div>
        <div className="text-sm mt-2" style={{ color: C.chalkDim, ...body }}>
          Plan your match and share the link with your team
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
        <div className="text-xs uppercase mb-2" style={{ color: C.sky, ...body, letterSpacing: "0.1em" }}>
          Match Title
        </div>
        <input
          type="text"
          value={matchTitle}
          onChange={(e) => setMatchTitle(e.target.value)}
          placeholder="e.g., Office Cup 2026"
          className="w-full px-3 py-2 rounded-lg text-lg outline-none"
          style={{ background: C.night, color: C.chalk, ...body, border: `1px solid ${C.line}` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
          <div className="text-xs uppercase mb-2" style={{ color: C.sky, ...body, letterSpacing: "0.1em" }}>
            Date
          </div>
          <input
            type="date"
            value={matchDate}
            onChange={(e) => setMatchDate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: C.night, color: C.chalk, ...body, border: `1px solid ${C.line}` }}
          />
        </div>
        <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
          <div className="text-xs uppercase mb-2" style={{ color: C.sky, ...body, letterSpacing: "0.1em" }}>
            Time
          </div>
          <input
            type="time"
            value={matchTime}
            onChange={(e) => setMatchTime(e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: C.night, color: C.chalk, ...body, border: `1px solid ${C.line}` }}
          />
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
        <div className="text-xs uppercase mb-2" style={{ color: C.sky, ...body, letterSpacing: "0.1em" }}>
          Venue
        </div>
        <input
          type="text"
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          placeholder="e.g., City Cricket Ground"
          className="w-full px-3 py-2 rounded-lg text-lg outline-none"
          style={{ background: C.night, color: C.chalk, ...body, border: `1px solid ${C.line}` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
          <div className="text-xs uppercase mb-2" style={{ color: C.sky, ...body, letterSpacing: "0.1em" }}>
            Team A
          </div>
          <input
            type="text"
            value={teamAName}
            onChange={(e) => setTeamAName(e.target.value)}
            placeholder="Team A"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: C.night, color: C.chalk, ...body, border: `1px solid ${C.line}` }}
          />
        </div>
        <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
          <div className="text-xs uppercase mb-2" style={{ color: C.sky, ...body, letterSpacing: "0.1em" }}>
            Team B
          </div>
          <input
            type="text"
            value={teamBName}
            onChange={(e) => setTeamBName(e.target.value)}
            placeholder="Team B"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: C.night, color: C.chalk, ...body, border: `1px solid ${C.line}` }}
          />
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
        <div className="text-xs uppercase mb-2" style={{ color: C.sky, ...body, letterSpacing: "0.1em" }}>
          Overs per Innings
        </div>
        <input
          type="number"
          min={1}
          max={50}
          value={oversLimit}
          onChange={(e) => setOversLimit(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
          className="w-24 px-3 py-2 rounded-lg text-lg outline-none"
          style={{ background: C.night, color: C.amber, ...display }}
        />
      </div>

      <button
        onClick={handleScheduleMatch}
        disabled={loading}
        className="w-full py-4 rounded-2xl text-2xl font-semibold active:scale-95 transition-all"
        style={{
          background: matchTitle.trim() ? C.grassLight : C.line,
          color: matchTitle.trim() ? C.ink : C.slate,
          ...display,
          opacity: loading ? 0.6 : 1,
          cursor: loading ? "not-allowed" : "pointer"
        }}
      >
        {loading ? "Creating..." : "Create & Share"}
      </button>

      <button
        onClick={onBack}
        className="w-full py-3 rounded-xl font-semibold"
        style={{ background: C.nightSoft, color: C.chalk, border: `1px solid ${C.line}`, ...body }}
      >
        Cancel
      </button>
    </div>
  );
}

function RoleSelect({ onPick, playerName, isGuest, onLogout }) {
  const [showAbout, setShowAbout] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [avatarStyle, setAvatarStyle] = useState(() => {
    const saved = localStorage.getItem("avatar-style");
    return saved ? parseInt(saved) : 1;
  });
  
  // Load notifications on mount
  useEffect(() => {
    (async () => {
      if (!isGuest) {
        const userPhone = localStorage.getItem("my-phone");
        if (userPhone) {
          try {
            const notifs = await getNotifications(userPhone);
            setNotifications(notifs || []);
          } catch (err) {
            console.error('Error loading notifications:', err);
          }
        }
      }
    })();
  }, [isGuest]);
  
  const features = [
    "Ball-by-ball live scoring with runs, wides, no balls, byes, leg byes, wickets & undo/redo",
    "Complete team management with player invitations and role-based permissions",
    "Share match codes for live team follow-along and spectator access",
    "Match history with comprehensive stats and Player of the Match selection",
    "Offline-first architecture with automatic cloud sync when online",
    "Real-time Firestore integration for multi-device scorer support",
    "Guest mode for quick ad-hoc scoring without registration",
    "Advanced undo/redo system that preserves all match state correctly",
  ];
  const email = "saitejaakula15@gmail.com";

  return (
    <div className="flex flex-col gap-4 p-4 pt-8 items-center text-center">
      <div className="w-full flex justify-between items-center mb-2">
        {!isGuest ? (
          <button
            onClick={() => onPick("profile")}
            className="flex items-center gap-2 active:scale-95 transition-all"
            style={{ color: C.chalk, fontSize: 12, ...body, cursor: 'pointer' }}
          >
            <Avatar name={playerName} size={32} avatarStyle={avatarStyle} />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <Avatar name={playerName} size={32} avatarStyle={avatarStyle} />
            <span className="px-2 py-1 rounded text-xs font-semibold" style={{ background: C.sky, color: C.ink, ...body }}>
              GUEST
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          {/* Notifications Bell */}
          {!isGuest && notifications.length > 0 && (
            <button
              onClick={() => {
                // Mark all as read
                notifications.forEach(n => markNotificationRead(n.id));
                setNotifications([]);
              }}
              className="relative active:scale-95 transition-all"
              style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer" }}
            >
              🔔
              <span
                className="absolute -top-1 -right-1 rounded-full text-xs font-bold w-5 h-5 flex items-center justify-center"
                style={{ background: C.crimson, color: C.chalk, ...body }}
              >
                {notifications.length}
              </span>
            </button>
          )}
          <button
            onClick={onLogout}
            className="text-xs px-2 py-1 rounded"
            style={{ background: isGuest ? C.crimson : C.nightSoft, color: isGuest ? C.chalk : C.slate, ...body }}
          >
            {isGuest ? "End Session" : "Logout"}
          </button>
        </div>
      </div>
      <button
        onClick={() => onPick(null)}
        style={{ ...display, fontSize: 40, color: C.amber, lineHeight: 1, background: "none", border: "none", cursor: "pointer", padding: 0 }}
        className="active:opacity-75 transition-opacity"
      >
        CRICKETBUDDY
      </button>
      <div className="text-xs uppercase mb-2" style={{ color: C.chalkDim, ...body, letterSpacing: "0.12em" }}>
        Score it like the pros
      </div>
      <div className="text-sm mb-2" style={{ color: C.chalkDim, ...body }}>
        Score the match yourself, follow along live, or help score from the other end.
      </div>
      <button
        onClick={() => onPick("score")}
        className="w-full py-4 rounded-2xl text-2xl"
        style={{ background: C.amber, color: C.ink, ...display, letterSpacing: "0.06em" }}
      >
         Score a Match
      </button>

      <button
        onClick={() => onPick("matches")}
        className="w-full py-4 rounded-2xl text-2xl"
        style={{ background: C.nightSoft, color: C.chalk, border: `1.5px solid ${C.line}`, ...display, letterSpacing: "0.06em" }}
      >
         Matches
      </button>

      <button
        onClick={() => setShowAbout((v) => !v)}
        className="text-xs mt-4"
        style={{ color: C.slate, ...body, textDecoration: "underline" }}
      >
        {showAbout ? "Hide about" : "About this app"}
      </button>

      {showAbout && (
        <div className="w-full rounded-2xl p-4 text-left" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
          <div className="text-xs uppercase mb-2" style={{ color: C.amberSoft, ...body, letterSpacing: "0.1em" }}>
            Features
          </div>
          <ul className="flex flex-col gap-1.5 mb-4">
            {features.map((f, i) => (
              <li key={i} className="text-xs flex gap-2" style={{ color: C.chalkDim, ...body }}>
                <span style={{ color: C.amber }}></span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="text-xs uppercase mb-2" style={{ color: C.amberSoft, ...body, letterSpacing: "0.1em" }}>
            Developer
          </div>
          <div className="text-sm mb-1" style={{ color: C.chalk, ...body, fontWeight: 700 }}>
            CurlyHairVibeCoder
          </div>
          <a
            href={`mailto:${email}`}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg mt-1"
            style={{ background: C.sky, color: C.ink, ...body }}
          >
            📧 {email}
          </a>
        </div>
      )}
    </div>
  );
}



function ProfileScreen({ onBack }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [stats, setStats] = useState(null);
  const [existing, setExisting] = useState(null); // profile record already in the directory, if any
  const [pinInput, setPinInput] = useState(""); // pin typed to unlock an existing profile
  const [newPin, setNewPin] = useState(""); // pin set when creating a brand-new profile
  const [unlocked, setUnlocked] = useState(false);
  const [pinError, setPinError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // auto-load this device's remembered phone number, then their profile
  useEffect(() => {
    (async () => {
      try {
        const mine = await storageGet("my-phone", false);
        if (mine && mine.value) {
          const p = normalizePhone(mine.value);
          setPhone(p);
          await lookupExisting(p, true);
        }
      } catch (e) {
        // no saved profile on this device yet  that's fine
      }
    })();
  }, []);

  const lookupExisting = async (rawPhone, isAutoload) => {
    const p = normalizePhone(rawPhone);
    if (p.length < 6) return;
    const dir = await loadDirectory();
    if (dir[p]) {
      setExisting(dir[p]);
      setStats(dir[p].stats);
      setName(dir[p].name);
      setLocation(dir[p].location || "");
      // this device already saved this phone before  trust it without re-entering the PIN
      setUnlocked(!!isAutoload);
    } else {
      setExisting(null);
      setStats(null);
      setUnlocked(false);
      if (!isAutoload) {
        setName("");
        setLocation("");
      }
    }
    setPinInput("");
    setPinError("");
  };

  const tryUnlock = () => {
    if (!existing) return;
    if (pinInput === existing.pin) {
      setUnlocked(true);
      setPinError("");
      logEvent("info", `Profile unlocked for ${existing.name}`);
    } else {
      setPinError("Incorrect PIN.");
      logEvent("error", `Wrong PIN attempt for phone ending ${normalizePhone(phone).slice(-4)}`);
    }
  };

  const save = async () => {
    const p = normalizePhone(phone);
    if (!p || !name.trim()) return;
    if (existing && !unlocked) return; // editing an existing profile requires the PIN
    if (!existing && newPin.length !== 4) return; // creating a profile requires setting a PIN

    setSaving(true);
    try {
      const dir = await loadDirectory();
      const already = dir[p];
      dir[p] = {
        phone: p,
        name: name.trim(),
        location: location.trim(),
        pin: already ? already.pin : newPin,
        stats: already ? already.stats : emptyProfileStats(),
      };
      await saveDirectory(dir);
      await storageSet("my-phone", p, false);
      setExisting(dir[p]);
      setStats(dir[p].stats);
      setUnlocked(true);
      setSaved(true);
      logEvent("info", `Profile saved for ${dir[p].name}`);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      logEvent("error", "Failed to save profile: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    normalizePhone(phone).length >= 6 &&
    name.trim().length > 0 &&
    (existing ? unlocked : newPin.length === 4);

  return (
    <div className="flex flex-col gap-4 p-4 pt-8 pb-8">
      <button onClick={onBack} className="text-xs self-start" style={{ color: C.slate, ...body }}>
         Back
      </button>
      <div className="text-center">
        <div style={{ ...display, fontSize: 32, color: C.amber }}>MY PROFILE</div>
        <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
          Protected by a 4-digit PIN so only you can edit it.
        </div>
      </div>

      <div className="flex justify-center">
        <Avatar name={name || "?"} size={84} />
      </div>

      <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
        <div>
          <div className="text-xs uppercase mb-1" style={{ color: C.slate, ...body, letterSpacing: "0.1em" }}>
            Mobile number
          </div>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={(e) => lookupExisting(e.target.value, false)}
            type="tel"
            placeholder="e.g. 9876543210"
            className="w-full px-3 py-2 rounded-lg text-lg outline-none"
            style={{ background: C.night, color: C.chalk, ...body, border: `1px solid ${C.line}` }}
          />
        </div>

        {existing && !unlocked && (
          <div className="rounded-lg p-3" style={{ background: C.night, border: `1px solid ${C.amber}` }}>
            <div className="text-xs mb-2" style={{ color: C.amberSoft, ...body }}>
              A profile already exists for this number ({existing.name}). Enter its 4-digit PIN to edit it.
            </div>
            <div className="flex gap-2">
              <input
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                type="password"
                inputMode="numeric"
                placeholder=""
                className="flex-1 px-3 py-2 rounded-lg text-lg text-center outline-none"
                style={{ background: C.nightSoft, color: C.chalk, ...display, letterSpacing: "0.3em", border: `1px solid ${C.line}` }}
              />
              <button
                onClick={tryUnlock}
                className="px-4 rounded-lg font-semibold text-sm"
                style={{ background: C.amber, color: C.ink, ...body }}
              >
                Unlock
              </button>
            </div>
            {pinError && (
              <div className="text-xs mt-1" style={{ color: C.crimson, ...body }}>
                {pinError}
              </div>
            )}
          </div>
        )}

        <div>
          <div className="text-xs uppercase mb-1" style={{ color: C.slate, ...body, letterSpacing: "0.1em" }}>
            Name
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={existing ? !unlocked : false}
            placeholder="Your name"
            className="w-full px-3 py-2 rounded-lg text-lg outline-none disabled:opacity-40"
            style={{ background: C.night, color: C.chalk, ...body, border: `1px solid ${C.line}` }}
          />
        </div>

        <div>
          <div className="text-xs uppercase mb-1" style={{ color: C.slate, ...body, letterSpacing: "0.1em" }}>
            Location (City/Region)
          </div>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={existing ? !unlocked : false}
            placeholder="e.g. Mumbai, India"
            className="w-full px-3 py-2 rounded-lg text-lg outline-none disabled:opacity-40"
            style={{ background: C.night, color: C.chalk, ...body, border: `1px solid ${C.line}` }}
          />
        </div>

        {!existing && (
          <div>
            <div className="text-xs uppercase mb-1" style={{ color: C.slate, ...body, letterSpacing: "0.1em" }}>
              Create a 4-digit PIN
            </div>
            <input
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              type="password"
              inputMode="numeric"
              placeholder=""
              className="w-full px-3 py-2 rounded-lg text-lg text-center outline-none"
              style={{ background: C.night, color: C.chalk, ...display, letterSpacing: "0.3em", border: `1px solid ${C.line}` }}
            />
            <div className="text-[10px] mt-1" style={{ color: C.slate, ...body }}>
              You'll need this PIN to edit this profile later. This app can't send real SMS codes without a
              backend, so a PIN is used instead of a text-message OTP.
            </div>
          </div>
        )}
      </div>

      {stats && stats.matches > 0 && (
        <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
          <div className="text-xs uppercase mb-2" style={{ color: C.slate, ...body, letterSpacing: "0.1em" }}>
            Career stats
          </div>
          <div className="grid grid-cols-2 gap-y-1.5 text-sm" style={{ color: C.chalk, ...body }}>
            <span>Matches</span>
            <span className="text-right">{stats.matches}</span>
            <span>Wins</span>
            <span className="text-right">{stats.wins}</span>
            <span>Runs</span>
            <span className="text-right">{stats.runs}</span>
            <span>High score</span>
            <span className="text-right">{stats.highScore}</span>
            <span>Fours / Sixes</span>
            <span className="text-right">
              {stats.fours} / {stats.sixes}
            </span>
            <span>Wickets</span>
            <span className="text-right">{stats.wickets}</span>
            <span>Best bowling</span>
            <span className="text-right">
              {stats.bestBowling.wickets}/{stats.bestBowling.runs}
            </span>
            <span>Runs conceded</span>
            <span className="text-right">{stats.runsConceded}</span>
          </div>
        </div>
      )}

      <button
        disabled={!canSave || saving}
        onClick={save}
        className="w-full py-4 rounded-2xl text-2xl"
        style={{
          background: canSave ? C.amber : C.line,
          color: canSave ? C.ink : C.slate,
          ...display,
          letterSpacing: "0.06em",
        }}
      >
        {saved ? "Saved" : saving ? "Saving" : existing ? "Save Changes" : "Create Profile"}
      </button>
    </div>
  );
}

function FollowerView({ onBack }) {
  const [code, setCode] = useState("");
  const [joined, setJoined] = useState(false);
  const [remoteState, setRemoteState] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | waiting | error
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    if (!joined) {
      console.log('[FollowerView] Not joined yet, skipping subscription setup');
      return;
    }
    
    console.log('[FollowerView] Setting up match subscription for code:', code);
    // Subscribe to live match data from Firebase using the match code
    unsubscribeRef.current = subscribeToMatchByCode(code, (matchData) => {
      if (matchData) {
        console.log('[FollowerView]  Received live match update for code:', code);
        console.log('[FollowerView] Match data:', matchData);
        setRemoteState(matchData);
        setStatus("ok");
      } else {
        console.log('[FollowerView]  No match found with code:', code);
        setStatus("waiting");
      }
    });
    
    return () => {
      console.log('[FollowerView] Cleaning up subscription for code:', code);
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [joined, code]);

  if (!joined) {
    return (
      <div className="flex flex-col gap-4 p-4 pt-10">
        <button onClick={onBack} className="text-xs self-start" style={{ color: C.slate, ...body }}>
           Back
        </button>
        <div className="text-center mb-2">
          <div style={{ ...display, fontSize: 32, color: C.amber }}>FOLLOW A MATCH</div>
          <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
            Enter the 5-character code shared by the scorer.
          </div>
        </div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))}
          placeholder="CODE"
          className="w-full px-3 py-4 rounded-xl text-center text-3xl outline-none"
          style={{ background: C.nightSoft, color: C.amber, ...display, letterSpacing: "0.2em", border: `1px solid ${C.line}` }}
        />
        <button
          disabled={code.length < 5}
          onClick={() => setJoined(true)}
          className="w-full py-4 rounded-2xl text-2xl"
          style={{
            background: code.length >= 5 ? C.amber : C.line,
            color: code.length >= 5 ? C.ink : C.slate,
            ...display,
            letterSpacing: "0.06em",
          }}
        >
          Join
        </button>
      </div>
    );
  }

  if (!remoteState) {
    return (
      <div className="flex flex-col gap-3 p-4 pt-16 items-center text-center">
        <div style={{ ...display, fontSize: 24, color: C.chalkDim }}>
          {status === "waiting" ? "No match found yet" : "Connecting"}
        </div>
        <div className="text-xs" style={{ color: C.slate, ...body }}>
          Make sure the scorer has started their innings, and the code matches exactly.
        </div>
        <button onClick={() => setJoined(false)} className="text-xs mt-2" style={{ color: C.amber, ...body }}>
          Try a different code
        </button>
      </div>
    );
  }

  const s = remoteState;
  
  // Safety check for incomplete remote state
  if (!s || !s.phase) {
    return (
      <div className="flex flex-col gap-3 p-4 pt-16 items-center text-center">
        <div style={{ ...display, fontSize: 24, color: C.chalkDim }}>
          {status === "waiting" ? "Match loading" : "Waiting for data"}
        </div>
        <button onClick={() => setJoined(false)} className="text-xs mt-2" style={{ color: C.amber, ...body }}>
          Try a different code
        </button>
      </div>
    );
  }
  
  return (
    <div className="pb-8">
      <div className="px-4 pt-2 pb-3 flex items-center justify-between">
        <div className="text-xs" style={{ color: C.slate, ...body }}>
          Following <span style={{ color: C.amber }}>{code}</span> · live
        </div>
        <button onClick={() => setJoined(false)} className="text-xs" style={{ color: C.slate, ...body }}>
          Leave
        </button>
      </div>
      <div className="px-4">
        {(s.phase === "live" || s.phase === "selectBatsman" || s.phase === "selectBowler") && (
          <>
            <Scoreboard state={s} />
            <BallByBallDisplay state={s} />
            <BatBowlLine state={s} />
          </>
        )}
        {s.phase === "break" && s.innings && s.innings[0] && (
          <div className="text-center pt-6">
            <div style={{ ...display, fontSize: 28, color: C.amber }}>INNINGS BREAK</div>
            <div className="mt-2" style={{ ...display, fontSize: 40, color: C.chalk }}>
              {teamOf(s, s.innings[0].battingTeam).name} {s.innings[0].runs}-{s.innings[0].wickets}
            </div>
          </div>
        )}
        {s.phase === "result" && <ResultScreen state={s} dispatch={() => {}} readOnly />}
        {(s.phase === "setup" || s.phase === "openers1" || s.phase === "openers2") && (
          <div className="text-center pt-16" style={{ color: C.chalkDim, ...body }}>
            Match hasn't started yet  check back in a moment.
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * OngoingMatchesView: Shows all ongoing matches being scored, sorted chronologically
 * User can click on any match to follow it in real-time
 */
function OngoingMatchesView({ onBack }) {
  const [ongoingMatches, setOngoingMatches] = useState([]);
  const [selectedCode, setSelectedCode] = useState(null);
  const [remoteState, setRemoteState] = useState(null);
  const [followingTab, setFollowingTab] = useState("scorecard"); // 'scorecard' | 'squads' | 'commentary'
  const unsubscribeRef = useRef(null);
  const pollRef = useRef(null);

  // Fetch ongoing matches from Firestore
  useEffect(() => {
    if (selectedCode) return; // If following a match, don't poll
    
    const fetchMatches = async () => {
      try {
        // Get all active matches from Firestore
        const firebaseMatches = await getOngoingMatches();
        
        // Convert to format needed by UI
        const matches = firebaseMatches.map(m => ({
          code: m.code,
          teamA: m.teamA,
          teamB: m.teamB,
          score: m.score,
          phase: m.phase || "setup",
          startedAt: m.createdAt,
        }));
        
        // Cache matches for offline access
        if (matches.length > 0) {
          localStorage.setItem('ongoingMatches', JSON.stringify(firebaseMatches));
        }
        
        setOngoingMatches(matches);
      } catch (e) {
        console.error('[OngoingMatchesView] Error fetching matches:', e);
        // Try to load from cache if fetch fails
        try {
          const cached = localStorage.getItem('ongoingMatches');
          if (cached) {
            const firebaseMatches = JSON.parse(cached);
            const matches = firebaseMatches.map(m => ({
              code: m.code,
              teamA: m.teamA,
              teamB: m.teamB,
              score: m.score,
              startedAt: m.createdAt,
            }));
            setOngoingMatches(matches);
          }
        } catch (cacheErr) {
          console.log('[OngoingMatchesView] No cached matches available');
        }
      }
    };

    fetchMatches();
    // Poll Firestore every 3 seconds for new matches
    pollRef.current = setInterval(fetchMatches, 3000);
    return () => clearInterval(pollRef.current);
  }, [selectedCode]);

  // Subscribe to selected live match from Firestore
  useEffect(() => {
    if (!selectedCode) {
      setRemoteState(null);
      if (unsubscribeRef.current) unsubscribeRef.current();
      return;
    }

    console.log('[OngoingMatchesView] Subscribing to live match:', selectedCode);
    // Use Firestore subscription for real-time updates
    unsubscribeRef.current = subscribeToLiveMatch(selectedCode, (matchData) => {
      if (matchData) {
        console.log('[OngoingMatchesView]  Received live match update:', selectedCode);
        setRemoteState(matchData);
      } else {
        console.log('[OngoingMatchesView] Match data is null');
      }
    });

    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, [selectedCode]);

  if (selectedCode && remoteState) {
    const s = remoteState;
    return (
      <div className="pb-8">
        <div className="px-4 pt-2 pb-3 flex items-center justify-between">
          <div className="text-xs" style={{ color: C.slate, ...body }}>
            Following <span style={{ color: C.amber }}>{selectedCode}</span> · live
          </div>
          <button onClick={() => { setSelectedCode(null); setFollowingTab("scorecard"); }} className="text-xs" style={{ color: C.slate, ...body }}>
             All Matches
          </button>
        </div>

        {/* Tabs for following a match */}
        <div className="px-4 pt-3 pb-3 flex gap-1 border-b overflow-x-auto" style={{ borderColor: C.line }}>
          <button
            onClick={() => setFollowingTab("scorecard")}
            className="px-3 py-2 text-sm rounded-t-lg transition-all flex-shrink-0"
            style={{
              background: followingTab === "scorecard" ? C.nightSoft : "transparent",
              color: followingTab === "scorecard" ? C.amber : C.slate,
              borderBottom: followingTab === "scorecard" ? `2px solid ${C.amber}` : "none",
              ...body,
            }}
          >
             Scorecard
          </button>
          <button
            onClick={() => setFollowingTab("squads")}
            className="px-3 py-2 text-sm rounded-t-lg transition-all flex-shrink-0"
            style={{
              background: followingTab === "squads" ? C.nightSoft : "transparent",
              color: followingTab === "squads" ? C.amber : C.slate,
              borderBottom: followingTab === "squads" ? `2px solid ${C.amber}` : "none",
              ...body,
            }}
          >
             Squads
          </button>
          <button
            onClick={() => setFollowingTab("commentary")}
            className="px-3 py-2 text-sm rounded-t-lg transition-all flex-shrink-0"
            style={{
              background: followingTab === "commentary" ? C.nightSoft : "transparent",
              color: followingTab === "commentary" ? C.amber : C.slate,
              borderBottom: followingTab === "commentary" ? `2px solid ${C.amber}` : "none",
              ...body,
            }}
          >
             Commentary
          </button>
        </div>

        <div className="px-4">
          {/* Scorecard Tab */}
          {followingTab === "scorecard" && (
            <div className="p-4 pb-8" style={{ marginLeft: -16, marginRight: -16, marginTop: 0 }}>
              <div className="px-4">
                <Scoreboard state={s} />
                <div className="mt-4 mb-4">
                  <BatBowlLine state={s} />
                </div>
                {s.innings && s.innings.length > 0 && (
                  <>
                    <div className="mb-4">
                      <ScoreCardTable inn={s.innings[0]} teamName={teamOf(s, s.innings[0].battingTeam).name} team={teamOf(s, s.innings[0].battingTeam)} />
                    </div>
                    {s.innings.length > 1 && (
                      <div className="mb-4">
                        <ScoreCardTable inn={s.innings[1]} teamName={teamOf(s, s.innings[1].battingTeam).name} team={teamOf(s, s.innings[1].battingTeam)} />
                      </div>
                    )}
                  </>
                )}
                <div className="mt-6 pt-6" style={{ borderTop: `1px solid ${C.line}` }}>
                  <div style={{ ...display, fontSize: 24, color: C.amber, marginBottom: 16, textAlign: "center" }}>LINE-UPS</div>
                  <SquadsDisplay state={s} />
                </div>
              </div>
            </div>
          )}


          {/* Squads Tab */}
          {followingTab === "squads" && (
            <div className="pb-8" style={{ background: C.night, minHeight: "100vh", marginLeft: -16, marginRight: -16, marginTop: 0 }}>
              <SquadsDisplay state={s} />
            </div>
          )}

          {/* Commentary Tab */}
          {followingTab === "commentary" && (
            <div className="p-4 pb-8" style={{ marginLeft: -16, marginRight: -16, marginTop: 0 }}>
              <div className="px-4">
                <CommentaryTabLast6 state={s} />
              </div>
            </div>
          )}

          {/* Show break/result screens regardless of tab */}
          {s.phase === "break" && s.innings && s.innings[0] && (
            <div className="text-center pt-6">
              <div style={{ ...display, fontSize: 28, color: C.amber }}>INNINGS BREAK</div>
              <div className="mt-2" style={{ ...display, fontSize: 40, color: C.chalk }}>
                {teamOf(s, s.innings[0].battingTeam).name} {s.innings[0].runs}-{s.innings[0].wickets}
              </div>
            </div>
          )}
          {s.phase === "result" && <ResultScreen state={s} dispatch={() => {}} readOnly />}
        </div>
      </div>
    );
  }

  // Show list of ongoing matches
  return (
    <div className="flex flex-col gap-4 p-4 pt-8">
      <button onClick={onBack} className="text-xs self-start" style={{ color: C.slate, ...body }}>
         Back
      </button>
      <div className="text-center mb-2">
        <div style={{ ...display, fontSize: 32, color: C.amber }}>ONGOING MATCHES</div>
        <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
          {ongoingMatches.length === 0 ? "No matches being scored" : `${ongoingMatches.length} match${ongoingMatches.length === 1 ? "" : "es"} in progress`}
        </div>
      </div>

      {ongoingMatches.length === 0 ? (
        <div className="text-center pt-8" style={{ color: C.slate, ...body }}>
          <div className="text-sm mb-2">No active matches found</div>
          <div className="text-xs" style={{ color: C.chalkDim }}>
            Matches will appear here when someone starts scoring
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {ongoingMatches.map((match) => {
            const startTime = new Date(match.startedAt);
            const timeStr = startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            // Safely calculate overs: handle undefined/NaN
            const oversNum = match.score?.overs ?? 0;
            const overs = match.score && typeof oversNum === 'number' && !isNaN(oversNum) ? Math.floor(oversNum / 6) + "." + (oversNum % 6) : "0.0";
            
            return (
              <button
                key={match.code}
                onClick={() => setSelectedCode(match.code)}
                className="p-4 rounded-2xl text-left"
                style={{
                  background: C.nightSoft,
                  border: `1px solid ${C.line}`,
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.amber)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.line)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase mb-1" style={{ color: C.amber, ...body, letterSpacing: "0.1em" }}>
                      Code: {match.code}
                    </div>
                    <div style={{ ...display, fontSize: 18, color: C.chalk }}>
                      {match.teamA} vs {match.teamB}
                    </div>
                    <div className="text-xs" style={{ color: C.chalkDim, ...body }}>
                      {match.score && match.score.runs !== undefined && match.score.wickets !== undefined ? `${match.score.runs}-${match.score.wickets} (${overs} ov)` : "Setup"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs" style={{ color: C.slate, ...body }}>
                      {match.phase === "live" ? "LIVE" : match.phase === "break" ? "BREAK" : match.phase === "result" ? "OVER" : match.phase}
                    </div>
                    <div className="text-xs mt-1" style={{ color: C.chalkDim, ...body }}>
                      {timeStr}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   RESUME SCORING - Transfer scoring to different device/user
---------------------------------------------------------------- */
function ResumeScorScreen({ onBack, playerPhone, playerName, currentUserEmail, currentUserUid }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ownMatches, setOwnMatches] = useState([]);
  const [resumeMatches, setResumeMatches] = useState([]);
  const [takeoverMatches, setTakeoverMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [resuming, setResuming] = useState(false);

  // Load resumable matches on mount
  useEffect(() => {
    loadMatches();
  }, []);

  const loadMatches = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getResumableMatches(currentUserEmail, currentUserUid, playerPhone);
      console.log('[ResumeScor] Loaded matches:', result);
      
      if (result.error) {
        setError(result.error);
      } else {
        setOwnMatches(result.ownMatches || []);
        setResumeMatches(result.resumeMatches || []);
        setTakeoverMatches(result.takeoverMatches || []);
        
        if (result.total === 0) {
          setError("No ongoing matches found. Start a new match to begin scoring.");
        }
      }
    } catch (err) {
      console.error('[ResumeScor] Error loading matches:', err);
      setError('Error loading matches: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResumeMatch = async (match) => {
    if (!match) return;
    
    setResuming(true);
    try {
      // Record the transfer if it's a takeover
      const reason = match.resumeType === 'takeover' ? 'TAKEOVER' : 'RESUME';
      await recordScorerTransfer(match.code, playerPhone, playerName, reason);
      
      // Load match state from localStorage if available
      const localMatch = localStorage.getItem(`match:${match.code}`);
      if (localMatch) {
        try {
          const state = JSON.parse(localMatch);
          onBack({ action: 'RESUME_MATCH', code: match.code, state });
          return;
        } catch (e) {
          console.warn('[ResumeScor] Could not parse local match:', e);
        }
      }
      
      // Fallback: Signal to load from Firestore
      onBack({ action: 'RESUME_MATCH', code: match.code });
    } catch (err) {
      console.error('[ResumeScor] Error resuming match:', err);
      setError('Error resuming match: ' + err.message);
    } finally {
      setResuming(false);
    }
  };

  const MatchCard = ({ match, type }) => {
    const isOwnMatch = type === 'own';
    const isOriginalMatch = type === 'resume';
    const isTakeover = type === 'takeover';
    
    let badgeColor = C.amberSoft;
    let badgeLabel = "Your Match";
    if (isOriginalMatch) {
      badgeColor = C.sky;
      badgeLabel = "Original Scorer";
    } else if (isTakeover) {
      badgeColor = C.crimson;
      badgeLabel = `Abandoned ${match.minutesSinceUpdate}m ago`;
    }
    
    return (
      <div
        onClick={() => setSelectedMatch(match)}
        className="rounded-xl p-4 cursor-pointer transition-all hover:shadow-lg"
        style={{
          background: C.nightSoft,
          border: `2px solid ${selectedMatch?.code === match.code ? C.amber : C.line}`,
        }}
      >
        <div className="flex justify-between items-start mb-2">
          <div className="text-xs font-bold px-2 py-1 rounded" style={{ background: C.line, color: badgeColor, ...body }}>
            {badgeLabel}
          </div>
          <div className="text-xs" style={{ color: C.slate, ...body }}>
            {match.code}
          </div>
        </div>
        
        <div className="text-sm font-bold mb-2" style={{ color: C.chalk, ...body }}>
          {match.teamA} vs {match.teamB}
        </div>
        
        {match.score && (
          <div className="text-xs mb-3" style={{ color: C.amberSoft, ...body }}>
            Score: {match.score.runs}/{match.score.wickets} • {Math.floor(match.score.overs / 6)}.{match.score.overs % 6} overs
          </div>
        )}
        
        <div className="flex justify-between items-center">
          <div className="text-xs" style={{ color: C.slate, ...body }}>
            By: {match.scorerName}
          </div>
          <div className="text-xs" style={{ color: C.chalkDim, ...body }}>
            Updated {match.minutesSinceUpdate}m ago
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 p-4 pt-8 h-screen overflow-y-auto" style={{ background: C.night }}>
      <button
        onClick={() => onBack()}
        className="self-start text-sm"
        style={{ color: C.amberSoft, ...body }}
      >
        ← Back
      </button>

      <div style={{ ...display, fontSize: 28, color: C.amber }}>RESUME SCORING</div>
      <div className="text-xs" style={{ color: C.chalkDim, ...body }}>
        Select a match to continue scoring
      </div>

      {/* Error Message */}
      {error && !loading && (
        <div className="rounded-xl p-3" style={{ background: C.crimson, opacity: 0.1, border: `1px solid ${C.crimson}` }}>
          <div className="text-xs" style={{ color: C.crimson, ...body }}>
            ⚠ {error}
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8" style={{ color: C.slate, ...body }}>
          ⏳ Loading matches...
        </div>
      )}

      {/* No Matches State */}
      {!loading && ownMatches.length === 0 && resumeMatches.length === 0 && takeoverMatches.length === 0 && (
        <div className="text-center py-8" style={{ color: C.slate, ...body }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏟</div>
          <div className="text-sm">No ongoing matches found</div>
          <div className="text-xs mt-2" style={{ color: C.chalkDim }}>
            Start a new match to begin scoring
          </div>
        </div>
      )}

      {/* Your Matches Section */}
      {ownMatches.length > 0 && (
        <div>
          <div className="text-xs font-bold mb-3 uppercase" style={{ color: C.amberSoft, ...body, letterSpacing: "0.1em" }}>
            ✓ Your Matches ({ownMatches.length})
          </div>
          <div className="flex flex-col gap-3">
            {ownMatches.map((match) => (
              <MatchCard key={match.code} match={match} type="own" />
            ))}
          </div>
        </div>
      )}

      {/* Resume Original Matches Section */}
      {resumeMatches.length > 0 && (
        <div>
          <div className="text-xs font-bold mb-3 uppercase" style={{ color: C.sky, ...body, letterSpacing: "0.1em" }}>
            📋 Original Matches ({resumeMatches.length})
          </div>
          <div className="flex flex-col gap-3">
            {resumeMatches.map((match) => (
              <MatchCard key={match.code} match={match} type="resume" />
            ))}
          </div>
        </div>
      )}

      {/* Takeover Matches Section */}
      {takeoverMatches.length > 0 && (
        <div>
          <div className="text-xs font-bold mb-3 uppercase" style={{ color: C.crimson, ...body, letterSpacing: "0.1em" }}>
            🔄 Available to Takeover ({takeoverMatches.length})
          </div>
          <div className="flex flex-col gap-3">
            {takeoverMatches.map((match) => (
              <MatchCard key={match.code} match={match} type="takeover" />
            ))}
          </div>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Resume Button */}
      {selectedMatch && (
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedMatch(null)}
            className="flex-1 py-3 rounded-xl text-sm"
            style={{
              background: C.line,
              color: C.chalk,
              ...body,
            }}
          >
            Clear
          </button>
          <button
            onClick={() => handleResumeMatch(selectedMatch)}
            disabled={resuming}
            className="flex-1 py-3 rounded-xl text-sm font-bold"
            style={{
              background: C.amber,
              color: C.ink,
              ...body,
              opacity: resuming ? 0.6 : 1,
            }}
          >
            {resuming ? "Loading..." : selectedMatch.resumeType === 'takeover' ? '🔄 Take Over' : '✓ Resume'}
          </button>
        </div>
      )}

      {/* Refresh Button */}
      {!loading && !selectedMatch && (
        <button
          onClick={loadMatches}
          className="w-full py-3 rounded-xl text-sm"
          style={{
            background: C.line,
            color: C.chalk,
            ...body,
          }}
        >
          🔄 Refresh Matches
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   TRANSFER BY PHONE - Minimal phone-based transfer
   Scorers can instantly transfer to any squad member
   If scorer inactive for 3+ min, anyone can take over
---------------------------------------------------------------- */
/* Co-scorer: joins with the same code as a follower, but can also enter balls.
   Its taps don't touch the primary scorer's reducer directly  they're queued
   in shared storage and the primary device applies them, so there's one source
   of truth for the match state. */
function CoScorerView({ onBack }) {
  const [code, setCode] = useState("");
  const [starterPhone, setStarterPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [joined, setJoined] = useState(false);
  const [remoteState, setRemoteState] = useState(null);
  const [status, setStatus] = useState("idle");
  const pollRef = useRef(null);

  useEffect(() => {
    if (!joined) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await storageGet(`match:${code}`, true);
        if (cancelled) return;
        if (res && res.value) {
          const matchState = JSON.parse(res.value);
          // Verify co-scorer's phone matches the match starter's phone
          if (matchState.starterPhone && normalizePhone(matchState.starterPhone) !== normalizePhone(starterPhone)) {
            setStatus("unauthorized");
            logEvent("error", "Co-scorer phone does not match match starter");
            return;
          }
          setRemoteState(matchState);
          setStatus("ok");
        } else {
          setStatus("waiting");
        }
      } catch (e) {
        if (!cancelled) {
          setStatus("waiting");
          logEvent("error", "Co-scorer poll failed: " + e.message);
        }
      }
    };
    poll();
    pollRef.current = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(pollRef.current);
    };
  }, [joined, code, starterPhone]);

  const queueDispatch = (action) => pushQueueAction(code, action);

  const joinAsCoScorer = () => {
    if (code.length < 5) {
      setPhoneError("Enter a valid 5-character match code.");
      return;
    }
    if (starterPhone.trim().length < 6) {
      setPhoneError("Enter the match starter's mobile number.");
      return;
    }
    setPhoneError("");
    setJoined(true);
  };

  if (!joined) {
    return (
      <div className="flex flex-col gap-4 p-4 pt-10">
        <button onClick={onBack} className="text-xs self-start" style={{ color: C.slate, ...body }}>
           Back
        </button>
        <div className="text-center mb-2">
          <div style={{ ...display, fontSize: 32, color: C.amber }}>CO-SCORE A MATCH</div>
          <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
            Enter the match code and the starter's mobile number. Your ball entries are sent to the main
            scorer's phone and applied there  coordinate with them so you're not both entering the same ball.
          </div>
        </div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))}
          placeholder="CODE"
          className="w-full px-3 py-4 rounded-xl text-center text-3xl outline-none"
          style={{ background: C.nightSoft, color: C.amber, ...display, letterSpacing: "0.2em", border: `1px solid ${C.line}` }}
        />
        <input
          value={starterPhone}
          onChange={(e) => setStarterPhone(e.target.value)}
          placeholder="Starter's mobile number"
          type="tel"
          className="w-full px-3 py-3 rounded-xl text-center text-lg outline-none"
          style={{ background: C.nightSoft, color: C.chalk, ...body, border: `1px solid ${C.line}` }}
        />
        {phoneError && (
          <div className="text-xs text-center" style={{ color: C.crimson, ...body }}>
            {phoneError}
          </div>
        )}
        <button
          disabled={code.length < 5 || starterPhone.trim().length < 6}
          onClick={joinAsCoScorer}
          className="w-full py-4 rounded-2xl text-2xl"
          style={{
            background: code.length >= 5 && starterPhone.trim().length >= 6 ? C.amber : C.line,
            color: code.length >= 5 && starterPhone.trim().length >= 6 ? C.ink : C.slate,
            ...display,
            letterSpacing: "0.06em",
          }}
        >
          Join as Co-Scorer
        </button>
      </div>
    );
  }

  if (status === "unauthorized") {
    return (
      <div className="flex flex-col gap-3 p-4 pt-16 items-center text-center">
        <div style={{ ...display, fontSize: 24, color: C.crimson }}>
          Unauthorized
        </div>
        <div className="text-xs" style={{ color: C.slate, ...body }}>
          Your mobile number doesn't match the match starter's number. Co-scoring is only available to the starter.
        </div>
        <button onClick={() => setJoined(false)} className="text-xs mt-2" style={{ color: C.amber, ...body }}>
          Try again with correct details
        </button>
      </div>
    );
  }

  if (!remoteState) {
    return (
      <div className="flex flex-col gap-3 p-4 pt-16 items-center text-center">
        <div style={{ ...display, fontSize: 24, color: C.chalkDim }}>
          {status === "waiting" ? "No match found yet" : "Connecting"}
        </div>
        <button onClick={() => setJoined(false)} className="text-xs mt-2" style={{ color: C.amber, ...body }}>
          Try a different code
        </button>
      </div>
    );
  }

  const s = remoteState;
  return (
    <div className="pb-8">
      <div className="px-4 pt-2 pb-3 flex items-center justify-between">
        <div className="text-xs" style={{ color: C.slate, ...body }}>
          Co-scoring <span style={{ color: C.amber }}>{code}</span> · live
        </div>
        <button onClick={() => setJoined(false)} className="text-xs" style={{ color: C.slate, ...body }}>
          Leave
        </button>
      </div>
      <div className="px-4">
        {s.phase === "live" && (
          <>
            <Scoreboard state={s} />
            <BatBowlLine state={s} />
            <ScoringPad state={s} dispatch={queueDispatch} />
          </>
        )}
        {s.phase === "selectBatsman" && (
          <>
            <Scoreboard state={s} />
            <SelectBatsman state={s} dispatch={queueDispatch} />
          </>
        )}
        {s.phase === "selectBowler" && (
          <>
            <Scoreboard state={s} />
            <SelectBowler state={s} dispatch={queueDispatch} />
          </>
        )}
        {s.phase === "break" && (
          <div className="text-center pt-6" style={{ color: C.chalkDim, ...body }}>
            Innings break  waiting for the other innings to begin.
          </div>
        )}
        {s.phase === "result" && <ResultScreen state={s} dispatch={() => {}} readOnly />}
        {(s.phase === "setup" || s.phase === "openers1" || s.phase === "openers2") && (
          <div className="text-center pt-16" style={{ color: C.chalkDim, ...body }}>
            Match hasn't started yet  check back in a moment.
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   MATCH HISTORY  last 10 matches, visible to every player
---------------------------------------------------------------- */
function MatchHistoryList({ onBack }) {
  const [list, setList] = useState(null);
  const [openId, setOpenId] = useState(null);

  const loadHistory = async () => {
    logEvent("info", "[MatchHistory] Loading history from Firebase...");
    try {
      const matches = await loadMatches();
      logEvent("info", `[MatchHistory] Loaded ${matches.length} matches from Firebase`);
      console.log('[MatchHistory] Raw matches:', matches);
      
      // Format matches for display
      const formatted = matches.map((m) => {
        let dateStr = "Invalid Date";
        try {
          // Handle various timestamp formats from Firestore
          let timestamp = m.timestamp || m.savedAt;
          
          if (timestamp) {
            let date;
            
            // Handle Firestore Timestamp object (has .toDate() method)
            if (timestamp && typeof timestamp === 'object' && timestamp.toDate) {
              console.log('[MatchHistory] Firestore Timestamp detected, converting...');
              date = timestamp.toDate();
            }
            // Handle ISO string or Date-compatible string
            else if (typeof timestamp === 'string') {
              date = new Date(timestamp);
            }
            // Handle Unix timestamp in milliseconds (number >= 1000000000000)
            else if (typeof timestamp === 'number' && timestamp > 1000000000000) {
              date = new Date(timestamp);
            }
            // Handle Firestore timestamp object with seconds and nanoseconds
            else if (typeof timestamp === 'object' && timestamp.seconds) {
              console.log('[MatchHistory] Firestore timestamp (seconds+nanoseconds) detected');
              date = new Date(timestamp.seconds * 1000 + Math.floor(timestamp.nanoseconds / 1000000));
            }
            
            // Validate the date
            if (date && !isNaN(date.getTime())) {
              dateStr = date.toLocaleDateString();
              console.log('[MatchHistory]  Date parsed successfully:', dateStr);
            } else {
              console.warn('[MatchHistory] Invalid timestamp format:', timestamp, 'type:', typeof timestamp);
            }
          }
        } catch (err) {
          console.error('[MatchHistory] Date parsing error:', err, 'timestamp:', m.timestamp);
        }
        
        return {
          id: m.id,
          title: dateStr,
          teamAName: m.teamA?.name || "Team A",
          teamBName: m.teamB?.name || "Team B",
          resultText: "Match completed",
          innings: [m.inning1, m.inning2],
          timestamp: m.timestamp,
          teamA: m.teamA,
          teamB: m.teamB,
          code: m.code,
        };
      });
      
      console.log('[MatchHistory] Formatted matches:', formatted);
      setList(formatted);
    } catch (e) {
      console.error('[MatchHistory] Error:', e);
      logEvent("error", "Failed to load match history: " + e.message);
      setList([]);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  if (openId) {
    const m = list.find((x) => x.id === openId);
    return <MatchHistoryDetail match={m} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="flex flex-col gap-3 p-4 pt-8 pb-8">
      <div className="flex justify-between items-center">
        <button onClick={onBack} className="text-xs self-start" style={{ color: C.slate, ...body }}>
           Back
        </button>
        <button onClick={loadHistory} className="text-xs px-2 py-1" style={{ color: C.chalk, ...body }}>
           Refresh
        </button>
      </div>
      <div className="text-center mb-2">
        <div style={{ ...display, fontSize: 32, color: C.amber }}>MATCH HISTORY</div>
        <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
          The last 10 matches played, visible to everyone.
        </div>
      </div>
      {list === null && (
        <div className="text-sm text-center py-6" style={{ color: C.slate, ...body }}>
          Loading
        </div>
      )}
      {list && list.length === 0 && (
        <div className="text-sm text-center py-6" style={{ color: C.slate, ...body }}>
          No matches recorded yet. Once a match finishes, it'll show up here.
        </div>
      )}
      {list &&
        list.map((m) => (
          <button
            key={m.id}
            onClick={() => setOpenId(m.id)}
            className="text-left rounded-2xl p-4"
            style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}
          >
            <div className="text-xs uppercase mb-1" style={{ color: C.amberSoft, ...body, letterSpacing: "0.08em" }}>
              {m.title}
            </div>
            <div style={{ ...display, fontSize: 18, color: C.chalk }}>
              {m.teamAName} vs {m.teamBName}
            </div>
            <div className="text-xs mt-1" style={{ color: C.chalkDim, ...body }}>
              {m.resultText}
            </div>
          </button>
        ))}
    </div>
  );
}

function MatchHistoryDetail({ match, onBack }) {
  if (!match) return null;
  const inn1 = match.innings[0];
  const inn2 = match.innings[1];
  const teamAName = match.teamAName;
  const teamBName = match.teamBName;
  const nameFor = (key) => (key === "A" ? teamAName : teamBName);

  return (
    <div className="p-4 flex flex-col gap-4 pb-8">
      <button onClick={onBack} className="text-xs self-start" style={{ color: C.slate, ...body }}>
         All matches
      </button>
      <div className="text-center">
        <div className="text-xs uppercase mb-1" style={{ color: C.amberSoft, ...body, letterSpacing: "0.08em" }}>
          {match.title}
        </div>
        <div style={{ ...display, fontSize: 28, color: C.chalk }}>{match.resultText}</div>
      </div>
      {match.awards && (
        <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: C.grass, border: `1px solid ${C.amber}` }}>
          <Avatar name={match.awards.name} size={40} />
          <div>
            <div className="text-[10px] uppercase" style={{ color: C.amberSoft, ...body, letterSpacing: "0.1em" }}>
              Player of the Match
            </div>
            <div style={{ ...display, fontSize: 20, color: C.chalk }}>{match.awards.name}</div>
            <div className="text-xs" style={{ color: C.chalkDim, ...body }}>
              {match.awards.team} · {match.awards.line}
            </div>
          </div>
        </div>
      )}
      <ScoreCardTable inn={inn1} teamName={nameFor(inn1.battingTeam)} />
      <ScoreCardTable inn={inn2} teamName={nameFor(inn2.battingTeam)} />
    </div>
  );
}

/* ---------------------------------------------------------------
   DIAGNOSTICS / LOGS
---------------------------------------------------------------- */
function LogsScreen({ onBack }) {
  const logs = useLogs();
  const levelColor = { info: C.sky, error: C.crimson, warn: C.amber };

  const copyLogs = async () => {
    const text = logs.map((l) => `[${l.time}] ${l.level.toUpperCase()}: ${l.message}`).join("\n");
    try {
      await navigator.clipboard.writeText(text || "No logs yet.");
    } catch (e) {
      // clipboard not available on this browser  logs are still visible on screen
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4 pt-8 pb-8">
      <button onClick={onBack} className="text-xs self-start" style={{ color: C.slate, ...body }}>
         Back
      </button>
      <div className="flex items-center justify-between">
        <div style={{ ...display, fontSize: 28, color: C.amber }}>DIAGNOSTICS</div>
        <button onClick={copyLogs} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: C.amber, color: C.ink, ...body }}>
          Copy
        </button>
      </div>
      <div className="text-xs" style={{ color: C.slate, ...body }}>
        Session-only log of syncing, profile, and scoring events  useful for figuring out what went
        wrong if something doesn't sync. Clears on page reload.
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
        {logs.length === 0 && (
          <div className="text-xs p-3" style={{ color: C.slate, ...body }}>
            No events logged yet this session.
          </div>
        )}
        {logs.map((l, i) => (
          <div
            key={i}
            className="px-3 py-2 text-xs flex gap-2"
            style={{ background: i % 2 ? C.night : C.nightSoft, borderBottom: `1px solid ${C.line}`, ...body }}
          >
            <span style={{ color: C.slate, minWidth: 70 }}>{l.time}</span>
            <span style={{ color: levelColor[l.level] || C.chalk, minWidth: 42, fontWeight: 700 }}>{l.level}</span>
            <span style={{ color: C.chalkDim, flex: 1 }}>{l.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   ADMIN  lightweight passcode-gated cleanup tools (not a real login
   system; the passcode lives in shared storage, set by whoever gets here first)
---------------------------------------------------------------- */
function AdminScreen({ onBack }) {
  const [checking, setChecking] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState(null);
  const [directory, setDirectory] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await storageGet(ADMIN_KEY, true);
        setHasPin(!!(res && res.value));
      } catch (e) {
        setHasPin(false);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  const loadData = async () => {
    try {
      const h = await storageGet(HISTORY_KEY, true).catch(() => null);
      setHistory(h && h.value ? JSON.parse(h.value) : []);
      const d = await loadDirectory();
      setDirectory(Object.values(d));
    } catch (e) {
      logEvent("error", "Admin: failed to load data: " + e.message);
    }
  };

  useEffect(() => {
    if (unlocked) loadData();
  }, [unlocked]);

  const createPin = async () => {
    if (newPin.length !== 4 || newPin !== confirmPin) {
      setError("Enter the same 4-digit passcode twice.");
      return;
    }
    try {
      const result = await storageSet(ADMIN_KEY, JSON.stringify({ pin: newPin }), true);
      if (result && typeof result === "object" && (result.value || result.success)) {
        logEvent("info", "Admin passcode created");
        setHasPin(true);
        setUnlocked(true);
        setError("");
      } else {
        throw new Error("Invalid response from storage");
      }
    } catch (e) {
      setError("Couldn't save passcode. Try again.");
      logEvent("error", "Admin: failed to save passcode: " + e.message);
    }
  };

  const tryUnlock = async () => {
    try {
      const res = await storageGet(ADMIN_KEY, true);
      if (!res || typeof res !== "object") {
        setError("Storage error. Try again.");
        return;
      }
      const saved = res.value ? JSON.parse(res.value) : null;
      if (saved && saved.pin === pinInput) {
        setUnlocked(true);
        setError("");
        logEvent("info", "Admin unlocked");
      } else {
        setError("Incorrect passcode.");
        logEvent("error", "Admin: incorrect passcode attempt");
      }
    } catch (e) {
      setError("Couldn't verify passcode. Try again.");
      logEvent("error", "Admin: parse error: " + e.message);
    }
  };

  const deleteMatch = async (id) => {
    const updated = history.filter((m) => m.id !== id);
    setHistory(updated);
    await storageSet(HISTORY_KEY, JSON.stringify(updated), true);
    logEvent("info", `Admin deleted match history entry ${id}`);
  };

  const clearAllHistory = async () => {
    setHistory([]);
    await storageSet(HISTORY_KEY, JSON.stringify([]), true);
    logEvent("info", "Admin cleared all match history");
  };

  const deleteProfile = async (phone) => {
    const dir = await loadDirectory();
    delete dir[phone];
    await saveDirectory(dir);
    setDirectory(Object.values(dir));
    logEvent("info", `Admin deleted profile ${phone}`);
  };

  if (checking) {
    return (
      <div className="p-4 pt-16 text-center text-sm" style={{ color: C.slate, ...body }}>
        Loading
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="flex flex-col gap-4 p-4 pt-10">
        <button onClick={onBack} className="text-xs self-start" style={{ color: C.slate, ...body }}>
           Back
        </button>
        <div className="text-center mb-2">
          <div style={{ ...display, fontSize: 32, color: C.amber }}>ADMIN</div>
          <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
            {hasPin
              ? "Enter the group's admin passcode."
              : "No admin passcode set yet  create one now. Anyone with this passcode can manage history and profiles, so share it only with whoever should have that access."}
          </div>
        </div>

        {hasPin ? (
          <>
            <input
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
              type="password"
              inputMode="numeric"
              placeholder=""
              className="w-full px-3 py-4 rounded-xl text-center text-3xl outline-none"
              style={{ background: C.nightSoft, color: C.amber, ...display, letterSpacing: "0.3em", border: `1px solid ${C.line}` }}
            />
            <button
              onClick={tryUnlock}
              className="w-full py-4 rounded-2xl text-2xl"
              style={{ background: C.amber, color: C.ink, ...display, letterSpacing: "0.06em" }}
            >
              Unlock
            </button>
          </>
        ) : (
          <>
            <input
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              type="password"
              inputMode="numeric"
              placeholder="New passcode"
              className="w-full px-3 py-3 rounded-xl text-center text-2xl outline-none"
              style={{ background: C.nightSoft, color: C.chalk, ...display, letterSpacing: "0.3em", border: `1px solid ${C.line}` }}
            />
            <input
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              type="password"
              inputMode="numeric"
              placeholder="Confirm passcode"
              className="w-full px-3 py-3 rounded-xl text-center text-2xl outline-none"
              style={{ background: C.nightSoft, color: C.chalk, ...display, letterSpacing: "0.3em", border: `1px solid ${C.line}` }}
            />
            <button
              onClick={createPin}
              className="w-full py-4 rounded-2xl text-2xl"
              style={{ background: C.amber, color: C.ink, ...display, letterSpacing: "0.06em" }}
            >
              Create Passcode
            </button>
          </>
        )}
        {error && (
          <div className="text-xs text-center" style={{ color: C.crimson, ...body }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 pt-8 pb-8">
      <button onClick={onBack} className="text-xs self-start" style={{ color: C.slate, ...body }}>
         Back
      </button>
      <div style={{ ...display, fontSize: 28, color: C.amber, textAlign: "center" }}>ADMIN TOOLS</div>

      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase" style={{ color: C.amberSoft, ...body, letterSpacing: "0.1em" }}>
            Match history ({history ? history.length : 0})
          </div>
          {history && history.length > 0 && (
            <button onClick={clearAllHistory} className="text-xs" style={{ color: C.crimson, ...body }}>
              Clear all
            </button>
          )}
        </div>
        {history && history.length === 0 && (
          <div className="text-xs" style={{ color: C.slate, ...body }}>
            Nothing recorded.
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          {history &&
            history.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: C.night }}>
                <div className="text-xs" style={{ color: C.chalk, ...body }}>
                  {m.title}
                </div>
                <button onClick={() => deleteMatch(m.id)} className="text-xs" style={{ color: C.crimson, ...body }}>
                  Delete
                </button>
              </div>
            ))}
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
        <div className="text-xs uppercase mb-2" style={{ color: C.amberSoft, ...body, letterSpacing: "0.1em" }}>
          Player profiles ({directory ? directory.length : 0})
        </div>
        {directory && directory.length === 0 && (
          <div className="text-xs" style={{ color: C.slate, ...body }}>
            No profiles yet.
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          {directory &&
            directory.map((p) => (
              <div key={p.phone} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: C.night }}>
                <div className="flex items-center gap-2">
                  <Avatar name={p.name} size={22} />
                  <span className="text-xs" style={{ color: C.chalk, ...body }}>
                    {p.name} · {p.stats.matches} matches
                  </span>
                </div>
                <button onClick={() => deleteProfile(p.phone)} className="text-xs" style={{ color: C.crimson, ...body }}>
                  Delete
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   TEAM MANAGEMENT COMPONENTS
---------------------------------------------------------------- */

function TeamCreationModal({ playerName, onBack, onTeamCreated }) {
  const [teamName, setTeamName] = useState("");
  const [selectedClan, setSelectedClan] = useState(null);
  const [clans, setClans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [clansLoading, setClansLoading] = useState(true);

  // Load user's clans on mount
  useEffect(() => {
    const userPhone = localStorage.getItem("my-phone");
    if (userPhone) {
      getUserClans(userPhone)
        .then((userClans) => {
          setClans(userClans || []);
          setClansLoading(false);
        })
        .catch((err) => {
          console.error('[TeamCreation] Error loading clans:', err);
          setClansLoading(false);
        });
    } else {
      setClansLoading(false);
    }
  }, []);

  const handleCreate = async () => {
    if (!teamName.trim()) return;
    setLoading(true);
    const teamId = await createTeam(teamName.trim(), playerName, selectedClan?.id || null);
    setLoading(false);
    if (teamId) {
      onTeamCreated(teamId);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 pt-10">
      <button onClick={onBack} className="text-xs self-start" style={{ color: C.slate, ...body }}>
         Back
      </button>
      <div className="text-center mb-2">
        <div style={{ ...display, fontSize: 32, color: C.amber }}>CREATE TEAM</div>
        <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
          You'll be the captain of this team.
        </div>
      </div>
      <input
        value={teamName}
        onChange={(e) => setTeamName(e.target.value)}
        placeholder="Team name..."
        className="w-full px-3 py-4 rounded-xl text-lg outline-none"
        style={{ background: C.nightSoft, color: C.chalk, ...display, border: `1px solid ${C.line}` }}
      />

      {/* Clan Selection */}
      {!clansLoading && clans.length > 0 && (
        <div>
          <label className="text-xs uppercase mb-2 block" style={{ color: C.sky, ...body }}>
            Add to Clan (Optional)
          </label>
          <select
            value={selectedClan?.id || ""}
            onChange={(e) => {
              const clanId = e.target.value;
              setSelectedClan(clanId ? clans.find((c) => c.id === clanId) : null);
            }}
            className="w-full px-3 py-3 rounded-xl text-sm outline-none"
            style={{ background: C.nightSoft, color: C.chalk, border: `1px solid ${C.line}`, ...body }}
          >
            <option value="">No clan</option>
            {clans.map((clan) => (
              <option key={clan.id} value={clan.id}>
                {clan.name}
              </option>
            ))}
          </select>
          {selectedClan && (
            <div className="text-xs mt-2" style={{ color: C.grassLight, ...body }}>
              ✓ Team will be added to {selectedClan.name}
            </div>
          )}
        </div>
      )}

      <button
        disabled={!teamName.trim() || loading}
        onClick={handleCreate}
        className="w-full py-4 rounded-2xl text-lg font-semibold"
        style={{
          background: teamName.trim() && !loading ? C.grassLight : C.slate,
          color: C.chalk,
          ...display,
        }}
      >
        {loading ? "Creating..." : "Create Team"}
      </button>
    </div>
  );
}

function TeamInvitationsView({ playerName, onBack }) {
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState({});

  useEffect(() => {
    subscribeToTeamInvitations(playerName, (invites) => {
      setInvitations(invites);
    });
  }, [playerName]);

  const handleAccept = async (invitationId) => {
    setLoading((prev) => ({ ...prev, [invitationId]: true }));
    await acceptTeamInvitation(invitationId, playerName);
    setLoading((prev) => ({ ...prev, [invitationId]: false }));
  };

  const handleReject = async (invitationId) => {
    setLoading((prev) => ({ ...prev, [invitationId]: true }));
    await rejectTeamInvitation(invitationId);
    setLoading((prev) => ({ ...prev, [invitationId]: false }));
  };

  return (
    <div className="flex flex-col gap-4 p-4 pt-8 pb-8">
      <button onClick={onBack} className="text-xs self-start" style={{ color: C.slate, ...body }}>
         Back
      </button>
      <div className="text-center mb-2">
        <div style={{ ...display, fontSize: 32, color: C.amber }}>TEAM INVITATIONS</div>
        <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
          Join a team or create your own.
        </div>
      </div>

      {invitations.length === 0 ? (
        <div className="text-center py-8" style={{ color: C.slate, ...body }}>
          <div className="mb-4">No pending invitations</div>
          <button
            onClick={() => {
              const input = prompt("Ask a team captain to send you an invite!");
              if (input) logEvent("info", input);
            }}
            className="text-sm px-3 py-2 rounded"
            style={{ background: C.nightSoft, color: C.sky, ...body }}
          >
            Learn how to join
          </button>
        </div>
      ) : (
        invitations.map((invite) => (
          <div
            key={invite.id}
            className="rounded-2xl p-4"
            style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}
          >
            <div className="text-xs uppercase mb-2" style={{ color: C.amberSoft, ...body, letterSpacing: "0.08em" }}>
              Team Invitation
            </div>
            <div style={{ ...display, fontSize: 20, color: C.chalk, marginBottom: 8 }}>
              {invite.teamName}
            </div>
            <div className="text-xs mb-4" style={{ color: C.chalkDim, ...body }}>
              Invited by <span style={{ color: C.amber }}>{invite.from}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleAccept(invite.id)}
                disabled={loading[invite.id]}
                className="flex-1 py-2 rounded-lg font-semibold"
                style={{
                  background: C.grassLight,
                  color: C.chalk,
                  ...body,
                  opacity: loading[invite.id] ? 0.5 : 1,
                }}
              >
                Accept
              </button>
              <button
                onClick={() => handleReject(invite.id)}
                disabled={loading[invite.id]}
                className="flex-1 py-2 rounded-lg font-semibold"
                style={{
                  background: C.crimson,
                  color: C.chalk,
                  ...body,
                  opacity: loading[invite.id] ? 0.5 : 1,
                }}
              >
                 Decline
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function PlayerProfileView({ playerName, playerStats, onBack }) {
  const [tab, setTab] = useState("profile"); // profile | clans | invitations
  const [team, setTeam] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [clans, setClans] = useState([]);
  const [pendingClanRequests, setPendingClanRequests] = useState([]); // For clan creators
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState({});
  const [playerLocation, setPlayerLocation] = useState("");
  const [expandedTeamId, setExpandedTeamId] = useState(null);
  const [clanInviteCodes, setClanInviteCodes] = useState({}); // Store invite codes by clan ID
  const [avatarStyle, setAvatarStyle] = useState(() => {
    const saved = localStorage.getItem("avatar-style");
    return saved ? parseInt(saved) : 1;
  });
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [invitePhone, setInvitePhone] = useState(""); // For inviting by phone number
  const [inviteLoading, setInviteLoading] = useState(false);
  const [showJoinClanModal, setShowJoinClanModal] = useState(false);
  const [joinClanId, setJoinClanId] = useState("");
  const [userPhone, setUserPhone] = useState("");
  // Profile edit fields
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [profileData, setProfileData] = useState({
    role: null,
    age: null,
    city: "",
    country: ""
  });
  const [saveProfileLoading, setSaveProfileLoading] = useState(false);

  // Load player's team and location
  useEffect(() => {
    (async () => {
      const playerTeam = await getPlayerTeam(playerName);
      if (playerTeam) {
        setTeam(playerTeam);
        setTeamMembers(playerTeam.members || []);
      }
      // Load location from local profile
      const dir = await loadDirectory();
      const userPhone = localStorage.getItem("my-phone");
      if (userPhone && dir[userPhone]) {
        setPlayerLocation(dir[userPhone].location || "");
      }
      
      // Load profile data from Firestore or localStorage
      const userEmail = localStorage.getItem("my-email");
      if (userEmail) {
        try {
          const profileDoc = await getPlayerByEmail(userEmail);
          if (profileDoc) {
            setProfileData({
              role: profileDoc.role || null,
              age: profileDoc.age || null,
              city: profileDoc.city || "",
              country: profileDoc.country || ""
            });
          }
        } catch (err) {
          console.error('Error loading profile data:', err);
        }
      }
    })();
  }, [playerName]);

  // Load player's clans and user phone (assuming userPhone is stored somewhere - we'll use localStorage)
  useEffect(() => {
    (async () => {
      const phone = localStorage.getItem("my-phone");
      setUserPhone(phone || "");
      
      if (phone) {
        const userClans = await getUserClans(phone);
        setClans(userClans);
        
        // Load pending requests if user is a clan creator
        for (const clan of userClans) {
          if (clan.creatorPhone === phone) {
            try {
              const requests = await getPendingClanRequests(clan.id);
              setPendingClanRequests(requests);
              break; // Load requests for first created clan
            } catch (err) {
              console.error('Error loading pending requests:', err);
            }
          }
        }
      }
    })();
  }, []);

  // Load team invitations
  useEffect(() => {
    subscribeToTeamInvitations(playerName, (invites) => {
      setInvitations(invites);
    });
  }, [playerName]);

  // Load invite code when a clan is expanded
  useEffect(() => {
    (async () => {
      if (expandedTeamId && clans.length > 0) {
        const clan = clans.find(c => c.id === expandedTeamId);
        if (clan && !clanInviteCodes[clan.id]) {
          try {
            // Try to get existing invite code
            let inviteData = await getClanInviteLink(clan.id);
            
            // If no code exists, generate one
            if (!inviteData) {
              inviteData = await generateClanInviteLink(clan.id);
            }
            
            if (inviteData) {
              setClanInviteCodes(prev => ({ ...prev, [clan.id]: inviteData.code }));
              // Update clan with invite code for rendering
              setClans(prevClans => prevClans.map(c => 
                c.id === clan.id ? { ...c, inviteCode: inviteData.code } : c
              ));
            }
          } catch (err) {
            console.error('Error loading invite code:', err);
          }
        }
      }
    })();
  }, [expandedTeamId, clans]);

  const handleAcceptInvitation = async (invitationId) => {
    setLoading((prev) => ({ ...prev, [invitationId]: true }));
    await acceptTeamInvitation(invitationId, playerName);
    setLoading((prev) => ({ ...prev, [invitationId]: false }));
  };

  const handleRejectInvitation = async (invitationId) => {
    setLoading((prev) => ({ ...prev, [invitationId]: true }));
    await rejectTeamInvitation(invitationId);
    setLoading((prev) => ({ ...prev, [invitationId]: false }));
  };

  const handleInviteByPhone = async () => {
    if (!invitePhone.trim()) {
      alert("Please enter a phone number");
      return;
    }
    if (!team) {
      alert("You must have a team to invite players");
      return;
    }
    setInviteLoading(true);
    try {
      // Get player name from Firebase using phone number
      const playerToInvite = await getPlayerByPhone(invitePhone);
      if (!playerToInvite) {
        alert("No player found with this phone number. They must be registered in CricketBuddy first.");
        setInviteLoading(false);
        return;
      }
      // Send invitation using full name from firstName and lastName
      const fullName = `${playerToInvite.firstName || ''} ${playerToInvite.lastName || ''}`.trim();
      if (!fullName) {
        alert("Could not determine player name");
        setInviteLoading(false);
        return;
      }
      await invitePlayerToTeam(team.id, playerName, fullName);
      alert(`Invitation sent to ${playerToInvite.name}!`);
      setInvitePhone("");
    } catch (err) {
      console.error('Error inviting player:', err);
      alert("Failed to send invitation: " + (err.message || "Unknown error"));
    } finally {
      setInviteLoading(false);
    }
  };

  const handleAvatarSelect = (styleId) => {
    setAvatarStyle(styleId);
    localStorage.setItem("avatar-style", styleId.toString());
    setShowAvatarPicker(false);
  };

  // Save profile edits to Firestore
  const handleSaveProfile = async () => {
    setSaveProfileLoading(true);
    try {
      const userEmail = localStorage.getItem("my-email");
      if (!userEmail) throw new Error("User email not found");
      
      const result = await updateUserEmailProfile(userEmail, {
        role: profileData.role,
        age: profileData.age ? parseInt(profileData.age) : null,
        city: profileData.city,
        country: profileData.country
      });
      
      if (result.success) {
        setShowEditProfile(false);
        logEvent("info", "Profile updated successfully");
      } else {
        throw new Error(result.error || "Failed to update profile");
      }
    } catch (err) {
      console.error("Error saving profile:", err);
      logEvent("error", "Failed to save profile: " + err.message);
    } finally {
      setSaveProfileLoading(false);
    }
  };

  const stats = playerStats || {
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

  const tabs = [
    { id: "profile", label: "Profile", color: C.sky },
    { id: "clans", label: "Clans", color: C.amber, badge: (clans.length > 0 || pendingClanRequests.length > 0) ? (clans.length + pendingClanRequests.length) : null },
    { id: "invitations", label: "Invitations", color: C.grassLight, badge: invitations.length > 0 ? invitations.length : null },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 pt-8 pb-8">
      <button onClick={onBack} className="text-xs self-start" style={{ color: C.slate, ...body }}>
         Back
      </button>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-4">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.id}
            onClick={() => setTab(tabItem.id)}
            className="flex-1 py-2 rounded-lg text-xs font-semibold relative transition-all"
            style={{
              background: tab === tabItem.id ? tabItem.color : C.nightSoft,
              color: tab === tabItem.id ? C.ink : C.chalk,
              border: `1px solid ${tab === tabItem.id ? tabItem.color : C.line}`,
              ...body,
            }}
          >
            {tabItem.label}
            {tabItem.badge && (
              <span
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: C.crimson, color: C.chalk }}
              >
                {tabItem.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {tab === "profile" && (
        <div className="flex flex-col gap-4">
          <div className="text-center mb-2">
            <button
              onClick={() => setShowAvatarPicker(!showAvatarPicker)}
              className="mx-auto block active:scale-95 transition-all"
              style={{ cursor: "pointer" }}
            >
              <Avatar name={playerName} size={60} avatarStyle={avatarStyle} />
            </button>
            <div className="text-xs mt-1" style={{ color: C.chalkDim, ...body }}>
              Tap to change avatar
            </div>
            <div style={{ ...display, fontSize: 28, color: C.chalk, marginTop: 8 }}>
              {playerName}
            </div>
            {playerLocation && (
              <div className="text-xs mt-1" style={{ color: C.chalkDim, ...body }}>
                📍 {playerLocation}
              </div>
            )}
          </div>

          {/* Avatar Picker */}
          {showAvatarPicker && (
            <div className="rounded-xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.sky}` }}>
              <div className="text-xs uppercase mb-3" style={{ color: C.sky, ...body, letterSpacing: "0.08em" }}>
                Choose Your Avatar
              </div>
              <div className="grid grid-cols-3 gap-3">
                {AVATAR_STYLES.map((style) => (
                  <button
                    key={style.id}
                    onClick={() => handleAvatarSelect(style.id)}
                    className="flex flex-col items-center gap-2 p-3 rounded-lg active:scale-95 transition-all"
                    style={{
                      background: avatarStyle === style.id ? style.color : C.night,
                      border: `2px solid ${avatarStyle === style.id ? style.color : C.line}`,
                    }}
                  >
                    <Avatar name={playerName} size={48} avatarStyle={style.id} />
                    <div className="text-xs text-center" style={{ color: avatarStyle === style.id ? C.ink : C.chalkDim, ...body }}>
                      {style.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Edit Profile Button */}
          <button
            onClick={() => setShowEditProfile(!showEditProfile)}
            className="w-full py-2 px-3 rounded-lg text-sm font-semibold active:scale-95 transition-all"
            style={{
              background: showEditProfile ? C.amberSoft : C.nightSoft,
              color: showEditProfile ? C.ink : C.chalk,
              border: `1px solid ${C.line}`,
              ...body,
            }}
          >
            {showEditProfile ? "Cancel Edit" : "✎ Edit Profile"}
          </button>

          {/* Profile Edit Form */}
          {showEditProfile && (
            <div className="flex flex-col gap-3 p-4 rounded-xl" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
              <div className="text-xs uppercase" style={{ color: C.amber, ...body, letterSpacing: "0.08em" }}>
                Player Information
              </div>

              {/* Role Selection */}
              <div className="flex flex-col gap-2">
                <label className="text-xs" style={{ color: C.chalkDim, ...body }}>Role</label>
                <div className="flex gap-2">
                  {['batsman', 'bowler', 'allrounder'].map((r) => (
                    <button
                      key={r}
                      onClick={() => setProfileData({...profileData, role: profileData.role === r ? null : r})}
                      className="flex-1 py-2 rounded text-xs font-semibold active:scale-95 transition-all capitalize"
                      style={{
                        background: profileData.role === r ? C.amber : C.night,
                        color: profileData.role === r ? C.ink : C.chalk,
                        border: `1px solid ${profileData.role === r ? C.amber : C.line}`,
                        ...body,
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Age Input */}
              <div className="flex flex-col gap-2">
                <label className="text-xs" style={{ color: C.chalkDim, ...body }}>Age</label>
                <input
                  type="number"
                  min="10"
                  max="100"
                  value={profileData.age || ""}
                  onChange={(e) => setProfileData({...profileData, age: e.target.value ? parseInt(e.target.value) : null})}
                  placeholder="Enter your age"
                  className="px-3 py-2 rounded text-sm"
                  style={{
                    background: C.night,
                    color: C.chalk,
                    border: `1px solid ${C.line}`,
                    ...body,
                  }}
                />
              </div>

              {/* City Input */}
              <div className="flex flex-col gap-2">
                <label className="text-xs" style={{ color: C.chalkDim, ...body }}>City</label>
                <input
                  type="text"
                  value={profileData.city}
                  onChange={(e) => setProfileData({...profileData, city: e.target.value})}
                  placeholder="Enter your city"
                  className="px-3 py-2 rounded text-sm"
                  style={{
                    background: C.night,
                    color: C.chalk,
                    border: `1px solid ${C.line}`,
                    ...body,
                  }}
                />
              </div>

              {/* Country Input */}
              <div className="flex flex-col gap-2">
                <label className="text-xs" style={{ color: C.chalkDim, ...body }}>Country</label>
                <input
                  type="text"
                  value={profileData.country}
                  onChange={(e) => setProfileData({...profileData, country: e.target.value})}
                  placeholder="Enter your country"
                  className="px-3 py-2 rounded text-sm"
                  style={{
                    background: C.night,
                    color: C.chalk,
                    border: `1px solid ${C.line}`,
                    ...body,
                  }}
                />
              </div>

              {/* Save Button */}
              <button
                onClick={handleSaveProfile}
                disabled={saveProfileLoading}
                className="w-full py-2 rounded-lg font-semibold text-sm active:scale-95 transition-all"
                style={{
                  background: C.amber,
                  color: C.ink,
                  opacity: saveProfileLoading ? 0.6 : 1,
                  cursor: saveProfileLoading ? "not-allowed" : "pointer",
                  ...body,
                }}
              >
                {saveProfileLoading ? "Saving..." : "💾 Save Profile"}
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <StatBox label="Matches" value={stats.matches} />
            <StatBox label="Runs" value={stats.runs} />
            <StatBox label="Wickets" value={stats.wickets} />
            <StatBox label="Highest Score" value={stats.highestScore} />
            <StatBox label="Fours" value={stats.fours} />
            <StatBox label="Sixes" value={stats.sixes} />
            <StatBox label="Innings" value={stats.innings} />
            <StatBox label="Balls Faced" value={stats.ballsFaced} />
          </div>

          {stats.matches === 0 && (
            <div className="rounded-xl p-4 text-center" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
              <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
                No matches played yet. Your stats will appear here once you participate in a match!
              </div>
            </div>
          )}

          {/* Team management moved to Teams tab */}
          {!team && (
            <div className="rounded-2xl p-4 text-center" style={{ background: C.nightSoft, border: `1px solid ${C.amber}` }}>
              <div className="text-sm mb-3" style={{ color: C.chalkDim, ...body }}>
                You don't have a team yet. Go to Teams tab to create or join one!
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clans Tab */}
      {tab === "clans" && (
        <div className="flex flex-col gap-4">
          {/* Organize Clans Button - Always visible */}
          <button
            onClick={() => onBack({action: 'ORGANIZE_CLANS'})}
            className="w-full py-3 rounded-xl font-semibold text-sm active:scale-95 transition-all"
            style={{
              background: C.sky,
              color: C.ink,
              ...body,
            }}
          >
            ⚙️ Organize Clans
          </button>

          {clans.length === 0 ? (
            <>
              <div className="rounded-xl p-4 text-center" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
                <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
                  You're not part of any clan yet.
                </div>
              </div>

              <div className="rounded-xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
                <div className="text-xs uppercase mb-3" style={{ color: C.amber, ...body, letterSpacing: "0.1em" }}>
                  🏏 About Clans
                </div>
                <div className="text-xs space-y-2" style={{ color: C.chalkDim, ...body }}>
                  <div>A <span style={{ color: C.chalk, fontWeight: 600 }}>Clan</span> is a group of players who organize together</div>
                  <div>• Clan creator can manage teams within the clan</div>
                  <div>• Clans can play matches against each other</div>
                  <div>• Request to join a clan or ask creator to invite you</div>
                </div>
              </div>

              <button
                onClick={() => setShowJoinClanModal(true)}
                className="w-full py-3 rounded-xl font-semibold text-sm active:scale-95 transition-all"
                style={{
                  background: C.amber,
                  color: C.ink,
                  ...body,
                }}
              >
                🔗 Request to Join a Clan
              </button>
            </>
          ) : (
            <>
              {/* User's Clans */}
              <div>
                <div className="text-xs uppercase mb-3" style={{ color: C.amber, ...body, letterSpacing: "0.1em" }}>
                  Your Clans
                </div>
                <div className="flex flex-col gap-3">
                  {clans.map((clan) => {
                    const isCreator = clan.creatorPhone === userPhone;
                    const memberDetails = clan.memberDetails || {};
                    const currentMemberRole = memberDetails[userPhone]?.role || "member";
                    
                    return (
                      <div
                        key={clan.id}
                        className="rounded-xl p-4 cursor-pointer transition-all"
                        style={{
                          background: expandedTeamId === clan.id ? C.night : C.nightSoft,
                          border: `1px solid ${expandedTeamId === clan.id ? C.amber : C.line}`,
                        }}
                        onClick={() => setExpandedTeamId(expandedTeamId === clan.id ? null : clan.id)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div style={{ ...display, fontSize: 18, color: C.amber }}>
                            {clan.name} {isCreator && "👑"}
                          </div>
                          <div style={{ fontSize: 18, color: C.amber }}>
                            {expandedTeamId === clan.id ? "▼" : "▶"}
                          </div>
                        </div>
                        <div className="text-xs" style={{ color: C.chalkDim, ...body }}>
                          {clan.members?.length || 0} members • {currentMemberRole}
                        </div>

                        {/* Expanded Clan Details */}
                        {expandedTeamId === clan.id && (
                          <div className="mt-4 pt-4 flex flex-col gap-4" style={{ borderTop: `1px solid ${C.line}` }}>
                            {/* Clan ID */}
                            <div>
                              <div className="text-xs uppercase" style={{ color: C.chalkDim, ...body, letterSpacing: "0.1em", marginBottom: "4px" }}>
                                Clan ID
                              </div>
                              <div className="text-sm" style={{ color: C.chalk, ...body, fontFamily: "monospace", letterSpacing: "0.05em", background: C.night, padding: "8px 12px", borderRadius: "6px", border: `1px solid ${C.line}` }}>
                                {clan.id}
                              </div>
                            </div>

                            {/* Invite Code */}
                            <div>
                              <div className="text-xs uppercase" style={{ color: C.chalkDim, ...body, letterSpacing: "0.1em", marginBottom: "4px" }}>
                                Invite Code
                              </div>
                              <div className="text-sm" style={{ color: C.amber, ...display, fontFamily: "monospace", letterSpacing: "2px", background: C.night, padding: "8px 12px", borderRadius: "6px", border: `1px solid ${C.amber}`, textAlign: "center" }}>
                                {clan.inviteCode || "Generating..."}
                              </div>
                              <div className="text-xs mt-2" style={{ color: C.chalkDim, ...body }}>
                                Share this code to invite players to join {clan.name}
                              </div>
                            </div>

                            {/* Members List */}
                            <div>
                              <div className="text-xs uppercase mb-2" style={{ color: C.sky, ...body, letterSpacing: "0.1em" }}>
                                Members ({clan.members?.length || 0})
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {Object.values(memberDetails).map((member) => (
                                  <span
                                    key={member.phone}
                                    className="px-3 py-1 rounded-full text-xs"
                                    style={{
                                      background: member.phone === userPhone ? C.amber : (member.role === "creator" ? C.amberSoft : C.nightSoft),
                                      color: member.phone === userPhone ? C.ink : (member.role === "creator" ? C.ink : C.chalk),
                                      ...body,
                                      border: `1px solid ${C.line}`,
                                    }}
                                  >
                                    {member.name} {member.role === "creator" ? "👑" : ""} {member.phone === userPhone ? "👤" : ""}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Pending Requests - Only for Clan Creator */}
                            {isCreator && pendingClanRequests.length > 0 && (
                              <div>
                                <div className="text-xs uppercase mb-2" style={{ color: C.sky, ...body, letterSpacing: "0.1em" }}>
                                  Pending Join Requests ({pendingClanRequests.length})
                                </div>
                                <div className="flex flex-col gap-2">
                                  {pendingClanRequests.map((req) => (
                                    <div
                                      key={req.id}
                                      className="rounded-lg p-3"
                                      style={{ background: C.nightSoft, border: `1px solid ${C.sky}` }}
                                    >
                                      <div className="flex items-center justify-between mb-2">
                                        <div>
                                          <div className="text-sm font-semibold" style={{ color: C.chalk, ...body }}>
                                            {req.playerName}
                                          </div>
                                          <div className="text-xs" style={{ color: C.chalkDim, ...body }}>
                                            📱 {req.playerPhone}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex gap-2">
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            setLoading((prev) => ({ ...prev, [req.id]: true }));
                                            try {
                                              await approveClanMembership(req.id, clan.id);
                                              alert(`✓ ${req.playerName} added to clan`);
                                              // Reload clans
                                              const updated = await getUserClans(userPhone);
                                              setClans(updated);
                                            } catch (err) {
                                              console.error('Error approving membership:', err);
                                              alert("Failed to approve: " + err.message);
                                            } finally {
                                              setLoading((prev) => ({ ...prev, [req.id]: false }));
                                            }
                                          }}
                                          disabled={loading[req.id]}
                                          className="flex-1 py-2 rounded text-xs font-semibold"
                                          style={{
                                            background: C.grassLight,
                                            color: C.ink,
                                            ...body,
                                            opacity: loading[req.id] ? 0.5 : 1,
                                          }}
                                        >
                                          Approve
                                        </button>
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            setLoading((prev) => ({ ...prev, [req.id]: true }));
                                            try {
                                              await rejectClanMembership(req.id);
                                              alert("Request rejected");
                                              // Reload clan requests
                                              const requests = await getPendingClanRequests(clan.id);
                                              setPendingClanRequests(requests);
                                            } catch (err) {
                                              console.error('Error rejecting membership:', err);
                                              alert("Failed to reject: " + err.message);
                                            } finally {
                                              setLoading((prev) => ({ ...prev, [req.id]: false }));
                                            }
                                          }}
                                          disabled={loading[req.id]}
                                          className="flex-1 py-2 rounded text-xs font-semibold"
                                          style={{
                                            background: C.crimson,
                                            color: C.chalk,
                                            ...body,
                                            opacity: loading[req.id] ? 0.5 : 1,
                                          }}
                                        >
                                          Reject
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Join More Clans Button */}
              <button
                onClick={() => setShowJoinClanModal(true)}
                className="w-full py-3 rounded-xl font-semibold text-sm active:scale-95 transition-all"
                style={{
                  background: C.nightSoft,
                  color: C.chalk,
                  border: `1px solid ${C.line}`,
                  ...body,
                }}
              >
                + Request to Join Another Clan
              </button>
            </>
          )}

          {/* Join Clan Modal */}
          {showJoinClanModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center" onClick={() => setShowJoinClanModal(false)}>
              <div
                className="rounded-2xl p-4 max-w-sm w-full mx-4"
                style={{ background: C.night, border: `2px solid ${C.amber}` }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ ...display, fontSize: 20, color: C.amber, marginBottom: 12 }}>
                  Join Clan
                </div>

                <div className="text-xs mb-3" style={{ color: C.chalkDim, ...body }}>
                  Enter clan ID to request membership
                </div>

                <input
                  type="text"
                  placeholder="Clan ID"
                  value={joinClanId}
                  onChange={(e) => setJoinClanId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg mb-3 text-sm outline-none"
                  style={{ background: C.nightSoft, color: C.chalk, border: `1px solid ${C.line}`, ...body }}
                />

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowJoinClanModal(false)}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: C.nightSoft, color: C.chalk, border: `1px solid ${C.line}`, ...body }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!joinClanId.trim()) {
                        alert("Please enter a clan ID");
                        return;
                      }
                      setInviteLoading(true);
                      try {
                        const result = await requestClanMembership(joinClanId, userPhone, playerName);
                        alert(`✓ ${result.message}`);
                        setShowJoinClanModal(false);
                        setJoinClanId("");
                        // Reload clans
                        const updated = await getUserClans(userPhone);
                        setClans(updated);
                      } catch (err) {
                        console.error('Error requesting membership:', err);
                        alert("Error: " + err.message);
                      } finally {
                        setInviteLoading(false);
                      }
                    }}
                    disabled={inviteLoading}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold"
                    style={{
                      background: C.amber,
                      color: C.ink,
                      ...body,
                      opacity: inviteLoading ? 0.5 : 1,
                    }}
                  >
                    {inviteLoading ? "..." : "Request"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Invitations Tab */}
      {tab === "invitations" && (
        <div className="flex flex-col gap-4">
          {invitations.length === 0 ? (
            <div className="rounded-xl p-4 text-center" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
              <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
                No pending team invitations
              </div>
            </div>
          ) : (
            invitations.map((invite) => (
              <div
                key={invite.id}
                className="rounded-2xl p-4"
                style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}
              >
                <div className="text-xs uppercase mb-2" style={{ color: C.amberSoft, ...body, letterSpacing: "0.08em" }}>
                  Team Invitation
                </div>
                <div style={{ ...display, fontSize: 20, color: C.chalk, marginBottom: 8 }}>
                  {invite.teamName}
                </div>
                <div className="text-xs mb-4" style={{ color: C.chalkDim, ...body }}>
                  Invited by <span style={{ color: C.amber }}>{invite.from}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAcceptInvitation(invite.id)}
                    disabled={loading[invite.id]}
                    className="flex-1 py-2 rounded-lg font-semibold"
                    style={{
                      background: C.grassLight,
                      color: C.chalk,
                      ...body,
                      opacity: loading[invite.id] ? 0.5 : 1,
                    }}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleRejectInvitation(invite.id)}
                    disabled={loading[invite.id]}
                    className="flex-1 py-2 rounded-lg font-semibold"
                    style={{
                      background: C.crimson,
                      color: C.chalk,
                      ...body,
                      opacity: loading[invite.id] ? 0.5 : 1,
                    }}
                  >
                     Decline
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value }) {
  return (
    <div
      className="p-3 rounded-lg text-center"
      style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}
    >
      <div className="text-xs" style={{ color: C.chalkDim, ...body }}>
        {label}
      </div>
      <div style={{ ...display, fontSize: 20, color: C.amber }}>
        {value}
      </div>
    </div>
  );
}

function InvitePlayerModal({ teamId, teamName, captainName, playersList, onBack, onInviteSent }) {
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [loading, setLoading] = useState(false);

  const handleInvite = async () => {
    if (!selectedPlayer) return;
    setLoading(true);
    await invitePlayerToTeam(teamId, captainName, selectedPlayer);
    setLoading(false);
    setSelectedPlayer("");
    onInviteSent();
  };

  return (
    <div className="flex flex-col gap-4 p-4 pt-8">
      <button onClick={onBack} className="text-xs self-start" style={{ color: C.slate, ...body }}>
         Back
      </button>
      <div className="text-center mb-2">
        <div style={{ ...display, fontSize: 28, color: C.amber }}>INVITE PLAYER</div>
        <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
          Add a player to {teamName}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs uppercase" style={{ color: C.sky, ...body }}>
          Select Player
        </label>
        <select
          value={selectedPlayer}
          onChange={(e) => setSelectedPlayer(e.target.value)}
          className="px-3 py-3 rounded-lg outline-none text-sm"
          style={{ background: C.nightSoft, color: C.chalk, border: `1px solid ${C.line}`, ...body }}
        >
          <option value="">Choose a player...</option>
          {playersList.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleInvite}
        disabled={!selectedPlayer || loading}
        className="w-full py-3 rounded-lg font-semibold"
        style={{
          background: selectedPlayer && !loading ? C.grassLight : C.slate,
          color: C.chalk,
          ...display,
          opacity: selectedPlayer && !loading ? 1 : 0.5,
        }}
      >
        {loading ? "Sending..." : "️ Send Invitation"}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------
   CLAN SELECTION & MANAGEMENT
---------------------------------------------------------------- */

function ClanSelectionScreen({ userPhone, userName, onClanSelected, onBack }) {
  const [clans, setClans] = useState([]);
  const [selectedClan, setSelectedClan] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newClanName, setNewClanName] = useState("");
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [invitePhone, setInvitePhone] = useState("");
  const [showInviteLink, setShowInviteLink] = useState(false);
  const [inviteLink, setInviteLink] = useState(null);
  const [showJoinForm, setShowJoinForm] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinPlayerPhone, setJoinPlayerPhone] = useState(userPhone || "");
  const [joinPlayerName, setJoinPlayerName] = useState(userName || "");
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [profileData, setProfileData] = useState({ firstName: "", lastName: "", email: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Load user's clans on mount
  useEffect(() => {
    if (!userPhone) {
      console.warn('[ClanSelection] userPhone is not set, cannot load clans');
      return;
    }

    const loadClans = async () => {
      try {
        setLoading(true);
        const userClans = await getUserClans(userPhone);
        console.log('[ClanSelection] Loaded', userClans.length, 'clans for', userPhone);
        setClans(userClans || []);
      } catch (err) {
        console.error('[ClanSelection] Error loading clans:', err.message);
        setError('Failed to load clans');
        setClans([]);
      } finally {
        setLoading(false);
      }
    };
    loadClans();
  }, [userPhone]);

  // Create new clan
  // Create new clan
  const handleCreateClan = async () => {
    if (!newClanName.trim()) {
      setError('Clan name is required');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await createClan(newClanName.trim(), userPhone, userName);
      setClans([...clans, { id: result.clanId, name: result.clanName, members: [userPhone], memberDetails: {} }]);
      setSuccess('Clan created successfully!');
      setNewClanName('');
      setShowCreateForm(false);
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Invite player to clan
  const handleInvitePlayer = async () => {
    if (!invitePhone || invitePhone.length < 10) {
      setError('Please enter a valid phone number');
      return;
    }

    if (!selectedClan) {
      setError('Please select a clan');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await invitePlayerToClan(selectedClan.id, invitePhone, userPhone);
      setSuccess('Player invited to clan!');
      setInvitePhone('');
      setShowInviteForm(false);
      
      // Reload clans
      const updatedClans = await getUserClans(userPhone);
      setClans(updatedClans);
      
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Generate invite link for selected clan
  const handleGenerateInviteLink = async () => {
    if (!selectedClan) {
      setError('Please select a clan');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await generateClanInviteLink(selectedClan.id);
      setInviteLink(result.code);
      setSuccess('Invite link generated!');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Copy invite code to clipboard
  const handleCopyInviteCode = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setSuccess('Invite code copied to clipboard!');
      setTimeout(() => setSuccess(''), 2000);
    }
  };

  // Join clan using invite code
  const handleJoinClan = async () => {
    if (!joinCode || joinCode.length < 6) {
      setError('Please enter a valid invite code');
      return;
    }

    if (!joinPlayerPhone || joinPlayerPhone.length < 10) {
      setError('Please enter a valid phone number');
      return;
    }

    if (!joinPlayerName.trim()) {
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await joinClanUsingInviteCode(joinCode.trim(), joinPlayerPhone, joinPlayerName);
      
      // Set initial profile data from input name
      const nameParts = joinPlayerName.split(' ');
      setProfileData({
        firstName: nameParts[0] || joinPlayerName,
        lastName: nameParts.slice(1).join(' ') || '',
        email: '',
      });
      
      // Show profile edit form if profile is incomplete
      if (!result.profileComplete) {
        setShowProfileEdit(true);
        setJoinCode('');
        setJoinPlayerPhone('');
        setJoinPlayerName('');
        setShowJoinForm(false);
        setSuccess('Clan joined! Please complete your profile.');
      } else {
        setSuccess(`Joined ${result.clanName} successfully!`);
        setJoinCode('');
        setShowJoinForm(false);
        
        // Reload clans
        const updatedClans = await getUserClans(joinPlayerPhone);
        setClans(updatedClans);
        
        setTimeout(() => setSuccess(''), 2000);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Save updated profile
  const handleSaveProfile = async () => {
    if (!profileData.firstName.trim()) {
      setError('First name is required');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Determine which phone to use - new player or existing user
      const phoneToUpdate = joinPlayerPhone || userPhone;
      
      await updatePlayerProfile(phoneToUpdate, {
        firstName: profileData.firstName.trim(),
        lastName: profileData.lastName.trim(),
        email: profileData.email.trim(),
      });

      setSuccess('Profile updated successfully!');
      setShowProfileEdit(false);
      
      // Reload clans
      const updatedClans = await getUserClans(phoneToUpdate);
      setClans(updatedClans);
      
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 pt-8 items-center pb-8">
      <button
        onClick={onBack}
        className="text-xs self-start"
        style={{ color: C.slate, ...body }}
      >
         Back
      </button>

      <div style={{ ...display, fontSize: 32, color: C.amber }}>Select Your Clan</div>
      <div className="text-xs" style={{ color: C.chalkDim, ...body }}>
        Create or join a clan to organize your cricket matches
      </div>

      {/* Error message */}
      {error && (
        <div className="w-full max-w-sm rounded-xl p-3" style={{ background: C.crimsonDim || "rgba(220, 38, 38, 0.2)", border: `1px solid ${C.crimson}` }}>
          <div className="text-xs" style={{ color: C.crimson, ...body }}>
            {error}
          </div>
        </div>
      )}

      {/* Success message */}
      {success && (
        <div className="w-full max-w-sm rounded-xl p-3" style={{ background: C.grassLight, border: `1px solid ${C.grass}` }}>
          <div className="text-xs" style={{ color: C.ink, ...body }}>
            {success}
          </div>
        </div>
      )}
      {clans.length > 0 && (
        <div className="w-full max-w-sm">
          <div className="text-xs uppercase mb-3" style={{ color: C.sky, ...body }}>
            Your Clans ({clans.length})
          </div>
          <div className="flex flex-col gap-2">
            {clans.map((clan) => (
              <button
                key={clan.id}
                onClick={() => {
                  console.log('[ClanSelection] Selected clan:', clan.id, clan.name);
                  setSelectedClan(clan);
                  setShowInviteForm(false);
                  setShowCreateForm(false);
                }}
                className="w-full p-3 rounded-lg text-left active:scale-95 transition-all"
                style={{
                  background: selectedClan?.id === clan.id ? C.amber : C.nightSoft,
                  color: selectedClan?.id === clan.id ? C.ink : C.chalk,
                  border: `1px solid ${selectedClan?.id === clan.id ? C.amber : C.line}`,
                  ...body,
                  cursor: 'pointer',
                }}
              >
                <div className="font-semibold">{clan.name}</div>
                <div className="text-xs mt-1" style={{ opacity: 0.7 }}>
                   {clan.members?.length || 0} members
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No clans message */}
      {!loading && clans.length === 0 && (
        <div className="w-full max-w-sm rounded-xl p-4 text-center" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
          <div className="text-sm mb-2" style={{ color: C.chalkDim, ...body }}>
            No clans yet
          </div>
          <div className="text-xs" style={{ color: C.slate, ...body }}>
            Create a new clan or join using an invite code
          </div>
        </div>
      )}

      {/* Loading message */}
      {loading && (
        <div className="w-full max-w-sm rounded-xl p-4 text-center" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
          <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
            Loading clans...
          </div>
        </div>
      )}

      {/* Show selected clan details */}
      {selectedClan && (
        <div className="w-full max-w-sm rounded-xl p-3" style={{ background: C.nightSoft, border: `1px solid ${C.sky}` }}>
          <div className="text-xs uppercase mb-2" style={{ color: C.sky, ...body }}>
             {selectedClan.name} Members
          </div>
          <div className="flex flex-col gap-1">
            {selectedClan.members?.map((phone, idx) => (
              <div key={idx} className="text-xs" style={{ color: C.chalk, ...body }}>
                 {phone}
              </div>
            )) || <div className="text-xs" style={{ color: C.chalkDim }}>No members yet</div>}
          </div>
          <button
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="w-full mt-3 py-2 rounded-lg text-xs font-semibold active:scale-95 transition-all"
            style={{
              background: C.grassLight,
              color: C.ink,
              ...display,
            }}
          >
             Invite Player
          </button>
          <button
            onClick={() => {
              setShowInviteLink(!showInviteLink);
              if (!inviteLink && !showInviteLink) {
                handleGenerateInviteLink();
              }
            }}
            className="w-full mt-2 py-2 rounded-lg text-xs font-semibold active:scale-95 transition-all"
            style={{
              background: C.sky,
              color: C.ink,
              ...display,
            }}
          >
             Share Invite Link
          </button>
        </div>
      )}

      {/* Invite link display */}
      {showInviteLink && inviteLink && selectedClan && (
        <div className="w-full max-w-sm rounded-xl p-3" style={{ background: C.nightSoft, border: `1px solid ${C.grass}` }}>
          <div className="text-xs uppercase mb-2" style={{ color: C.chalk, ...body }}>
             Invite Code
          </div>
          <div className="bg-black/30 p-3 rounded-lg mb-3 text-center">
            <div style={{ fontSize: 24, color: C.amber, ...display, letterSpacing: '4px' }}>
              {inviteLink}
            </div>
          </div>
          <div className="text-xs mb-3" style={{ color: C.chalkDim, ...body }}>
             Share this code with players to invite them to {selectedClan.name}
          </div>
          <button
            onClick={handleCopyInviteCode}
            className="w-full py-2 rounded-lg text-xs font-semibold active:scale-95 transition-all"
            style={{
              background: C.grassLight,
              color: C.ink,
              ...display,
            }}
          >
             Copy Code
          </button>
        </div>
      )}

      {/* Invite player form */}
      {showInviteForm && selectedClan && (
        <div className="w-full max-w-sm flex flex-col gap-3">
          <div>
            <label className="text-xs uppercase mb-1 block" style={{ color: C.sky, ...body }}>
              Player Phone Number
            </label>
            <input
              type="tel"
              value={invitePhone}
              onChange={(e) => setInvitePhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="9876543210"
              maxLength="10"
              disabled={loading}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: C.nightSoft,
                color: C.chalk,
                border: `1px solid ${C.line}`,
              }}
            />
          </div>

          {error && (
            <div className="text-xs p-2 rounded" style={{ background: C.crimson, color: C.chalk, ...body }}>
               {error}
            </div>
          )}

          {success && (
            <div className="text-xs p-2 rounded" style={{ background: C.grassLight, color: C.ink, ...body }}>
               {success}
            </div>
          )}

          <button
            disabled={invitePhone.length < 10 || loading}
            onClick={handleInvitePlayer}
            className="w-full py-2 rounded-lg font-semibold text-sm active:scale-95 transition-all"
            style={{
              background: invitePhone.length >= 10 && !loading ? C.grassLight : C.slate,
              color: C.ink,
              ...display,
              opacity: invitePhone.length >= 10 && !loading ? 1 : 0.5,
            }}
          >
            {loading ? "Inviting..." : "Send Invite"}
          </button>
        </div>
      )}

      {/* Create clan form */}
      {showCreateForm && (
        <div className="w-full max-w-sm flex flex-col gap-3">
          <input
            type="text"
            value={newClanName}
            onChange={(e) => setNewClanName(e.target.value)}
            placeholder="Enter clan name..."
            disabled={loading}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: C.nightSoft,
              color: C.chalk,
              border: `1px solid ${C.line}`,
            }}
          />

          {error && (
            <div className="text-xs p-2 rounded" style={{ background: C.crimson, color: C.chalk, ...body }}>
               {error}
            </div>
          )}

          <button
            disabled={!newClanName.trim() || loading}
            onClick={handleCreateClan}
            className="w-full py-2 rounded-lg font-semibold text-sm active:scale-95 transition-all"
            style={{
              background: newClanName.trim() && !loading ? C.amber : C.slate,
              color: C.ink,
              ...display,
              opacity: newClanName.trim() && !loading ? 1 : 0.5,
            }}
          >
            {loading ? "Creating..." : "Create Clan"}
          </button>
        </div>
      )}

      {/* Join clan using invite code */}
      {!showCreateForm && clans.length === 0 && (
        <div className="w-full max-w-sm flex flex-col gap-3">
          <div className="text-xs uppercase mb-2" style={{ color: C.sky, ...body }}>
             Join Existing Clan
          </div>
          
          <div>
            <label className="text-xs uppercase mb-1 block" style={{ color: C.sky, ...body }}>
              Invite Code
            </label>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="Enter 6-digit code"
              maxLength="6"
              disabled={loading}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none text-center"
              style={{
                background: C.nightSoft,
                color: C.chalk,
                border: `1px solid ${C.line}`,
                fontSize: 18,
                letterSpacing: '4px',
              }}
            />
          </div>

          <div>
            <label className="text-xs uppercase mb-1 block" style={{ color: C.sky, ...body }}>
              Your Phone Number
            </label>
            <input
              type="tel"
              value={joinPlayerPhone}
              onChange={(e) => setJoinPlayerPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="9876543210"
              maxLength="10"
              disabled={loading}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: C.nightSoft,
                color: C.chalk,
                border: `1px solid ${C.line}`,
              }}
            />
          </div>

          <div>
            <label className="text-xs uppercase mb-1 block" style={{ color: C.sky, ...body }}>
              Your Name
            </label>
            <input
              type="text"
              value={joinPlayerName}
              onChange={(e) => setJoinPlayerName(e.target.value)}
              placeholder="Your full name"
              disabled={loading}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: C.nightSoft,
                color: C.chalk,
                border: `1px solid ${C.line}`,
              }}
            />
          </div>

          {error && (
            <div className="text-xs p-2 rounded" style={{ background: C.crimson, color: C.chalk, ...body }}>
               {error}
            </div>
          )}

          {success && (
            <div className="text-xs p-2 rounded" style={{ background: C.grassLight, color: C.ink, ...body }}>
               {success}
            </div>
          )}

          <button
            disabled={joinCode.length < 6 || joinPlayerPhone.length < 10 || !joinPlayerName.trim() || loading}
            onClick={handleJoinClan}
            className="w-full py-2 rounded-lg font-semibold text-sm active:scale-95 transition-all"
            style={{
              background: joinCode.length >= 6 && joinPlayerPhone.length >= 10 && joinPlayerName.trim() && !loading ? C.grassLight : C.slate,
              color: C.ink,
              ...display,
              opacity: joinCode.length >= 6 && joinPlayerPhone.length >= 10 && joinPlayerName.trim() && !loading ? 1 : 0.5,
            }}
          >
            {loading ? "Joining..." : "Join Clan"}
          </button>
        </div>
      )}

      {/* Profile edit form */}
      {showProfileEdit && (
        <div className="w-full max-w-sm flex flex-col gap-3 rounded-xl p-4" style={{ background: C.nightSoft, border: `1px solid ${C.sky}` }}>
          <div style={{ ...display, fontSize: 18, color: C.sky }}>Complete Your Profile</div>
          <div className="text-xs" style={{ color: C.chalkDim, ...body }}>
            Update your details to complete joining the clan
          </div>

          <div>
            <label className="text-xs uppercase mb-1 block" style={{ color: C.sky, ...body }}>
              First Name
            </label>
            <input
              type="text"
              value={profileData.firstName}
              onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })}
              placeholder="Your first name"
              disabled={loading}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: C.night,
                color: C.chalk,
                border: `1px solid ${C.line}`,
              }}
            />
          </div>

          <div>
            <label className="text-xs uppercase mb-1 block" style={{ color: C.sky, ...body }}>
              Last Name
            </label>
            <input
              type="text"
              value={profileData.lastName}
              onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })}
              placeholder="Your last name (optional)"
              disabled={loading}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: C.night,
                color: C.chalk,
                border: `1px solid ${C.line}`,
              }}
            />
          </div>

          <div>
            <label className="text-xs uppercase mb-1 block" style={{ color: C.sky, ...body }}>
              Email
            </label>
            <input
              type="email"
              value={profileData.email}
              onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
              placeholder="your@email.com (optional)"
              disabled={loading}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: C.night,
                color: C.chalk,
                border: `1px solid ${C.line}`,
              }}
            />
          </div>

          {error && (
            <div className="text-xs p-2 rounded" style={{ background: C.crimson, color: C.chalk, ...body }}>
               {error}
            </div>
          )}

          {success && (
            <div className="text-xs p-2 rounded" style={{ background: C.grassLight, color: C.ink, ...body }}>
               {success}
            </div>
          )}

          <button
            disabled={!profileData.firstName.trim() || loading}
            onClick={handleSaveProfile}
            className="w-full py-2 rounded-lg font-semibold text-sm active:scale-95 transition-all"
            style={{
              background: profileData.firstName.trim() && !loading ? C.grassLight : C.slate,
              color: C.ink,
              ...display,
              opacity: profileData.firstName.trim() && !loading ? 1 : 0.5,
            }}
          >
            {loading ? "Saving..." : "Save Profile & Continue"}
          </button>
        </div>
      )}

      {/* Buttons */}
      <div className="w-full max-w-sm flex gap-2">
        {!showCreateForm && (
          <button
            onClick={() => {
              setShowCreateForm(true);
              setShowInviteForm(false);
              setError('');
            }}
            className="flex-1 py-3 rounded-xl font-semibold active:scale-95 transition-all"
            style={{
              background: C.amber,
              color: C.ink,
              ...display,
            }}
          >
             New Clan
          </button>
        )}

        {selectedClan && !showInviteForm && (
          <button
            onClick={() => onClanSelected(selectedClan)}
            className="flex-1 py-3 rounded-xl font-semibold active:scale-95 transition-all"
            style={{
              background: C.grassLight,
              color: C.ink,
              ...display,
            }}
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   ✨ NEW: MODERN AUTHENTICATION (Email/Password, Google, Apple)
---------------------------------------------------------------- */

function ModernAuthScreen({ onAuthSuccess }) {
  const [mode, setMode] = useState("login-options"); // "login-options" | "email-login" | "email-register" | "forgot-password" | "legacy"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Handle Email Signup
  const handleEmailSignup = async () => {
    setError("");
    setSuccess("");
    
    if (!email.includes("@")) {
      setError("Please enter a valid email");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (!firstName.trim()) {
      setError("Please enter your first name");
      return;
    }

    setLoading(true);
    try {
      const result = await signUpWithEmail(email, password, firstName, lastName, phone);
      if (result.success) {
        setSuccess("Registration successful! Logging in...");
        setTimeout(() => {
          localStorage.setItem("my-email", email);
          localStorage.setItem("my-name", firstName);
          onAuthSuccess({ email, firstName, lastName });
        }, 1000);
      } else {
        setError(result.error);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Email Login
  const handleEmailLogin = async () => {
    setError("");
    setSuccess("");
    
    if (!email.includes("@")) {
      setError("Please enter a valid email");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const result = await signInWithEmail(email, password);
      if (result.success) {
        setSuccess("Login successful!");
        const profile = await getPlayerByEmail(email);
        setTimeout(() => {
          localStorage.setItem("my-email", email);
          localStorage.setItem("my-name", profile?.firstName || email);
          onAuthSuccess({ email, firstName: profile?.firstName, lastName: profile?.lastName });
        }, 1000);
      } else {
        setError(result.error);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Google Login
  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result.success) {
        const profile = await getPlayerByEmail(result.email);
        localStorage.setItem("my-email", result.email);
        localStorage.setItem("my-name", profile?.firstName || result.email);
        onAuthSuccess({ email: result.email, firstName: profile?.firstName, lastName: profile?.lastName });
      } else {
        setError(result.error);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Apple Login
  const handleAppleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await signInWithApple();
      if (result.success) {
        const profile = await getPlayerByEmail(result.email);
        localStorage.setItem("my-email", result.email);
        localStorage.setItem("my-name", profile?.firstName || result.email);
        onAuthSuccess({ email: result.email, firstName: profile?.firstName, lastName: profile?.lastName });
      } else {
        setError(result.error);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Anonymous Login
  const handleAnonymousLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const result = await loginAnonymously();
      if (result.success) {
        localStorage.setItem("my-email", result.email);
        localStorage.setItem("my-name", "Anonymous Player");
        localStorage.setItem("is-anonymous", "true");
        onAuthSuccess({ 
          email: result.email, 
          firstName: "Anonymous", 
          lastName: "Player",
          isAnonymous: true
        });
      } else {
        setError(result.error);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Password Reset
  const handlePasswordReset = async () => {
    setError("");
    
    if (!email.includes("@")) {
      setError("Please enter a valid email");
      return;
    }

    setLoading(true);
    try {
      const result = await sendPasswordReset(email);
      if (result.success) {
        setSuccess("Password reset email sent! Check your inbox.");
        setTimeout(() => setMode("login-options"), 2000);
      } else {
        setError(result.error);
      }
    } finally {
      setLoading(false);
    }
  };

  // ==================== LOGIN OPTIONS SCREEN ====================
  if (mode === "login-options") {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: C.night, padding: "20px" }}>
        {/* Centered Modal Card */}
        <div className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden" style={{ 
          background: C.night,
          border: `1px solid ${C.line}`
        }}>
          {/* Header with Logo */}
          <div className="text-center pt-12 pb-8 px-6" style={{ background: C.nightSoft }}>
            <div className="text-5xl mb-4">🏏</div>
            <div style={{ ...display, fontSize: 24, color: C.amber, marginBottom: "4px" }}>
              CRICKETBUDDY
            </div>
            <div className="text-xs uppercase" style={{ color: C.chalkDim, ...body, letterSpacing: "0.12em" }}>
              Score it like a Pro
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-8 flex flex-col gap-4">
            {error && (
              <div className="text-xs p-3 rounded-lg" style={{ background: C.crimson, color: C.chalk, ...body }}>
                {error}
              </div>
            )}

            {success && (
              <div className="text-xs p-3 rounded-lg" style={{ background: C.grassLight, color: C.ink, ...body }}>
                {success}
              </div>
            )}

            {/* Google Button */}
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-3 rounded-lg font-semibold text-sm active:scale-95 transition-all flex items-center justify-center gap-2"
              style={{
                background: C.chalk,
                color: C.night,
                ...display,
                opacity: loading ? 0.7 : 1,
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
              </svg>
              {loading ? "Signing in..." : "Sign in with Google"}
            </button>

            {/* Apple Button */}
            <button
              onClick={handleAppleLogin}
              disabled={loading}
              className="w-full py-3 rounded-lg font-semibold text-sm active:scale-95 transition-all flex items-center justify-center gap-2"
              style={{
                background: C.ink,
                color: C.chalk,
                ...display,
                opacity: loading ? 0.7 : 1,
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 13.5c-.91 0-1.82-.55-2.25-1.52.5-.5.91-1.23.91-2.05 0-1.66-1.34-3-3-3s-3 1.34-3 3c0 .82.41 1.55.91 2.05-.43.97-1.34 1.52-2.25 1.52-1.66 0-3 1.34-3 3 0 .55.14 1.07.41 1.52.64 1.05 1.86 1.76 3.28 1.76h9.13c1.42 0 2.64-.71 3.28-1.76.27-.45.41-.97.41-1.52 0-1.66-1.34-3-3-3z"/>
              </svg>
              {loading ? "Signing in..." : "Sign in with Apple"}
            </button>

            {/* Email Button */}
            <button
              onClick={() => setMode("email-login")}
              className="w-full py-3 rounded-lg font-semibold text-sm active:scale-95 transition-all"
              style={{
                background: C.nightSoft,
                color: C.chalk,
                border: `1px solid ${C.sky}`,
                ...body
              }}
            >
              Sign in with Email
            </button>

            {/* Anonymous Button */}
            <button
              onClick={handleAnonymousLogin}
              disabled={loading}
              className="w-full py-3 rounded-lg font-semibold text-sm active:scale-95 transition-all"
              style={{
                background: C.grassLight,
                color: C.ink,
                ...display,
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "..." : "Play as Anonymous"}
            </button>

            {/* New Account Link */}
            <button
              onClick={() => setMode("email-register")}
              className="w-full py-2 rounded-lg text-xs font-medium transition-all"
              style={{
                background: "transparent",
                color: C.sky,
                ...body,
                textDecoration: "underline"
              }}
            >
              Create New Account
            </button>
          </div>

          {/* Footer */}
          <div className="border-t px-6 py-4 text-center text-xs" style={{ borderColor: C.line, color: C.chalkDim, ...body }}>
            <div>
              By continuing, you agree to our{" "}
              <a href="#" style={{ color: C.sky, textDecoration: "underline" }}>Terms of Service</a>
              {" "}and{" "}
              <a href="#" style={{ color: C.sky, textDecoration: "underline" }}>Privacy Policy</a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==================== EMAIL LOGIN SCREEN ====================
  if (mode === "email-login") {
    return (
      <div className="flex flex-col gap-4 p-4 pt-12 items-center text-center pb-8 min-h-screen" style={{ background: C.night }}>
        <button
          onClick={() => setMode("login-options")}
          className="self-start text-2xl"
          style={{ color: C.sky }}
        >
          ←
        </button>

        <div style={{ ...display, fontSize: 32, color: C.amber, lineHeight: 1 }}>Login</div>
        <div className="text-sm uppercase mb-8" style={{ color: C.chalkDim, ...body }}>
          Sign in with Email
        </div>

        <div className="w-full max-w-sm flex flex-col gap-4">
          <div>
            <label className="text-xs uppercase mb-2 block" style={{ color: C.sky, ...body }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl outline-none"
              style={{
                background: C.nightSoft,
                color: C.chalk,
                border: `1px solid ${C.line}`,
                ...body,
              }}
            />
          </div>

          <div>
            <label className="text-xs uppercase mb-2 block" style={{ color: C.sky, ...body }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl outline-none"
              style={{
                background: C.nightSoft,
                color: C.chalk,
                border: `1px solid ${C.line}`,
                ...body,
              }}
            />
          </div>

          {error && (
            <div className="text-xs p-2 rounded" style={{ background: C.crimson, color: C.chalk, ...body }}>
              {error}
            </div>
          )}

          {success && (
            <div className="text-xs p-2 rounded" style={{ background: C.grassLight, color: C.ink, ...body }}>
              {success}
            </div>
          )}

          <button
            disabled={!email || !password || loading}
            onClick={handleEmailLogin}
            className="w-full py-3 rounded-xl font-bold text-lg active:scale-95 transition-all"
            style={{
              background: email && password ? C.amber : C.slate,
              color: C.ink,
              ...display,
              opacity: email && password ? 1 : 0.5,
            }}
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          <button
            onClick={() => setMode("forgot-password")}
            className="text-sm font-semibold"
            style={{ color: C.sky, ...body }}
          >
            Forgot Password?
          </button>
        </div>
      </div>
    );
  }

  // ==================== EMAIL REGISTER SCREEN ====================
  if (mode === "email-register") {
    return (
      <div className="flex flex-col gap-4 p-4 pt-12 items-center text-center pb-8 min-h-screen" style={{ background: C.night }}>
        <button
          onClick={() => setMode("login-options")}
          className="self-start text-2xl"
          style={{ color: C.sky }}
        >
          ←
        </button>

        <div style={{ ...display, fontSize: 32, color: C.amber, lineHeight: 1 }}>Create Account</div>
        <div className="text-sm uppercase mb-6" style={{ color: C.chalkDim, ...body }}>
          Join CricketBuddy
        </div>

        <div className="w-full max-w-sm flex flex-col gap-3">
          <div>
            <label className="text-xs uppercase mb-2 block" style={{ color: C.sky, ...body }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={loading}
              className="w-full px-4 py-2 rounded-lg outline-none text-sm"
              style={{
                background: C.nightSoft,
                color: C.chalk,
                border: `1px solid ${C.line}`,
                ...body,
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase mb-2 block" style={{ color: C.sky, ...body }}>First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First"
                disabled={loading}
                className="w-full px-4 py-2 rounded-lg outline-none text-sm"
                style={{
                  background: C.nightSoft,
                  color: C.chalk,
                  border: `1px solid ${C.line}`,
                  ...body,
                }}
              />
            </div>
            <div>
              <label className="text-xs uppercase mb-2 block" style={{ color: C.sky, ...body }}>Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last"
                disabled={loading}
                className="w-full px-4 py-2 rounded-lg outline-none text-sm"
                style={{
                  background: C.nightSoft,
                  color: C.chalk,
                  border: `1px solid ${C.line}`,
                  ...body,
                }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs uppercase mb-2 block" style={{ color: C.sky, ...body }}>Phone (Optional)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, "").slice(0, 20))}
              placeholder="+91-9876543210"
              disabled={loading}
              className="w-full px-4 py-2 rounded-lg outline-none text-sm"
              style={{
                background: C.nightSoft,
                color: C.chalk,
                border: `1px solid ${C.line}`,
                ...body,
              }}
            />
          </div>

          <div>
            <label className="text-xs uppercase mb-2 block" style={{ color: C.sky, ...body }}>Password (8+ chars)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              className="w-full px-4 py-2 rounded-lg outline-none text-sm"
              style={{
                background: C.nightSoft,
                color: C.chalk,
                border: `1px solid ${C.line}`,
                ...body,
              }}
            />
          </div>

          <div>
            <label className="text-xs uppercase mb-2 block" style={{ color: C.sky, ...body }}>Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
              className="w-full px-4 py-2 rounded-lg outline-none text-sm"
              style={{
                background: C.nightSoft,
                color: C.chalk,
                border: `1px solid ${C.line}`,
                ...body,
              }}
            />
          </div>

          {error && (
            <div className="text-xs p-2 rounded" style={{ background: C.crimson, color: C.chalk, ...body }}>
              {error}
            </div>
          )}

          {success && (
            <div className="text-xs p-2 rounded" style={{ background: C.grassLight, color: C.ink, ...body }}>
              {success}
            </div>
          )}

          <button
            disabled={!email || !firstName || !password || !confirmPassword || loading}
            onClick={handleEmailSignup}
            className="w-full py-3 rounded-xl font-bold text-lg active:scale-95 transition-all mt-2"
            style={{
              background: email && firstName && password && confirmPassword ? C.grassLight : C.slate,
              color: C.ink,
              ...display,
              opacity: email && firstName && password && confirmPassword ? 1 : 0.5,
            }}
          >
            {loading ? "Creating..." : "Create Account"}
          </button>
        </div>
      </div>
    );
  }

  // ==================== FORGOT PASSWORD SCREEN ====================
  if (mode === "forgot-password") {
    return (
      <div className="flex flex-col gap-4 p-4 pt-12 items-center text-center pb-8 min-h-screen" style={{ background: C.night }}>
        <button
          onClick={() => setMode("email-login")}
          className="self-start text-2xl"
          style={{ color: C.sky }}
        >
          ←
        </button>

        <div style={{ ...display, fontSize: 32, color: C.amber, lineHeight: 1 }}>Reset Password</div>
        <div className="text-sm uppercase mb-8" style={{ color: C.chalkDim, ...body }}>
          Forgot your password?
        </div>

        <div className="w-full max-w-sm flex flex-col gap-4">
          <p style={{ color: C.chalk, ...body, fontSize: 14 }}>
            Enter your email and we'll send you a password reset link.
          </p>

          <div>
            <label className="text-xs uppercase mb-2 block" style={{ color: C.sky, ...body }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl outline-none"
              style={{
                background: C.nightSoft,
                color: C.chalk,
                border: `1px solid ${C.line}`,
                ...body,
              }}
            />
          </div>

          {error && (
            <div className="text-xs p-2 rounded" style={{ background: C.crimson, color: C.chalk, ...body }}>
              {error}
            </div>
          )}

          {success && (
            <div className="text-xs p-2 rounded" style={{ background: C.grassLight, color: C.ink, ...body }}>
              {success}
            </div>
          )}

          <button
            disabled={!email || loading}
            onClick={handlePasswordReset}
            className="w-full py-3 rounded-xl font-bold text-lg active:scale-95 transition-all"
            style={{
              background: email ? C.amber : C.slate,
              color: C.ink,
              ...display,
              opacity: email ? 1 : 0.5,
            }}
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </div>
      </div>
    );
  }

  // ==================== LEGACY PHONE AUTH ====================
  if (mode === "legacy") {
    return (
      <div style={{ background: C.night, minHeight: "100vh" }}>
        <button
          onClick={() => setMode("login-options")}
          className="p-4 text-2xl"
          style={{ color: C.sky }}
        >
          ←
        </button>
        <AuthScreen
          onAuthSuccess={(user) => {
            onAuthSuccess({ phone: user.phone, name: user.firstName + " " + user.lastName });
          }}
        />
      </div>
    );
  }

  return null;
}

/* ---------------------------------------------------------------
   PLAYER AUTHENTICATION - Mobile Number Login (Legacy)
---------------------------------------------------------------- */

function AuthScreen({ onAuthSuccess }) {
  const [mode, setMode] = useState("login"); // "login" | "register" | "reset" | "guest"
  const [step, setStep] = useState(1); // Step 1, 2, 3 for different screens
  
  // Login fields
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPasscode, setLoginPasscode] = useState("");
  
  // Registration fields
  const [regEmail, setRegEmail] = useState("");
  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regPasscode, setRegPasscode] = useState("");
  const [regConfirmPasscode, setRegConfirmPasscode] = useState("");
  const [regRole, setRegRole] = useState("All-rounder");
  const [regHandedness, setRegHandedness] = useState("Right");
  
  // Reset fields
  const [resetEmail, setResetEmail] = useState("");
  const [resetMobile, setResetMobile] = useState("");
  const [resetNewPasscode, setResetNewPasscode] = useState("");
  const [resetConfirmPasscode, setResetConfirmPasscode] = useState("");
  
  // Guest fields
  const [guestName, setGuestName] = useState("");
  const [guestError, setGuestError] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Handle login
  const handleLogin = async () => {
    const normalizedPhone = loginPhone.replace(/\D/g, "").slice(-10);
    if (!loginPhone || normalizedPhone.length < 10) {
      setError("Please enter a valid 10-digit phone number");
      return;
    }
    if (!loginPasscode || loginPasscode.length !== 4) {
      setError("Passcode must be exactly 4 digits");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const result = await loginUser(normalizedPhone, loginPasscode);
      localStorage.setItem("my-phone", normalizedPhone);
      localStorage.setItem("my-name", result.user.firstName + " " + result.user.lastName);
      localStorage.setItem("my-user", JSON.stringify(result.user));
      console.log('[Auth]  Login successful');
      onAuthSuccess(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle registration
  const handleRegister = async () => {
    const normalizedPhone = regPhone.replace(/\D/g, "").slice(-10);
    if (!regEmail || !regEmail.includes("@")) {
      setError("Please enter a valid email");
      return;
    }
    if (!regFirstName.trim()) {
      setError("Please enter your first name");
      return;
    }
    if (!regLastName.trim()) {
      setError("Please enter your last name");
      return;
    }
    if (!regPhone || normalizedPhone.length < 10) {
      setError("Please enter a valid 10-digit phone number");
      return;
    }
    if (regPasscode !== regConfirmPasscode) {
      setError("Passcodes don't match");
      return;
    }
    if (regPasscode.length !== 4 || !/^\d{4}$/.test(regPasscode)) {
      setError("Passcode must be exactly 4 digits");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const result = await registerUser({
        email: regEmail,
        firstName: regFirstName,
        lastName: regLastName,
        phone: normalizedPhone,
        passcode: regPasscode,
        role: regRole,
        handedness: regHandedness,
      });
      setSuccess("Registration successful! Please login.");
      setTimeout(() => {
        setMode("login");
        setStep(1);
        setLoginPhone("");
        setLoginPasscode("");
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle password reset - verify email + mobile
  const handleResetVerify = async () => {
    const normalizedMobile = resetMobile.replace(/\D/g, "").slice(-10);
    if (!resetEmail || !resetEmail.includes("@")) {
      setError("Please enter a valid email");
      return;
    }
    if (!resetMobile || normalizedMobile.length < 10) {
      setError("Please enter a valid mobile number");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      console.log('[Auth] Verifying email and mobile for password reset:', resetEmail, normalizedMobile);
      // Just verify without actually updating - proceed to step 2 if valid
      // The actual verification happens in the next step when updating password
      setStep(2);
    } catch (err) {
      console.error('[Auth] Verify error:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetConfirm = async () => {
    const normalizedMobile = resetMobile.replace(/\D/g, "").slice(-10);
    if (resetNewPasscode !== resetConfirmPasscode) {
      setError("Passcodes don't match");
      return;
    }
    if (resetNewPasscode.length !== 4 || !/^\d{4}$/.test(resetNewPasscode)) {
      setError("Passcode must be exactly 4 digits");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      await verifyEmailPhoneAndUpdatePasscode(resetEmail, normalizedMobile, resetNewPasscode);
      setSuccess("Passcode reset successfully! Please login with your new passcode.");
      // Reset form
      setTimeout(() => {
        setMode("login");
        setStep(1);
        setResetEmail("");
        setResetMobile("");
        setResetNewPasscode("");
        setResetConfirmPasscode("");
      }, 2000);
    } catch (err) {
      console.error('[Auth] Reset error:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ==================== LOGIN SCREEN ====================
  if (mode === "login") {
    return (
      <div className="flex flex-col gap-4 p-4 pt-12 items-center text-center pb-8">
        <div style={{ ...display, fontSize: 48, color: C.amber, lineHeight: 1, marginBottom: "8px" }}></div>
        <div style={{ ...display, fontSize: 36, color: C.amber, lineHeight: 1 }}>CRICKETBUDDY</div>
        <div className="text-sm uppercase mb-6" style={{ color: C.chalkDim, ...body, letterSpacing: "0.12em" }}>
          Score it like a Pro
        </div>

        <div className="w-full max-w-sm flex flex-col gap-4">
          <div>
            <label className="text-xs uppercase mb-2 block" style={{ color: C.sky, ...body }}>
              Phone Number
            </label>
            <input
              type="tel"
              value={loginPhone}
              onChange={(e) => setLoginPhone(e.target.value.replace(/[^\d+]/g, "").slice(0, 13))}
              placeholder="+91 9876543210"
              maxLength="13"
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl text-center text-2xl outline-none"
              style={{
                background: C.nightSoft,
                color: C.chalk,
                ...display,
                letterSpacing: "0.2em",
                border: `1px solid ${C.line}`,
                opacity: loading ? 0.5 : 1,
              }}
            />
          </div>

          <div>
            <label className="text-xs uppercase mb-2 block" style={{ color: C.sky, ...body }}>
              4-Digit Passcode
            </label>
            <input
              type="password"
              value={loginPasscode}
              onChange={(e) => setLoginPasscode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="0000"
              maxLength="4"
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl text-center text-4xl outline-none tracking-widest"
              style={{
                background: C.nightSoft,
                color: C.chalk,
                ...display,
                border: `1px solid ${C.line}`,
                opacity: loading ? 0.5 : 1,
              }}
            />
          </div>

          {error && (
            <div className="text-xs p-2 rounded" style={{ background: C.crimson, color: C.chalk, ...body }}>
               {error}
            </div>
          )}

          {success && (
            <div className="text-xs p-2 rounded" style={{ background: C.grassLight, color: C.ink, ...body }}>
               {success}
            </div>
          )}

          <button
            disabled={loginPhone.replace(/\D/g, "").length < 10 || loginPasscode.length !== 4 || loading}
            onClick={handleLogin}
            className="w-full py-3 rounded-xl font-bold text-lg active:scale-95 transition-all"
            style={{
              background: loginPhone.replace(/\D/g, "").length >= 10 && loginPasscode.length === 4 ? C.amber : C.slate,
              color: C.ink,
              ...display,
              opacity: loginPhone.replace(/\D/g, "").length >= 10 && loginPasscode.length === 4 ? 1 : 0.5,
            }}
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          <button
            onClick={() => setMode("guest")}
            className="w-full py-3 rounded-xl font-semibold text-base mt-2"
            style={{
              background: C.nightSoft,
              color: C.chalk,
              ...display,
              border: `2px solid ${C.sky}`,
              opacity: loading ? 0.5 : 1,
            }}
          >
            🎮 Play as Guest
          </button>

          <div className="flex gap-2 text-xs">
            <button
              onClick={() => {
                setMode("register");
                setStep(1);
                setError("");
              }}
              className="flex-1 px-3 py-2 rounded-lg font-semibold transition-all active:scale-95"
              style={{ 
                background: C.nightSoft, 
                color: C.chalk,
                border: `2px solid ${C.sky}`,
                ...body 
              }}
            >
              📝 Register
            </button>
            <button
              onClick={() => {
                setMode("reset");
                setStep(1);
                setError("");
              }}
              className="flex-1 px-3 py-2 rounded-lg font-semibold transition-all active:scale-95"
              style={{ 
                background: C.nightSoft, 
                color: C.chalk,
                border: `2px solid ${C.grass}`,
                ...body 
              }}
            >
              🔑 Reset
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==================== REGISTRATION SCREEN ====================
  if (mode === "register") {
    return (
      <div className="flex flex-col gap-4 p-4 pt-8 items-center pb-8 overflow-y-auto" style={{ maxHeight: "100vh" }}>
        <button
          onClick={() => setMode("login")}
          className="text-xs self-start"
          style={{ color: C.slate, ...body }}
        >
           Back to Login
        </button>

        <div style={{ ...display, fontSize: 32, color: C.amber }}>Register</div>
        <div className="text-xs" style={{ color: C.chalkDim, ...body }}>
          Create your CricketBuddy account
        </div>

        <div className="w-full max-w-sm flex flex-col gap-3">
          <div>
            <label className="text-xs uppercase mb-1 block" style={{ color: C.sky, ...body }}>
              Email
            </label>
            <input
              type="email"
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={loading}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: C.nightSoft,
                color: C.chalk,
                border: `1px solid ${C.line}`,
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs uppercase mb-1 block" style={{ color: C.sky, ...body }}>
                First Name
              </label>
              <input
                type="text"
                value={regFirstName}
                onChange={(e) => setRegFirstName(e.target.value)}
                placeholder="John"
                disabled={loading}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: C.nightSoft,
                  color: C.chalk,
                  border: `1px solid ${C.line}`,
                }}
              />
            </div>
            <div>
              <label className="text-xs uppercase mb-1 block" style={{ color: C.sky, ...body }}>
                Last Name
              </label>
              <input
                type="text"
                value={regLastName}
                onChange={(e) => setRegLastName(e.target.value)}
                placeholder="Doe"
                disabled={loading}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: C.nightSoft,
                  color: C.chalk,
                  border: `1px solid ${C.line}`,
                }}
              />
            </div>
          </div>

          <div>
            <label className="text-xs uppercase mb-1 block" style={{ color: C.sky, ...body }}>
              Phone Number
            </label>
            <input
              type="tel"
              value={regPhone}
              onChange={(e) => setRegPhone(e.target.value.replace(/[^\d+]/g, "").slice(0, 13))}
              placeholder="+91 9876543210"
              maxLength="13"
              disabled={loading}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: C.nightSoft,
                color: C.chalk,
                border: `1px solid ${C.line}`,
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs uppercase mb-1 block" style={{ color: C.sky, ...body }}>
                Role
              </label>
              <select
                value={regRole}
                onChange={(e) => setRegRole(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: C.nightSoft,
                  color: C.chalk,
                  border: `1px solid ${C.line}`,
                }}
              >
                <option>Batsman</option>
                <option>Bowler</option>
                <option>All-rounder</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase mb-1 block" style={{ color: C.sky, ...body }}>
                Handedness
              </label>
              <select
                value={regHandedness}
                onChange={(e) => setRegHandedness(e.target.value)}
                disabled={loading}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: C.nightSoft,
                  color: C.chalk,
                  border: `1px solid ${C.line}`,
                }}
              >
                <option>Right</option>
                <option>Left</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs uppercase mb-1 block" style={{ color: C.sky, ...body }}>
                Passcode (4 digits)
              </label>
              <input
                type="password"
                value={regPasscode}
                onChange={(e) => setRegPasscode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="0000"
                maxLength="4"
                disabled={loading}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none text-center tracking-widest"
                style={{
                  background: C.nightSoft,
                  color: C.chalk,
                  border: `1px solid ${C.line}`,
                }}
              />
            </div>
            <div>
              <label className="text-xs uppercase mb-1 block" style={{ color: C.sky, ...body }}>
                Confirm Passcode
              </label>
              <input
                type="password"
                value={regConfirmPasscode}
                onChange={(e) => setRegConfirmPasscode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="0000"
                maxLength="4"
                disabled={loading}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none text-center tracking-widest"
                style={{
                  background: C.nightSoft,
                  color: C.chalk,
                  border: `1px solid ${C.line}`,
                }}
              />
            </div>
          </div>

          {error && (
            <div className="text-xs p-2 rounded" style={{ background: C.crimson, color: C.chalk, ...body }}>
               {error}
            </div>
          )}

          {success && (
            <div className="text-xs p-2 rounded" style={{ background: C.grassLight, color: C.ink, ...body }}>
               {success}
            </div>
          )}

          <button
            disabled={!regEmail || !regFirstName || !regLastName || regPhone.length < 10 || regPasscode.length !== 4 || regPasscode !== regConfirmPasscode || loading}
            onClick={handleRegister}
            className="w-full py-3 rounded-xl font-bold text-lg active:scale-95 transition-all"
            style={{
              background: regEmail && regFirstName && regLastName && regPhone.length >= 10 && regPasscode === regConfirmPasscode ? C.grassLight : C.slate,
              color: C.ink,
              ...display,
              opacity: regEmail && regFirstName && regLastName && regPhone.length >= 10 && regPasscode === regConfirmPasscode ? 1 : 0.5,
            }}
          >
            {loading ? "Registering..." : "Register"}
          </button>
        </div>
      </div>
    );
  }

  // ==================== PASSWORD RESET SCREEN ====================
  if (mode === "reset") {
    return (
      <div className="flex flex-col gap-4 p-4 pt-8 items-center pb-8">
        <button
          onClick={() => {
            setMode("login");
            setStep(1);
            setError("");
          }}
          className="text-xs self-start"
          style={{ color: C.slate, ...body }}
        >
           Back to Login
        </button>

        <div style={{ ...display, fontSize: 32, color: C.amber }}>Reset Passcode</div>

        {step === 1 && (
          <div className="w-full max-w-sm flex flex-col gap-4">
            <div className="text-xs text-center" style={{ color: C.chalkDim, ...body }}>
              Verify your email and mobile number to reset your passcode
            </div>

            <div>
              <label className="text-xs uppercase mb-2 block" style={{ color: C.sky, ...body }}>
                Email
              </label>
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={loading}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: C.nightSoft,
                  color: C.chalk,
                  border: `1px solid ${C.line}`,
                }}
              />
            </div>

            <div>
              <label className="text-xs uppercase mb-2 block" style={{ color: C.sky, ...body }}>
                Mobile Number
              </label>
              <input
                type="tel"
                value={resetMobile}
                onChange={(e) => setResetMobile(e.target.value.replace(/[^\d+]/g, "").slice(0, 13))}
                placeholder="+91 9876543210"
                maxLength="13"
                disabled={loading}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  background: C.nightSoft,
                  color: C.chalk,
                  border: `1px solid ${C.line}`,
                }}
              />
              <div className="text-xs mt-1" style={{ color: C.chalkDim, ...body }}>
                Last 10 digits of your mobile number
              </div>
            </div>

            {error && (
              <div className="text-xs p-2 rounded" style={{ background: C.crimson, color: C.chalk, ...body }}>
                 {error}
              </div>
            )}

            {success && (
              <div className="text-xs p-2 rounded" style={{ background: C.grassLight, color: C.ink, ...body }}>
                 {success}
              </div>
            )}

            <button
              disabled={!resetEmail || !resetMobile || resetMobile.length < 10 || loading}
              onClick={handleResetVerify}
              className="w-full py-3 rounded-xl font-bold active:scale-95 transition-all"
              style={{
                background: resetEmail && resetMobile && resetMobile.length === 10 && !loading ? C.amber : C.slate,
                color: C.ink,
                ...display,
                opacity: resetEmail && resetMobile && resetMobile.length === 10 && !loading ? 1 : 0.5,
              }}
            >
              {loading ? "Verifying..." : " Continue"}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="w-full max-w-sm flex flex-col gap-4">
            <div className="text-xs text-center" style={{ color: C.chalkDim, ...body }}>
              Enter your new 4-digit passcode
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs uppercase mb-1 block" style={{ color: C.sky, ...body }}>
                  New Passcode
                </label>
                <input
                  type="password"
                  value={resetNewPasscode}
                  onChange={(e) => setResetNewPasscode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="0000"
                  maxLength="4"
                  disabled={loading}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none text-center tracking-widest"
                  style={{
                    background: C.nightSoft,
                    color: C.chalk,
                    border: `1px solid ${C.line}`,
                  }}
                />
              </div>
              <div>
                <label className="text-xs uppercase mb-1 block" style={{ color: C.sky, ...body }}>
                  Confirm Passcode
                </label>
                <input
                  type="password"
                  value={resetConfirmPasscode}
                  onChange={(e) => setResetConfirmPasscode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="0000"
                  maxLength="4"
                  disabled={loading}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none text-center tracking-widest"
                  style={{
                    background: C.nightSoft,
                    color: C.chalk,
                    border: `1px solid ${C.line}`,
                  }}
                />
              </div>
            </div>

            {error && (
              <div className="text-xs p-2 rounded" style={{ background: C.crimson, color: C.chalk, ...body }}>
                 {error}
              </div>
            )}

            {success && (
              <div className="text-xs p-2 rounded" style={{ background: C.grassLight, color: C.ink, ...body }}>
                 {success}
              </div>
            )}

            <button
              disabled={resetNewPasscode.length !== 4 || resetNewPasscode !== resetConfirmPasscode || loading}
              onClick={handleResetConfirm}
              className="w-full py-3 rounded-xl font-bold active:scale-95 transition-all"
              style={{
                background: resetNewPasscode.length === 4 && resetNewPasscode === resetConfirmPasscode ? C.grassLight : C.slate,
                color: C.ink,
                ...display,
                opacity: resetNewPasscode.length === 4 && resetNewPasscode === resetConfirmPasscode ? 1 : 0.5,
              }}
            >
              {loading ? "Resetting..." : " Reset Passcode"}
            </button>

            <button
              onClick={() => {
                setStep(1);
                setResetNewPasscode("");
                setResetConfirmPasscode("");
                setError("");
              }}
              className="text-xs"
              style={{ color: C.slate, ...body }}
            >
               Back
            </button>
          </div>
        )}
      </div>
    );
  }

  // ==================== GUEST MODE SCREEN ====================
  if (mode === "guest") {
    const handleGuestStart = () => {
      if (!guestName.trim()) {
        setGuestError("Please enter your name to continue");
        return;
      }
      if (guestName.trim().length < 2) {
        setGuestError("Name must be at least 2 characters");
        return;
      }

      // Set guest session - no Firebase data saved
      onAuthSuccess({
        name: guestName.trim(),
        phone: `guest-${Date.now()}`,
        isGuest: true,
        firstName: guestName.trim().split(" ")[0],
        lastName: guestName.trim().split(" ").slice(1).join(" ") || "",
        email: null,
        role: null,
        handedness: null,
      });
    };

    return (
      <div className="flex flex-col gap-4 p-4 pt-12 items-center text-center pb-8">
        <button
          onClick={() => setMode("login")}
          className="text-xs self-start"
          style={{ color: C.slate, ...body }}
        >
           Back to Login
        </button>

        <div style={{ ...display, fontSize: 36, color: C.amber, lineHeight: 1 }}>PLAY AS GUEST</div>
        <div className="text-sm" style={{ color: C.chalkDim, ...body }}>
          No account needed. Just enter your name and start playing!
        </div>

        <div className="w-full max-w-sm flex flex-col gap-4">
          <div>
            <label className="text-xs uppercase mb-2 block" style={{ color: C.sky, ...body }}>
              Your Name
            </label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => {
                setGuestName(e.target.value);
                setGuestError("");
              }}
              placeholder="e.g., Virat Kohli"
              maxLength="50"
              className="w-full px-4 py-3 rounded-xl text-lg outline-none"
              style={{
                background: C.nightSoft,
                color: C.chalk,
                ...body,
                border: `1px solid ${C.line}`,
              }}
            />
            <div className="text-xs mt-1" style={{ color: C.chalkDim, ...body }}>
              This session only • No account created
            </div>
          </div>

          {guestError && (
            <div className="text-xs p-2 rounded" style={{ background: C.crimson, color: C.chalk, ...body }}>
               {guestError}
            </div>
          )}

          <button
            onClick={handleGuestStart}
            disabled={!guestName.trim()}
            className="w-full py-3 rounded-xl font-bold text-lg active:scale-95 transition-all"
            style={{
              background: guestName.trim() ? C.amber : C.slate,
              color: C.ink,
              ...display,
              opacity: guestName.trim() ? 1 : 0.5,
            }}
          >
            🎮 Start Playing
          </button>

          <div className="text-xs p-3 rounded" style={{ background: C.nightSoft, color: C.chalkDim, ...body }}>
            <strong style={{ color: C.chalk }}>Guest Mode Info:</strong>
            <ul className="text-left mt-2 gap-1 flex flex-col">
              <li>✓ No login required</li>
              <li>✓ No data saved to account</li>
              <li>✓ Session only - clears when you logout</li>
              <li>✓ Can score, follow matches, play freely</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }
}

function TeamManagementView({ playerName, clan, clanPlayers, onBack, onStartMatch }) {
  const [clanMembers, setClanMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlayerForStats, setSelectedPlayerForStats] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    if (!clan) {
      onBack();
      return;
    }

    // Load clan members
    const members = Object.values(clan.memberDetails || {});
    setClanMembers(members);
    setLoading(false);
  }, [clan, onBack]);

  // Load player stats when a player is selected
  useEffect(() => {
    if (!selectedPlayerForStats) {
      setPlayerStats(null);
      return;
    }

    (async () => {
      setStatsLoading(true);
      try {
        const stats = await loadPlayerStats(selectedPlayerForStats);
        setPlayerStats(stats || {
          matches: 0,
          runs: 0,
          wickets: 0,
          fours: 0,
          sixes: 0,
          highestScore: 0,
          highestWickets: 0,
          innings: 0,
          ballsFaced: 0,
        });
      } catch (e) {
        console.error('[TeamManagementView] Error loading player stats:', e);
        setPlayerStats(null);
      }
      setStatsLoading(false);
    })();
  }, [selectedPlayerForStats]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-4 pt-16 items-center text-center">
        <div style={{ color: C.chalkDim, ...body }}>Loading clan...</div>
      </div>
    );
  }

  if (!clan) {
    return (
      <div className="flex flex-col gap-4 p-4 pt-16 items-center text-center">
        <button onClick={onBack} className="text-xs self-start" style={{ color: C.slate, ...body }}>
           Back
        </button>
        <div style={{ ...display, fontSize: 24, color: C.chalkDim }}>
          No clan selected
        </div>
        <button onClick={onBack} className="text-xs" style={{ color: C.amber, ...body }}>
          Select a clan
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 pt-8 pb-8">
      <button onClick={onBack} className="text-xs self-start" style={{ color: C.slate, ...body }}>
         Back
      </button>
      <div className="text-center mb-2">
        <div style={{ ...display, fontSize: 32, color: C.amber }}> {clan.name}</div>
        <div className="text-xs mt-2" style={{ color: C.sky, ...body }}>
          Clan
        </div>
      </div>

      {selectedPlayerForStats ? (
        // 📊 Player Stats View
        <div>
          <button 
            onClick={() => setSelectedPlayerForStats(null)}
            className="text-xs mb-3" 
            style={{ color: C.slate, ...body }}
          >
            ← Back to Squad
          </button>
          <div className="rounded-2xl p-4 mb-4" style={{ background: C.nightSoft, border: `1px solid ${C.line}` }}>
            <div style={{ ...display, fontSize: 24, color: C.amber, marginBottom: 8 }}>
              {selectedPlayerForStats}
            </div>
            {statsLoading ? (
              <div style={{ color: C.chalkDim, ...body }}>Loading stats...</div>
            ) : playerStats ? (
              <div className="grid grid-cols-2 gap-2">
                <StatBox label="Matches" value={playerStats.matches} />
                <StatBox label="Runs" value={playerStats.runs} />
                <StatBox label="Wickets" value={playerStats.wickets} />
                <StatBox label="Highest Score" value={playerStats.highestScore} />
                <StatBox label="Fours" value={playerStats.fours} />
                <StatBox label="Sixes" value={playerStats.sixes} />
                <StatBox label="Innings" value={playerStats.innings} />
                <StatBox label="Balls Faced" value={playerStats.ballsFaced} />
              </div>
            ) : (
              <div style={{ color: C.chalkDim, ...body }}>No stats available</div>
            )}
          </div>
        </div>
      ) : (
        // 👥 Squad Member List
        <>
          <div className="flex gap-2">
            <button
              onClick={onStartMatch}
              className="flex-1 py-3 rounded-lg font-semibold"
              style={{ background: C.grassLight, color: C.ink, ...display }}
            >
               Start Match
            </button>
            <button
              onClick={onBack}
              className="flex-1 py-3 rounded-lg font-semibold"
              style={{ background: C.nightSoft, color: C.chalk, border: `1px solid ${C.line}`, ...display }}
            >
               Change Clan
            </button>
          </div>

          <div>
            <div className="text-xs uppercase mb-3" style={{ color: C.amber, ...body, letterSpacing: "0.1em" }}>
              Clan Members ({clanMembers.length}) · Click to view stats
            </div>
            <div className="flex flex-wrap gap-2">
              {clanMembers.map((member) => (
                <button
                  key={member.phone}
                  onClick={() => setSelectedPlayerForStats(member.name)}
                  className="px-3 py-2 rounded-lg text-sm flex items-center gap-2 active:scale-95 transition-all"
                  style={{
                    background: member.role === "creator" ? C.amberSoft : C.nightSoft,
                    color: member.role === "creator" ? C.ink : C.chalk,
                    ...body,
                    border: `1px solid ${C.line}`,
                    cursor: 'pointer',
                  }}
                >
                  {member.role === "creator" && <span></span>}
                  {member.name}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   APP
---------------------------------------------------------------- */
function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [role, setRole] = useState(null); // null | 'score' | 'schedule' | 'matches' | 'ongoing' | 'scheduled' | 'history' | 'logs' | 'selectClan' | 'resumeScore' | 'profile' | 'teamInvitations' | 'createTeam' | 'teamManagement' | 'stats'
  const [selectedClan, setSelectedClan] = useState(null); // Selected clan for match
  const [clanPlayers, setClanPlayers] = useState([]); // Players from selected clan
  const [matchCode, setMatchCode] = useState(null);
  const [scoringTab, setScoringTab] = useState("scoring"); // 'scoring' | 'scorecard' | 'squads'
  const statsSyncedRef = useRef(false);
  const [profileCheckDone, setProfileCheckDone] = useState(false);
  const [loggedInPlayer, setLoggedInPlayer] = useState(null); // { phone, name }
  const [loginCheckDone, setLoginCheckDone] = useState(false);
  const [scoringTransferInvites, setScoringTransferInvites] = useState([]); // Pending scoring transfer invites
  const [storageWarning, setStorageWarning] = useState(null); // Storage error warning message
  
  // ✨ NEW: Email-based authentication state
  const [currentUser, setCurrentUser] = useState(null); // Firebase Auth user
  const [currentUserProfile, setCurrentUserProfile] = useState(null); // Player profile from Firestore
  const [authLoading, setAuthLoading] = useState(true);
  const [loginMode, setLoginMode] = useState("register"); // "login" | "register" | "forgot-password"
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");

  // Subscribe to Firebase auth state on app load
  useEffect(() => {
    const unsubscribe = subscribeToAuthState((authState) => {
      setCurrentUser(authState.user);
      setCurrentUserProfile(authState.profile);
      
      // If user is logged in with email, set loggedInPlayer from email profile
      if (authState.isLoggedIn && authState.profile) {
        setLoggedInPlayer({
          email: authState.user.email,
          name: authState.profile.firstName || authState.user.email,
          phone: authState.profile.phone || "",
        });
      } else {
        // No email auth, use saved phone auth
        const savedPhone = localStorage.getItem("my-phone");
        const savedName = localStorage.getItem("my-name");
        
        if (savedPhone && savedName) {
          setLoggedInPlayer({
            phone: savedPhone,
            name: savedName,
          });
        }
      }
      
      setAuthLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  // Check for auto-login on app load (phone-based - for backward compatibility)
  useEffect(() => {
    if (loginCheckDone || currentUser) return; // Skip if already logged in with email
    
    (async () => {
      try {
        const savedPhone = localStorage.getItem("my-phone");
        const savedName = localStorage.getItem("my-name");
        
        if (savedPhone && savedName) {
          // Try to auto-login with phone
          const player = await getPlayerByPhone(savedPhone);
          const playerName = (player && player.name) ? player.name : savedName;
          console.log('[Auth] Auto-login successful (phone):', playerName);
          setLoggedInPlayer({
            phone: savedPhone,
            name: playerName,
          });
        }
      } catch (err) {
        console.error('[Auth] Auto-login failed:', err);
      }
      setLoginCheckDone(true);
    })();
  }, [currentUser]);

  // Setup network detection and retry queue on app load
  useEffect(() => {
    setupNetworkDetection();
    
    // Process retry queue immediately on app start
    (async () => {
      const result = await processRetryQueue();
      if (result.processed > 0) {
        console.log('[App] Processed', result.processed, 'queued operations on startup');
      }
    })();
  }, []);

  // Load scoring transfer invites when player logs in
  useEffect(() => {
    if (!loggedInPlayer || !loggedInPlayer.phone) {
      setScoringTransferInvites([]);
      return;
    }

    (async () => {
      try {
        const invites = await getScoringTransferInvites(loggedInPlayer.phone);
        setScoringTransferInvites(invites);
      } catch (err) {
        console.error('[App] Error loading scoring transfer invites:', err);
      }
    })();
  }, [loggedInPlayer?.phone]);

  // Load player stats from Firebase and subscribe to real-time updates
  // Only run on mount to avoid re-triggering when globalPlayers changes
  useEffect(() => {
    // Only load if there are players to load
    if (!state.globalPlayers || state.globalPlayers.length === 0) {
      return;
    }

    (async () => {
      try {
        const initialStats = await loadPlayerStats(state.globalPlayers);
        
        // Also load stats for logged-in player if not already in the list
        if (loggedInPlayer && loggedInPlayer.name && !initialStats[loggedInPlayer.name]) {
          const loggedInStats = await loadPlayerStats([loggedInPlayer.name]);
          const mergedStats = { ...initialStats, ...loggedInStats };
          dispatch({ type: "SET_PLAYER_STATS", payload: mergedStats });
        } else {
          dispatch({ type: "SET_PLAYER_STATS", payload: initialStats });
        }
      } catch (err) {
        console.error('[App] Error loading initial stats:', err);
      }
    })();

    // Subscribe to real-time updates from Firebase
    const playersToSubscribe = loggedInPlayer && loggedInPlayer.name && !state.globalPlayers.includes(loggedInPlayer.name)
      ? [...state.globalPlayers, loggedInPlayer.name]
      : state.globalPlayers;
    
    subscribeToPlayerStats(playersToSubscribe, (updatedStats) => {
      dispatch({ type: "SET_PLAYER_STATS", payload: updatedStats });
    });

    // Cleanup on unmount
    return () => {
      unsubscribeAllListeners();
    };
  }, []);

  // Monitor when Stats role is selected
  useEffect(() => {
    if (role === "stats") {
      console.log('[App] Stats role selected');
      console.log('[App] Current state.playerStats:', state.playerStats);
      console.log('[App] playerStats keys:', Object.keys(state.playerStats || {}).length);
      const statsArray = Object.entries(state.playerStats || {});
      console.log('[App] statsArray will have', statsArray.length, 'entries');
    }
  }, [role, state.playerStats]);


  // Trigger player stats update when match ends (phase becomes "result")
  useEffect(() => {
    if (state.phase === "result" && !statsSyncedRef.current) {
      console.log('[Match Complete] Phase changed to "result" - Match Finished!');
      console.log('[Match Complete] Innings count:', state.innings?.length || 0);
      if (state.innings && Array.isArray(state.innings)) {
        state.innings.forEach((inn, idx) => {
          if (inn) {
            console.log(`[Match Complete] Innings ${idx}: ${inn.runs}/${inn.wickets} with ${inn.balls?.length || 0} balls`);
          }
        });
      }
      console.log('[Match Complete] Triggering UPDATE_PLAYER_STATS with code:', matchCode);
      
      // Skip stats update for guest users (no Firebase saves)
      if (loggedInPlayer && !loggedInPlayer.isGuest) {
        dispatch({ type: "UPDATE_PLAYER_STATS", code: matchCode });
      } else if (loggedInPlayer?.isGuest) {
        logEvent("info", "[Guest] Match completed - stats not saved (guest session)");
      }
      statsSyncedRef.current = true;
    }
  }, [state.phase, dispatch, matchCode, loggedInPlayer]);

  // Check if user has a profile on app load, prompt to create one if not
  useEffect(() => {
    if (profileCheckDone || role !== null || !loginCheckDone) return;
    (async () => {
      try {
        const savedPhone = await storageGet("my-phone", false).catch(() => null);
        logEvent("info", "[AppInit] Checking for existing profile...");
        
        if (savedPhone && savedPhone.value) {
          // User has a saved phone, check if profile exists
          const dir = await loadDirectory();
          const phone = normalizePhone(savedPhone.value);
          if (dir[phone]) {
            logEvent("info", `[AppInit] Found existing profile for ${dir[phone].name}`);
          } else {
            logEvent("info", "[AppInit] Phone saved but profile missing, skipping profile step");
          }
        } else {
          logEvent("info", "[AppInit] No profile found, skipping profile step");
        }
        setProfileCheckDone(true);
      } catch (e) {
        logEvent("error", "[AppInit] Profile check failed: " + e.message);
        setProfileCheckDone(true);
      }
    })();
  }, [profileCheckDone, role]);

  // generate a share code once scoring begins
  useEffect(() => {
    if (role === "score" && state.phase !== "setup" && !matchCode) {
      const c = genCode();
      setMatchCode(c);
      logEvent("info", `Match started  share code ${c}`);
    }
    if (role === "score" && state.phase === "setup") {
      setMatchCode(null);
    }
  }, [role, state.phase, matchCode]);

  // Helper: Create ultra-minimal state for localStorage (compress aggressively)
  const minimizeStateForStorage = (state) => {
    // ULTRA-MINIMAL: Only store absolute essentials to prevent quota errors
    return {
      code: matchCode,
      phase: state.phase,
      // Team names only (no full objects)
      teamA: { name: state.teamA.name, players: state.teamA.players },
      teamB: { name: state.teamB.name, players: state.teamB.players },
      oversLimit: state.oversLimit,
      current: state.current,
      // Only store current innings WITHOUT batsman/bowler full stats
      innings: state.innings.map(inn => ({
        battingTeam: inn.battingTeam,
        bowlingTeam: inn.bowlingTeam,
        runs: inn.runs,
        wickets: inn.wickets,
        legalBalls: inn.legalBalls,
        target: inn.target,
        striker: inn.striker,
        nonStriker: inn.nonStriker,
        bowler: inn.bowler,
        // Store ONLY current players' essential stats (not full batsmen/bowlers objects)
        currentBatsman: inn.batsmen?.[inn.striker] ? {
          name: inn.striker,
          runs: inn.batsmen[inn.striker].runs,
          balls: inn.batsmen[inn.striker].balls,
        } : null,
        currentBowler: inn.bowlers?.[inn.bowler] ? {
          name: inn.bowler,
          runs: inn.bowlers[inn.bowler].runs,
          wickets: inn.bowlers[inn.bowler].wickets,
          legalBalls: inn.bowlers[inn.bowler].legalBalls,
        } : null,
        // Skip: batsmen, bowlers, timeline, commentary, balls
      })),
      timestamps: {
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      }
    };
  };

  // Cleanup old match data from localStorage
  const cleanupOldMatches = async () => {
    try {
      // Find all stored matches
      const keys = Object.keys(localStorage);
      const matchKeys = keys.filter(k => k.startsWith('match:'));
      
      // Keep only last 3 matches, delete older ones
      if (matchKeys.length > 3) {
        matchKeys.slice(0, -3).forEach(key => {
          localStorage.removeItem(key);
          console.log('[Storage] Cleaned up old match:', key);
        });
      }
    } catch (err) {
      console.warn('[Storage] Error cleaning up old matches:', err);
    }
  };

  // Sync live match state to Firestore for multi-device support
  // OFFLINE-FIRST: Always save to localStorage first, then try Firestore
  // ⭐ OPTIMIZATION: Cleanup is async and non-blocking to prevent lag during scoring
  useEffect(() => {
    if (role !== "score" || !matchCode) return;
    (async () => {
      try {
        // STEP 1: Save ULTRA-MINIMAL state to localStorage (compressed aggressively)
        const minimalState = minimizeStateForStorage(state);
        const storageResult = await storageSet(`match:${matchCode}`, minimalState, false);
        
        if (!storageResult.success) {
          console.error('[Match] ✗ Failed to save to localStorage - quota exceeded or other error');
          if (storageResult.error === 'QUOTA_EXCEEDED') {
            setStorageWarning('⚠️ Storage full! Cleaning up old matches...');
          }
          // Try to cleanup more aggressively and retry
          try {
            const keys = Object.keys(localStorage);
            const matchKeys = keys.filter(k => k.startsWith('match:') && k !== `match:${matchCode}`);
            // Delete all old match data
            matchKeys.forEach(key => {
              localStorage.removeItem(key);
              console.log('[Storage] Emergency cleanup:', key);
            });
            // Retry save
            const retryResult = await storageSet(`match:${matchCode}`, minimalState, false);
            if (retryResult.success) {
              console.log('[Match] ✓ Saved minimal state to localStorage (after emergency cleanup)');
              setStorageWarning(null);
            } else {
              console.error('[Match] ✗ Still cannot save after cleanup - data will be lost if browser closes');
              setStorageWarning('🔴 CRITICAL: Cannot save match! Close other apps to free storage immediately.');
              logEvent("error", "Critical: Cannot save match to storage - match data at risk!");
            }
          } catch (cleanupErr) {
            console.error('[Match] ✗ Emergency cleanup failed:', cleanupErr);
            setStorageWarning('🔴 CRITICAL: Storage error! Your match data may be lost.');
          }
          return;
        }
        
        console.log('[Match] ✓ Saved minimal state to localStorage');
        setStorageWarning(null); // Clear warning on successful save
        
        // ASYNC CLEANUP (non-blocking, runs in background)
        // These are intentionally NOT awaited to prevent lag during scoring
        (async () => {
          try {
            await cleanupOldMatches();
            // Remove abandoned matches from Firestore (every 5th sync to reduce load)
            if (Math.random() < 0.2) { // ~20% chance
              await cleanupAbandonedMatches().catch(err => {
                console.warn('[Match] Firestore cleanup failed:', err.message);
              });
            }
          } catch (err) {
            console.warn('[Match] Background cleanup failed:', err.message);
          }
        })(); // Fire and forget - don't block scoring
        
        // STEP 2: Skip Firestore for guests (session-only scoring)
        if (loggedInPlayer?.isGuest) {
          console.log('[Match] [Guest] Firestore sync skipped - guest session only');
          return;
        }
        
        // STEP 3: Try to sync FULL state to Firestore (optional, requires internet)
        const firebaseResult = await saveLiveMatch(matchCode, state);
        if (firebaseResult.success) {
          console.log('[Match] ✓ Synced full state to Firestore for live followers');
          setStorageWarning(null); // Clear any previous warnings
        } else if (firebaseResult.willRetry) {
          console.log('[Match] ⚠️ Offline - will sync when online');
          logEvent("info", "Match saved locally. Live followers will see it when you reconnect.");
        } else {
          console.warn('[Match] ✗ Firestore sync failed:', firebaseResult.message);
          logEvent("warn", "Could not sync to Firestore, but match is saved locally");
        }
      } catch (e) {
        console.error('[Match] Error syncing:', e.message);
        if (e.message.includes('quota') || e.message.includes('QUOTA')) {
          setStorageWarning('⚠️ Storage full! Match data may be at risk. Close this app and other apps to free space.');
        }
        // Scoring continues regardless - Firestore is secondary to local scoring
        logEvent("error", "Live followers may not see this match, but scoring is safe locally");
      }
    })();
  }, [role, matchCode, state, loggedInPlayer?.isGuest]);

  // persist current match state to prevent loss on accidental exit
  useEffect(() => {
    if (role === "score" && state.phase !== "setup") {
      try {
        localStorage.setItem("current-match-session", JSON.stringify(state));
      } catch (e) {
        // session storage failure is non-critical
      }
    }
  }, [role, state]);

  // restore match session on page load
  useEffect(() => {
    if (role !== null || matchCode !== null) return;
    (async () => {
      try {
        const saved = await storageGet("current-match-session", false).catch(() => null);
        if (saved && saved.value) {
          const restoredState = JSON.parse(saved.value);
          if (restoredState && restoredState.phase !== "setup") {
            // Match state would be restored on next action
            logEvent("info", "Restored previous match session");
          }
        }
      } catch (e) {
        // session restore failure is non-critical
      }
    })();
  }, []);

  // primary scorer: periodically pick up any actions submitted by a co-scorer and apply them
  useEffect(() => {
    if (role !== "score" || !matchCode) return;
    if (!["live", "selectBatsman", "selectBowler"].includes(state.phase)) return;
    const t = setInterval(async () => {
      try {
        const key = `queue:${matchCode}`;
        const res = await storageGet(key, true).catch(() => null);
        if (res && res.value) {
          const arr = JSON.parse(res.value);
          if (arr.length) {
            arr.forEach((a) => dispatch(a));
            await storageSet(key, JSON.stringify([]), true);
            logEvent("info", `Applied ${arr.length} co-scorer action(s)`);
          }
        }
      } catch (e) {
        logEvent("error", "Queue check failed: " + e.message);
      }
    }, 2500);
    return () => clearInterval(t);
  }, [role, matchCode, state.phase]);

  // once the match finishes, roll linked players' performances into their saved profile
  // stats, and save the match into the shared last-10-matches history  unless it's a test match
  useEffect(() => {
    if (role !== "score") return;
    if (state.phase === "result" && !statsSyncedRef.current) {
      statsSyncedRef.current = true;
      
      // Skip stats updates for guest users
      if (loggedInPlayer && loggedInPlayer.isGuest) {
        logEvent("info", "[Guest] Match finished - stats not saved to profile");
        return;
      }
      
      syncStatsToDirectory(state);
      dispatch({ type: "UPDATE_PLAYER_STATS" });
      const awards = computeAwards(state);
      const inn1 = state.innings[0];
      const inn2 = state.innings[1];
      const team1 = teamOf(state, inn1.battingTeam);
      const team2 = teamOf(state, inn2.battingTeam);
      let resultText;
      if (inn2.runs >= inn1.runs + 1) {
        const wLeft = maxWicketsFor(team2.players) - inn2.wickets;
        resultText = `${team2.name} won by ${wLeft} wicket${wLeft === 1 ? "" : "s"}`;
      } else if (inn2.runs === inn1.runs) {
        resultText = "Match tied";
      } else {
        resultText = `${team1.name} won by ${inn1.runs - inn2.runs} run${inn1.runs - inn2.runs === 1 ? "" : "s"}`;
      }
      pushMatchHistory(state, awards, resultText);
    }
    if (state.phase === "setup") statsSyncedRef.current = false;
  }, [role, state.phase, state]);

  // Show loading screen while checking for auto-login
  if (!loginCheckDone) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center" style={{ background: C.night }}>
        <style>{`${FONT_IMPORT} * { box-sizing: border-box; }`}</style>
        <div style={{ color: C.chalk, ...display, fontSize: 20 }}>Loading...</div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!loggedInPlayer) {
    return (
      <div className="min-h-screen w-full" style={{ background: C.night }}>
        <style>{`${FONT_IMPORT} * { box-sizing: border-box; }`}</style>
        <div className="max-w-md mx-auto min-h-screen" style={{ background: C.night }}>
          <ModernAuthScreen
            onAuthSuccess={(user) => {
              setLoggedInPlayer({
                phone: user.phone || "",
                email: user.email || "",
                name: user.name || (user.firstName || "Player"),
                firstName: user.firstName || "Player",
                lastName: user.lastName || "",
                role: user.role,
                handedness: user.handedness,
                isGuest: user.isGuest || false,
              });
            }}
          />
        </div>
      </div>
    );
  }

  if (role === null) {
    return (
      <div className="min-h-screen w-full" style={{ background: C.night }}>
        <style>{`${FONT_IMPORT} * { box-sizing: border-box; }`}</style>
        <div className="max-w-md mx-auto min-h-screen" style={{ background: C.night }}>
          <RoleSelect 
            onPick={setRole} 
            playerName={loggedInPlayer.name} 
            isGuest={loggedInPlayer.isGuest}
            onLogout={async () => {
              // For guests, just clear session
              if (loggedInPlayer.isGuest) {
                setLoggedInPlayer(null);
                setRole(null);
                logEvent("info", "Guest session ended");
              } else if (loggedInPlayer.email) {
                // For email-authenticated users, logout from Firebase
                await logoutUser();
                localStorage.removeItem("my-email");
                localStorage.removeItem("my-name");
                setLoggedInPlayer(null);
                setCurrentUser(null);
                setCurrentUserProfile(null);
              } else {
                // For phone-authenticated users (legacy), clear localStorage
                localStorage.removeItem("my-phone");
                localStorage.removeItem("my-name");
                setLoggedInPlayer(null);
              }
            }} 
          />
        </div>
      </div>
    );
  }

  if (role === "history") {
    return (
      <div className="min-h-screen w-full" style={{ background: C.night }}>
        <style>{`${FONT_IMPORT} * { box-sizing: border-box; }`}</style>
        <div className="max-w-md mx-auto min-h-screen" style={{ background: C.night }}>
          <MatchHistoryList onBack={() => setRole(null)} />
        </div>
      </div>
    );
  }

  if (role === "logs") {
    return (
      <div className="min-h-screen w-full" style={{ background: C.night }}>
        <style>{`${FONT_IMPORT} * { box-sizing: border-box; }`}</style>
        <div className="max-w-md mx-auto min-h-screen" style={{ background: C.night }}>
          <LogsScreen onBack={() => setRole(null)} />
        </div>
      </div>
    );
  }

  if (role === "matches") {
    return (
      <div className="min-h-screen w-full" style={{ background: C.night }}>
        <style>{`${FONT_IMPORT} * { box-sizing: border-box; }`}</style>
        <div className="max-w-md mx-auto min-h-screen" style={{ background: C.night }}>
          <MatchesMenuView onPick={setRole} onBack={() => setRole(null)} />
        </div>
      </div>
    );
  }

  if (role === "schedule") {
    return (
      <div className="min-h-screen w-full" style={{ background: C.night }}>
        <style>{`${FONT_IMPORT} * { box-sizing: border-box; }`}</style>
        <div className="max-w-md mx-auto min-h-screen overflow-y-auto" style={{ background: C.night }}>
          <ScheduleMatchScreen onBack={() => setRole(null)} />
        </div>
      </div>
    );
  }

  if (role === "scheduled") {
    return (
      <div className="min-h-screen w-full" style={{ background: C.night }}>
        <style>{`${FONT_IMPORT} * { box-sizing: border-box; }`}</style>
        <div className="max-w-md mx-auto min-h-screen overflow-y-auto" style={{ background: C.night }}>
          <ScheduledMatchesView 
            onBack={() => setRole("matches")} 
            onJoinMatch={(match) => {
              const dir = JSON.parse(localStorage.getItem("scheduled-matches") || "[]");
              const idx = dir.findIndex(m => m.id === match.id);
              if (idx >= 0) {
                dir[idx].joined = dir[idx].joined || [];
                if (!dir[idx].joined.includes(loggedInPlayer.name)) {
                  dir[idx].joined.push(loggedInPlayer.name);
                }
                localStorage.setItem("scheduled-matches", JSON.stringify(dir));
                alert(`✓ Joined ${match.title}!`);
              }
            }}
          />
        </div>
      </div>
    );
  }

  if (role === "ongoing") {
    return (
      <div className="min-h-screen w-full" style={{ background: C.night }}>
        <style>{`${FONT_IMPORT} * { box-sizing: border-box; }`}</style>
        <div className="max-w-md mx-auto min-h-screen" style={{ background: C.night }}>
          <OngoingMatchesView onBack={() => setRole("matches")} />
        </div>
      </div>
    );
  }

  if (role === "resumeScore") {
    return (
      <div className="min-h-screen w-full" style={{ background: C.night }}>
        <style>{`${FONT_IMPORT} * { box-sizing: border-box; }`}</style>
        <div className="max-w-md mx-auto min-h-screen" style={{ background: C.night }}>
          <ResumeScorScreen 
            onBack={(result) => {
              if (result && result.action === 'RESUME_MATCH') {
                // Load the resumed match state
                dispatch({ type: "LOAD_STATE", state: result.state });
                setMatchCode(result.code);
                setRole("score");
              } else {
                // Go back to menu
                setRole("matches");
              }
            }}
            playerPhone={loggedInPlayer.phone}
            playerName={loggedInPlayer.name}
            currentUserEmail={currentUser?.email}
            currentUserUid={currentUser?.uid}
          />
        </div>
      </div>
    );
  }

  if (role === "stats") {
    return (
      <div className="min-h-screen w-full" style={{ background: C.night }}>
        <style>{`${FONT_IMPORT} * { box-sizing: border-box; }`}</style>
        <div className="max-w-4xl mx-auto min-h-screen pb-8" style={{ background: C.night }}>
          <PlayerStatsDisplay playerStats={state.playerStats} />
          <button
            onClick={() => setRole(null)}
            className="w-full mt-4 py-2 rounded-lg"
            style={{ background: C.line, color: C.chalk, ...body }}
          >
             Back
          </button>
        </div>
      </div>
    );
  }

  if (role === "profile") {
    const currentPlayerStats = state.playerStats[loggedInPlayer?.name] || null;
    
    console.log('[Profile] Logged-in player:', loggedInPlayer?.name);
    console.log('[Profile] Current player stats:', currentPlayerStats);
    console.log('[Profile] All playerStats keys:', Object.keys(state.playerStats || {}).slice(0, 5));
    
    return (
      <div className="min-h-screen w-full" style={{ background: C.night }}>
        <style>{`${FONT_IMPORT} * { box-sizing: border-box; }`}</style>
        <div className="max-w-md mx-auto min-h-screen" style={{ background: C.night }}>
          <PlayerProfileView playerName={loggedInPlayer?.name} playerStats={currentPlayerStats} onBack={(result) => {
            if (result && result.action === 'CREATE_TEAM') {
              setRole("createTeam");
            } else if (result && result.action === 'ORGANIZE_CLANS') {
              setRole("selectClan");
            } else {
              setRole(null);
            }
          }} />
        </div>
      </div>
    );
  }

  if (role === "teamInvitations") {
    return (
      <div className="min-h-screen w-full" style={{ background: C.night }}>
        <style>{`${FONT_IMPORT} * { box-sizing: border-box; }`}</style>
        <div className="max-w-md mx-auto min-h-screen" style={{ background: C.night }}>
          <TeamInvitationsView playerName={loggedInPlayer.name} onBack={() => setRole(null)} />
        </div>
      </div>
    );
  }

  if (role === "createTeam") {
    return (
      <div className="min-h-screen w-full" style={{ background: C.night }}>
        <style>{`${FONT_IMPORT} * { box-sizing: border-box; }`}</style>
        <div className="max-w-md mx-auto min-h-screen" style={{ background: C.night }}>
          <TeamCreationModal playerName={loggedInPlayer.name} onBack={() => setRole(null)} onTeamCreated={() => setRole("profile")} />
        </div>
      </div>
    );
  }



  if (role === "selectClan") {
    return (
      <div className="min-h-screen w-full" style={{ background: C.night }}>
        <style>{`${FONT_IMPORT} * { box-sizing: border-box; }`}</style>
        <div className="max-w-md mx-auto min-h-screen" style={{ background: C.night }}>
          <ClanSelectionScreen
            userPhone={loggedInPlayer.phone}
            userName={loggedInPlayer.name}
            onClanSelected={(clan) => {
              setSelectedClan(clan);
              // Extract player names from clan members
              const playerNames = Object.values(clan.memberDetails || {}).map(m => m.name).filter(Boolean).sort();
              setClanPlayers(playerNames);
              setRole("teamManagement");
            }}
            onBack={() => setRole(null)}
          />
        </div>
      </div>
    );
  }

  if (role === "teamManagement") {
    return (
      <div className="min-h-screen w-full" style={{ background: C.night }}>
        <style>{`${FONT_IMPORT} * { box-sizing: border-box; }`}</style>
        <div className="max-w-md mx-auto min-h-screen" style={{ background: C.night }}>
          <TeamManagementView 
            playerName={loggedInPlayer.name} 
            clan={selectedClan} 
            clanPlayers={clanPlayers}
            onBack={() => setRole(null)}
            onStartMatch={() => {
              // Initialize match state with clan players when starting from clan
              dispatch({ type: "SET_CLAN_PLAYERS", players: clanPlayers });
              setRole("score");
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full" style={{ background: C.night }}>
      <style>{`
        ${FONT_IMPORT}
        * { box-sizing: border-box; }
        input:focus { outline: 2px solid ${C.amber}; }
        button:focus-visible { outline: 2px solid ${C.amber}; outline-offset: 2px; }
      `}</style>
      <div className="max-w-md mx-auto min-h-screen" style={{ background: C.night }}>
        <div className="px-4 pt-4 pb-1 flex items-center justify-between">
          <button
            onClick={() => setRole(null)}
            style={{ ...display, fontSize: 22, color: C.chalk, letterSpacing: "0.08em", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            className="active:opacity-75 transition-opacity"
          >
            CricketBuddy
          </button>
          {state.phase !== "setup" && (
            <button
              onClick={() => {
                dispatch({ type: "RESET" });
                setMatchCode(null);
              }}
              className="text-xs"
              style={{ color: C.slate, ...body }}
            >
              Restart
            </button>
          )}
        </div>

        {/* Match Code in Top Right Corner */}
        {matchCode && state.phase !== "setup" && state.phase === "live" && (
          <div className="fixed top-4 right-4 z-50 max-w-xs">
            <div
              className="rounded-lg px-2 py-1.5 flex items-center justify-between"
              style={{ background: C.nightSoft, border: `1px solid ${C.amber}` }}
            >
              <div>
                <div className="text-[8px] uppercase" style={{ color: C.slate, ...body, letterSpacing: "0.05em" }}>Follow Live</div>
                <div style={{ ...display, fontSize: 14, color: C.amber, letterSpacing: "0.1em" }}>{matchCode}</div>
              </div>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(matchCode);
                  } catch (e) {
                    // ignore
                  }
                }}
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold ml-2 flex-shrink-0"
                style={{ background: C.amber, color: C.ink, ...body }}
              >
                
              </button>
            </div>
          </div>
        )}

        {/* Scoring Transfer Invites Banner */}
        {scoringTransferInvites.length > 0 && state.phase === "setup" && (
          <div className="px-4 pt-4">
            <div className="rounded-2xl p-4" style={{ background: C.sky, border: `2px solid ${C.amber}` }}>
              <div className="text-xs uppercase mb-2" style={{ color: C.ink, ...body, letterSpacing: "0.1em", fontWeight: 600 }}>
                📱 Scoring Transfer Invite(s)
              </div>
              <div className="flex flex-col gap-2">
                {scoringTransferInvites.slice(0, 3).map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold" style={{ color: C.ink, ...body }}>
                        {invite.fromName}
                      </div>
                      <div className="text-xs" style={{ color: C.ink, opacity: 0.8, ...body }}>
                        wants you to score: <span style={{ fontWeight: 600 }}>{invite.matchCode}</span>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={async () => {
                          try {
                            const result = await acceptScoringTransferInvite(invite.id, loggedInPlayer.phone);
                            if (result.success) {
                              // Load the match to resume
                              const liveMatch = await subscribeToLiveMatch(invite.matchCode, (match) => {
                                if (match) {
                                  dispatch({ type: "LOAD_STATE", state: match });
                                  setMatchCode(invite.matchCode);
                                }
                              });
                              alert("Transfer accepted! Loading match...");
                              // Remove from pending list
                              setScoringTransferInvites(scoringTransferInvites.filter(i => i.id !== invite.id));
                            }
                          } catch (err) {
                            console.error('Error accepting transfer:', err);
                            alert("Failed to accept transfer");
                          }
                        }}
                        className="px-2 py-1 rounded text-xs font-semibold"
                        style={{ background: C.grassLight, color: C.ink, ...body }}
                      >
                        Accept
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await rejectScoringTransferInvite(invite.id);
                            setScoringTransferInvites(scoringTransferInvites.filter(i => i.id !== invite.id));
                          } catch (err) {
                            console.error('Error rejecting transfer:', err);
                            alert("Failed to reject transfer");
                          }
                        }}
                        className="px-2 py-1 rounded text-xs font-semibold"
                        style={{ background: C.crimson, color: C.chalk, ...body }}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {scoringTransferInvites.length > 3 && (
                <div className="text-xs mt-2" style={{ color: C.ink, opacity: 0.7, ...body }}>
                  +{scoringTransferInvites.length - 3} more invites
                </div>
              )}
            </div>
          </div>
        )}

        {state.phase === "setup" && <SetupScreen state={state} dispatch={dispatch} isGuest={loggedInPlayer?.isGuest || false} clanPlayers={clanPlayers} />}
        {state.phase === "toss" && <TossScreen state={state} dispatch={dispatch} />}
        {(state.phase === "openers1" || state.phase === "openers2") && <OpenersScreen state={state} dispatch={dispatch} />}

        {state.phase === "live" && (
          <div className="pb-8">
            {/* Storage Warning Banner */}
            {storageWarning && (
              <div className="px-4 pt-3 pb-2 rounded-lg text-sm" style={{ background: '#8B0000', color: '#FFD700' }}>
                {storageWarning}
              </div>
            )}
            
            {/* Tabs for different views */}
            <div className="px-4 pt-3 flex gap-1 border-b overflow-x-auto" style={{ borderColor: C.line }}>
              <button
                onClick={() => setScoringTab("scoring")}
                className="px-3 py-2 text-sm rounded-t-lg transition-all flex-shrink-0"
                style={{
                  background: scoringTab === "scoring" ? C.nightSoft : "transparent",
                  color: scoringTab === "scoring" ? C.amber : C.slate,
                  borderBottom: scoringTab === "scoring" ? `2px solid ${C.amber}` : "none",
                  ...body,
                }}
              >
                 Scoring
              </button>
              <button
                onClick={() => setScoringTab("scorecard")}
                className="px-3 py-2 text-sm rounded-t-lg transition-all flex-shrink-0"
                style={{
                  background: scoringTab === "scorecard" ? C.nightSoft : "transparent",
                  color: scoringTab === "scorecard" ? C.amber : C.slate,
                  borderBottom: scoringTab === "scorecard" ? `2px solid ${C.amber}` : "none",
                  ...body,
                }}
              >
                 Scorecard
              </button>
              <button
                onClick={() => setScoringTab("squads")}
                className="px-3 py-2 text-sm rounded-t-lg transition-all flex-shrink-0"
                style={{
                  background: scoringTab === "squads" ? C.nightSoft : "transparent",
                  color: scoringTab === "squads" ? C.amber : C.slate,
                  borderBottom: scoringTab === "squads" ? `2px solid ${C.amber}` : "none",
                  ...body,
                }}
              >
                 Squads
              </button>
            </div>

            {/* Scoring Pad Tab */}
            {scoringTab === "scoring" && (
              <div className="p-4 pb-8">
                <Scoreboard state={state} />
                <BatBowlLine state={state} />
                <ScoringPad state={state} dispatch={dispatch} />
              </div>
            )}

            {/* Scorecard Tab */}
            {scoringTab === "scorecard" && (
              <div className="p-4 pb-8">
                <Scoreboard state={state} />
                {state.innings && state.innings.length > 0 && (
                  <>
                    <div className="mb-4">
                      <ScoreCardTable inn={state.innings[0]} teamName={teamOf(state, state.innings[0].battingTeam).name} team={teamOf(state, state.innings[0].battingTeam)} />
                    </div>
                    {state.innings.length > 1 && (
                      <div className="mb-4">
                        <ScoreCardTable inn={state.innings[1]} teamName={teamOf(state, state.innings[1].battingTeam).name} team={teamOf(state, state.innings[1].battingTeam)} />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}


            {/* Squads Tab */}
            {scoringTab === "squads" && (
              <div className="pb-8" style={{ background: C.night, minHeight: "100vh" }}>
                <SquadsDisplay state={state} />
              </div>
            )}
          </div>
        )}
        {state.phase === "selectBatsman" && (
          <div className="p-4 pb-8">
            <Scoreboard state={state} />
            <SelectBatsman state={state} dispatch={dispatch} />
          </div>
        )}
        {state.phase === "selectBowler" && (
          <div className="p-4 pb-8">
            <Scoreboard state={state} />
            <SelectBowler state={state} dispatch={dispatch} />
          </div>
        )}
        {state.phase === "break" && <InningsBreak state={state} dispatch={dispatch} />}
        {state.phase === "result" && <ResultScreen state={state} dispatch={dispatch} onHome={() => setRole(null)} />}
      </div>
    </div>
  );
}

// 🏏 Wrap App with Error Boundary to catch and recover from rendering errors
export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
