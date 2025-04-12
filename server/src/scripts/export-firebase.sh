#!/bin/bash

# Set the correct working directory
SCRIPT_DIR=$(dirname "$0")
cd "$SCRIPT_DIR/.."

# Run the TypeScript script
npx ts-node ./scripts/exportFirebaseStructure.ts
