#!/bin/bash

# YourLab Website - Setup & Run Script
# Run this script to set up and start the YourLab website

echo "🚀 YourLab Website - Setup & Run"
echo "=================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null
then
    echo "❌ Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    echo "Then run this script again."
    exit 1
fi

echo "✅ Node.js is installed"
echo "   Version: $(node --version)"
echo ""

# Navigate to server directory
cd "$(dirname "$0")" || exit

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Starting server..."
echo "================================================"
echo ""
echo "Your website will be available at:"
echo "  🌐 Main website: http://localhost:3000"
echo "  📊 Admin dashboard: http://localhost:3000/admin.html"
echo ""
echo "API endpoints:"
echo "  📋 View inquiries: http://localhost:3000/api/inquiries"
echo "  ❤️ Health check: http://localhost:3000/api/health"
echo ""
echo "Press Ctrl+C to stop the server"
echo "================================================"
echo ""

# Start the server
npm start
