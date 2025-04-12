# Google Cloud Run Deployment Guide for Privateer Trading Bot

This guide provides detailed, step-by-step instructions for deploying the Privateer Capital Trading Bot on Google Cloud Run.

## Prerequisites

Before starting, ensure you have:

1. A Google Cloud account with billing enabled
2. A Firebase project (can be the same project as your Google Cloud project)
3. The following tools installed on your local machine:
   - Node.js (v18+)
   - [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
   - [Docker](https://docs.docker.com/get-docker/)
   - [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
4. Your Hyperliquid API key

## Step 1: Initial Google Cloud Setup

1. **Login to Google Cloud**:
   ```bash
   gcloud auth login
   ```

2. **Set your Google Cloud project**:
   ```bash
   gcloud config set project YOUR_PROJECT_ID
   ```

3. **Enable required APIs**:
   ```bash
   gcloud services enable \
       cloudbuild.googleapis.com \
       containerregistry.googleapis.com \
       run.googleapis.com \
       cloudscheduler.googleapis.com \
       secretmanager.googleapis.com
   ```

## Step 2: Prepare Firebase Service Account

1. **Go to the Firebase Console**:
   - Navigate to: [https://console.firebase.google.com/](https://console.firebase.google.com/)
   - Select your project

2. **Generate a service account key**:
   - Go to Project Settings > Service Accounts
   - Click "Generate new private key"
   - Save the JSON file as `firebase-service-account.json` in the `server` directory

## Step 3: Configure and Deploy the Server

1. **Navigate to the server directory**:
   ```bash
   cd server
   ```

2. **Install dependencies and build**:
   ```bash
   npm install
   npm run build
   ```

3. **Make the deployment script executable**:
   ```bash
   chmod +x deploy-cloudrun.sh
   ```

4. **Run the deployment script**:
   ```bash
   ./deploy-cloudrun.sh
   ```

   The script will:
   - Ask for your Google Cloud project ID (or use the default)
   - Build the application
   - Create a Docker container
   - Push the container to Google Container Registry
   - Set up secrets in Secret Manager
   - Deploy to Google Cloud Run
   - Configure Cloud Scheduler for scheduled tasks
   - Output the URL of your deployed service

5. **Note the Cloud Run service URL**:
   - Save the URL displayed at the end of the deployment process
   - It will look like: `https://privateer-trading-bot-xxxxxx-xx.a.run.app`

## Step 4: Configure and Deploy the Dashboard

1. **Navigate to the dashboard directory**:
   ```bash
   cd ../dashboard
   ```

2. **Create a `.env` file** with your Firebase config and Cloud Run URL:
   ```bash
   cp .env.example .env
   ```

3. **Edit the `.env` file** to include your Firebase configuration and the Cloud Run service URL:
   ```
   VITE_FIREBASE_API_KEY=your-firebase-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
   VITE_FIREBASE_APP_ID=your-app-id

   # Use the URL from Step 3
   VITE_API_URL=https://privateer-trading-bot-xxxxxx-xx.a.run.app/api
   ```

4. **Login to Firebase**:
   ```bash
   firebase login
   ```

5. **Initialize Firebase hosting** (if not already done):
   ```bash
   firebase init hosting
   ```
   
   When prompted:
   - Select your Firebase project
   - Specify `dist` as the public directory
   - Configure as a single-page app: Yes
   - Set up automatic builds and deploys: No

6. **Build and deploy the dashboard**:
   ```bash
   npm install
   npm run build
   firebase deploy --only hosting
   ```

7. **Note the hosting URL** displayed after deployment completes

## Step 5: Verify Deployment

1. **Test the Cloud Run service**:
   ```bash
   curl https://privateer-trading-bot-xxxxxx-xx.a.run.app/health
   ```

   You should see a response indicating the service is healthy.

2. **Visit your dashboard** at the Firebase Hosting URL:
   ```
   https://your-project-id.web.app
   ```

3. **Check Cloud Scheduler jobs** in the Google Cloud Console:
   - Navigate to Cloud Scheduler in the Google Cloud Console
   - Verify that the following jobs are present:
     - `correlation-analysis`
     - `strategy-initialization`
     - `opportunity-check`
     - `trade-updates`
     - `collect-price-data` (runs hourly)
     - `data-maintenance` (daily)

## Scheduled Operations

The system runs on a schedule to optimize resource usage:

- **Price Data Collection**: Hourly via `collect-price-data` job
- **Correlation Analysis**: Every 4 hours
- **Strategy Initialization**: Daily at 01:00 UTC
- **Opportunity Check**: Hourly
- **Trade Updates**: Every 15 minutes
- **Strategy Health Check**: Daily at 07:00 UTC
- **Data Cleanup**: Daily at 01:00 UTC

## Step 6: Monitor Your Bot

1. **View Cloud Run logs**:
   ```bash
   gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=privateer-trading-bot" --limit=20
   ```

2. **Monitor Cloud Scheduler job execution**:
   - Navigate to Cloud Scheduler in the Google Cloud Console
   - Check the "Last Run" and "Result" columns

3. **Monitor through the dashboard**:
   - Visit your dashboard URL
   - Check the performance metrics, active trades, and bot health status

## Troubleshooting

### Common Issues

1. **Deployment Failures**:
   - Check if all required Google Cloud APIs are enabled
   - Ensure your account has proper permissions
   - Verify the Docker build succeeds locally: `docker build -t privateer-test .`

2. **Scheduler Job Failures**:
   - Check if the service account has the correct permissions
   - Verify the endpoints are correctly set up
   - View specific job logs in the Cloud Console

3. **Service Connection Issues**:
   - Ensure your Hyperliquid wallet credentials are correctly set as environment variables
   - Check if the Firebase service account JSON is properly configured
   - Verify the dashboard is using the correct API URL

### Error Logs

To view specific error logs:

```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=privateer-trading-bot AND severity>=ERROR" --limit=10
```

## Updating Your Bot

When you need to update your trading bot:

1. **Make code changes** to the server code

2. **Run the deployment script again**:
   ```bash
   cd server
   ./deploy-cloudrun.sh
   ```

3. **If you updated the dashboard**:
   ```bash
   cd dashboard
   npm run build
   firebase deploy --only hosting
   ```

## Security Considerations

1. **API Keys and Credentials**:
   - Never commit API keys or sensitive credentials to your repository
   - Set environment variables directly in deployment scripts
   - Your .env file should never be committed to the repository

2. **IAM Permissions**:
   - Follow the principle of least privilege for service accounts
   - Regularly audit permissions in your Google Cloud project

3. **Network Security**:
   - Consider using VPC-SC for enhanced security
   - Set up proper firewall rules if connecting to external services

## Cost Management

Google Cloud Run uses a pay-per-use pricing model:

1. **Cloud Run Costs**:
   - You pay only when your service is processing requests
   - Costs are based on CPU, memory, and request count
   - The bot scales to zero when idle, minimizing costs

2. **Cloud Scheduler Costs**:
   - Each job costs approximately $0.10/month
   - With 4 scheduled jobs, expect ~$0.40/month for scheduling

3. **Secret Manager Costs**:
   - Active secret versions cost ~$0.06/month per secret
   - Secret access operations cost ~$0.03 per 10,000 operations

4. **Budget Alerts**:
   - Set up budget alerts in Google Cloud to monitor costs
   - Start with a small budget and adjust as needed