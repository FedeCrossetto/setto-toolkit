$cacheBase = Join-Path $env:LOCALAPPDATA "electron-builder\Cache\winCodeSign"
$finalDir  = Join-Path $cacheBase "winCodeSign-2.6.0"

# Remove any previous wrong directory
$wrongDir = Join-Path $cacheBase "winCodeSign"
if (Test-Path $wrongDir) { Remove-Item $wrongDir -Recurse -Force }

# Pick most-recently modified partial extraction as source (random hash dirs)
$source = Get-ChildItem $cacheBase -Directory |
    Where-Object { $_.Name -ne "winCodeSign-2.6.0" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $source) { Write-Error "No source directory found"; exit 1 }
Write-Host "Using source: $($source.FullName)"

# Copy to final location (app-builder checks for this exact path)
if (Test-Path $finalDir) { Remove-Item $finalDir -Recurse -Force }
Copy-Item $source.FullName $finalDir -Recurse -Force
Write-Host "Copied to: $finalDir"

# Create the two missing macOS dylib stubs
$libDir = Join-Path $finalDir "darwin\10.12\lib"
if (-not (Test-Path $libDir)) { New-Item -ItemType Directory -Path $libDir -Force | Out-Null }
$libs = @("libcrypto.dylib", "libssl.dylib")
foreach ($lib in $libs) {
    $p = Join-Path $libDir $lib
    if (-not (Test-Path $p)) { New-Item -ItemType File -Path $p -Force | Out-Null }
}

Write-Host "Done! winCodeSign-2.6.0 ready at: $finalDir"
Get-ChildItem $finalDir | Select-Object Name
