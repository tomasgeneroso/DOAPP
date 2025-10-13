# Railway Deployment Setup Guide

## Required Environment Variables

To deploy DOAPP on Railway, you need to configure the following environment variables in your Railway project dashboard.

### How to Add Environment Variables on Railway

1. Go to your Railway project dashboard
2. Click on your service
3. Navigate to the **Variables** tab
4. Click **+ New Variable** to add each variable below

---

## Core Required Variables

### Database
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/doapp?retryWrites=true&w=majority
```
**Get this from:** Your MongoDB Atlas dashboard → Connect → Connect your application

### Authentication
```
JWT_SECRET=your-super-secure-random-string-min-32-chars
```
**Generate with:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### PayPal Payment Integration
```
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-client-secret
PAYPAL_PLATFORM_FEE_PERCENTAGE=5
```
**Get credentials from:**
- Sandbox: https://developer.paypal.com/dashboard/applications/sandbox
- Production: https://developer.paypal.com/dashboard/applications/live

### Application URLs
```
CLIENT_URL=https://your-frontend-url.railway.app
PORT=5000
NODE_ENV=production
```
**Note:** Railway automatically sets PORT, but you can specify 5000 if needed.

---

## Optional Variables (OAuth Login)

These are optional and only needed if you want Google/Facebook login:

### Google OAuth (Optional)
```
GOOGLE_CLOUD_AUTH_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLOUD_AUTH_PASS=your-google-client-secret
```
**Get from:** https://console.cloud.google.com/apis/credentials

### Facebook OAuth (Optional)
```
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
```
**Get from:** https://developers.facebook.com/apps/

---

## Redis Cache (Recommended)

Railway provides Redis as a separate service:

1. Click **+ New** in your Railway project
2. Select **Database** → **Redis**
3. Railway will automatically create a `REDIS_URL` variable

Or set manually:
```
REDIS_URL=redis://default:password@redis-host:6379
```

---

## Email Service (Optional)

Choose ONE provider:

### SendGrid
```
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxx
```
**Get from:** https://app.sendgrid.com/settings/api_keys

### Mailgun
```
EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_DOMAIN=your-domain.mailgun.org
```
**Get from:** https://app.mailgun.com/app/account/security/api_keys

---

## Push Notifications (Optional)

```
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"..."}
```
**Get from:** Firebase Console → Project Settings → Service Accounts → Generate new private key

---

## Analytics (Optional)

```
GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX
```
**Get from:** https://analytics.google.com/

---

## Minimal Working Configuration

For a basic deployment, you ONLY need these 4 variables:

```
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<generated-secret-min-32-chars>
PAYPAL_CLIENT_ID=<from-paypal-dashboard>
PAYPAL_CLIENT_SECRET=<from-paypal-dashboard>
```

---

## Step-by-Step Deployment

### 1. Prepare MongoDB

1. Create a free cluster at https://mongodb.com/cloud/atlas
2. Create a database user
3. Whitelist all IPs (0.0.0.0/0) for Railway access
4. Copy your connection string

### 2. Get PayPal Credentials

1. Go to https://developer.paypal.com/dashboard
2. Create a new app (or use existing)
3. Copy Client ID and Secret
4. Use **Sandbox** mode for testing

### 3. Generate JWT Secret

Run this in your terminal:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Configure Railway

1. Open your Railway project
2. Click on your service
3. Go to **Variables** tab
4. Add all 4 required variables
5. Click **Deploy** or push to your connected GitHub repo

### 5. Verify Deployment

Once deployed, check:
- Railway deployment logs for errors
- Visit your app URL to verify it's running
- Test user registration/login
- Test PayPal integration in sandbox mode

---

## Common Issues

### Build Fails with "Missing Environment Variables"
- Ensure all 4 required variables are set in Railway
- Double-check for typos in variable names
- Make sure MONGODB_URI includes the database name

### MongoDB Connection Failed
- Check if Railway's IP is whitelisted (use 0.0.0.0/0)
- Verify MongoDB user has correct permissions
- Ensure connection string includes `retryWrites=true&w=majority`

### PayPal Integration Not Working
- Verify you're using the correct mode (sandbox/live)
- Check CLIENT_URL is set correctly
- Review PayPal dashboard for test accounts

### CORS Errors
- Set CLIENT_URL to your actual frontend URL
- Don't include trailing slash in CLIENT_URL

---

## Security Checklist

- ✅ JWT_SECRET is at least 32 characters
- ✅ MongoDB URI doesn't expose username/password in logs
- ✅ PayPal credentials are from sandbox (not production) for testing
- ✅ NODE_ENV is set to "production"
- ✅ All sensitive variables are stored in Railway Variables (not in code)

---

## Production Checklist

Before going live:

- [ ] Switch PAYPAL_MODE from "sandbox" to "live"
- [ ] Use production PayPal credentials
- [ ] Configure custom domain
- [ ] Set up email service (SendGrid/Mailgun)
- [ ] Enable Redis for better performance
- [ ] Configure OAuth providers if needed
- [ ] Set up monitoring/logging
- [ ] Test all payment flows thoroughly

---

## Support

If you encounter issues:
1. Check Railway deployment logs
2. Review server logs for errors
3. Verify all environment variables are set correctly
4. Test MongoDB connection separately
5. Check PayPal sandbox credentials

**Railway Logs:** Railway Dashboard → Your Service → Deployments → View Logs
