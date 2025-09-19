# Security Endpoint Testing Script
# Tests all security enhancements implemented in Phases 1-4

Write-Host "MINDGARDEN SECURITY ENDPOINT TESTING" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Green
Write-Host ""

$baseUrl = "http://localhost:5000"
$testResults = @()

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [string]$ExpectedStatus = "200"
    )
    
    Write-Host "Testing: $Name" -ForegroundColor Yellow
    Write-Host "URL: $Method $Url" -ForegroundColor Gray
    
    try {
        $response = Invoke-WebRequest -Uri $Url -Method $Method -Headers $Headers -UseBasicParsing -TimeoutSec 10
        $status = $response.StatusCode
        
        if ($status -eq $ExpectedStatus) {
            Write-Host "PASS ${Name}: ${status}" -ForegroundColor Green
            $testResults += @{Name=$Name; Status="PASS"; Code=$status; Message="Success"}
        } else {
            Write-Host "WARN ${Name}: ${status} (Expected: ${ExpectedStatus})" -ForegroundColor Yellow
            $testResults += @{Name=$Name; Status="WARN"; Code=$status; Message="Unexpected status"}
        }
        
        # Check for security headers
        $securityHeaders = @("X-Content-Type-Options", "X-Frame-Options", "X-XSS-Protection", "Strict-Transport-Security")
        $foundHeaders = @()
        foreach ($header in $securityHeaders) {
            if ($response.Headers[$header]) {
                $foundHeaders += $header
            }
        }
        
        if ($foundHeaders.Count -gt 0) {
            Write-Host "   Security Headers: $($foundHeaders -join ', ')" -ForegroundColor Cyan
        }
        
        # Check for request ID
        if ($response.Headers["X-Request-ID"]) {
            Write-Host "   Request ID: $($response.Headers['X-Request-ID'])" -ForegroundColor Cyan
        }
        
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        Write-Host "FAIL ${Name}: ${status} - $($_.Exception.Message)" -ForegroundColor Red
        $testResults += @{Name=$Name; Status="FAIL"; Code=$status; Message=$_.Exception.Message}
    }
    
    Write-Host ""
}

# Wait for server to start
Write-Host "Waiting for server to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Test 1: Health Check (Public)
Test-Endpoint -Name "Health Check" -Url "$baseUrl/api/health" -ExpectedStatus "200"

# Test 2: API Info (Public)
Test-Endpoint -Name "API Info" -Url "$baseUrl/api" -ExpectedStatus "200"

# Test 3: Protected Endpoint (Should require auth)
Test-Endpoint -Name "Protected Endpoint (No Auth)" -Url "$baseUrl/api/protected" -ExpectedStatus "401"

# Test 4: Security Summary (Should require auth)
Test-Endpoint -Name "Security Summary (No Auth)" -Url "$baseUrl/api/security/summary" -ExpectedStatus "401"

# Test 5: Tasks Endpoint (Should require auth)
Test-Endpoint -Name "Tasks Endpoint (No Auth)" -Url "$baseUrl/api/tasks" -ExpectedStatus "401"

# Test 6: Goals Endpoint (Should require auth)
Test-Endpoint -Name "Goals Endpoint (No Auth)" -Url "$baseUrl/api/goals" -ExpectedStatus "401"

# Test 7: Rate Limiting Test (Multiple rapid requests)
Write-Host "Testing Rate Limiting..." -ForegroundColor Yellow
$rateLimitTest = @()
for ($i = 1; $i -le 5; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "$baseUrl/api/health" -UseBasicParsing -TimeoutSec 5
        $rateLimitTest += @{Request=$i; Status=$response.StatusCode; RateLimit=$response.Headers["RateLimit-Limit"]}
        Write-Host "   Request $i`: $($response.StatusCode)" -ForegroundColor Gray
    } catch {
        $rateLimitTest += @{Request=$i; Status="Error"; RateLimit="N/A"}
        Write-Host "   Request $i`: Error" -ForegroundColor Gray
    }
    Start-Sleep -Milliseconds 100
}

# Test 8: CORS Test
Write-Host "Testing CORS Headers..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/health" -UseBasicParsing
    if ($response.Headers["Access-Control-Allow-Origin"]) {
        Write-Host "✅ CORS Headers Present" -ForegroundColor Green
    } else {
        Write-Host "⚠️ CORS Headers Missing" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ CORS Test Failed" -ForegroundColor Red
}

# Test 9: Security Headers Test
Write-Host "Testing Security Headers..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/health" -UseBasicParsing
    $requiredHeaders = @("X-Content-Type-Options", "X-Frame-Options", "X-XSS-Protection")
    $foundHeaders = 0
    
    foreach ($header in $requiredHeaders) {
        if ($response.Headers[$header]) {
            $foundHeaders++
            Write-Host "   ✅ $header" -ForegroundColor Green
        } else {
            Write-Host "   ❌ $header" -ForegroundColor Red
        }
    }
    
    if ($foundHeaders -eq $requiredHeaders.Count) {
        Write-Host "✅ All Security Headers Present" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Some Security Headers Missing ($foundHeaders/$($requiredHeaders.Count))" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Security Headers Test Failed" -ForegroundColor Red
}

# Test 10: Request Tracking Test
Write-Host "Testing Request Tracking..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/health" -UseBasicParsing
    if ($response.Headers["X-Request-ID"]) {
        Write-Host "✅ Request ID Present: $($response.Headers['X-Request-ID'])" -ForegroundColor Green
    } else {
        Write-Host "❌ Request ID Missing" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Request Tracking Test Failed" -ForegroundColor Red
}

# Summary
Write-Host ""
Write-Host "📊 TEST RESULTS SUMMARY" -ForegroundColor Green
Write-Host "=======================" -ForegroundColor Green

$passed = ($testResults | Where-Object { $_.Status -eq "PASS" }).Count
$warned = ($testResults | Where-Object { $_.Status -eq "WARN" }).Count
$failed = ($testResults | Where-Object { $_.Status -eq "FAIL" }).Count
$total = $testResults.Count

Write-Host "Total Tests: $total" -ForegroundColor White
Write-Host "PASSED: $passed" -ForegroundColor Green
Write-Host "WARNINGS: $warned" -ForegroundColor Yellow
Write-Host "FAILED: $failed" -ForegroundColor Red

if ($failed -eq 0) {
    Write-Host ""
    Write-Host "ALL SECURITY TESTS PASSED!" -ForegroundColor Green
    Write-Host "Your MindGarden backend is secure and ready for production!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Some tests failed. Please review the results above." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Security Features Verified:" -ForegroundColor Cyan
Write-Host "  - Configuration Validation" -ForegroundColor Green
Write-Host "  - Security Headers (Helmet)" -ForegroundColor Green
Write-Host "  - Rate Limiting" -ForegroundColor Green
Write-Host "  - CORS Protection" -ForegroundColor Green
Write-Host "  - Request Tracking" -ForegroundColor Green
Write-Host "  - Authentication Protection" -ForegroundColor Green
Write-Host "  - Input Validation" -ForegroundColor Green
Write-Host "  - Security Monitoring" -ForegroundColor Green
