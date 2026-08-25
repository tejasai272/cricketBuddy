# Authentication Guide

## 🔐 Supported Authentication Methods

### 1. Email & Password
- Secure registration with validation
- Password reset via email
- Profile completion required

**Setup:** Firebase Console → Authentication → Email/Password

### 2. Google OAuth
- One-click login
- Auto-fill profile from Google account
- Seamless experience

**Setup:** Firebase Console → Authentication → Google

### 3. Apple OAuth (iOS)
- Native Apple sign-in
- Privacy-focused
- Works on iPhone/iPad

**Setup:** Firebase Console → Authentication → Apple

### 4. Anonymous Login
- No credentials needed
- Perfect for quick testing
- Can upgrade to email later

**Setup:** Automatic, built-in

---

## 🔑 How Authentication Works

### Registration Flow
```
User clicks "Sign Up"
  ↓
Email + Password entry
  ↓
Email verification (optional)
  ↓
Profile completion (name, phone)
  ↓
Account created
```

### Login Flow
```
User clicks "Login"
  ↓
Choose method (Email / Google / Apple)
  ↓
Enter credentials / OAuth consent
  ↓
Firebase verifies
  ↓
Logged in! Auto-redirect to app
```

### Phone-Based Login (Legacy)
```
User enters phone
  ↓
Firebase verifies player exists
  ↓
Auto-loaded as logged-in player
  ↓
Stored in localStorage
```

---

## 📱 Multi-Auth Player Identification

Players can be identified by:
- **Email:** For email/Google/Apple users
- **UID:** For anonymous users
- **Phone:** For legacy phone-based users

### Matching Logic (in order)
1. Check if email matches
2. Check if UID matches
3. Check if phone matches (normalized)

This allows **seamless switching** between auth methods.

---

## 🔄 Auth State Management

### React Hooks
```javascript
const [currentUser, setCurrentUser] = useState(null);      // Firebase user
const [loggedInPlayer, setLoggedInPlayer] = useState(null); // Player profile
const [authLoading, setAuthLoading] = useState(true);
```

### Firebase Auth Subscription
```javascript
subscribeToAuthState((authState) => {
  setCurrentUser(authState.user);
  setCurrentUserProfile(authState.profile);
});
```

---

## 🛡️ Security Features

### Password Protection
- Minimum 6 characters
- Hashed on Firebase servers
- Never sent in plain text

### Session Management
- Auto-logout on app close
- Session tokens refresh automatically
- Secure cookie storage

### OAuth Security
- Official Firebase OAuth implementation
- No credentials stored locally
- Secure token exchange

### Data Privacy
- User data in `/playerProfiles/{email}`
- Only owner can read/write
- Anonymous users identified by UID

---

## 📋 Firestore Security Rules

```javascript
// Email users: identified by email
// Anonymous users: identified by UID
match /playerProfiles/{docId} {
  allow read: if isOwner(docId) || resource.data.public == true;
  allow create: if isSignedIn() && (
    request.auth.token.email == docId || 
    request.auth.uid == docId
  );
  allow update: if isOwner(docId);
  allow delete: if isOwner(docId);
}
```

---

## 🚀 Setup on Firebase

### Step 1: Enable Authentication
1. Firebase Console → Authentication
2. Enable Email/Password
3. Enable Google
4. Enable Apple

### Step 2: Configure OAuth Apps
- **Google:** Create OAuth 2.0 credential in Google Cloud
- **Apple:** Configure Sign in with Apple

### Step 3: Update Web SDK
```javascript
// Already configured in firebaseConfig.js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  // ...
};
```

---

## 🔐 Best Practices

✅ **DO:**
- Use strong passwords
- Verify email after signup
- Store auth tokens securely
- Logout users on app close

❌ **DON'T:**
- Save passwords in localStorage
- Log credentials to console
- Send auth data in URLs
- Share private profiles

---

## 🐛 Troubleshooting

**"Email already registered"**
- User already has account
- Try "Forgot Password" if unsure

**"Invalid credentials"**
- Check email/password spelling
- Ensure user is registered
- Try resetting password

**"Google login not working"**
- Check OAuth app configuration
- Verify API key is correct
- Clear browser cookies

**"Anonymous session lost"**
- Close browser → new anonymous session
- Upgrade to email to save account permanently

---

## 📞 User Management

### Update Profile
```javascript
updateUserEmailProfile({
  firstName: "John",
  phone: "1234567890"
});
```

### Change Password
```javascript
sendPasswordReset(email);
// User receives email with reset link
```

### Logout
```javascript
logoutUser();
// Clears session, redirects to login
```

---

## 🔗 Integration with App

### Sign Up
```javascript
signUpWithEmail(email, password);
```

### Sign In
```javascript
signInWithEmail(email, password);
signInWithGoogle();
signInWithApple();
loginAnonymously();
```

### Check Current User
```javascript
const email = getCurrentUserEmail();
```

### Upgrade Anonymous
```javascript
upgradeAnonymousToEmail(email, password);
// Convert anonymous session to permanent account
```
