#!/bin/bash

# Simple checker for cargo management system
# Usage: sudo ./simple_checker.sh <github_repo_url>
# Or for local testing: sudo ./simple_checker.sh --local

set -e  # Exit on any error

# Check if script is running with sudo
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (use sudo)"
    exit 1
fi

if [ $# -lt 1 ]; then
    echo "Usage: $0 <github_repo_url> or $0 --local"
    exit 1
fi

PORT=8000
LOCAL_MODE=false

if [ "$1" == "--local" ]; then
    LOCAL_MODE=true
    echo "Running in local mode - will use existing Docker image"
else
    REPO_URL=$1
    TEMP_DIR=$(mktemp -d)
    echo "Created temporary directory: $TEMP_DIR"
fi

# Cleanup function
cleanup() {
    echo "Cleaning up..."
    if [ -n "$CONTAINER_ID" ]; then
        echo "Stopping container $CONTAINER_ID"
        docker stop "$CONTAINER_ID" 2>/dev/null || true
        docker rm "$CONTAINER_ID" 2>/dev/null || true
    fi
    if [ "$LOCAL_MODE" == "false" ] && [ -n "$TEMP_DIR" ]; then
        echo "Removing temporary directory: $TEMP_DIR"
        rm -rf "$TEMP_DIR"
    fi
}

# Register cleanup on script exit
trap cleanup EXIT

if [ "$LOCAL_MODE" == "true" ]; then
    echo "Using existing cargo-management-system Docker image"
else
    echo "Cloning repository: $REPO_URL"
    git clone "$REPO_URL" "$TEMP_DIR"

    echo "Building Docker image"
    docker build -t cargo-management-system "$TEMP_DIR"
fi

echo "Running Docker container"
CONTAINER_ID=$(docker run -d -p $PORT:$PORT cargo-management-system)
echo "Container started with ID: $CONTAINER_ID"

echo "Waiting for server to start..."
for i in {1..10}; do
    if curl -s "http://localhost:$PORT/" > /dev/null; then
        echo "Server is up and running!"
        break
    fi
    if [ "$i" -eq 10 ]; then
        echo "Server did not start within expected time."
        exit 1
    fi
    sleep 2
done

# Test the placement endpoint
echo "Testing placement endpoint..."
RESPONSE=$(curl -s -X POST "http://localhost:$PORT/api/placement" \
    -H "Content-Type: application/json" \
    -d '{
        "items": [
            {
                "itemId": "test-item-1",
                "name": "Test Item 1",
                "width": 10,
                "depth": 10,
                "height": 10,
                "mass": 1,
                "priority": 1,
                "preferredZone": "A"
            }
        ],
        "containers": [
            {
                "containerId": "test-container-1",
                "zone": "A",
                "width": 100,
                "depth": 100,
                "height": 100
            }
        ]
    }')

echo "Response received: $RESPONSE"

# Check if response contains "success": true (allowing for whitespace variations)
if echo "$RESPONSE" | grep -q '"success"[[:space:]]*:[[:space:]]*true'; then
    echo "✅ SUCCESS: Placement endpoint working!"
    exit 0
else
    echo "❌ FAILED: Placement endpoint not working"
    echo "Response: $RESPONSE"
    exit 1
fi
