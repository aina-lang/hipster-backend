#!/bin/bash

# Params
INPUT_FILE="$1"
OUTPUT_FILE="$2"
PROMPT="$3"
API_KEY="$OPENAI_API_KEY"

RESPONSE_FILE="/tmp/dalle_response_$(date +%s).json"

# We use gpt-image-1.5 for high-fidelity and 1024x1536 support
# Capture raw response to a file for validation
curl -s -X POST https://api.openai.com/v1/images/edits \
  -H "Authorization: Bearer $API_KEY" \
  -F "model=gpt-image-1.5" \
  -F "image=@${INPUT_FILE}" \
  -F "prompt=${PROMPT}" \
  -F "input_fidelity=high" \
  -F "quality=high" \
  -F "size=1024x1536" \
  -F "response_format=b64_json" > "$RESPONSE_FILE"

# Check if the response contains an error or valid data
B64_DATA=$(jq -r '.data[0].b64_json // empty' "$RESPONSE_FILE")

if [ -z "$B64_DATA" ] || [ "$B64_DATA" == "null" ]; then
    echo "ERROR: No image data returned from OpenAI." >&2
    echo "RAW RESPONSE: $(cat "$RESPONSE_FILE")" >&2
    rm -f "$RESPONSE_FILE"
    exit 1
fi

# Decode and save
echo "$B64_DATA" | base64 --decode > "$OUTPUT_FILE"

# Verify output size
if [ ! -s "$OUTPUT_FILE" ]; then
    echo "ERROR: Decoded file is empty." >&2
    rm -f "$RESPONSE_FILE" "$OUTPUT_FILE"
    exit 1
fi

rm -f "$RESPONSE_FILE"
exit 0
