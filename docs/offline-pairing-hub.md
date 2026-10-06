# CRL Offline Mode: connecting the two devices

**Offline mode needs no setup at all.** The teacher selects BoSY, MoSY or EoSY and then **Offline Mode** (the assessment code page has the same button). Their screen shows a pairing QR. The learner taps **Offline Mode** and **Scan teacher QR**, then their device shows a reply code and the teacher taps **Scan learner response**. Assessment messages then travel directly between the two devices. Both codes can be opened full screen to make them easier to scan, and neither device needs the internet, the hub, or any certificate.

**If neither device has a camera**, open **No camera? Connect with codes** under the QR. It holds the same code the QR carries, as text: copy it from one device and paste it into the other, then bring the reply code back the same way. Nothing has to be installed on the network for this, and the pasted code goes through exactly the same reader a scan does.

The hub described below is an **optional** one-time school setup. It only changes how the two devices find each other: with it, a learner types the six-character assessment code and the connection is made automatically, which saves scanning in a large class. Everything works without it. A hub installed before the compact pairing code existed keeps working; it is offered the older packet form, and updating it simply lets it carry the shorter one.

## Optional: the offline hub

Install one hub on an always-on Windows, macOS or Linux computer on the classroom Wi-Fi or hotspot. Teachers and learners can use different computers, Android phones/tablets, iPhone/iPad or HarmonyOS devices with a browser supporting WebRTC data channels and the trusted local HTTPS connection. A phone or tablet does not run the background hub. A mobile-only classroom needs a separate hub computer or compatible managed appliance, or simply uses scanning.

The hub runs when its computer signs in. Keep that computer awake and connected. The connection name is `https://crl-offline.local:8787`. Only one hub should advertise this name on each network. Guest Wi-Fi or hotspots with client isolation must be configured by the administrator to allow communication between classroom devices.

## Install once on the hub computer

1. Download `CRL-Offline-Setup.zip` from the deployed app at `/offline-hub/CRL-Offline-Setup.zip` (or produce it from a checkout with `npm run offline:package`). Extract the entire ZIP to a folder.
2. Install Node.js 24 LTS from <https://nodejs.org/en/download> if not already installed.
3. Windows: double-click **Install-Windows.cmd**. macOS: open **Install-macOS.command** (or run `sh Install-macOS.command` in Terminal). Linux: run `sh Install-Linux.sh` in a graphical login with systemd user services.
4. Follow the setup addresses printed by the installer. Installation happens in the signed-in user's account. Windows uses Task Scheduler, macOS a LaunchAgent, and Linux a systemd user service. School policy may require the administrator to complete installation. There are no daily terminal commands.
5. Permit TCP 8787 (HTTPS pairing), TCP 8788 (initial device setup) and UDP 5353 (mDNS discovery) on the trusted private network only. Do not expose these ports to the internet.

The installation stores its own Node executable and hub files in `.crl-offline-hub` inside the installing user's profile. It does not install the repository, Prisma or the cloud database on that computer. The setup package includes only the hub's runtime dependencies. Reinstalling preserves the existing certificate authority and configuration. Update the setup package and reinstall when the administrator updates the hub or its Node runtime.

## Prepare every teacher and learner device once

1. Open the `http://<hub IP>:8788/setup` address printed by the installer. This HTTP page is only for initial setup; assessment pairing uses HTTPS.
2. Have the school administrator verify the hub's certificate against `certificates/CRL-Offline-Root.crt` on the hub computer, then install it as trusted on each classroom device. Do not trust an unknown certificate. The installer never silently changes a device's trusted certificates.
3. iPhone/iPad: after installing the certificate profile, enable its trust in **Settings → General → About → Certificate Trust Settings**. School MDM can deploy it instead. Android/HarmonyOS: use the device's security settings to install a CA certificate; menus and browser support vary. Windows/macOS/Linux: use the administrator's approved certificate store for the chosen browser.
4. Select **Check secure connection** on the setup page. It must open successfully without a certificate warning. Allow local network access when the browser asks.
5. Open and prepare the teacher and learner apps online once so the current app files, teacher login, class roster and assessment content are available offline. Then test a complete offline assessment on the actual school devices.

Pairing codes are much shorter than the session description they carry, and a device that is still running an app cached before this version cannot read a code a newer device shows. Prepare **both** devices online on the same day, so they run the same version, before going offline.

Once prepared, the apps find `crl-offline.local` automatically and keep using the address they already found. A network that blocks that local name must be configured by the administrator to allow it; QR and text-code pairing never need the hub, so a blocked local name costs only the typed six-character shortcut. The certificate also covers private IPv4 addresses of the hub; it is renewed when addresses change. Never disable browser security checks to connect.

## Platforms and practical limits

- Windows, macOS and Linux are supported hub hosts. User-level autostart requires a signed-in host account; it is not a service before login. Linux needs systemd user services.
- Android, iOS/iPadOS and HarmonyOS are browser clients, including tablets. Trusted HTTPS avoids relying on Chrome-only HTTP exceptions. Their browser must support WebRTC data channels, local DNS and the installed certificate. Some managed browsers restrict these features.
- HarmonyOS NEXT and other devices without a compatible browser cannot be promised support without testing their browser. A universal native mobile background service is not included.
- The browser cannot start a stopped hub on another device. **Offline Mode** finds the already-running service. If the hub is unavailable, self-contained QR pairing and the copyable text code remain available; six-character manual connection codes require the hub.

## Administration

The hub stores temporary pairing packets in memory and never stores assessment scores or learner records. Each code is six characters and differs from its assessment code. Codes expire after 15 minutes, and the apps refresh pending references automatically. Once connected, code expiry or hub shutdown does not stop the peer link. Reloading the teacher page replaces its live peer invitation; reconnect with the new invitation.

The certificate authority key remains private in the hub user's profile. Only the public root certificate is downloadable from the setup page. Certificates are renewed locally without internet. Treat pairing codes as temporary bearer credentials and use a trusted classroom network.

To remove autostart, run `node scripts/offline-hub/install.cjs --uninstall` from the extracted setup folder. This removes the hub's startup entry and stops that managed service; it preserves configuration and certificates. Previously installed device certificates must be removed through the administrator's device-management process if the hub is retired.

Existing technical setups using `npm run offline:hub` still work as the legacy HTTP/QR option. That command is not needed for the installed HTTPS background hub.
