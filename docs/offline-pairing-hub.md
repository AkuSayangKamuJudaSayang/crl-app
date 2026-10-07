# CRL Offline Mode: connecting the two devices

**Conduct Assessment selects its mode automatically.** Internet reachability is checked when BoSY, MoSY or EoSY is selected. Online assessments keep their usual assessment QR and six-character assessment code. There is no Online/Offline chooser. A learner record created offline must finish syncing before starting an online assessment; it remains available for assessment while offline.

**Prepare the device connection before starting offline.** In Conduct Assessment, open **Offline settings** inside **Enrolled Learners**. On the learner device, open **Connection Settings** and scan the teacher QR. The learner shows a response QR; the teacher scans that response in the roster settings. Assessment messages then travel directly between the devices, without a hub or cloud signalling. QR codes can be opened full screen. Both devices must have the current app prepared online once, and must be on a network that allows direct communication between them.

**If neither device has a camera**, open **No camera? Connect with codes** under the QR. It holds the same code the QR carries, as text: copy it from one device and paste it into the other, then bring the reply code back the same way. Nothing has to be installed on the network for this, and the pasted code goes through exactly the same reader a scan does.

**One pairing covers a whole sitting.** After the roster settings show the connected learner device, select the learner and BoSY, MoSY or EoSY. The existing connection is handed over to a fresh assessment code only after the learner device confirms the move. Offline assessments open over the teacher dashboard, keeping that connection alive. Complete and save the result, return to Enrolled Learners, and select the next learner. No new scan or text exchange is required while the connection remains open. Each run has its own learner, code, content and results; packets and late status replies from an earlier run cannot update the next run. The link ends when either app reloads or closes, or the devices lose contact; reconnect in Offline settings in that case. A missing cached assessment screen displays a recovery message without navigating away from the dashboard.

The current pairing screens use self-contained QR and compressed text codes only. They do not discover, publish to or ask for a hub. The six-character assessment code identifies an assessment; it cannot carry the device connection by itself. The legacy hub tools below are retained for existing administrator installations and older clients, and are not part of the current Conduct Assessment flow.

## Legacy hub administration

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

Older hub-enabled clients find `crl-offline.local` automatically and keep using the address they already found. Current clients use QR or compressed text instead. The certificate also covers private IPv4 addresses of the hub; it is renewed when addresses change. Never disable browser security checks to connect.

## Platforms and practical limits

- Windows, macOS and Linux are supported hub hosts. User-level autostart requires a signed-in host account; it is not a service before login. Linux needs systemd user services.
- Android, iOS/iPadOS and HarmonyOS are browser clients, including tablets. Trusted HTTPS avoids relying on Chrome-only HTTP exceptions. Their browser must support WebRTC data channels, local DNS and the installed certificate. Some managed browsers restrict these features.
- HarmonyOS NEXT and other devices without a compatible browser cannot be promised support without testing their browser. A universal native mobile background service is not included.
- The browser cannot start a stopped hub on another device. Legacy hub-enabled clients discover an already-running service. Current clients do not need that service; they use self-contained QR pairing or its compressed text code.

## Administration

The hub stores temporary pairing packets in memory and never stores assessment scores or learner records. Each code is six characters and differs from its assessment code. Codes expire after 15 minutes, and the apps refresh pending references automatically. Once connected, code expiry or hub shutdown does not stop the peer link. Reloading the teacher page replaces its live peer invitation; reconnect with the new invitation.

The certificate authority key remains private in the hub user's profile. Only the public root certificate is downloadable from the setup page. Certificates are renewed locally without internet. Treat pairing codes as temporary bearer credentials and use a trusted classroom network.

To remove autostart, run `node scripts/offline-hub/install.cjs --uninstall` from the extracted setup folder. This removes the hub's startup entry and stops that managed service; it preserves configuration and certificates. Previously installed device certificates must be removed through the administrator's device-management process if the hub is retired.

Existing technical setups using `npm run offline:hub` still work as the legacy HTTP/QR option. That command is not needed for the installed HTTPS background hub.
