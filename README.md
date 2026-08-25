# 🏏 CricketBuddy - Cricket Scoring App

**Status:** ✅ Production Ready | **Version:** 1.0.0 | **Live:** https://cricbuddy-6640d.web.app

A complete React-based cricket scoring application with real-time multi-device synchronization, offline support (PWA), and comprehensive cricket rule implementation.

---

## 📚 Documentation

All documentation has been organized into a clean `docs/` folder. **Start here:**

### 🎯 Main Docs Index
**→ [Complete Documentation](docs/README.md)** - Overview of all guides

### 📖 Essential Guides
- **[Repository Structure](docs/STRUCTURE.md)** - What files do what + cleanup guide
- **[Features & Rules](docs/FEATURES.md)** - Cricket scoring rules & features
- **[Deployment](docs/DEPLOYMENT.md)** - Firebase Hosting & GitHub Actions setup
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues & fixes

### 🔧 Reference Guides
- **[Authentication](docs/AUTHENTICATION.md)** - Login methods (Email, Google, Apple, Anonymous)
- **[Database](docs/DATABASE.md)** - Firestore schema & security rules
- **[Scoring System](docs/SCORING.md)** - How scoring mechanics work

---

## ⚡ Quick Start (5 Minutes)

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm start
# Opens at http://localhost:3000

# 3. Create a match
# - Add players → Setup match → Score balls → View results
```

For detailed setup, see [DOCUMENTATION.md](DOCUMENTATION.md#quick-start)

---

## 🎯 Key Features

✅ **Live Cricket Scoring**
- Ball-by-ball tracking with all dismissal types
- Real-time runs, wickets, overs calculation
- Free hit rules after no-balls
- Retired hurt & runout support

✅ **Multi-Device Support**
- Real-time score following on other devices
- Co-scoring with queue-based synchronization
- Firestore integration for live sync
- Offline scoring with auto-sync when online

✅ **Persistent Data**
- Match state auto-saves to localStorage
- Session recovery on accidental exit
- Player statistics tracked across matches
- Complete match history with results

✅ **Professional UX**
- Dark theme with cricket-themed colors
- Responsive design (mobile-first)
- Real-time commentary
- Player profiles with avatars
- Clan management with invite codes

✅ **Offline-First Architecture**
- Works completely offline
- Auto-queues failed Firestore operations
- Syncs automatically when online
- Zero data loss guarantee

---

## 📊 Project Statistics

| Metric | Value |
|--------|-------|
| Main App Size | ~7,500 lines |
| Backend Service | ~1,900 lines |
| React Version | 18.2.0 |
| Tailwind CSS | 3.3.0 |
| Compilation Errors | 0 |
| Critical Bugs Fixed | 8 |
| Test Scenarios | 10+ |
| Cricket Rules | 6+ |

---

## 🧪 Testing Scenarios

### Scenario 1: Single Device Test (Basic Flow)
1. **Setup Match**
   - Add 2+ players per team
   - Enter venue name
   - Set maximum overs
   - Click "Start Match"

2. **Live Scoring**
   - Select openers and bowler
   - Score 20-30 balls
   - Mix of runs, extras, wickets
   - Complete first innings

3. **Verify**
   - Scoreboard updates correctly
   - Over count shows correctly (Over 1, 2, 3...)
   - Wickets tracked properly
   - Result calculated on match end

See [DOCUMENTATION.md](DOCUMENTATION.md#testing-scenarios) for 4 full scenarios

---

### Scenario 2: Multi-Device Following
- Tab A: Start match and score
- Tab B: Follow via "Ongoing Matches"
- Watch live updates in real-time

See [DOCUMENTATION.md](DOCUMENTATION.md#scenario-2-multi-device-following-two-tabs) for details

---
