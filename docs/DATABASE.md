# Database & Firestore Guide

## 📊 Database Structure

### Collections Overview

```
Firestore Database (cricbuddy-6640d)
├── playerProfiles/          # User accounts & profiles
├── players/                 # Player statistics (by name)
├── matches/                 # Completed match history
├── liveMatches/            # Ongoing matches
├── teams/                  # Saved team lineups
├── teamInvitations/        # Pending team invites
├── clans/                  # Player groups
├── clanInvites/            # Clan join links
├── clanMembershipRequests/  # Pending clan requests
├── scoringTransfers/       # Scoring handoff invites
└── notifications/          # User notifications
```

---

## 👤 Player Profiles

**Path:** `/playerProfiles/{email}` or `/playerProfiles/{uid}`

```json
{
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "1234567890",
  "photoURL": "https://...",
  "public": false,
  "createdAt": "2024-01-15T10:30:00Z",
  "lastLogin": "2024-01-20T14:45:00Z",
  "isGuest": false
}
```

**Access:**
- Owner can read/write their own
- Email users indexed by email
- Anonymous users indexed by UID
- Can set `public: true` to share profile

---

## 📈 Player Statistics

**Path:** `/players/{playerName}`

```json
{
  "name": "John Doe",
  "matches": 15,
  "runs": 450,
  "balls": 320,
  "average": 30.0,
  "strikeRate": 140.6,
  "wickets": 8,
  "bowlRuns": 120,
  "bowlBalls": 180,
  "bowlAvg": 15.0,
  "economy": 4.0,
  "fours": 18,
  "sixes": 12,
  "fifties": 2,
  "centuries": 0,
  "lastUpdated": "2024-01-20T14:45:00Z"
}
```

**Access:** Public read, authenticated write

---

## 🏏 Live Matches

**Path:** `/liveMatches/{matchCode}` (e.g., ABC12)

```json
{
  "code": "ABC12",
  "status": "live",  // live, break, result, aborted
  "phase": "live",
  "teamA": {
    "name": "Warriors",
    "players": ["John", "Mike"],
    "captain": "John",
    "wicketKeeper": "Mike"
  },
  "teamB": { ... },
  "innings": [
    {
      "battingTeam": "A",
      "runs": 45,
      "wickets": 2,
      "legalBalls": 18,
      "strikeRate": 150.0
    }
  ],
  "current": 0,
  "oversLimit": 20,
  "createdAt": "2024-01-20T10:00:00Z",
  "updatedAt": "2024-01-20T10:15:30Z",
  "scorerEmail": "john@example.com",
  "scorerUid": "user123",
  "originalScorerEmail": "original@example.com",
  "originalScorerUid": "original-user123"
}
```

**Access:** Public read, authenticated write/delete

**Auto-Cleanup:** Matches >30 mins old without updates are deleted

---

## 🏅 Completed Matches

**Path:** `/matches/{timestamp}` (e.g., 2024-01-20T10:30:00Z)

```json
{
  "code": "ABC12",
  "teamA": {
    "name": "Warriors",
    "runs": 145,
    "wickets": 7,
    "players": [...]
  },
  "teamB": { ... },
  "winner": "A",
  "winMargin": "3 wickets",
  "manOfMatch": "John",
  "timestamp": "2024-01-20T10:30:00Z",
  "createdAt": "2024-01-20T10:00:00Z",
  "duration": "35 mins"
}
```

**Access:** Public read, authenticated write

---

## 👥 Teams

**Path:** `/teams/{teamId}`

```json
{
  "name": "Warriors",
  "captain": "John",
  "members": ["John", "Mike", "Sarah"],
  "description": "Local cricket team",
  "createdAt": "2024-01-01T10:00:00Z",
  "updatedBy": "john@example.com"
}
```

**Access:** Public read, authenticated write

---

## 🎯 Clans

**Path:** `/clans/{clanId}`

```json
{
  "name": "Warriors Clan",
  "description": "Warriors cricket group",
  "founder": "john@example.com",
  "members": ["john@example.com", "mike@example.com"],
  "inviteCode": "WARRIORS123",
  "public": true,
  "createdAt": "2024-01-01T10:00:00Z",
  "totalMembers": 8
}
```

**Access:** Public read, authenticated write/delete

---

## 🔄 Scoring Transfers

**Path:** `/scoringTransfers/{inviteId}`

```json
{
  "matchCode": "ABC12",
  "fromScorer": "john@example.com",
  "toScorer": "mike@example.com",
  "status": "pending",  // pending, accepted, rejected
  "createdAt": "2024-01-20T10:15:00Z",
  "expiresAt": "2024-01-20T10:25:00Z",
  "reason": "Taking over from John"
}
```

**Access:** Authenticated only

---

## 📬 Notifications

**Path:** `/notifications/{notificationId}`

```json
{
  "type": "scoringTransfer",
  "title": "Scoring Transfer",
  "message": "John wants to transfer scoring",
  "toEmail": "mike@example.com",
  "toUid": "user456",
  "read": false,
  "createdAt": "2024-01-20T10:15:00Z",
  "relatedId": "ABC12"
}
```

**Access:** Only the recipient can read

---

## 🔐 Firestore Security Rules

```javascript
rules_version = '2';
service cloud.firestore {
  function isSignedIn() {
    return request.auth != null;
  }
  
  function isOwner(docId) {
    return isSignedIn() && (
      (request.auth.token.email != null && 
       request.auth.token.email == docId) ||
      (request.auth.uid == docId)
    );
  }

  // Player profiles - Owner can read/write
  match /playerProfiles/{docId} {
    allow read: if isOwner(docId) || isSignedIn() || 
                   resource.data.public == true;
    allow create: if isSignedIn() && (
      request.auth.token.email == docId || 
      request.auth.uid == docId
    );
    allow update: if isOwner(docId);
    allow delete: if isOwner(docId);
  }

  // Public player stats
  match /players/{playerName} {
    allow read: if true;
    allow write: if isSignedIn();
  }

  // Live matches - Public read, authenticated write
  match /liveMatches/{matchCode} {
    allow read: if true;
    allow write: if isSignedIn();
    allow delete: if isSignedIn();
  }
  
  // ... more rules in firestore.rules file
}
```

---

## 💾 Data Persistence

### localStorage
- Match data (ultra-minimal, ~50KB)
- Player profiles
- Session data
- 5-10MB quota per origin

### Firestore
- Cloud backup of all data
- Real-time sync across devices
- Secure authentication required
- Automatic cleanup of old matches

### Auto-Sync Strategy
```
User scores a ball
  ↓
Save to localStorage (immediate)
  ↓
Async: Upload to Firestore
  ↓
Auto-save every 5-10 balls
  ↓
On match end: Full upload
```

---

## 🧹 Data Cleanup

**Abandoned matches** >30 mins old are deleted:
- Checked during scoring (20% of syncs)
- Freed storage space
- Keeps database clean

**Old matches** in localStorage:
- Last 3 matches kept
- Auto-deleted before save if full
- Emergency cleanup on quota exceeded

---

## 🔍 Querying Data

### Get Live Matches
```javascript
const liveMatches = await getOngoingMatches();
// Returns: {code, teams, phase, score, updatedAt}
```

### Get Resumable Matches
```javascript
const resumable = await getResumableMatches(email, uid, phone);
// Returns: {ownMatches, resumeMatches, takeoverMatches}
```

### Get Player Stats
```javascript
const stats = await loadPlayerStats(playerNames);
// Returns: {playerName: {...stats}}
```

### Get Match History
```javascript
const history = await loadMatches(limit=10);
// Returns: [match1, match2, ...]
```

---

## ⚠️ Common Issues

**Document not found:**
- Player profile doesn't exist yet
- Create on first login

**Permission denied:**
- Not authenticated
- Try logging in

**Large document sizes:**
- Avoid storing huge arrays
- Keep match data minimal
- Archive old data

**Sync delays:**
- Offline? Will sync when online
- Check firebaseResult.willRetry flag
