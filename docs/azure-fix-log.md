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
- The remaining blocker was the deployed application package and several runtime mismatches.

### 2026-06-01 Deployment Repair Sequence

#### Workflow and Packaging Fixes

- Pushed repo changes to `main` to repair GitHub Actions deployment behavior.
- Removed the npm cache requirement that depended on a missing lockfile.
- Switched deployment packaging from a fragile standalone-only bundle to a source artifact that App Service can build during deployment.
- Enabled `SCM_DO_BUILD_DURING_DEPLOYMENT=true` in App Service.
- Set App Service startup command to:
  - `npx prisma migrate deploy && npm start`

#### Runtime and App Fixes

- Fixed auth route redirects to use the configured public `APP_URL` instead of the internal App Service request host.
- This corrected redirects that were previously pointing users to `https://localhost:8080/...`.
- Added a build step script to copy PDFKit runtime assets into:
  - `.next/server/chunks/data`
- This fixed the runtime error:
  - `ENOENT: no such file or directory, open '/home/site/wwwroot/.next/server/chunks/data/Helvetica.afm'`

#### Database and Storage Fixes

- Confirmed the production app initially failed registration because database tables did not exist.
- Startup was updated to run:
  - `prisma migrate deploy`
- Granted App Service managed identity the correct storage role:
  - `Storage Blob Data Contributor`

### Final Validation

- Verified fresh deployment records appeared in Azure after each push.
- Verified the health endpoint returned:
  - `{"status":"ok","service":"bank-document-evidence-system",...}`
- Verified the public login page loaded successfully.
- Verified customer registration succeeded in the live deployed app.
- Verified a live deposit succeeded and returned a saved transaction response:
  - transaction type: `DEPOSIT`
  - amount: `25.5`
  - balanceBefore: `0`
  - balanceAfter: `25.5`
  - reference: `DEP-03636595-PILCIA`

### Final State

- Web App is live and responding.
- PostgreSQL-backed registration works.
- Deposit flow works end to end from Azure App Service.
- Blob-backed evidence generation path no longer crashes on PDF asset lookup.
