#!/bin/bash
set -e

# Default variables
PROJECT_ID="privateer-capital"
SERVER_DIR="./server"
DASHBOARD_DIR="./dashboard"

echo "======================================================"
echo "      PRIVATEER CAPITAL FULL DEPLOYMENT SCRIPT        "
echo "======================================================"
echo ""

# Check if we're in the correct directory
if [ ! -d "$SERVER_DIR" ] || [ ! -d "$DASHBOARD_DIR" ]; then
  echo "Error: Script must be run from the project root directory"
  echo "Current directory: $(pwd)"
  echo "Expected directories: $SERVER_DIR and $DASHBOARD_DIR"
  exit 1
fi

# Check if required tools are installed
if ! command -v gcloud &> /dev/null; then
  echo "Error: gcloud CLI is required but not installed."
  echo "Please install from: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

if ! command -v npm &> /dev/null; then
  echo "Error: npm is required but not installed."
  exit 1
fi

if ! command -v firebase &> /dev/null; then
  echo "Error: firebase CLI is required but not installed."
  echo "Please install with: npm install -g firebase-tools"
  exit 1
fi

echo "Step 1: Deploying server to Google Cloud Run"
echo "-------------------------------------------"
(cd "$SERVER_DIR" && ./redeploy-cloudrun.sh)

if [ $? -ne 0 ]; then
  echo "❌ Server deployment failed"
  exit 1
fi

echo ""
echo "Step 2: Deploying dashboard to Firebase Hosting"
echo "----------------------------------------------"
# The update-dashboard-url.sh script already builds the dashboard
# Now we just need to deploy it

# Check Firebase login status
if ! firebase projects:list | grep -q "$PROJECT_ID"; then
  echo "Not logged in to Firebase or project not found"
  echo "Would you like to log in now? (y/n)"
  read -r answer
  if [[ "$answer" =~ ^[Yy]$ ]]; then
    firebase login
  else
    echo "Skipping Firebase deployment"
    echo "You can manually deploy later with: cd dashboard && firebase deploy --only hosting"
    exit 0
  fi
fi

# Try to use the project
echo "Setting Firebase project to $PROJECT_ID..."
firebase use "$PROJECT_ID" || {
  echo "Would you like to add this project to your Firebase configuration? (y/n)"
  read -r answer
  if [[ "$answer" =~ ^[Yy]$ ]]; then
    firebase use --add "$PROJECT_ID"
  else
    echo "Skipping Firebase deployment"
    echo "You can manually deploy later with: cd dashboard && firebase deploy --only hosting"
    exit 0
  fi
}

# Deploy to Firebase Hosting
echo "Deploying dashboard to Firebase..."
firebase deploy --only hosting

if [ $? -ne 0 ]; then
  echo "❌ Dashboard deployment failed"
  exit 1
fi

echo ""
echo "✅ DEPLOYMENT COMPLETE!"
echo ""
echo "Server URL: $(gcloud run services describe privateer-trading-bot --platform managed --region us-central1 --format 'value(status.url)' --project=$PROJECT_ID)"
echo "Dashboard URL: https://$PROJECT_ID.web.app"
echo ""
echo "You can monitor the application using:"
echo "- Firebase Console: https://console.firebase.google.com/project/$PROJECT_ID"
echo "- Google Cloud Console: https://console.cloud.google.com/run/detail/us-central1/privateer-trading-bot/metrics?project=$PROJECT_ID"
echo ""
echo "Cloud Scheduler jobs have been set up for automated tasks including position synchronization."
echo "Initial trading will begin after the opportunity-check job runs (scheduled hourly)."
echo ""
