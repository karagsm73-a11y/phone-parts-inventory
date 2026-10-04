#!/bin/bash
# Usage: ./push.sh owner/repo   (repo must already exist and be accessible to the PromptQL GitHub App)
set -e
cd "$(dirname "$0")"
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/$1.git"
git push -u origin main
