#!/bin/bash
set -e

# Default variables
PROJECT_ID="privateer-capital"
REGION="us-central1"
SERVICE_NAME="privateer-trading-bot"

# Get the service URL for the trading bot
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)' --project=$PROJECT_ID)

if [ -z "$SERVICE_URL" ]; then
  echo "Error: Could not get service URL for $SERVICE_NAME"
  exit 1
fi

echo "Found service URL: $SERVICE_URL"

# Check if dashboard directory exists
if [ ! -d "../dashboard" ]; then
  echo "Error: dashboard directory not found"
  exit 1
fi

# Update the .env file with the service URL
ENV_FILE="../dashboard/.env"
if [ -f "$ENV_FILE" ]; then
  # First backup the original file
  cp "$ENV_FILE" "${ENV_FILE}.bak"
  echo "Backed up original .env file to ${ENV_FILE}.bak"
  
  # Update or add the VITE_API_URL line
  if grep -q "VITE_API_URL=" "$ENV_FILE"; then
    # Replace the existing line
    sed -i '' "s|VITE_API_URL=.*|VITE_API_URL=$SERVICE_URL|g" "$ENV_FILE"
  else
    # Add the line if it doesn't exist
    echo "VITE_API_URL=$SERVICE_URL" >> "$ENV_FILE"
  fi
  
  echo "Updated $ENV_FILE with service URL: $SERVICE_URL"
else
  echo "Warning: $ENV_FILE does not exist, creating new file"
  echo "VITE_API_URL=$SERVICE_URL" > "$ENV_FILE"
  echo "Created $ENV_FILE with service URL: $SERVICE_URL"
fi

# Now build the dashboard with the updated URL
echo "Building dashboard with updated service URL..."
(cd ../dashboard && npm run build)

if [ $? -eq 0 ]; then
  echo "Dashboard build successful!"
  echo "You can now deploy the dashboard with 'firebase deploy' or your preferred hosting method."
else
  echo "Error: Dashboard build failed"
  exit 1
fi