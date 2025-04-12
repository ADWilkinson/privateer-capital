#!/bin/bash
set -e

echo "Privateer Capital Pre-Deployment Check"
echo "====================================="
echo

# Check Node version
NODE_VERSION=$(node --version)
echo "Node version: $NODE_VERSION"
if [[ ! $NODE_VERSION =~ ^v1[8-9]\. && ! $NODE_VERSION =~ ^v2[0-9]\. ]]; then
    echo "Warning: Node.js v18+ is recommended for this project"
fi

# Check npm version
NPM_VERSION=$(npm --version)
echo "npm version: $NPM_VERSION"

# Check Firebase CLI
if command -v firebase &> /dev/null; then
    FIREBASE_VERSION=$(firebase --version)
    echo "Firebase CLI version: $FIREBASE_VERSION"
else
    echo "Error: Firebase CLI not found. Please install it with:"
    echo "npm install -g firebase-tools"
    exit 1
fi

# Check Google Cloud SDK
if command -v gcloud &> /dev/null; then
    GCLOUD_VERSION=$(gcloud --version | head -n 1)
    echo "Google Cloud SDK: $GCLOUD_VERSION"
else
    echo "Error: Google Cloud SDK not found. Please install it from:"
    echo "https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check Docker
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    echo "Docker: $DOCKER_VERSION"
else
    echo "Error: Docker not found. Please install it from:"
    echo "https://docs.docker.com/get-docker/"
    exit 1
fi

echo

# Check server dependencies
echo "Checking server dependencies..."
if [ -d "server/node_modules" ]; then
    echo "✓ Server dependencies installed"
else
    echo "✗ Server dependencies not installed"
    echo "  Run: cd server && npm install"
fi

# Check server build
echo "Checking server build..."
if [ -d "server/dist" ]; then
    echo "✓ Server build exists"
else
    echo "✗ Server build not found"
    echo "  Run: cd server && npm run build"
fi

# Check dashboard dependencies
echo "Checking dashboard dependencies..."
if [ -d "dashboard/node_modules" ]; then
    echo "✓ Dashboard dependencies installed"
else
    echo "✗ Dashboard dependencies not installed"
    echo "  Run: cd dashboard && npm install"
fi

# Check dashboard build
echo "Checking dashboard build..."
if [ -d "dashboard/dist" ]; then
    echo "✓ Dashboard build exists"
else
    echo "✗ Dashboard build not found"
    echo "  Run: cd dashboard && npm run build"
fi

echo

# Check Firebase configuration files
echo "Checking Firebase configuration files..."
if [ -f "firebase.json" ]; then
    echo "✓ Firebase configuration found"
else
    echo "✗ Firebase configuration missing"
    echo "  Run: firebase init"
fi

if [ -f "firestore.rules" ]; then
    echo "✓ Firestore rules found"
else
    echo "✗ Firestore rules missing"
    echo "  Run: firebase init firestore"
fi

if [ -f "firestore.indexes.json" ]; then
    echo "✓ Firestore indexes configuration found"
else
    echo "✗ Firestore indexes configuration missing"
    echo "  Run: firebase init firestore"
fi

echo

# Check environment files
echo "Checking environment files..."
if [ -f "dashboard/.env" ]; then
    echo "✓ Dashboard environment file found"
    
    # Check for Cloud Run API URL in dashboard/.env
    if grep -q "VITE_API_URL" dashboard/.env; then
        echo "  ✓ Cloud Run API URL configured"
    else
        echo "  ✗ Cloud Run API URL not configured"
        echo "    Add VITE_API_URL=<your-cloud-run-url>/api to dashboard/.env"
    fi
else
    echo "✗ Dashboard environment file not found"
    echo "  Create dashboard/.env with Firebase configuration and Cloud Run URL"
fi

if [ -f "server/.env" ]; then
    echo "✓ Server environment file found"
    
    # Check for Hyperliquid API key in server/.env
    if grep -q "HYPERLIQUID_PRIVATE_KEY" server/.env; then
        echo "  ✓ Hyperliquid API key configured"
    else
        echo "  ✗ Hyperliquid API key not configured"
        echo "    Add HYPERLIQUID_PRIVATE_KEY=your_key to server/.env"
    fi
else
    echo "✗ Server environment file not found"
    echo "  Create server/.env based on server/.env.example"
fi

# Check for Firebase service account JSON
if [ -f "server/firebase-service-account.json" ]; then
    echo "✓ Firebase service account JSON found"
else
    echo "✗ Firebase service account JSON not found"
    echo "  Download from Firebase Console > Project Settings > Service Accounts"
    echo "  Save as server/firebase-service-account.json"
fi

echo

# Check Google Cloud project
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -n "$PROJECT_ID" ]; then
    echo "✓ Google Cloud project configured: $PROJECT_ID"
    
    # Check if Cloud Run API is enabled
    if gcloud services list --enabled --filter="name:run.googleapis.com" 2>/dev/null | grep -q "run.googleapis.com"; then
        echo "  ✓ Cloud Run API enabled"
    else
        echo "  ✗ Cloud Run API not enabled"
        echo "    Run: gcloud services enable run.googleapis.com"
    fi
else
    echo "✗ Google Cloud project not configured"
    echo "  Run: gcloud config set project YOUR_PROJECT_ID"
fi

echo
echo "Pre-deployment check complete."
echo "Fix any issues before proceeding with deployment."