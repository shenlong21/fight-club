<#
.SYNOPSIS
  Regenerates the LAN testing certificate (lan-dev-cert.pfx/.cer) to cover
  whatever this machine's current LAN IP address actually is, and trusts it
  locally. Run this whenever "play from a second machine" breaks with a
  WebSocket connection failure after nothing else changed - that's almost
  always DHCP having handed out a new IP since the cert was last generated
  (see README.md's "LAN testing" section for the full explanation).

.EXAMPLE
  # From the Server/ directory:
  .\regenerate-lan-cert.ps1

  # From anywhere:
  powershell -File Server\regenerate-lan-cert.ps1
#>

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot

# Every non-loopback, non-link-local IPv4 address on this machine - usually
# just one (Wi-Fi or Ethernet), but a machine with both active gets both
# covered so this doesn't need re-running if you switch networks.
$ips = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -ExpandProperty IPAddress -Unique

if (-not $ips) {
    Write-Warning "No LAN IPv4 address found - are you connected to a network? Falling back to localhost-only."
}

$hostname = $env:COMPUTERNAME
$sanParts = @("DNS=localhost", "DNS=$hostname") + ($ips | ForEach-Object { "IPAddress=$_" }) + "IPAddress=127.0.0.1"
$san = "2.5.29.17={text}" + ($sanParts -join "&")

Write-Output "Generating cert for: localhost, $hostname, $($ips -join ', '), 127.0.0.1"

# Replace any previous fight-club-lan-dev cert in CurrentUser\My so stale
# ones don't accumulate every time this runs.
Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { $_.Subject -eq "CN=fight-club-lan-dev" } |
    Remove-Item -Force -ErrorAction SilentlyContinue

$cert = New-SelfSignedCertificate `
    -Subject "CN=fight-club-lan-dev" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears(2) `
    -KeyAlgorithm ECDSA_nistP256 `
    -KeyUsage DigitalSignature `
    -TextExtension @($san, "2.5.29.37={text}1.3.6.1.5.5.7.3.1")

$pfxPath = Join-Path $scriptDir "lan-dev-cert.pfx"
$cerPath = Join-Path (Split-Path $scriptDir -Parent) "lan-dev-cert.cer"
$pwd = ConvertTo-SecureString -String "devpass123" -Force -AsPlainText

Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pwd | Out-Null
Export-Certificate -Cert $cert -FilePath $cerPath -Force | Out-Null

# Trust it on this machine. Import-Certificate into the Root store needs an
# interactive prompt that isn't available from a script/non-interactive
# shell - the X509Store API doesn't have that restriction for CurrentUser\Root.
$certBytes = [System.IO.File]::ReadAllBytes($cerPath)
$certObj = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($certBytes)
$store = [System.Security.Cryptography.X509Certificates.X509Store]::new("Root", "CurrentUser")
$store.Open("ReadWrite")
$store.Add($certObj)
$store.Close()

Write-Output ""
Write-Output "Done. Thumbprint: $($cert.Thumbprint)"
Write-Output ""
Write-Output "1. Restart the server with this cert:"
Write-Output "     cd Server; dotnet run --Kestrel:CertPath=lan-dev-cert.pfx --Kestrel:CertPassword=devpass123"
Write-Output ""
Write-Output "2. On the OTHER machine, re-copy lan-dev-cert.cer and either re-import it"
Write-Output "   into Trusted Root Certification Authorities, or just visit"
Write-Output "   https://<this-machine-LAN-IP>:5252/ once and click through the warning."
Write-Output "   (The old .cer from a previous run no longer matches - this generated a new one.)"
