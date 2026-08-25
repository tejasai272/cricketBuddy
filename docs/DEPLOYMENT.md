# Deployment & Hosting Guide

## 🚀 Firebase Hosting Setup

### Prerequisites
- Node.js v16+ installed
- Firebase project created
- React app built

### Step 1: Install Firebase CLI

```bash
npm install -g firebase-tools
```

Verify installation:
```bash
firebase --version
```

### Step 2: Login to Firebase

```bash
firebase login
```

Opens browser for Google authentication.

### Step 3: Initialize Firebase Hosting

In your project directory:

```bash
firebase init hosting
```

**Prompts:**
- **Select Firebase project:** Choose `cricbuddy-6640d`
- **Public directory:** Type `build`
- **Single-page app:** Answer `y` (yes)
- **Overwrite index.html:** Answer `n` (no)

This creates `firebase.json` configuration.

### Step 4: Build Your App

```bash
npm run build
```

Creates optimized `build/` folder (~2-5 minutes).

### Step 5: Deploy to Firebase

```bash
firebase deploy --only hosting
```

Output shows:
```
Project Console: https://console.firebase.google.com/project/cricbuddy-6640d
Hosting URL: https://cricbuddy-6640d.web.app
```

**Your app is now LIVE!** 🎉

---

## 🌍 Custom Domain Setup

### Option 1: Firebase Custom Domain

1. **Firebase Console** → Your project → **Hosting**
2. Click **Add custom domain**
3. Enter your domain (e.g., `cricketbuddy.com`)
4. Firebase displays DNS records

### Option 2: Point Domain to Firebase

At your domain registrar (GoDaddy, Namecheap, etc.):

1. Add Firebase's DNS records to your domain
2. Wait 24 hours for propagation
3. Access via: `https://cricketbuddy.com`

### Option 3: Subdomain

Use `scoring.cricketbuddy.com`:
- Set up CNAME record
- Points to Firebase hosting
- Takes 24 hours to activate

---

## 🔄 GitHub Actions Auto-Deploy

Automatically deploy when you push to GitHub!

### Prerequisites
- GitHub repository created
- GitHub Actions enabled
- `.github/workflows/deploy.yml` file created

### Setup Instructions

#### Step 1: Get Firebase Service Account

1. **Firebase Console** → **Project Settings** (⚙️)
2. **Service Accounts** tab
3. Click **Generate New Private Key**
4. JSON file downloads - **Open and copy contents**

#### Step 2: Add GitHub Secret

1. **GitHub** → Your repo → **Settings**
2. **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. **Name:** `FIREBASE_SERVICE_ACCOUNT_CRICBUDDY_6640D`
5. **Secret:** Paste the JSON content
6. Click **Add secret**

#### Step 3: Push Code

```bash
git add .
git commit -m "Setup GitHub Actions deployment"
git push origin main
```

#### Step 4: Watch Deployment

1. Go to GitHub → Your repo → **Actions** tab
2. See your workflow building
3. Watch real-time deployment status

Once complete:
- ✅ App deployed to Firebase
- ✅ Live at `https://cricbuddy-6640d.web.app`
- ✅ Automatic on every push!

---

## 📝 GitHub Actions Workflow

File: `.github/workflows/deploy.yml`

```yaml
name: Deploy to Firebase Hosting

on:
  push:
    branches:
      - main
      - master

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build React app
        run: npm run build
        env:
          CI: false
      
      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '${{ secrets.FIREBASE_SERVICE_ACCOUNT_CRICBUDDY_6640D }}'
          projectId: cricbuddy-6640d
          channelId: live
```

---

## 🛠️ Manual Deploy Workflow

For deploying from any machine:

```bash
# Clone repo
git clone https://github.com/YOUR-USERNAME/cricketbuddy.git
cd cricketbuddy

# Install dependencies
npm install

# Build for production
npm run build

# Deploy to Firebase
firebase deploy --only hosting
```

---

## 📊 Firebase Hosting Features

### Global CDN
- Deployed to 150+ edge locations worldwide
- Ultra-fast delivery
- Auto-optimized compression

### Free SSL/HTTPS
- All Firebase apps have HTTPS
- Auto-renewed certificates
- Secure by default

### Automatic Backups
- Instant rollback to previous versions
- Version history available
- Zero downtime updates

### Monitoring & Analytics
- Real-time traffic metrics
- Performance insights
- Error tracking

---

## 🐛 Deployment Troubleshooting

**Build fails:**
```bash
npm ci --clean-install
npm run build
```

**Firebase auth fails:**
```bash
firebase logout
firebase login
```

**Deploy fails with permission error:**
- Check Firebase Service Account secret is correct
- Verify project ID in workflow file
- Ensure secret name matches exactly

**App loads but shows blank:**
- Check browser console for errors
- Verify build succeeded
- Clear browser cache

**Very slow deployment:**
- Large bundle? Check `npm run build` output
- Network issue? Retry deployment
- Consider code splitting

---

## 🚀 Environment Variables

### For Production
Create `.env.production`:

```bash
REACT_APP_FIREBASE_PROJECT_ID=cricbuddy-6640d
REACT_APP_FIREBASE_AUTH_DOMAIN=cricbuddy-6640d.firebaseapp.com
# ... other variables
```

### For GitHub Actions
Add as repository secrets:
- `FIREBASE_PROJECT_ID`
- `FIREBASE_API_KEY` (if needed)

### Access in Code
```javascript
const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
```

---

## 📈 Performance Tips

1. **Code Splitting**
   ```bash
   npm install react-router-dom
   // Use React.lazy() for route-based splits
   ```

2. **Image Optimization**
   - Use WebP format
   - Compress PNGs/JPGs
   - Lazy load below fold

3. **Bundle Analysis**
   ```bash
   npm install --save-dev source-map-explorer
   npm run build
   npx source-map-explorer 'build/static/js/*.js'
   ```

4. **Lighthouse Audit**
   - DevTools → Lighthouse tab
   - Run audit, fix issues
   - Target 90+ scores

---

## 🔐 Security Checklist

- ✅ HTTPS enforced (automatic on Firebase)
- ✅ Firestore rules configured
- ✅ API keys restricted to web domain
- ✅ No sensitive data in code
- ✅ Environment variables for secrets
- ✅ GitHub secrets for deployment tokens

---

## 📞 Support

- **Firebase Issues:** https://firebase.google.com/support
- **GitHub Actions:** https://docs.github.com/en/actions
- **Deployment Help:** Firebase Console debugger
