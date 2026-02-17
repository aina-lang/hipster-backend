#!/bin/bash

# Params
INPUT_FILE="$1"
OUTPUT_FILE="$2"
PROMPT="$3"
API_KEY="$OPENAI_API_KEY"

# We use gpt-image-1.5 for high-fidelity and 1024x1536 support
curl -s -X POST https://api.openai.com/v1/images/edits \
  -H "Authorization: Bearer $API_KEY" \
  -F "model=gpt-image-1.5" \
  -F "image=@${INPUT_FILE}" \
  -F "prompt=${PROMPT}" \
  -F "input_fidelity=high" \
  -F "quality=high" \
  -F "size=1024x1536" \
  -F "response_format=b64_json" \
| jq -r '.data[0].b64_json' \
| base64 --decode > "${OUTPUT_FILE}"
