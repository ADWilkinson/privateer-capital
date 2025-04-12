#!/bin/bash
set -e

# Default variables
PROJECT_ID="privateer-capital"
REGION="us-central1"
SERVICE_NAME="privateer-trading-bot"
SERVICE_URL="https://${SERVICE_NAME}-x6tpfdyjkq-uc.a.run.app"
SERVICE_ACCOUNT="privateer-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --project)
      PROJECT_ID="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --service-name)
      SERVICE_NAME="$2"
      SERVICE_URL="https://${SERVICE_NAME}-x6tpfdyjkq-uc.a.run.app"
      shift 2
      ;;
    --delete-only)
      DELETE_ONLY=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "Setting up Cloud Scheduler jobs for ${SERVICE_NAME}"
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Service URL: ${SERVICE_URL}"

# Check if service account exists
if ! gcloud iam service-accounts describe $SERVICE_ACCOUNT --project=$PROJECT_ID &>/dev/null; then
  echo "Creating service account for Cloud Scheduler..."
  gcloud iam service-accounts create privateer-scheduler \
    --display-name="Privateer Scheduler Service Account" \
    --project=$PROJECT_ID
fi

# Grant the service account permission to invoke Cloud Run
echo "Granting Cloud Run invoker permission to service account..."
gcloud run services add-iam-policy-binding $SERVICE_NAME \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/run.invoker" \
  --region=$REGION \
  --project=$PROJECT_ID \
  --condition="expression=true,title=AllowCloudSchedulerToInvokeCloudRun" \
  || echo "IAM binding already exists"

# List of jobs to create
JOBS=(
  "cleanup-data"
  "price-data-collection"
  "historical-correlation"
  "opportunity-check"
  "trade-updates"
  "strategy-health-check"
  "strategy-initialization"
)

# Delete existing jobs first
for job in "${JOBS[@]}"; do
  echo "Deleting job: $job"
  gcloud scheduler jobs delete $job --location=$REGION --quiet || true
  sleep 1
  echo "Deleted job: $job"
done

# Exit if delete-only flag is set
if [ "$DELETE_ONLY" = true ]; then
  echo "Jobs deleted. Exiting as requested."
  exit 0
fi

# Create jobs
for job in "${JOBS[@]}"; do
  echo "Creating job: $job"
  case $job in
    "cleanup-data")
      gcloud scheduler jobs create http $job \
        --location=$REGION \
        --schedule="0 1 * * *" \
        --uri="$SERVICE_URL/api/cleanup-data" \
        --http-method=POST \
        --oidc-service-account-email=$SERVICE_ACCOUNT \
        --oidc-token-audience=$SERVICE_URL \
        || echo "$job already exists or could not be created"
      ;;
    "price-data-collection")
      gcloud scheduler jobs create http $job \
        --location=$REGION \
        --schedule="*/15 * * * *" \
        --uri="$SERVICE_URL/api/collect-price-data" \
        --http-method=POST \
        --oidc-service-account-email=$SERVICE_ACCOUNT \
        --oidc-token-audience=$SERVICE_URL \
        || echo "$job already exists or could not be created"
      ;;
    "historical-correlation")
      gcloud scheduler jobs create http $job \
        --location=$REGION \
        --schedule="0 2 * * 0" \
        --uri="$SERVICE_URL/api/historical-correlation" \
        --http-method=POST \
        --oidc-service-account-email=$SERVICE_ACCOUNT \
        --oidc-token-audience=$SERVICE_URL \
        || echo "$job already exists or could not be created"
      ;;
    "opportunity-check")
      gcloud scheduler jobs create http $job \
        --location=$REGION \
        --schedule="0 * * * *" \
        --uri="$SERVICE_URL/api/opportunity-check" \
        --http-method=POST \
        --oidc-service-account-email=$SERVICE_ACCOUNT \
        --oidc-token-audience=$SERVICE_URL \
        || echo "$job already exists or could not be created"
      ;;
    "trade-updates")
      gcloud scheduler jobs create http $job \
        --location=$REGION \
        --schedule="*/15 * * * *" \
        --uri="$SERVICE_URL/api/trade-updates" \
        --http-method=POST \
        --oidc-service-account-email=$SERVICE_ACCOUNT \
        --oidc-token-audience=$SERVICE_URL \
        || echo "$job already exists or could not be created"
      ;;
    "strategy-health-check")
      gcloud scheduler jobs create http $job \
        --location=$REGION \
        --schedule="0 7 * * *" \
        --uri="$SERVICE_URL/api/strategy-health-check" \
        --http-method=POST \
        --oidc-service-account-email=$SERVICE_ACCOUNT \
        --oidc-token-audience=$SERVICE_URL \
        || echo "$job already exists or could not be created"
      ;;
    "strategy-initialization")
      gcloud scheduler jobs create http $job \
        --location=$REGION \
        --schedule="0 1 * * *" \
        --uri="$SERVICE_URL/api/strategy-initialization" \
        --http-method=POST \
        --oidc-service-account-email=$SERVICE_ACCOUNT \
        --oidc-token-audience=$SERVICE_URL \
        || echo "$job already exists or could not be created"
      ;;
  esac
  sleep 1
  echo "Created job: $job"
done

echo "Cloud Scheduler jobs setup complete!"
echo "To verify, run: gcloud scheduler jobs list --location=$REGION --project=$PROJECT_ID"
