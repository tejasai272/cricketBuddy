# Features & Cricket Rules

## 🏏 Core Scoring Features

### Match Setup
- **Teams:** Up to 11 players per team
- **Overs:** Customizable (T20: 20 overs, ODI: 50 overs)
- **Powerplay:** Configurable powerplay overs
- **Venue:** Track match location
- **Mode:** Manual player entry or select from saved teams

### Scoring Operations

#### **Runs**
- 1-6 runs scored by batsman
- Auto-strike change on odd runs
- Boundary detection (4s and 6s tracked)

#### **Extras**
- **Wide:** 1 run awarded + free hit next ball
- **No-Ball:** 1 run + free hit next ball
- **Bye:** Runs without bat contact
- **Leg-Bye:** Runs off body/legs

#### **Wickets**
- **Bowled:** Bowler credits
- **Caught:** Fielder credit
- **LBW:** Bowler credits
- **Stumped:** Wicketkeeper credit
- **Run-Out:** Fielder credit
- **Retired Hurt:** Doesn't count as wicket
- Free hit protection (can't be out on free hit)

---

## 🎯 Game Rules

### Match Progression
1. **Setup Phase** - Add teams, players, venue
2. **Toss Phase** - Winner decides bat/bowl
3. **Openers Phase** - Select opening batsmen & bowler
4. **Live Phase** - Score balls
5. **Break Phase** - Between innings
6. **Result Phase** - Match conclusion

### Inning Rules
- Ends when: All out OR overs completed OR target reached (chasing)
- Target = 1st inning runs + 1

### Bowler Rules
- Cannot bowl consecutive overs
- Max overs per bowler (T20: 4, ODI: varies)
- Auto-selected after each over

### Batsman Rules
- Strike change on odd runs
- New batsman on wicket
- Wicketkeeper tracked separately

### Free Hit Rule
- Set after wide or no-ball
- Batsman cannot be out (except run-out)
- Continues if another no-ball on free hit

---

## 👥 Players & Teams

### Player Management
- **Global Players:** Registered in system, stats tracked
- **Custom Players:** Added mid-match, no stats
- **Clan Members:** Prioritized when team has clan selected

### Team Features
- Save team lineups
- Set captain & wicketkeeper
- Team history & stats

### Clans
- Group related players
- Invite via link
- Approve/reject members

---

## 📊 Match Features

### Live Followers
- Anyone can watch ongoing matches
- Real-time score updates
- Spectator mode (no scoring access)

### Scoring Transfer
- Pass control to co-scorer
- Transfer by phone/email
- 2-minute takeover for abandoned matches

### Resume Scoring
- Auto-load recent matches
- Continue mid-match scoring
- Offline match recovery

### Match History
- Last 10 matches saved
- Searchable by date/teams
- Download as CSV (future)

---

## 📱 Offline Features

### PWA (Progressive Web App)
- Install as home screen app
- Works without internet
- Auto-sync when online
- Cached data for offline scoring

### Offline Scoring
- Full scoring without connection
- localStorage persistence
- Auto-upload when internet returns

---

## 🎨 UI Features

### Scoring Pad
- Quick access buttons for runs/extras/wickets
- Undo/Redo functionality (40-state history)
- Commentary tracking (last 30 balls)
- Ball-by-ball timeline

### Scorecard
- Real-time score display
- Innings breakdown
- Player statistics
- Over summary

### Squad View
- Team lineups
- Player roles (captain, WK)
- Performance stats

---

## ⚙️ Customization

### Match Settings (T20 defaults)
- Overs limit: 20
- Powerplay overs: 6
- Max overs per bowler: 4
- Customizable per match

### Super Over
- Added if match tied
- 1 over per team
- Team A bats first

---

## 🔄 Multi-Device Support

- **Same Match:** Multiple devices sync via Firestore
- **Backup:** Cloud save with local fallback
- **Offline-First:** Local scoring, cloud optional
