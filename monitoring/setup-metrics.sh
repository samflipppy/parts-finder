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

# Metric: Total tokens per request (distribution — extracts numeric value from log)
cat > /tmp/metric_total_tokens.json << 'METRIC_EOF'
{
  "name": "agent_total_tokens",
  "description": "Total LLM tokens (input+output) per agent request",
  "filter": "jsonPayload.message=\"agent_request_complete\"",
  "metricDescriptor": { "metricKind": "DELTA", "valueType": "DISTRIBUTION" },
  "valueExtractor": "EXTRACT(jsonPayload.agent.totalTokens)",
  "bucketOptions": { "exponentialBuckets": { "numFiniteBuckets": 12, "growthFactor": 2, "scale": 50 } }
}
METRIC_EOF
gcloud logging metrics create agent_total_tokens --config-from-file=/tmp/metric_total_tokens.json \
  2>/dev/null || echo "  agent_total_tokens already exists"

# Metric: Input tokens per request (distribution)
cat > /tmp/metric_input_tokens.json << 'METRIC_EOF'
{
  "name": "agent_input_tokens",
  "description": "LLM input (prompt) tokens per agent request",
  "filter": "jsonPayload.message=\"agent_request_complete\"",
  "metricDescriptor": { "metricKind": "DELTA", "valueType": "DISTRIBUTION" },
  "valueExtractor": "EXTRACT(jsonPayload.agent.totalInputTokens)",
  "bucketOptions": { "exponentialBuckets": { "numFiniteBuckets": 12, "growthFactor": 2, "scale": 50 } }
}
METRIC_EOF
gcloud logging metrics create agent_input_tokens --config-from-file=/tmp/metric_input_tokens.json \
  2>/dev/null || echo "  agent_input_tokens already exists"

# Metric: Output tokens per request (distribution)
cat > /tmp/metric_output_tokens.json << 'METRIC_EOF'
{
  "name": "agent_output_tokens",
  "description": "LLM output (completion) tokens per agent request",
  "filter": "jsonPayload.message=\"agent_request_complete\"",
  "metricDescriptor": { "metricKind": "DELTA", "valueType": "DISTRIBUTION" },
  "valueExtractor": "EXTRACT(jsonPayload.agent.totalOutputTokens)",
  "bucketOptions": { "exponentialBuckets": { "numFiniteBuckets": 12, "growthFactor": 2, "scale": 50 } }
}
METRIC_EOF
gcloud logging metrics create agent_output_tokens --config-from-file=/tmp/metric_output_tokens.json \
  2>/dev/null || echo "  agent_output_tokens already exists"

# Metric: Estimated cost per request in USD (distribution)
cat > /tmp/metric_estimated_cost.json << 'METRIC_EOF'
{
  "name": "agent_estimated_cost",
  "description": "Estimated LLM cost in USD per agent request",
  "filter": "jsonPayload.message=\"agent_request_complete\"",
  "metricDescriptor": { "metricKind": "DELTA", "valueType": "DISTRIBUTION" },
  "valueExtractor": "EXTRACT(jsonPayload.agent.estimatedCostUsd)",
  "bucketOptions": { "explicitBuckets": { "bounds": [0, 0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1] } }
}
METRIC_EOF
gcloud logging metrics create agent_estimated_cost --config-from-file=/tmp/metric_estimated_cost.json \
  2>/dev/null || echo "  agent_estimated_cost already exists"

# Metric: Agent requests by model (counter with model label for A/B comparison)
cat > /tmp/metric_request_by_model.json << 'METRIC_EOF'
{
  "name": "agent_request_by_model",
  "description": "Agent request count by LLM model — for model comparison over time",
  "filter": "jsonPayload.message=\"agent_request_complete\"",
  "metricDescriptor": { "metricKind": "DELTA", "valueType": "INT64" },
  "labelExtractors": { "model": "EXTRACT(jsonPayload.agent.model)" }
}
METRIC_EOF
gcloud logging metrics create agent_request_by_model --config-from-file=/tmp/metric_request_by_model.json \
  2>/dev/null || echo "  agent_request_by_model already exists"

rm -f /tmp/metric_*.json

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
