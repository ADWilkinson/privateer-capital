#!/bin/bash
set -e

# Default variables
PROJECT_ID="privateer-capital"
REGION="us-central1"
SERVICE_NAME="privateer-trading-bot"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME:latest"

# Check if project ID is not set
if [ -z "$PROJECT_ID" ]; then
  PROJECT_ID=$(gcloud config get-value project)
  if [ -z "$PROJECT_ID" ]; then
    echo "Error: No Google Cloud project specified."
    echo "Please run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
  fi
fi

echo " Deploying Privateer Trading Bot to Google Cloud Run"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service name: $SERVICE_NAME"
echo ""

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
RISK_MAX_PORTFOLIO_ALLOCATION=$(grep RISK_MAX_PORTFOLIO_ALLOCATION .env | cut -d '=' -f2 || echo "0.5")
RISK_MAX_POSITION_SIZE=$(grep RISK_MAX_POSITION_SIZE .env | cut -d '=' -f2 || echo "0.25")
RISK_STOP_LOSS_PERCENT=$(grep RISK_STOP_LOSS_PERCENT .env | cut -d '=' -f2 || echo "0.10")

if [ -z "$MAIN_WALLET_ADDRESS" ] || [ -z "$COINGECKO_API_KEY" ]; then
  echo " Error: HYPERLIQUID_MAIN_WALLET_ADDRESS or COINGECKO_API_KEY not found in .env file!"
  exit 1
fi

# Add Secret Manager Secret Accessor role to service account
echo " Adding Secret Manager Secret Accessor role to service account..."
SERVICE_ACCOUNT="privateer-scheduler@$PROJECT_ID.iam.gserviceaccount.com"

# Check if binding already exists to avoid duplicate bindings
if ! gcloud projects get-iam-policy $PROJECT_ID --format="json" | grep -q "serviceAccount:$SERVICE_ACCOUNT.*roles/secretmanager.secretAccessor"; then
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/secretmanager.secretAccessor" \
    --condition=None
  echo " IAM binding added for $SERVICE_ACCOUNT"
else
  echo " IAM binding for $SERVICE_ACCOUNT already exists"
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
  --set-env-vars="NODE_ENV=production,TZ=UTC,FIREBASE_SERVICE_ACCOUNT_PATH=/secrets/firebase-service-account.json,HYPERLIQUID_MAIN_WALLET_ADDRESS=${MAIN_WALLET_ADDRESS},COINGECKO_API_KEY=${COINGECKO_API_KEY},RISK_MAX_PORTFOLIO_ALLOCATION=${RISK_MAX_PORTFOLIO_ALLOCATION},RISK_MAX_POSITION_SIZE=${RISK_MAX_POSITION_SIZE},RISK_STOP_LOSS_PERCENT=${RISK_STOP_LOSS_PERCENT},SERVICE_URL=https://${SERVICE_NAME}-${PROJECT_ID}.${REGION}.run.app" \
  --set-secrets="HYPERLIQUID_MAIN_WALLET_PRIVATE_KEY=hyperliquid-private-key:latest,FIREBASE_SERVICE_ACCOUNT=firebase-service-account:latest" \
  --service-account="$SERVICE_ACCOUNT" \
  --min-instances=1 \
  --max-instances=3

if [ $? -ne 0 ]; then
  echo " Deployment failed"
  exit 1
fi

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)' --project=$PROJECT_ID)

echo ""
echo " Deployment complete!"
echo " Service URL: $SERVICE_URL"
echo ""
echo " IMPORTANT: This deployment did not recreate Cloud Scheduler jobs."
echo " If you need to update or create scheduler jobs, use the full deployment script."