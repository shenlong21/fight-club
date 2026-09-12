# Fight Club

A web-based, 3D fighting game (Bloody Roar 2 style) built on a deterministic,
rollback-friendly combat simulation shared between a .NET server and a
Babylon.js/TypeScript client. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the
full design (client simulation strategy, determinism rules, network protocol).

## Project layout

| Path | What it is |
| :--- | :--- |
| `CombatCore/` | Headless, deterministic C# simulation library. Single source of truth for combat rules. |
| `CombatCore.Harness/` | Console test suite for `CombatCore`; also exports the golden replays under `shared/golden-replays/`. |
| `Server/` | ASP.NET Core server. WebTransport (HTTP/3) primary transport, WebSocket fallback. |
| `Client/` | Babylon.js + TypeScript (Vite) client, including a golden-replay-verified TypeScript port of the sim (`Client/src/sim/`). |
| `shared/` | Cross-language contract (`golden-replays/*.json`) between `CombatCore.Harness` and `Client/src/parity.test.ts`. |

## Getting started

```
# Simulation tests + golden replay export
cd CombatCore.Harness && dotnet run

# TypeScript port type-check + parity test against the golden replays above
cd Client && npm install && npx tsc --noEmit && npm run test:parity

# Server
cd Server && dotnet run

# Client dev server
cd Client && npm run dev
```

Running the server with no extra configuration binds a plain HTTPS endpoint
using the standard ASP.NET Core dev certificate - enough for the WebSocket
fallback path and for browsing the site over HTTPS. **WebTransport needs one
extra step**, covered below - and **testing from another machine on your
network needs a different one**, covered in "LAN testing" further down.

By default Vite's dev server only binds `localhost`, so another machine on
your network can't reach it even once the game server itself is reachable.
Run it with `--host` to bind all interfaces:

```
cd Client && npm run dev -- --host
```

## Local HTTPS / HTTP-3 / WebTransport certificate setup

WebTransport has no plaintext mode - it requires TLS 1.3 over QUIC (HTTP/3).
There are two certificate needs, and they are **not the same certificate**:

1. A normal, CA-style trusted cert for plain HTTPS/WebSocket traffic and for
   browsing `https://localhost:5252/` directly. The standard ASP.NET Core dev
   certificate covers this.
2. A cert usable with WebTransport's `serverCertificateHashes` pinning
   mechanism, which browsers and browser-accurate clients hold to a stricter
   spec requirement: **validity of no more than ~2 weeks, and an ECDSA
   P-256 key** (not RSA). A normal 1-year `dotnet dev-certs` certificate is
   correctly trusted by the OS but will be **rejected** by a WebTransport
   client pinning it by hash (fails the TLS handshake with a generic
   `CertificateUnknown` alert) - this is the client enforcing the spec's
   short-validity rule for self-signed certs, not a bug in the server.

### 1. Trust the standard dev certificate (needed for everything)

```bash
dotnet dev-certs https --trust
```

Run this once. `Server/Program.cs` calls `UseHttps()` with no arguments by
default, which picks this certificate up automatically - the same thing the
default ASP.NET Core "https" launch profile does. This is sufficient for the
WebSocket fallback (`/match`) and for hitting the server directly from a
browser.

### 2. Generate a short-lived cert for WebTransport testing

Only needed if you're driving the `/wt-match` WebTransport endpoint directly
(e.g. with a non-browser WebTransport client that pins the cert by hash,
rather than going through a trusted CA). From an elevated or normal PowerShell
prompt:

```powershell
$cert = New-SelfSignedCertificate `
  -DnsName "localhost" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -NotAfter (Get-Date).AddDays(13) `
  -KeyAlgorithm ECDSA_nistP256 `
  -KeyUsage DigitalSignature `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.1")   # Server Authentication EKU

$pwd = ConvertTo-SecureString -String "devpass123" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "Server/wt-dev-cert.pfx" -Password $pwd | Out-Null

# Save the DER bytes too - a WebTransport client needs the SHA-256 hash of these
# for serverCertificateHashes pinning.
[System.IO.File]::WriteAllBytes("wt-dev-cert.der", $cert.GetRawCertData())
```

`*.pfx` and `*.der` are git-ignored - never commit certificate material, even
throwaway local dev certs.

Point the server at it via configuration (it falls back to the standard dev
cert if these aren't set):

```
cd Server
dotnet run --Kestrel:CertPath=wt-dev-cert.pfx --Kestrel:CertPassword=devpass123
```

### 3. Computing the pinned hash for a WebTransport client

A WebTransport client (browser `new WebTransport(url, { serverCertificateHashes })`
or a library like `@fails-components/webtransport`) needs the SHA-256 hash of
the certificate's DER encoding:

```powershell
$hash = [System.Security.Cryptography.SHA256]::HashData((Get-Content -Raw -Encoding Byte wt-dev-cert.der))
```

or in Node, from the `.der` file exported above:

```js
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const hash = createHash("sha256").update(readFileSync("./wt-dev-cert.der")).digest();
// pass as: { algorithm: "sha-256", value: hash }
```

### Verifying it actually works

- **HTTP/3 is negotiating** (not silently falling back to HTTP/1.1): request
  `https://localhost:5252/` with a client that forces HTTP/3
  (`HttpRequestMessage.VersionPolicy = HttpVersionPolicy.RequestVersionExact`,
  `Version = HttpVersion.Version30`) - it should succeed rather than throw.
- **WebTransport sessions work end-to-end**: connect two WebTransport clients
  to `wss://localhost:5252/wt-match` (pinning the short-lived cert's hash from
  step 3), send a few input frames, and confirm both receive `MatchState`
  broadcasts (`NetCodec.WireSize` = 57 bytes each) at ~60Hz once
  `MatchLobby` pairs them.

## LAN testing (playing from a second machine)

> **IP changed since last time?** If this was already working and now gives a
> `WebSocket connection to '...' failed` in the browser console with nothing
> else different, your router almost certainly handed this machine a new
> DHCP IP and the LAN cert (below) still only lists the old one. Fast path:
>
> ```ps1
> powershell -File Server\regenerate-lan-cert.ps1
> ```
>
> Then restart the server with the command it prints, and (if you'd imported
> the old `.cer` on the other machine rather than using the click-through
> workaround) re-copy and re-import the regenerated `lan-dev-cert.cer` there
> too - the old one no longer matches. Whole thing takes under a minute; the
> rest of this section is the manual/first-time version of what that script
> automates, useful if you want to understand what it's doing or need to do
> it on macOS/Linux (the script is Windows/PowerShell-only).

Three separate things have to be true for a second machine on your network to
connect, and it's easy to fix only one and still see a failure:

1. **The server has to listen on your network interface, not just loopback.**
   `Server/Program.cs` binds with `ListenAnyIP`, so this is already handled -
   just confirm you don't see "Now listening on: https://localhost:5252"
   (loopback-only); it should say `https://[::]:5252` or similar.
2. **The client has to connect to the host's address, not "localhost."**
   `Client/src/main.ts` builds the server URL from `window.location.hostname`
   automatically, so as long as the other machine loads the page via your
   machine's actual IP/hostname (e.g. `http://192.168.1.2:5173`, not
   `http://localhost:5173`), this is already handled too.
3. **The other machine's browser has to trust the server's certificate for
   that address.** This is the one that needs manual setup, covered below -
   the standard `dotnet dev-certs` certificate is issued for `localhost` only,
   so it fails TLS validation for a LAN IP even after (1) and (2) are fixed.
   A failure here shows up as a generic `WebSocket connection to '...' failed`
   in the browser console, with no other detail.

### Generate a certificate that covers your LAN IP/hostname

```powershell
$san = "2.5.29.17={text}DNS=localhost&DNS=<YOUR-HOSTNAME>&IPAddress=<YOUR-LAN-IP>&IPAddress=127.0.0.1"

$cert = New-SelfSignedCertificate `
  -Subject "CN=fight-club-lan-dev" `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -NotAfter (Get-Date).AddYears(2) `
  -KeyAlgorithm ECDSA_nistP256 `
  -KeyUsage DigitalSignature `
  -TextExtension @($san, "2.5.29.37={text}1.3.6.1.5.5.7.3.1")

$pwd = ConvertTo-SecureString -String "devpass123" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "Server/lan-dev-cert.pfx" -Password $pwd | Out-Null
Export-Certificate -Cert $cert -FilePath "lan-dev-cert.cer" | Out-Null
```

Find your LAN IP with `Get-NetIPAddress -AddressFamily IPv4` (look for your
Wi-Fi/Ethernet adapter, not `127.0.0.1`/`169.254.*`) and your hostname with
`$env:COMPUTERNAME`. Unlike the WebTransport cert above, there's no
short-validity/ECDSA-only constraint here (that's specific to
`serverCertificateHashes` pinning) - this is a normal, long-lived cert, it
just needs the right names in it. `*.pfx` and `*.cer` are git-ignored -
never commit certificate material.

Run the server with it:

```
cd Server
dotnet run --Kestrel:CertPath=lan-dev-cert.pfx --Kestrel:CertPassword=devpass123
```

### Trust it - on both machines

**On this machine** (so you can also browse via your own LAN IP):

```powershell
$certBytes = [System.IO.File]::ReadAllBytes("lan-dev-cert.cer")
$cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($certBytes)
$store = [System.Security.Cryptography.X509Certificates.X509Store]::new("Root", "CurrentUser")
$store.Open("ReadWrite")
$store.Add($cert)
$store.Close()
```

(`Import-Certificate` into the Root store can fail with "UI is not allowed in
this operation" from a non-interactive shell - the `X509Store` API above
doesn't have that restriction for `CurrentUser\Root`.)

**On the other machine**: copy `lan-dev-cert.cer` over (it's the public
certificate only, no private key - safe to send) and import it into
**Trusted Root Certification Authorities**:

- Windows: double-click the `.cer` → **Install Certificate** → **Local
  Machine** (or Current User) → "Place all certificates in the following
  store" → **Trusted Root Certification Authorities**.
- macOS: open the `.cer` in **Keychain Access**, add to the **System**
  keychain, then double-click it → **Trust** → "Always Trust".
- Linux (Chrome/Chromium via NSS): `certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n fight-club-lan-dev -i lan-dev-cert.cer`

After that, `https://<your-lan-ip>:5252/` should load cleanly in that
machine's browser with no warning, and the game page's WebSocket connection
to the same address will succeed for the same reason.

If you'd rather not distribute a certificate at all, the fallback is: on the
other machine, visit `https://<your-lan-ip>:5252/` directly first and click
through the browser's security warning ("Advanced" → "Proceed anyway"). That
creates a per-browser exception good enough for testing, but it has to be
redone if the certificate or IP changes, and some browsers don't offer the
click-through option at all.
