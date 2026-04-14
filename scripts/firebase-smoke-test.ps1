$health = Invoke-WebRequest -Uri "http://127.0.0.1:5001/demo-pluto/asia-south1/health" -UseBasicParsing
Write-Host "HEALTH_STATUS=$($health.StatusCode)"
Write-Host "HEALTH_BODY=$($health.Content)"

try {
  Invoke-WebRequest `
    -Uri "http://127.0.0.1:5001/demo-pluto/asia-south1/razorpayWebhook" `
    -Method Post `
    -ContentType "application/json" `
    -Body "{}" `
    -UseBasicParsing | Out-Null
  Write-Host "WEBHOOK_STATUS=200"
} catch {
  if ($_.Exception.Response) {
    Write-Host "WEBHOOK_STATUS=$($_.Exception.Response.StatusCode.value__)"
  } else {
    throw
  }
}
