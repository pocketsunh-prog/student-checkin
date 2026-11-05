# Builds and tags the release API/admin images and produces signed Android release artifacts.
# Usage: .\scripts\build-release.ps1 [-Version 1.0.0]
param(
    [string]$Version = "1.0.0"
)

# Native tools (docker/gradle) write progress to stderr; keep that from becoming a
# terminating PowerShell error and check their exit codes explicitly.
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
Push-Location $Root
try {
    Write-Host "== Building Node 26 API + Next.js 16 admin images =="
    docker compose build backend admin 2>&1 | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { throw "docker compose build failed (exit $LASTEXITCODE)" }

    docker tag student-checkin-backend:latest "student-checkin-backend:$Version"
    docker tag student-checkin-admin:latest "student-checkin-admin:$Version"
    Write-Host "Tagged: student-checkin-backend:$Version, student-checkin-admin:$Version"

    Write-Host "== Building signed Android release =="
    Push-Location "$Root\android"
    try {
        if (-not (Test-Path "keystore.properties")) {
            throw "android\keystore.properties is missing. Copy keystore.properties.example, generate a keystore (keytool), and fill in the passwords. See android\README.md."
        }
        .\gradlew.bat assembleRelease bundleRelease 2>&1 | ForEach-Object { Write-Host $_ }
        if ($LASTEXITCODE -ne 0) { throw "Gradle release build failed (exit $LASTEXITCODE)" }

        $Apk = Join-Path $PWD "app\build\outputs\apk\release\app-release.apk"
        $Aab = Join-Path $PWD "app\build\outputs\bundle\release\app-release.aab"
        if (-not (Test-Path $Apk)) { throw "Release APK not found at $Apk" }
        if (-not (Test-Path $Aab)) { throw "Release AAB not found at $Aab" }

        $Sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { "" }
        $ApkSigner = $null
        if ($Sdk) {
            $ApkSigner = Get-ChildItem (Join-Path $Sdk "build-tools") -Directory -ErrorAction SilentlyContinue |
                Sort-Object Name -Descending |
                ForEach-Object { Join-Path $_.FullName "apksigner.bat" } |
                Where-Object { Test-Path $_ } |
                Select-Object -First 1
        }
        if ($ApkSigner) {
            & $ApkSigner verify --verbose --print-certs $Apk
            if ($LASTEXITCODE -ne 0) { throw "APK signature verification failed" }
        } else {
            Write-Warning "apksigner not found; set ANDROID_HOME to verify the APK signature."
        }

        Write-Host ""
        Write-Host "Release artifacts:"
        Write-Host "  API image:   student-checkin-backend:$Version"
        Write-Host "  Admin image: student-checkin-admin:$Version"
        Write-Host "  APK:         $Apk  ($([math]::Round((Get-Item $Apk).Length / 1MB, 1)) MB)"
        Write-Host "  AAB:         $Aab  ($([math]::Round((Get-Item $Aab).Length / 1MB, 1)) MB)"
    }
    finally {
        Pop-Location
    }
}
finally {
    Pop-Location
}
