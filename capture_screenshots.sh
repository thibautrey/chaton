#!/bin/bash

# Chaton Screenshot Capture Script
# Run this after starting your application

echo "📸 Chaton Screenshot Capture Assistant"
echo "======================================"

# Create screenshots directory
mkdir -p docs/screenshots

# Function to capture with delay
take_screenshot() {
    local name=$1
    local delay=${2:-5}
    
    echo ""
    echo "🎯 Setting up for: $name"
    echo "⏳ You have $delay seconds to prepare the screen..."
    
    # Countdown
    for i in $(seq $delay -1 1); do
        echo -ne "\r⏳ $i seconds remaining..."
        sleep 1
    done
    echo -ne "\r📸 Capturing!\n"
    
    # Capture (macOS specific - adjust for your OS)
    screencapture -R 100,100,1000,800 "docs/screenshots/${name}.png"
    
    echo "✅ Saved: docs/screenshots/${name}.png"
}

echo ""
echo "📋 Capture Plan:"
echo "1. Main Conversation Interface"
echo "2. Model Selection View"
echo "3. Project Organization View"
echo ""

# Capture 1: Main Conversation Interface
echo "🎯 Step 1/3: Main Conversation Interface"
echo "- Open Chaton"
echo "- Navigate to main conversation view"
echo "- Show a sample conversation"
echo "- Make sure the sidebar is visible"
take_screenshot "main-conversation"

# Capture 2: Model Selection
echo ""
echo "🎯 Step 2/3: Model Selection View"
echo "- Open the model selection panel"
echo "- Show various model options"
echo "- Highlight the active/selected model"
take_screenshot "model-selection"

# Capture 3: Project Organization
echo ""
echo "🎯 Step 3/3: Project Organization View"
echo "- Open the projects view"
echo "- Show multiple projects"
echo "- Expand one project to show threads"
take_screenshot "project-organization"

echo ""
echo "🎉 All screenshots captured!"
echo "📁 Location: docs/screenshots/"
echo ""
echo "💡 Next steps:"
echo "1. Review the screenshots in docs/screenshots/"
echo "2. Edit if needed (crop, annotate, etc.)"
echo "3. Update README.md with the new image paths"
