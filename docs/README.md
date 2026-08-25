# CricketBuddy Documentation

Complete documentation for the CricketBuddy cricket scoring app.

## 📋 Quick Links

- **[Features & Rules](FEATURES.md)** - Game rules, features, scoring system
- **[Authentication](AUTHENTICATION.md)** - Login, signup, multi-auth methods
- **[Firestore & Database](DATABASE.md)** - Schema, security rules, data structure
- **[Scoring System](SCORING.md)** - How scoring works, ball tracking, wickets
- **[Testing Guide](TESTING.md)** - Test cases, verification, edge cases
- **[Deployment](DEPLOYMENT.md)** - Firebase setup, GitHub Actions, hosting
- **[Troubleshooting](TROUBLESHOOTING.md)** - Common issues, fixes, debugging

---

## 🎯 Core Features

✅ **Cricket Scoring** - Real-time ball-by-ball scoring
✅ **Multi-Auth** - Email, Google, Apple, Anonymous login
✅ **Offline First** - Works without internet (PWA)
✅ **Live Followers** - Watch matches live
✅ **Teams & Clans** - Organize players into groups
✅ **Scoring Transfer** - Pass control mid-match
✅ **Match History** - Track past matches and stats
✅ **Co-Scorers** - Multiple people can score same match

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run locally
npm start

# Build for production
npm run build

# Deploy to Firebase
firebase deploy --only hosting
```

---

## 📱 Tech Stack

- **Frontend:** React 17+, Tailwind CSS
- **Backend:** Firebase (Auth, Firestore, Hosting)
- **State Management:** React useReducer + Hooks
- **PWA:** Service Workers for offline support

---

## 🔐 Security

- Email/password encrypted
- OAuth2 for Google/Apple
- Firestore security rules with role-based access
- Anonymous user support
- No sensitive data in localStorage

---

## 📞 Support

For issues or questions, check the **[Troubleshooting](TROUBLESHOOTING.md)** guide or see **[Testing Guide](TESTING.md)** for known edge cases.
