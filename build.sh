#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Get the product name from package.json
APP_NAME=$(node -p "require('./package.json').build.productName")

# Define the source path for the built application
# electron-builder typically outputs to dist/mac/
SOURCE_APP_PATH="./dist/mac-arm64/${APP_NAME}.app"

# Define the destination path in the Applications directory
DEST_APP_PATH="/Applications/${APP_NAME}.app"

echo "Starting build process..."

# Run the build command defined in package.json (npm run pack)
npm run pack

echo "Build completed."

# Check if the source application bundle exists
if [ -d "${SOURCE_APP_PATH}" ]; then
  echo "Copying ${APP_NAME}.app to /Applications/ (overwriting if exists)..."
  # Copy the application bundle recursively and force overwrite
  cp -Rf "${SOURCE_APP_PATH}" "/Applications/"
  echo "Successfully copied ${APP_NAME}.app to /Applications/."
else
  echo "Error: Built application not found at ${SOURCE_APP_PATH}"
  exit 1
fi

echo "Build and deployment script finished successfully."

exit 0