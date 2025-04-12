#!/bin/bash
set -e

# Default variables
PROJECT_ID="privateer-capital"
REGION="us-central1"
SERVICE_NAME="privateer-trading-bot"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME:latest"
SERVICE_ACCOUNT="privateer-trading-bot@$PROJECT_ID.iam.gserviceaccount.com"

# Check if required tools are installed
if ! command -v gcloud &> /dev/null; then
  echo "Error: gcloud CLI is required but not installed."
  echo "Please install from: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

if ! command -v docker &> /dev/null; then
  echo "Error: docker is required but not installed."
  exit 1
fi

# Get project ID if not set
if [ -z "$PROJECT_ID" ]; then
  PROJECT_ID=$(gcloud config get-value project)
  if [ -z "$PROJECT_ID" ]; then
    echo "Error: No Google Cloud project specified."
    echo "Please run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
  fi
fi

echo " Redeploying Privateer Trading Bot to Google Cloud Run"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service name: $SERVICE_NAME"
echo ""

# Check if we need to rebuild the TypeScript application
if [ ! -d "dist" ] || [ "$(find src -type f -name '*.ts' -newer dist/index.js | wc -l)" -gt 0 ]; then
  echo " Building TypeScript application..."
  npm install || exit 1
  npm run build || exit 1
else
  echo " TypeScript build up to date, skipping..."
fi

# Build the Docker image with cache
echo " Building Docker image..."
docker build \
  --platform=linux/amd64 \
  --build-arg NODE_ENV=production \
  --cache-from $IMAGE_NAME \
  -t $IMAGE_NAME .

# Push the image to Google Container Registry
echo " Pushing image to Google Container Registry..."
if ! docker push $IMAGE_NAME; then
  echo "Error: Failed to push Docker image to GCR"
  exit 1
fi

# Create a secret for the Firebase service account if it doesn't exist
echo " Checking secrets..."
gcloud secrets describe firebase-service-account --project=$PROJECT_ID &> /dev/null || \
  gcloud secrets create firebase-service-account \
    --data-file="firebase-service-account.json" \
    --replication-policy="automatic" \
    --project=$PROJECT_ID

# Create/Update secret for Hyperliquid private key
HL_PRIVATE_KEY_SECRET_NAME="hyperliquid-private-key"
if gcloud secrets describe $HL_PRIVATE_KEY_SECRET_NAME --project=$PROJECT_ID &> /dev/null; then
  echo " Updating secret $HL_PRIVATE_KEY_SECRET_NAME..."
  HL_PRIVATE_KEY=$(grep HYPERLIQUID_MAIN_WALLET_PRIVATE_KEY .env | cut -d '=' -f2)
  if [ -z "$HL_PRIVATE_KEY" ]; then
    echo " Error: HYPERLIQUID_MAIN_WALLET_PRIVATE_KEY not found in .env file!"
    exit 1
  fi
  printf "%s" "$HL_PRIVATE_KEY" | gcloud secrets versions add $HL_PRIVATE_KEY_SECRET_NAME --data-file=- --project=$PROJECT_ID
else
  echo " Creating secret $HL_PRIVATE_KEY_SECRET_NAME..."
  HL_PRIVATE_KEY_FILE="./.hl-key-temp"
  grep HYPERLIQUID_MAIN_WALLET_PRIVATE_KEY .env | cut -d '=' -f2 > "$HL_PRIVATE_KEY_FILE"
  if [ ! -s "$HL_PRIVATE_KEY_FILE" ]; then
      echo " Error: HYPERLIQUID_MAIN_WALLET_PRIVATE_KEY not found in .env file or is empty!"
      rm -f "$HL_PRIVATE_KEY_FILE"
      exit 1
  fi
  gcloud secrets create $HL_PRIVATE_KEY_SECRET_NAME \
    --data-file="$HL_PRIVATE_KEY_FILE" \
    --replication-policy="automatic" \
    --project=$PROJECT_ID
  rm -f "$HL_PRIVATE_KEY_FILE"
fi

# Get other credentials from .env file
MAIN_WALLET_ADDRESS=$(grep HYPERLIQUID_MAIN_WALLET_ADDRESS .env | cut -d '=' -f2)
COINGECKO_API_KEY=$(grep COINGECKO_API_KEY .env | cut -d '=' -f2)

if [ -z "$MAIN_WALLET_ADDRESS" ] || [ -z "$COINGECKO_API_KEY" ]; then
  echo " Error: HYPERLIQUID_MAIN_WALLET_ADDRESS or COINGECKO_API_KEY not found in .env file!"
  exit 1
fi

# Create service account for the Cloud Run service if it doesn't exist
echo " Checking Cloud Run service account..."
if ! gcloud iam service-accounts describe $SERVICE_ACCOUNT --project=$PROJECT_ID &> /dev/null; then
  echo " Creating service account $SERVICE_ACCOUNT..."
  gcloud iam service-accounts create ${SERVICE_ACCOUNT%%@*} \
    --description="Service account for Privateer Trading Bot" \
    --display-name="Privateer Trading Bot Service Account" || {
      echo "Error: Failed to create service account. Using default service account."
      SERVICE_ACCOUNT="$PROJECT_ID@appspot.gserviceaccount.com"
    }
fi

# Grant necessary roles to the service account
echo " Granting necessary roles to service account..."

# Firestore access role (datastore.user)
if ! gcloud projects get-iam-policy $PROJECT_ID --format="json" | grep -q "serviceAccount:$SERVICE_ACCOUNT.*roles/datastore.user"; then
  echo " Granting Firestore access role to $SERVICE_ACCOUNT..."
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/datastore.user" || echo "Warning: Could not grant datastore.user role"
else
  echo " Firestore role already assigned to $SERVICE_ACCOUNT"
fi

# Secret Manager access
if ! gcloud projects get-iam-policy $PROJECT_ID --format="json" | grep -q "serviceAccount:$SERVICE_ACCOUNT.*roles/secretmanager.secretAccessor"; then
  echo " Granting Secret Manager access role to $SERVICE_ACCOUNT..."
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/secretmanager.secretAccessor" || echo "Warning: Could not grant secretmanager.secretAccessor role"
else
  echo " Secret Manager role already assigned to $SERVICE_ACCOUNT"
fi

# Deploy to Cloud Run
echo " Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image=$IMAGE_NAME \
  --platform=managed \
  --region=$REGION \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=1 \
  --timeout=300s \
  --set-env-vars="NODE_ENV=production,TZ=UTC,FIREBASE_SERVICE_ACCOUNT_PATH=/secrets/firebase-service-account.json,HYPERLIQUID_MAIN_WALLET_ADDRESS=${MAIN_WALLET_ADDRESS},COINGECKO_API_KEY=${COINGECKO_API_KEY},RISK_MAX_PORTFOLIO_ALLOCATION=$(grep RISK_MAX_PORTFOLIO_ALLOCATION .env | cut -d '=' -f2),RISK_MAX_POSITION_SIZE=$(grep RISK_MAX_POSITION_SIZE .env | cut -d '=' -f2),RISK_STOP_LOSS_PERCENT=$(grep RISK_STOP_LOSS_PERCENT .env | cut -d '=' -f2),SERVICE_URL=https://${SERVICE_NAME}-${PROJECT_ID}.${REGION}.run.app" \
  --set-secrets="HYPERLIQUID_MAIN_WALLET_PRIVATE_KEY=hyperliquid-private-key:latest,FIREBASE_SERVICE_ACCOUNT=firebase-service-account:latest" \
  --service-account=$SERVICE_ACCOUNT \
  --min-instances=1 \
  --max-instances=3

if [ $? -ne 0 ]; then
  echo "❌ Deployment failed"
  exit 1
fi

echo "✅ Deployment completed successfully"

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)' --project=$PROJECT_ID)

echo " Service URL: $SERVICE_URL"

# Set up Cloud Scheduler jobs in parallel
{
  echo " Setting up Cloud Scheduler jobs..."
  
  # Create service account for scheduler if it doesn't exist
  echo " Checking scheduler service account..."
  SCHEDULER_SERVICE_ACCOUNT="privateer-scheduler@$PROJECT_ID.iam.gserviceaccount.com"
  if ! gcloud iam service-accounts describe $SCHEDULER_SERVICE_ACCOUNT --project=$PROJECT_ID &> /dev/null; then
    echo " Creating service account $SCHEDULER_SERVICE_ACCOUNT..."
    gcloud iam service-accounts create privateer-scheduler \
      --description="Service account for Cloud Scheduler jobs" \
      --display-name="Privateer Scheduler Service Account" || {
        echo "Warning: Failed to create scheduler service account. Using app default service account."
        SCHEDULER_SERVICE_ACCOUNT="$PROJECT_ID@appspot.gserviceaccount.com"
      }
  fi

  # Grant necessary permissions for scheduler service account
  echo "Checking and updating IAM permissions for scheduler..."
  if ! gcloud projects get-iam-policy $PROJECT_ID --format="json" | grep -q "serviceAccount:$SCHEDULER_SERVICE_ACCOUNT.*roles/run.invoker"; then
    gcloud projects add-iam-policy-binding $PROJECT_ID \
      --member="serviceAccount:$SCHEDULER_SERVICE_ACCOUNT" \
      --role="roles/run.invoker" \
      --condition="title=AllowCloudSchedulerToInvokeCloudRun,expression=true" || {
        echo "Warning: Error adding IAM policy binding. Continuing with existing permissions."
      }
    echo "Added IAM policy binding for $SCHEDULER_SERVICE_ACCOUNT"
  else
    echo "IAM policy binding for $SCHEDULER_SERVICE_ACCOUNT already exists"
  fi
  
  # Ensure the scheduler service account has secretAccessor role
  if ! gcloud projects get-iam-policy $PROJECT_ID --format="json" | grep -q "serviceAccount:$SCHEDULER_SERVICE_ACCOUNT.*roles/secretmanager.secretAccessor"; then
    gcloud projects add-iam-policy-binding $PROJECT_ID \
      --member="serviceAccount:$SCHEDULER_SERVICE_ACCOUNT" \
      --role="roles/secretmanager.secretAccessor" \
      --condition="title=AllowCloudSchedulerToInvokeCloudRun,expression=true" || {
        echo "Warning: Error adding secretAccessor role. Continuing with existing permissions."
      }
    echo "Added secretAccessor role for $SCHEDULER_SERVICE_ACCOUNT"
  else
    echo "secretAccessor role for $SCHEDULER_SERVICE_ACCOUNT already exists"
  fi

  # List of jobs to delete
  JOBS_TO_DELETE=(
    "cleanup-data"
    "price-data-collection"
    "opportunity-check"
    "trade-updates"
    "strategy-health-check"
    "strategy-initialization"
    "correlation-refresh"  # Legacy job, now integrated with price-data-collection
    "position-sync"        # Position synchronization job
  )

  # Delete existing jobs
  for job in "${JOBS_TO_DELETE[@]}"; do
    echo "Deleting job: $job"
    gcloud scheduler jobs delete $job --location=$REGION --quiet 2>/dev/null || echo "Job $job does not exist, skipping"
  done

  # Create price data collection job (every 15 minutes)
  # This job also runs correlation analysis automatically after collecting price data
  echo "Creating price-data-collection job..."
  gcloud scheduler jobs create http price-data-collection \
    --location $REGION \
    --schedule="*/15 * * * *" \
    --uri="$SERVICE_URL/api/collect-price-data" \
    --http-method=POST \
    --oidc-service-account-email=$SCHEDULER_SERVICE_ACCOUNT \
    --oidc-token-audience=$SERVICE_URL 2>/dev/null || {
      echo "Warning: Error creating price-data-collection job. It may already exist."
      gcloud scheduler jobs update http price-data-collection \
        --location $REGION \
        --schedule="*/15 * * * *" \
        --uri="$SERVICE_URL/api/collect-price-data" \
        --http-method=POST \
        --oidc-service-account-email=$SCHEDULER_SERVICE_ACCOUNT \
        --oidc-token-audience=$SERVICE_URL 2>/dev/null || echo "Could not update price-data-collection job."
    }

  # Create opportunity check job (every hour at 0 minutes past)
  gcloud scheduler jobs create http opportunity-check \
    --location $REGION \
    --schedule="0 * * * *" \
    --uri="$SERVICE_URL/api/opportunity-check" \
    --http-method=POST \
    --oidc-service-account-email=$SCHEDULER_SERVICE_ACCOUNT \
    --oidc-token-audience=$SERVICE_URL || echo "opportunity-check job already exists or could not be created"

  # Create trade updates job (every 15 minutes)
  gcloud scheduler jobs create http trade-updates \
    --location $REGION \
    --schedule="*/15 * * * *" \
    --uri="$SERVICE_URL/api/trade-updates" \
    --http-method=POST \
    --oidc-service-account-email=$SCHEDULER_SERVICE_ACCOUNT \
    --oidc-token-audience=$SERVICE_URL || echo "trade-updates job already exists or could not be created"

  # Note: We no longer need a separate correlation refresh job since it's now integrated with price data collection
  # which runs every 15 minutes

  # Create cleanup job (daily at 1 AM)
  gcloud scheduler jobs create http cleanup-data \
    --location $REGION \
    --schedule="0 1 * * *" \
    --uri="$SERVICE_URL/api/cleanup-data" \
    --http-method=POST \
    --oidc-service-account-email=$SCHEDULER_SERVICE_ACCOUNT \
    --oidc-token-audience=$SERVICE_URL || echo "cleanup-data job already exists or could not be created"

  # Create strategy initialization job (daily at 1 AM)
  gcloud scheduler jobs create http strategy-initialization \
    --location $REGION \
    --schedule="0 1 * * *" \
    --uri="$SERVICE_URL/api/strategy-initialization" \
    --http-method=POST \
    --oidc-service-account-email=$SCHEDULER_SERVICE_ACCOUNT \
    --oidc-token-audience=$SERVICE_URL || echo "strategy-initialization job already exists or could not be created"

  # Create strategy health check job (daily at 7 AM)
  gcloud scheduler jobs create http strategy-health-check \
    --location $REGION \
    --schedule="0 7 * * *" \
    --uri="$SERVICE_URL/api/strategy-health-check" \
    --http-method=POST \
    --oidc-service-account-email=$SCHEDULER_SERVICE_ACCOUNT \
    --oidc-token-audience=$SERVICE_URL || echo "strategy-health-check job already exists or could not be created"
    
  # Create position synchronization job (every 5 minutes)
  echo "Creating position-sync job..."
  gcloud scheduler jobs create http position-sync \
    --location $REGION \
    --schedule="*/5 * * * *" \
    --uri="$SERVICE_URL/api/sync-positions" \
    --http-method=POST \
    --attempt-deadline=4m \
    --time-zone="UTC" \
    --description="Synchronizes database positions with exchange positions" \
    --oidc-service-account-email=$SCHEDULER_SERVICE_ACCOUNT \
    --oidc-token-audience=$SERVICE_URL 2>/dev/null || {
      echo "Warning: Error creating position-sync job. It may already exist."
      gcloud scheduler jobs update http position-sync \
        --location $REGION \
        --schedule="*/5 * * * *" \
        --uri="$SERVICE_URL/api/sync-positions" \
        --http-method=POST \
        --attempt-deadline=4m \
        --time-zone="UTC" \
        --description="Synchronizes database positions with exchange positions" \
        --oidc-service-account-email=$SCHEDULER_SERVICE_ACCOUNT \
        --oidc-token-audience=$SERVICE_URL 2>/dev/null || echo "Could not update position-sync job."
    }
    
  echo "Successfully created all scheduler jobs including position-sync"
} &

# Trigger strategy initialization immediately after deployment
echo "Triggering strategy initialization..."
{
  curl -X POST "$SERVICE_URL/api/strategy-initialization" \
    -H "Authorization: Bearer $(gcloud auth print-identity-token)"
} &

# Update dashboard URL and build
echo " Updating dashboard URL with new service URL..."
{
  ./update-dashboard-url.sh
} &

# Wait for parallel operations to complete
wait

echo " Deployment complete!"
echo " Service URL: $SERVICE_URL"
echo ""
echo " Dashboard has been built with the updated service URL."
echo " Run 'firebase deploy' or your preferred hosting method to deploy it."