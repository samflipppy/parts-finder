#
# Creates Cloud Monitoring log-based metrics and a custom dashboard
# for the PartsFinder Repair Intelligence Agent.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Project ID set: gcloud config set project YOUR_PROJECT_ID
#
# Usage:
#   .\monitoring\setup-metrics.ps1
#

$ErrorActionPreference = "Stop"

$PROJECT_ID = (gcloud config get-value project 2>$null).Trim()
if (-not $PROJECT_ID) {
    Write-Error "No project set. Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
}

Write-Host "Setting up PartsFinder monitoring for project: $PROJECT_ID"

# ---------------------------------------------------------------------------
# 1. Log-based metrics
# ---------------------------------------------------------------------------

Write-Host "Creating log-based metrics..."

# Metric: Agent request latency (distribution — fixed with proper valueExtractor)
try { gcloud logging metrics delete agent_request_latency --quiet 2>$null } catch {}
$metricRequestLatency = @'
{
  "name": "agent_request_latency",
  "description": "Agent request total latency in ms (distribution)",
  "filter": "jsonPayload.message=\"agent_request_complete\"",
  "metricDescriptor": { "metricKind": "DELTA", "valueType": "DISTRIBUTION" },
  "valueExtractor": "EXTRACT(jsonPayload.agent.totalLatencyMs)",
  "bucketOptions": { "exponentialBuckets": { "numFiniteBuckets": 14, "growthFactor": 2, "scale": 100 } }
}
'@
$tmpFile = [System.IO.Path]::GetTempFileName()
$metricRequestLatency | Out-File -FilePath $tmpFile -Encoding utf8
try {
    gcloud logging metrics create agent_request_latency --config-from-file=$tmpFile 2>$null
} catch { Write-Host "  agent_request_latency already exists" }
Remove-Item $tmpFile -ErrorAction SilentlyContinue

# Metric: Agent request count (counter by confidence level)
$metricRequestCount = @'
{
  "name": "agent_request_count",
  "description": "Count of agent requests by confidence level",
  "filter": "jsonPayload.message=\"agent_request_complete\"",
  "metricDescriptor": {
    "metricKind": "DELTA",
    "valueType": "INT64",
    "labels": [
      { "key": "confidence", "description": "Confidence level (high/medium/low)", "valueType": "STRING" }
    ]
  },
  "labelExtractors": { "confidence": "EXTRACT(jsonPayload.agent.confidence)" }
}
'@
$tmpFile = [System.IO.Path]::GetTempFileName()
$metricRequestCount | Out-File -FilePath $tmpFile -Encoding utf8
try {
    gcloud logging metrics create agent_request_count --config-from-file=$tmpFile 2>$null
} catch { Write-Host "  agent_request_count already exists" }
Remove-Item $tmpFile -ErrorAction SilentlyContinue

# Metric: User feedback rating (distribution — extracts the actual star value)
$metricFeedbackRating = @'
{
  "name": "user_feedback_rating",
  "description": "User feedback star ratings distribution (1-5)",
  "filter": "jsonPayload.message=\"user_feedback\"",
  "metricDescriptor": { "metricKind": "DELTA", "valueType": "DISTRIBUTION" },
  "valueExtractor": "EXTRACT(jsonPayload.feedback.rating)",
  "bucketOptions": { "linearBuckets": { "numFiniteBuckets": 5, "width": 1, "offset": 0.5 } }
}
'@
$tmpFile = [System.IO.Path]::GetTempFileName()
$metricFeedbackRating | Out-File -FilePath $tmpFile -Encoding utf8
try {
    gcloud logging metrics create user_feedback_rating --config-from-file=$tmpFile 2>$null
} catch { Write-Host "  user_feedback_rating already exists" }
Remove-Item $tmpFile -ErrorAction SilentlyContinue

# Metric: User feedback count (counter by rating)
$metricFeedbackCount = @'
{
  "name": "user_feedback_count",
  "description": "Count of user feedback submissions by rating",
  "filter": "jsonPayload.message=\"user_feedback\"",
  "metricDescriptor": {
    "metricKind": "DELTA",
    "valueType": "INT64",
    "labels": [
      { "key": "rating", "description": "Star rating (1-5)", "valueType": "STRING" }
    ]
  },
  "labelExtractors": { "rating": "EXTRACT(jsonPayload.feedback.rating)" }
}
'@
$tmpFile = [System.IO.Path]::GetTempFileName()
$metricFeedbackCount | Out-File -FilePath $tmpFile -Encoding utf8
try {
    gcloud logging metrics create user_feedback_count --config-from-file=$tmpFile 2>$null
} catch { Write-Host "  user_feedback_count already exists" }
Remove-Item $tmpFile -ErrorAction SilentlyContinue

# Metric: Error count (from Cloud Functions)
try {
    gcloud logging metrics create agent_error_count `
        --description="Count of agent errors" `
        --log-filter='resource.type="cloud_function" severity>=ERROR' 2>$null
} catch { Write-Host "  agent_error_count already exists" }

# Metric: Total tokens per request (distribution)
$metricTotalTokens = @'
{
  "name": "agent_total_tokens",
  "description": "Total LLM tokens (input+output) per agent request",
  "filter": "jsonPayload.message=\"agent_request_complete\"",
  "metricDescriptor": { "metricKind": "DELTA", "valueType": "DISTRIBUTION" },
  "valueExtractor": "EXTRACT(jsonPayload.agent.totalTokens)",
  "bucketOptions": { "exponentialBuckets": { "numFiniteBuckets": 12, "growthFactor": 2, "scale": 50 } }
}
'@
$tmpFile = [System.IO.Path]::GetTempFileName()
$metricTotalTokens | Out-File -FilePath $tmpFile -Encoding utf8
try {
    gcloud logging metrics create agent_total_tokens --config-from-file=$tmpFile 2>$null
} catch { Write-Host "  agent_total_tokens already exists" }
Remove-Item $tmpFile -ErrorAction SilentlyContinue

# Metric: Input tokens per request (distribution)
$metricInputTokens = @'
{
  "name": "agent_input_tokens",
  "description": "LLM input (prompt) tokens per agent request",
  "filter": "jsonPayload.message=\"agent_request_complete\"",
  "metricDescriptor": { "metricKind": "DELTA", "valueType": "DISTRIBUTION" },
  "valueExtractor": "EXTRACT(jsonPayload.agent.totalInputTokens)",
  "bucketOptions": { "exponentialBuckets": { "numFiniteBuckets": 12, "growthFactor": 2, "scale": 50 } }
}
'@
$tmpFile = [System.IO.Path]::GetTempFileName()
$metricInputTokens | Out-File -FilePath $tmpFile -Encoding utf8
try {
    gcloud logging metrics create agent_input_tokens --config-from-file=$tmpFile 2>$null
} catch { Write-Host "  agent_input_tokens already exists" }
Remove-Item $tmpFile -ErrorAction SilentlyContinue

# Metric: Output tokens per request (distribution)
$metricOutputTokens = @'
{
  "name": "agent_output_tokens",
  "description": "LLM output (completion) tokens per agent request",
  "filter": "jsonPayload.message=\"agent_request_complete\"",
  "metricDescriptor": { "metricKind": "DELTA", "valueType": "DISTRIBUTION" },
  "valueExtractor": "EXTRACT(jsonPayload.agent.totalOutputTokens)",
  "bucketOptions": { "exponentialBuckets": { "numFiniteBuckets": 12, "growthFactor": 2, "scale": 50 } }
}
'@
$tmpFile = [System.IO.Path]::GetTempFileName()
$metricOutputTokens | Out-File -FilePath $tmpFile -Encoding utf8
try {
    gcloud logging metrics create agent_output_tokens --config-from-file=$tmpFile 2>$null
} catch { Write-Host "  agent_output_tokens already exists" }
Remove-Item $tmpFile -ErrorAction SilentlyContinue

# Metric: Estimated cost per request in USD (distribution)
$metricEstimatedCost = @'
{
  "name": "agent_estimated_cost",
  "description": "Estimated LLM cost in USD per agent request",
  "filter": "jsonPayload.message=\"agent_request_complete\"",
  "metricDescriptor": { "metricKind": "DELTA", "valueType": "DISTRIBUTION" },
  "valueExtractor": "EXTRACT(jsonPayload.agent.estimatedCostUsd)",
  "bucketOptions": { "explicitBuckets": { "bounds": [0, 0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1] } }
}
'@
$tmpFile = [System.IO.Path]::GetTempFileName()
$metricEstimatedCost | Out-File -FilePath $tmpFile -Encoding utf8
try {
    gcloud logging metrics create agent_estimated_cost --config-from-file=$tmpFile 2>$null
} catch { Write-Host "  agent_estimated_cost already exists" }
Remove-Item $tmpFile -ErrorAction SilentlyContinue

# Metric: Agent requests by model (counter with model label for A/B comparison)
$metricRequestByModel = @'
{
  "name": "agent_request_by_model",
  "description": "Agent request count by LLM model - for model comparison over time",
  "filter": "jsonPayload.message=\"agent_request_complete\"",
  "metricDescriptor": {
    "metricKind": "DELTA",
    "valueType": "INT64",
    "labels": [
      { "key": "model", "description": "LLM model identifier", "valueType": "STRING" }
    ]
  },
  "labelExtractors": { "model": "EXTRACT(jsonPayload.agent.model)" }
}
'@
$tmpFile = [System.IO.Path]::GetTempFileName()
$metricRequestByModel | Out-File -FilePath $tmpFile -Encoding utf8
try {
    gcloud logging metrics create agent_request_by_model --config-from-file=$tmpFile 2>$null
} catch { Write-Host "  agent_request_by_model already exists" }
Remove-Item $tmpFile -ErrorAction SilentlyContinue

# Metric: End-to-end agent latency (distribution for percentile charts)
$metricTotalLatency = @'
{
  "name": "agent_total_latency",
  "description": "End-to-end agent request latency in ms (distribution)",
  "filter": "jsonPayload.message=\"agent_request_complete\"",
  "metricDescriptor": { "metricKind": "DELTA", "valueType": "DISTRIBUTION" },
  "valueExtractor": "EXTRACT(jsonPayload.agent.totalLatencyMs)",
  "bucketOptions": { "exponentialBuckets": { "numFiniteBuckets": 14, "growthFactor": 2, "scale": 100 } }
}
'@
$tmpFile = [System.IO.Path]::GetTempFileName()
$metricTotalLatency | Out-File -FilePath $tmpFile -Encoding utf8
try {
    gcloud logging metrics create agent_total_latency --config-from-file=$tmpFile 2>$null
} catch { Write-Host "  agent_total_latency already exists" }
Remove-Item $tmpFile -ErrorAction SilentlyContinue

# Metric: Part found rate (counter with partFound label — true/false)
$metricPartFound = @'
{
  "name": "agent_part_found",
  "description": "Agent request count by part-found status (true/false)",
  "filter": "jsonPayload.message=\"agent_request_complete\"",
  "metricDescriptor": {
    "metricKind": "DELTA",
    "valueType": "INT64",
    "labels": [
      { "key": "part_found", "description": "Whether a part was found (true/false)", "valueType": "STRING" }
    ]
  },
  "labelExtractors": { "part_found": "EXTRACT(jsonPayload.agent.partFound)" }
}
'@
$tmpFile = [System.IO.Path]::GetTempFileName()
$metricPartFound | Out-File -FilePath $tmpFile -Encoding utf8
try {
    gcloud logging metrics create agent_part_found --config-from-file=$tmpFile 2>$null
} catch { Write-Host "  agent_part_found already exists" }
Remove-Item $tmpFile -ErrorAction SilentlyContinue

# Metric: Per-tool latency (distribution from agent_tool_call logs)
$metricToolLatency = @'
{
  "name": "agent_tool_latency",
  "description": "Individual tool call latency in ms",
  "filter": "jsonPayload.message=\"agent_tool_call\"",
  "metricDescriptor": {
    "metricKind": "DELTA",
    "valueType": "DISTRIBUTION",
    "labels": [
      { "key": "tool_name", "description": "Tool name (searchParts, getSuppliers, etc.)", "valueType": "STRING" }
    ]
  },
  "valueExtractor": "EXTRACT(jsonPayload.tool.latencyMs)",
  "labelExtractors": { "tool_name": "EXTRACT(jsonPayload.tool.name)" },
  "bucketOptions": { "exponentialBuckets": { "numFiniteBuckets": 12, "growthFactor": 2, "scale": 10 } }
}
'@
$tmpFile = [System.IO.Path]::GetTempFileName()
$metricToolLatency | Out-File -FilePath $tmpFile -Encoding utf8
try {
    gcloud logging metrics create agent_tool_latency --config-from-file=$tmpFile 2>$null
} catch { Write-Host "  agent_tool_latency already exists" }
Remove-Item $tmpFile -ErrorAction SilentlyContinue

# Metric: Per-tool usage count (counter by tool name)
$metricToolUsage = @'
{
  "name": "agent_tool_usage",
  "description": "Count of individual tool calls by tool name",
  "filter": "jsonPayload.message=\"agent_tool_call\"",
  "metricDescriptor": {
    "metricKind": "DELTA",
    "valueType": "INT64",
    "labels": [
      { "key": "tool_name", "description": "Tool name (searchParts, getSuppliers, etc.)", "valueType": "STRING" }
    ]
  },
  "labelExtractors": { "tool_name": "EXTRACT(jsonPayload.tool.name)" }
}
'@
$tmpFile = [System.IO.Path]::GetTempFileName()
$metricToolUsage | Out-File -FilePath $tmpFile -Encoding utf8
try {
    gcloud logging metrics create agent_tool_usage --config-from-file=$tmpFile 2>$null
} catch { Write-Host "  agent_tool_usage already exists" }
Remove-Item $tmpFile -ErrorAction SilentlyContinue

Write-Host "Log-based metrics created."

# ---------------------------------------------------------------------------
# 2. Dashboard
# ---------------------------------------------------------------------------

Write-Host "Creating Cloud Monitoring dashboard..."

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dashboardJson = (Get-Content -Path (Join-Path $scriptDir "dashboard.json") -Raw) -replace '\$\{PROJECT_ID\}', $PROJECT_ID

# Check if dashboard exists
try {
    $existing = gcloud monitoring dashboards list --format="value(name)" --filter="displayName='PartsFinder Agent Health'" 2>&1 |
        Where-Object { $_ -is [string] -or $_ -notmatch 'WARNING' }
    if ($existing) { $existing = ($existing | Out-String).Trim() }
    if (-not $existing) { $existing = $null }
} catch {
    $existing = $null
}

if ($existing) {
    Write-Host "  Dashboard already exists. Updating..."
    $dashboardName = ($existing -split "`n")[0].Trim()
    $tmpDash = [System.IO.Path]::GetTempFileName()
    $dashboardJson | Out-File -FilePath $tmpDash -Encoding utf8
    gcloud monitoring dashboards update $dashboardName --config-from-file=$tmpDash
    Remove-Item $tmpDash -ErrorAction SilentlyContinue
} else {
    $tmpDash = [System.IO.Path]::GetTempFileName()
    $dashboardJson | Out-File -FilePath $tmpDash -Encoding utf8
    gcloud monitoring dashboards create --config-from-file=$tmpDash
    Remove-Item $tmpDash -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Done! Dashboard available at:"
Write-Host "  https://console.cloud.google.com/monitoring/dashboards?project=$PROJECT_ID"
Write-Host ""
Write-Host "To view logs:"
Write-Host "  https://console.cloud.google.com/logs/query;query=jsonPayload.message%3D%22agent_request_complete%22%20OR%20jsonPayload.message%3D%22user_feedback%22?project=$PROJECT_ID"
