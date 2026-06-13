# Build the arm64 Tikspot image and export it as a RouterOS-compatible
# docker-archive tar (dist/tikspot-rb5009.tar).
#
# Why this dance: Docker Desktop's containerd image store produces OCI-format
# tars that RouterOS rejects with "could not load next layer". We build an OCI
# archive, then use skopeo (run in a container, so nothing extra to install on
# Windows) to convert it to the legacy docker-archive format RouterOS accepts.
#
# Usage:  pwsh scripts/export-rb5009.ps1
param(
    [string]$Platform = "linux/arm64",
    [string]$OutTar   = "dist/tikspot-rb5009.tar",
    [string]$Tag      = "tikspot:latest"
)
$ErrorActionPreference = "Stop"
$repo = (Resolve-Path "$PSScriptRoot/..").Path
$dist = Join-Path $repo "dist"
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$ociTar = Join-Path $dist "tikspot-oci.tar"

Write-Host "1/3  Building $Platform image as an OCI archive..."
docker buildx build --provenance=false --platform $Platform `
    -o "type=oci,dest=$ociTar" -f docker/Dockerfile $repo
if ($LASTEXITCODE -ne 0) { throw "buildx failed" }

Write-Host "2/3  Converting to a RouterOS-compatible docker-archive via skopeo..."
# skopeo's docker-archive destination won't overwrite an existing tar.
Remove-Item (Join-Path $repo $OutTar) -ErrorAction SilentlyContinue
docker run --rm -v "${dist}:/work" quay.io/skopeo/stable copy `
    --format v2s2 --dest-compress=false `
    "oci-archive:/work/tikspot-oci.tar" `
    "docker-archive:/work/$(Split-Path $OutTar -Leaf):$Tag"
if ($LASTEXITCODE -ne 0) { throw "skopeo convert failed" }

Remove-Item $ociTar -ErrorAction SilentlyContinue
$size = "{0:N0} MB" -f ((Get-Item (Join-Path $repo $OutTar)).Length / 1MB)
Write-Host "3/3  Done -> $OutTar ($size). Transfer this to the router's /appdisk."
