param(
    [Parameter(Mandatory=$true)][string]$GameDirectory,
    [Parameter(Mandatory=$true)][string]$AndroidSdk,
    [Parameter(Mandatory=$true)][string]$JavaHome,
    [Parameter(Mandatory=$true)][string]$Gradle,
    [string]$Pnpm = 'pnpm'
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$game = (Resolve-Path -LiteralPath $GameDirectory).Path
foreach ($name in @('game.exe','Ra2.exe','Ra2.lcf','ra2.mix','language.mix','Maps01.mix','Maps02.mix')) {
    if (!(Test-Path -LiteralPath (Join-Path $game $name))) { throw "Missing original installation file: $name" }
}
$assets = Join-Path $repo '.private-apk/installation'
if (Test-Path -LiteralPath $assets) {
    # Preserve earlier input instead of merging stale files into a new APK.
    $backupRoot = Join-Path $repo '.private-apk-backups'
    $backup = Join-Path $backupRoot ([guid]::NewGuid().ToString('N'))
    foreach ($target in @($assets, $backup)) {
        if (![IO.Path]::GetFullPath($target).StartsWith($repo + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Private asset path escaped repository' }
    }
    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
    Move-Item -LiteralPath $assets -Destination $backup
}
New-Item -ItemType Directory -Path $assets -Force | Out-Null
$allowed = @('.exe','.dll','.mix','.mmx','.tlb','.lcf','.dsk','.bmp','.ico','.img','.key','.sed','.sys','.txt','.dat','.map')
$entries = @(Get-ChildItem -LiteralPath $game -File | Where-Object { $allowed -contains $_.Extension.ToLowerInvariant() } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $assets $_.Name)
    @{ name=$_.Name; size=$_.Length }
})
$json = ConvertTo-Json -InputObject $entries -Compress
[IO.File]::WriteAllText((Join-Path $assets 'manifest.json'), $json, [Text.UTF8Encoding]::new($false))
$env:JAVA_HOME = (Resolve-Path -LiteralPath $JavaHome).Path
$env:ANDROID_SDK_ROOT = (Resolve-Path -LiteralPath $AndroidSdk).Path
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
[IO.File]::WriteAllText((Join-Path $repo 'android/local.properties'), "sdk.dir=$($env:ANDROID_SDK_ROOT.Replace('\','/'))`n")
Push-Location $repo
try {
    & $Pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
    & $Pnpm run build
    if ($LASTEXITCODE -ne 0) { throw 'Production web build failed' }
    & $Gradle -p android --no-daemon assembleDebug
    if ($LASTEXITCODE -ne 0) { throw 'Android packaging failed' }
    Write-Output (Join-Path $repo 'android/app/build/outputs/apk/debug/app-debug.apk')
} finally { Pop-Location }
