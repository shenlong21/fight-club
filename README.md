npm run dev -- --host# Fight Club

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
extra step**, covered below.

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
