# Trust Proxy Security Configuration

## Overview

The trust proxy configuration has been updated to provide enhanced security by only trusting specific Railway ingress IP addresses instead of blindly trusting all proxies.

## Changes Made

### 1. CIDR Validation Utility (`src/utils/cidrValidator.js`)
- Created a comprehensive utility for IP address and CIDR validation
- Supports parsing comma-separated CIDR strings
- Validates IP addresses against CIDR ranges
- Handles edge cases and provides proper error handling

### 2. Secure Trust Proxy Configuration (`src/server.js`)
- Replaced `app.set('trust proxy', 1)` with a secure callback function
- Only trusts the first hop (immediate upstream) proxy
- Validates incoming IP addresses against configured CIDR ranges
- Provides secure defaults when no CIDR is configured

### 3. Environment Configuration
- Added `RAILWAY_INGRESS_CIDR` environment variable to all example files
- Documented the requirement for production environments
- Provided examples and clear instructions

## Configuration

### Environment Variable
```bash
RAILWAY_INGRESS_CIDR=10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
```

### Behavior
- **With CIDR configured**: Only trusts proxies whose IP addresses fall within the specified CIDR ranges
- **Without CIDR configured**: Trusts no proxies (secure default)
- **Invalid CIDR format**: Logs warning and trusts no proxies

## Security Benefits

1. **Prevents IP Spoofing**: Only trusted ingress proxies can set forwarded headers
2. **Reduces Attack Surface**: Eliminates trust in unknown or malicious proxies
3. **Audit Trail**: Logs trust decisions when debug logging is enabled
4. **Fail-Safe Default**: No trust when configuration is missing or invalid

## Production Requirements

**CRITICAL**: The `RAILWAY_INGRESS_CIDR` environment variable MUST be configured in production with the correct Railway ingress IP ranges. Contact Railway support for current ingress IP addresses.

## Debugging

Enable debug logging to see trust proxy decisions:
```bash
DEBUG_LOGS=true
```

This will log each IP address check and whether it was trusted or rejected.

## Migration Notes

- The previous configuration `app.set('trust proxy', 1)` trusted all proxies
- The new configuration is more restrictive and secure
- Ensure proper CIDR configuration before deploying to production
- Test rate limiting functionality after deployment to ensure it works correctly
