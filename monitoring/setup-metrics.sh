#!/usr/bin/env bash
#
# Creates Cloud Monitoring log-based metrics and a custom dashboard
# for the PartsFinder Repair Intelligence Agent.
#
# Prerequisites:
#   - gcloud CLI authenticated with your project
#   - Project ID set: gcloud config set project YOUR_PROJECT_ID
#
# Usage:
#   chmod +x monitoring/setup-metrics.sh
#   ./monitoring/setup-metrics.sh

set -euo pipefail

PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
  echo "Error: No project set. Run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

echo "Setting up PartsFinder monitoring for project: $PROJECT_ID"

# ---------------------------------------------------------------------------
# 1. Log-based metrics
# ---------------------------------------------------------------------------

echo "Creating log-based metrics..."

# Metric: Agent request latency (distribution)
gcloud logging metrics create agent_request_latency \
  --description="Agent request total latency in ms" \
  --log-filter='jsonPayload.message="agent_request_complete"' \
  --bucket-name="agent_request_latency" \
  2>/dev/null || echo "  agent_request_latency already exists"

# Metric: Agent request count (counter by confidence level)
gcloud logging metrics create agent_request_count \
  --description="Count of agent requests by confidence level" \
  --log-filter='jsonPayload.message="agent_request_complete"' \
  2>/dev/null || echo "  agent_request_count already exists"

# Metric: User feedback rating (distribution)
gcloud logging metrics create user_feedback_rating \
  --description="User feedback star ratings (1-5)" \
  --log-filter='jsonPayload.message="user_feedback"' \
  2>/dev/null || echo "  user_feedback_rating already exists"

# Metric: User feedback count
gcloud logging metrics create user_feedback_count \
  --description="Count of user feedback submissions" \
  --log-filter='jsonPayload.message="user_feedback"' \
  2>/dev/null || echo "  user_feedback_count already exists"

# Metric: Error count (from Cloud Functions)
gcloud logging metrics create agent_error_count \
  --description="Count of agent errors" \
  --log-filter='resource.type="cloud_function" severity>=ERROR' \
  2>/dev/null || echo "  agent_error_count already exists"

echo "Log-based metrics created."

# ---------------------------------------------------------------------------
# 2. Dashboard
# ---------------------------------------------------------------------------

echo "Creating Cloud Monitoring dashboard..."

DASHBOARD_JSON=$(cat monitoring/dashboard.json | sed "s/\${PROJECT_ID}/$PROJECT_ID/g")

# Check if dashboard exists
EXISTING=$(gcloud monitoring dashboards list --format="value(name)" --filter="displayName='PartsFinder Agent Health'" 2>/dev/null || true)

if [ -n "$EXISTING" ]; then
  echo "  Dashboard already exists. Updating..."
  DASHBOARD_NAME=$(echo "$EXISTING" | head -1)
  echo "$DASHBOARD_JSON" | gcloud monitoring dashboards update "$DASHBOARD_NAME" --config-from-file=-
else
  echo "$DASHBOARD_JSON" | gcloud monitoring dashboards create --config-from-file=-
fi

echo ""
echo "Done! Dashboard available at:"
echo "  https://console.cloud.google.com/monitoring/dashboards?project=$PROJECT_ID"
echo ""
echo "To view logs:"
echo "  https://console.cloud.google.com/logs/query;query=jsonPayload.message%3D%22agent_request_complete%22%20OR%20jsonPayload.message%3D%22user_feedback%22?project=$PROJECT_ID"
