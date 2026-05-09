#!/bin/bash

# Context Highlighter — Setup Script
# Run this once to initialize the repo and push to GitHub

set -e

REPO_NAME="context-highlighter"
GITHUB_USER="goldfishandswedishfish"
TARGET_DIR="$HOME/$REPO_NAME"

echo ""
echo "✦ Context Highlighter Setup"
echo "─────────────────────────────────────"

# 1. Copy knowledge base to home directory
echo "→ Creating knowledge base at $TARGET_DIR..."
if [ -d "$TARGET_DIR" ]; then
  echo "  Directory already exists, skipping copy."
else
  cp -r "$(dirname "$0")" "$TARGET_DIR"
fi

cd "$TARGET_DIR"

# 2. Initialize git
echo "→ Initializing git repo..."
git init
git add .
git commit -m "Initial commit — Context Highlighter knowledge base"

# 3. Create GitHub repo and push
echo "→ Creating GitHub repo..."
if command -v gh &> /dev/null; then
  gh repo create "$GITHUB_USER/$REPO_NAME" --private --source=. --push
  echo ""
  echo "✓ Repo created: https://github.com/$GITHUB_USER/$REPO_NAME"
else
  echo ""
  echo "  GitHub CLI (gh) not found. To push to GitHub:"
  echo "  1. Install gh: brew install gh"
  echo "  2. Authenticate: gh auth login"
  echo "  3. Run: gh repo create $GITHUB_USER/$REPO_NAME --private --source=. --push"
fi

echo ""
echo "✦ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Load the Chrome extension:"
echo "     chrome://extensions → Developer mode → Load unpacked → $TARGET_DIR/extension"
echo ""
echo "  2. Start the sync server:"
echo "     cd $TARGET_DIR/server && node index.js"
echo ""
echo "  3. Highlight anything on the web and it will appear in:"
echo "     $TARGET_DIR/highlights/"
echo ""
