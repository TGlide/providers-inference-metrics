#!/bin/bash

# Build and run script for providers-inference-metrics Docker container

set -e  # Exit on any error

echo "🐳 Building providers-inference-metrics Docker container..."

# Check if .env.docker exists
if [ ! -f ".env.docker" ]; then
    echo "❌ Error: .env.docker file not found!"
    echo "📝 Please copy .env.docker.example to .env.docker and fill in your values:"
    echo "   cp .env.docker.example .env.docker"
    echo "   # Then edit .env.docker with your actual HF tokens and config"
    exit 1
fi

# Build the Docker image
echo "🏗️  Building Docker image..."
docker build -t inference-metrics:latest .

echo "✅ Build completed successfully!"

# Ask user how they want to run
echo ""
echo "How would you like to run the container?"
echo "1) Using docker-compose (recommended)"
echo "2) Using docker run directly"
echo "3) Just build (don't run)"
read -p "Choose option (1-3): " choice

case $choice in
    1)
        echo "🚀 Starting with docker-compose..."
        docker-compose up -d
        echo "✅ Container started! Use 'docker-compose logs -f' to view logs"
        echo "🛑 Use 'docker-compose down' to stop"
        ;;
    2)
        echo "🚀 Starting with docker run..."
        docker run -d \
            --name inference-metrics-tracker \
            --env-file .env.docker \
            -v inference_data:/app/data \
            --restart unless-stopped \
            inference-metrics:latest
        echo "✅ Container started! Use 'docker logs -f inference-metrics-tracker' to view logs"
        echo "🛑 Use 'docker stop inference-metrics-tracker' to stop"
        ;;
    3)
        echo "✅ Build only completed. Container not started."
        ;;
    *)
        echo "❌ Invalid choice. Exiting."
        exit 1
        ;;
esac

echo ""
echo "📊 Useful commands:"
echo "  View logs: docker-compose logs -f  (or docker logs -f inference-metrics-tracker)"
echo "  Stop: docker-compose down  (or docker stop inference-metrics-tracker)"
echo "  Restart: docker-compose restart  (or docker restart inference-metrics-tracker)"
echo "  Check status: docker-compose ps  (or docker ps)"