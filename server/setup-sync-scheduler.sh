#!/bin/bash
# Setup script for position synchronization Cloud Scheduler

# Set variables
PROJECT_ID="privateer-capital"
REGION="us-central1"
SERVICE_NAME="privateer-trading-bot"
SERVICE_URL="https://privateer-trading-bot-542222496850.us-central1.run.app" # Actual Cloud Run service URL

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Setting up Cloud Scheduler for database-exchange position synchronization${NC}"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"
echo "Service URL: $SERVICE_URL"
echo ""

# 1. Set up position synchronization job (runs every 5 minutes)
# First delete any existing job
echo -e "${YELLOW}Deleting existing position synchronization job if it exists...${NC}"
gcloud scheduler jobs delete position-sync \
  --location=$REGION \
  --quiet || true

# Then create a fresh job
echo -e "${YELLOW}Creating position synchronization job (every 5 minutes)...${NC}"
gcloud scheduler jobs create http position-sync \
  --schedule="*/5 * * * *" \
  --uri="${SERVICE_URL}/api/sync-positions" \
  --http-method=POST \
  --attempt-deadline=4m \
  --time-zone="UTC" \
  --description="Synchronizes database positions with exchange positions" \
  --project=$PROJECT_ID \
  --location=$REGION \
  --oidc-service-account-email="privateer-scheduler@${PROJECT_ID}.iam.gserviceaccount.com" \
  --oidc-token-audience="${SERVICE_URL}"

if [ $? -eq 0 ]; then
  echo -e "${GREEN}Successfully created position synchronization job${NC}"
else
  echo -e "${RED}Failed to create position synchronization job${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}All Cloud Scheduler jobs have been created successfully!${NC}"
echo "You can view and manage them in the Google Cloud Console:"
echo "https://console.cloud.google.com/cloudscheduler?project=$PROJECT_ID"