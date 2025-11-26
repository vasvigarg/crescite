#!/bin/bash

# =======================================================
# CRITICAL: Configuration Variables (MUST BE CORRECT)
# =======================================================
BASE_URL="http://localhost:3000/api"
USER_EMAIL="test12@crescite.com"
USER_PASSWORD="SecurePass123!"

# !!! 1. VERIFY FILE PATH: Use the WSL/Linux path to your Windows file !!!
PDF_FILE_PATH="/mnt/c/Users/HP/Downloads/mock_portfolio_statement.pdf"
# !!! 2. VERIFY FILE SIZE: Use the EXACT byte size for the file below !!!
FILE_SIZE_BYTES=3688
# =======================================================

# Dynamic Variables
AUTH_TOKEN=""
JOB_ID=""
UPLOAD_URL=""

# --- Helper Functions ---
# Function to extract a value from a JSON response using jq
extract_value() {
    echo "$1" | jq -r ".$2"
}

# Function to poll the job status (Test 6)
poll_job_status() {
    local status="PENDING"
    local count=0
    echo -e "\n--- Test 6: Polling Job Status (JOB ID: $JOB_ID) ---"
    
    while [[ "$status" != "COMPLETED" && "$status" != "FAILED" && $count -lt 60 ]]; do
        response=$(curl -s -X GET "$BASE_URL/jobs/$JOB_ID" \
            -H "Authorization: Bearer $AUTH_TOKEN")
            
        status=$(extract_value "$response" "data.status")
        
        if [[ "$status" == "FAILED" ]]; then
            error_msg=$(extract_value "$response" "data.errorMessage")
            echo "🔴 Job FAILED. Error: $error_msg"
            return 1
        fi
        
        echo "Status: $status (Attempt: $((count+1)))"
        sleep 5
        count=$((count + 1))
    done
    
    if [[ "$status" == "COMPLETED" ]]; then
        echo -e "\n✅ Job processing completed successfully!"
        return 0
    else
        echo -e "\n❌ Job did not complete within the timeout period. Current status: $status"
        return 1
    fi
}

# --- Main Test Execution ---

# 0. Prerequisites Check
echo "--- Prerequisites Check ---"
if [[ ! -f "$PDF_FILE_PATH" ]]; then
    echo "❌ ERROR: File not found at $PDF_FILE_PATH"
    echo "Please update the PDF_FILE_PATH variable."
    exit 1
fi
echo "✅ Prerequisites OK. File found."

# 1. Health Check (Test 1)
echo "--- Test 1: Health Check ---"
curl -s "$BASE_URL/health" | jq .
echo "-----------------------------------"

# 2. Register User (Test 2)
echo "--- Test 2: Register User ---"
REG_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASSWORD\",\"firstName\":\"Test\",\"lastName\":\"User\"}")
echo "$REG_RESPONSE" | jq .
echo "-----------------------------------"

# 3. Login (Test 3)
echo "--- Test 3: Login (Obtaining Token) ---"
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASSWORD\"}")
AUTH_TOKEN=$(extract_value "$LOGIN_RESPONSE" "data.token")

if [[ -z "$AUTH_TOKEN" ]]; then
    echo "❌ ERROR: Failed to obtain AUTH_TOKEN. Exiting."
    exit 1
fi
echo "✅ Login successful. Token obtained."
echo "-----------------------------------"

# 4. Get Presigned URL (Test 4)
echo "--- Test 4: Get Presigned URL ---"
PRESIGNED_RESPONSE=$(curl -s -X POST "$BASE_URL/upload/presigned-url" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -d "{\"fileName\":\"$(basename "$PDF_FILE_PATH")\",\"fileSize\":$FILE_SIZE_BYTES,\"contentType\":\"application/pdf\"}")

UPLOAD_URL=$(extract_value "$PRESIGNED_RESPONSE" "data.uploadUrl")
JOB_ID=$(extract_value "$PRESIGNED_RESPONSE" "data.jobId")

if [[ -z "$UPLOAD_URL" || -z "$JOB_ID" ]]; then
    echo "❌ ERROR: Failed to get UPLOAD_URL or JOB_ID. API Response:"
    echo "$PRESIGNED_RESPONSE" | jq .
    exit 1
fi

echo "✅ Presigned URL obtained. NEW JOB ID: $JOB_ID"
echo "-----------------------------------"

# 5. Upload File to S3 (Test 5 - CRITICAL STEP)
echo "--- Test 5: Upload File to S3 ---"
echo "Starting binary upload of $PDF_FILE_PATH (Size: $FILE_SIZE_BYTES bytes)..."

UPLOAD_RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$UPLOAD_URL" \
  -H "Content-Type: application/pdf" \
  --data-binary "@$PDF_FILE_PATH")

if [[ "$UPLOAD_RESULT" == "200" ]]; then
    echo "✅ File upload successful (HTTP 200 OK)."
else
    echo "❌ ERROR: File upload failed with HTTP status code $UPLOAD_RESULT."
    echo "This is usually caused by an incorrect FILE_SIZE_BYTES or an expired URL."
    exit 1
fi
echo "-----------------------------------"

# 6. Check Job Status (Test 6 - Polling)
if poll_job_status; then
    # 7. Get Report (Test 7)
    echo -e "\n--- Test 7: Get Final Report ---"
    # Ensure to use the correct content from test-cas-data.pdf in the final output
    REPORT_RESPONSE=$(curl -s "$BASE_URL/jobs/$JOB_ID/report" \
        -H "Authorization: Bearer $AUTH_TOKEN")
    
    echo "$REPORT_RESPONSE" | jq .
    
    if echo "$REPORT_RESPONSE" | grep -q "reportData"; then
        echo -e "\n🚀 E2E Test Completed Successfully! Report retrieved."
    else
        echo -e "\n🔴 E2E Test FAILED: Report could not be retrieved. API response:"
        echo "$REPORT_RESPONSE"
    fi
else
    echo -e "\n🔴 E2E Test FAILED at Job Processing step."
fi
