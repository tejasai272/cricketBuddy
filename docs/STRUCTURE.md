# Repository Structure Guide

## 📁 Clean Repository Layout

```
crickapp/
├── docs/                       # 📚 All documentation
│   ├── README.md              # Doc index
│   ├── FEATURES.md            # Game features & rules
│   ├── AUTHENTICATION.md      # Auth methods & setup
│   ├── DATABASE.md            # Firestore schema
│   ├── DEPLOYMENT.md          # Hosting & CI/CD
│   ├── SCORING.md             # Scoring mechanics
│   ├── TESTING.md             # Test cases
│   └── TROUBLESHOOTING.md     # Common issues
│
├── src/                        # 🎯 React source code
│   ├── App.js                 # Main component
│   ├── CricketBuddy.js        # All UI logic
│   ├── firebase.js            # Firestore operations
│   ├── firebaseConfig.js      # Firebase config
│   ├── index.js               # React entry point
│   └── index.css              # Global styles
│
├── public/                     # 🌐 Static files
│   ├── index.html             # Main HTML
│   ├── manifest.json          # PWA manifest
│   ├── service-worker.js      # Offline support
│   └── favicon.ico            # App icon
│
├── .github/                    # 🤖 GitHub Actions
│   └── workflows/
│       └── deploy.yml         # Auto-deploy config
│
├── .env.local                  # 🔑 Local env vars
├── package.json               # Dependencies
├── package-lock.json          # Locked versions
├── firebase.json              # Firebase config
├── firestore.rules            # Database security
├── tailwind.config.js         # Tailwind config
├── postcss.config.js          # PostCSS config
├── .gitignore                 # Git ignore patterns
├── README.md                  # Main readme
└── build/                     # Auto-generated build (ignore)
```

---

## ✅ Required Files (Essential)

These files are **REQUIRED** for the app to work:

### Source Code
- `src/CricketBuddy.js` - Main React component
- `src/firebase.js` - Firestore operations
- `src/firebaseConfig.js` - Firebase credentials
- `src/index.js` - React entry point

### Configuration
- `package.json` - NPM dependencies & scripts
- `firebase.json` - Firebase hosting config
- `firestore.rules` - Firestore security
- `tailwind.config.js` - Tailwind configuration
- `postcss.config.js` - PostCSS configuration

### Frontend
- `public/index.html` - Main HTML file
- `public/manifest.json` - PWA manifest
- `public/service-worker.js` - Offline support

### Deployment
- `.github/workflows/deploy.yml` - Auto-deploy
- `.env.local` - Firebase credentials (local)

---

## ❌ Optional Files (Can Delete/Ignore)

These files are **NOT REQUIRED** - delete them to clean up:

### Documentation (Moved to docs/)
- ~~AUTHENTICATION_IMPLEMENTATION.md~~
- ~~BUGS_AND_TESTING.md~~
- ~~COSCORING_AND_TIE_VERIFICATION.md~~
- ~~DOCUMENTATION.md~~
- ~~EMAIL_PASSWORD_SETUP.md~~
- ~~FEATURES_AND_RULES.md~~
- ~~GUEST_MODE_FEATURE.md~~
- ~~INPUT_SANITIZATION_AUDIT.md~~
- ~~INTERNATIONAL_PHONE_SUPPORT.md~~
- ~~PHONE_TRANSFER_FEATURE.md~~
- ~~RUNOUT_FLOW_VERIFICATION.md~~
- ~~SCORER_TRANSFER_DESIGN.md~~
- ~~SCORER_TRANSFER_IMPLEMENTATION.md~~
- ~~SETUP_AND_DEPLOYMENT.md~~
- ~~UNDO_REDO_VERIFICATION.md~~
- ~~WICKET_TESTING_GUIDE.md~~
- ~~CODE_VALIDATION_REPORT.md~~
- ~~BUG_FIX_VERIFICATION.md~~
- ~~CORE_FUNCTIONALITY_SUMMARY.md~~
- ~~CORE_FUNCTIONALITY_TESTING.md~~
- ~~CORE_FUNCTIONALITY_VALIDATION_PROGRESS.md~~
- ~~FIRESTORE_RULES.txt~~ (duplicate of firestore.rules)

### Auto-Generated (Ignored by .gitignore)
- `node_modules/` - Auto-installed from package.json
- `build/` - Created by `npm run build`
- `.env` - Auto-created by Firebase

---

## 🗑️ Cleanup Instructions

### Step 1: Move Documentation

All `.md` files at root have been moved to `docs/` folder.

Verify they exist:
```bash
ls docs/
# Should show: README.md FEATURES.md AUTHENTICATION.md DATABASE.md DEPLOYMENT.md SCORING.md TESTING.md TROUBLESHOOTING.md
```

### Step 2: Delete Old Docs from Root

```bash
# Delete all old .md files from root
rm AUTHENTICATION_IMPLEMENTATION.md
rm BUGS_AND_TESTING.md
rm COSCORING_AND_TIE_VERIFICATION.md
# ... etc

# Or delete everything at once
rm *.md
# (except README.md which you want to keep)
```

### Step 3: Keep Only README.md

Root should have:
```
README.md  # Quick start guide
docs/      # Complete documentation
src/       # React app
public/    # Static files
.github/   # GitHub Actions
```

### Step 4: Commit Changes

```bash
git add .
git commit -m "Organize repository: Move docs to docs/ folder"
git push origin main
```

---

## 📖 File Purposes

### Core App Logic
| File | Purpose |
|------|---------|
| `src/CricketBuddy.js` | Main React component, all UI logic |
| `src/firebase.js` | Firestore queries, database ops |
| `src/index.js` | React app entry point |
| `src/index.css` | Global styles |

### Configuration
| File | Purpose |
|------|---------|
| `firebaseConfig.js` | Firebase credentials & setup |
| `firebase.json` | Firebase hosting settings |
| `firestore.rules` | Database security rules |
| `tailwind.config.js` | Tailwind CSS theming |
| `postcss.config.js` | CSS processing |

### PWA & Frontend
| File | Purpose |
|------|---------|
| `public/index.html` | Main HTML template |
| `public/manifest.json` | App metadata (name, icons, etc.) |
| `public/service-worker.js` | Offline support |

### Deployment
| File | Purpose |
|------|---------|
| `.github/workflows/deploy.yml` | Auto-deploy on GitHub push |
| `.env.local` | Local Firebase credentials |

### Dependencies
| File | Purpose |
|------|---------|
| `package.json` | NPM packages needed |
| `package-lock.json` | Locked package versions |
| `.gitignore` | Files to exclude from Git |

---

## 🚀 Quick Reference

### Development
```bash
npm install      # Install dependencies
npm start        # Run locally (localhost:3000)
npm run build    # Build for production
```

### Testing
```bash
npm test         # Run tests
npm run build    # Verify build succeeds
```

### Deployment
```bash
firebase deploy --only hosting    # Manual deploy
# OR just push to GitHub (auto-deploys via Actions)
```

### Documentation
All docs in `docs/` folder:
- `docs/README.md` - Start here
- `docs/FEATURES.md` - Game rules
- `docs/AUTHENTICATION.md` - Login setup
- `docs/DATABASE.md` - Data schema
- `docs/DEPLOYMENT.md` - Hosting
- `docs/SCORING.md` - Scoring mechanics
- `docs/TESTING.md` - Test cases
- `docs/TROUBLESHOOTING.md` - Common issues

---

## ✨ Before Going Public

- [ ] Delete old `.md` files from root
- [ ] Verify `docs/` folder exists
- [ ] Check `README.md` exists at root
- [ ] Run `npm run build` successfully
- [ ] Deploy to Firebase: `firebase deploy --only hosting`
- [ ] Test app at `https://cricbuddy-6640d.web.app`
- [ ] Commit cleanup: `git add . && git commit -m "Clean repository"`

---

## 🎯 Key Files for Different Tasks

| Task | Files to Check |
|------|-----------------|
| Add new feature | `src/CricketBuddy.js`, `src/firebase.js` |
| Fix bug | `src/CricketBuddy.js` (UI logic) |
| Change database | `src/firebase.js`, `firestore.rules` |
| Update auth | `src/firebase.js`, `firebaseConfig.js` |
| Change styling | `src/index.css`, `tailwind.config.js` |
| Deploy | `.github/workflows/deploy.yml` |
| Add dependency | `package.json` |
| Offline support | `public/service-worker.js`, `public/manifest.json` |
