# Offline pairing with six-character codes

Run the hub on one computer on the same hotspot or Wi-Fi as the teacher and learner. The teacher app can still run on a different computer, phone or tablet. The hub stores only temporary connection packets in memory, never assessment scores or learner records.

1. With Node.js installed and this repository downloaded, run `npm run offline:hub` in the repository folder. Keep its terminal open.
2. Enter the local address printed by the hub in **Offline hub setup** on both apps. Select **Use hub**. Allow local network access if the browser asks. A scanned hub QR fills the learner's hub address automatically.
3. Enter the learner's assessment code as usual. The learner scans the teacher QR or enters the separate six-character teacher connection code. The teacher then scans or enters the learner response code.

Codes expire after 15 minutes. Keep the teacher assessment page open while connecting: reloading it replaces its live invitation, so an old learner response cannot be reused. Create a new teacher invitation if needed.

The app must be opened online once to cache its offline files. After that, the hub and peer connection work without internet. Keep all three devices on the same network; guest Wi-Fi and hotspots that isolate connected devices cannot carry a direct peer connection.

Chrome and Edge 142+ support HTTP local hub access after granting local network permission. Other browsers may require an HTTPS hub with a certificate trusted by each device. To run HTTPS, set `CRL_PAIRING_HUB_CERT` and `CRL_PAIRING_HUB_KEY` to your local certificate and key files. The certificate must cover the hostname or IP used by the devices. Do not disable browser security settings.

The default hub port is 8787 (`CRL_PAIRING_HUB_PORT` overrides it). If Windows Firewall asks, allow the hub on your trusted private network. Do not forward the hub port to the internet. Codes are temporary bearer credentials; use a trusted classroom network. Additional app origins can be configured with the comma-separated `CRL_PAIRING_HUB_ORIGINS` environment variable.

Without a running hub, the app retains self-contained offline QR pairing. Six-character camera-free codes require the hub because the short code is a reference to the full connection packet.
