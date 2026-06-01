# Azure Fix Log

This file tracks live Azure investigation and remediation work performed against the deployed Bank Document & Transaction Evidence Storage System environment.

## How This Log Is Used

- Every Azure inspection or change should be recorded here.
- Each entry should describe:
  - what was checked
  - what issue was found
  - what change was made
  - what validation was performed

## Session Log

### 2026-06-01 Initial Azure Inspection

- Authenticated subscription confirmed:
  - Subscription: `Azure subscription 1`
  - Subscription ID: `e1f5b4be-e0ba-4ccb-8708-a949458fcd83`
- Discovered core resources in `bank-rg`:
  - Web App: `bankapp56`
  - PostgreSQL Flexible Server: `bank-postgres`
  - Storage Account: `bankstorage56`

### Findings

- The Web App was running as Linux App Service with `NODE|22-lts`.
- The Web App startup command was blank.
- The site returned `503 Service Unavailable`.
- App settings contained several production mismatches:
  - `APP_URL` was missing `https://`
  - `APP_ENVIRONMENT` was set to `development`
  - `APP_SERVICE_INSTANCE` was set to `local-dev`
- The Web App managed identity did not have the correct Blob data role.
  - Existing role: `Storage Actions Blob Data Operator`
  - Missing required role: `Storage Blob Data Contributor`
- PostgreSQL Flexible Server is private-access only and attached to the same VNet topology as the Web App integration path, which is the intended pattern.
- The active deployment shown by ARM was an older `OneDeploy` package from `2026-06-01T07:21:51Z`.

### Changes Applied

- Set the App Service startup command to:
  - `node server.js`
- Updated App Service app settings:
  - `APP_ENVIRONMENT=production`
  - `APP_SERVICE_INSTANCE=bankapp56-prod`
  - `APP_URL=https://bankapp56-c0euc4amg2f2b3e6.centralindia-01.azurewebsites.net`
  - `SESSION_SECRET` rotated to a long random value
- Granted the Web App managed identity the required storage role:
  - `Storage Blob Data Contributor` on storage account `bankstorage56`
- Restarted the Web App after configuration updates.

### Validation

- Verified the updated app settings were present in App Service configuration.
- Verified the new `Storage Blob Data Contributor` role assignment exists.
- The application still returned `503`, indicating the deployed package itself is still unhealthy or outdated.

### Current Conclusion

- Azure configuration issues were real and have been corrected.
- The remaining blocker is the deployed application package.
- Repository-side deployment fixes were prepared locally:
  - Next.js standalone output enabled
  - GitHub Actions workflow updated to build and deploy the standalone artifact
- These repo changes still need to be pushed so Azure receives the corrected runtime package.
