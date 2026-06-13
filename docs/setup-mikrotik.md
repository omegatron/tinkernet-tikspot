# Running Tikspot on a MikroTik router

This guide covers getting the Tikspot container onto a RouterOS device and pointed at your hotspot. Most of these steps can be done **for you** by the in-app setup wizard (Phase 4); this document is the manual reference and explains what the wizard does under the hood.

> **Draft** — expands as the build progresses. Phase 0 covers only loading and starting the container.

## 1. Requirements

- **RouterOS v7.4 or later** with the **`container`** package installed (`/system/package/print` should list `container`).
- A device whose CPU supports containers: **arm64** (hAP ax2/ax3, RB5009), **x86/CHR**, or **arm32v5** (older hAP ac2 — needs external storage). MIPS-based devices are not supported.
- **Storage for the image + data.** Devices with only 16 MB flash (e.g. hAP ac2) must use an external USB/NVMe disk. Devices with NAND (ax2/ax3, RB5009) can host the image internally; you still want a mounted volume for `/data`.
- Container mode enabled: `/system/device-mode/update container=yes` (this requires a physical confirmation — press the reset button or power-cycle when prompted).

## 2. Get the image onto the router

Two options:

**A. Import a pre-built tarball** (works on low-flash devices, no registry pull):

```
# On your workstation:
docker buildx build --load --platform linux/arm64 -t tikspot:latest -f docker/Dockerfile .
docker save tikspot:latest -o tikspot-arm64.tar
# Upload tikspot-arm64.tar to the router (WinBox Files, or scp/ftp), then:
/container/add file=tikspot-arm64.tar interface=veth-tikspot root-dir=usb1/tikspot/root \
    mounts=tikspot-data envlist=tikspot
```

**B. Pull from a registry** (needs RAM headroom; the image decompresses in memory):

```
/container/config/set registry-url=https://registry-1.docker.io tmpdir=usb1/tmp
/container/add remote-image=YOURREPO/tikspot:latest interface=veth-tikspot ...
```

## 3. Networking (veth + bridge)

```
/interface/veth/add name=veth-tikspot address=172.18.0.2/24 gateway=172.18.0.1
/interface/bridge/add name=br-containers
/interface/bridge/port/add bridge=br-containers interface=veth-tikspot
/ip/address/add address=172.18.0.1/24 interface=br-containers
```

The container is reachable from the router at `172.18.0.2`. Hotspot clients reach the
captive portal through the **walled-garden** (configured in step 5 / by the wizard).

## 4. Persistent storage

```
/container/mounts/add name=tikspot-data src=usb1/tikspot/data dst=/data
```

Everything stateful (the SQLite DB, branding assets, saved page designs, TLS cert,
secrets, logs) lives under `/data`, so it survives container rebuilds and upgrades.

## 5. Start it and verify

```
/container/start [find where root-dir~"tikspot"]
# Give it a few seconds, then from the router:
/tool/fetch url="http://172.18.0.2/healthz" output=user
```

You should see `{"status":"ok","service":"tikspot",...}`.

## 6. Point the hotspot at Tikspot

**Easiest: use the setup wizard.** Open `http://<container-ip>/admin` — on first run it
walks you through setting an admin password and (optionally) connecting your MikroTik.
On the **Router setup** step, enter the router's IP + API credentials, the container IP,
the hotspot server-name and the RADIUS secret, then click **Auto-configure**. Over the
RouterOS REST API it will: add the RADIUS client pointing at the container, set each
hotspot profile to `use-radius` + `login-by=mac-cookie,http-chap,http-pap,mac`, add the
DNS static entry for the server-name, and walled-garden the container. **Test
connection** and **Verify** are there too. You can re-run any of this later from the
Router setup tab.

**API user permissions.** Create a *dedicated* RouterOS user for Tikspot in group `full`
for the setup, e.g. `/user add name=tikspot group=full password=...`. Once Auto-configure
succeeds and **Verify** is green, downgrade it to read-only so the container can't change
the router during normal operation: `/user set [find name=tikspot] group=read`. Tikspot
only needs read access afterwards (health, Verify, active-user list); re-running setup or
pushing hotspot files needs `full` again temporarily.

**No-write option.** If you'd rather never give the container write access, use the
**Manual setup script** button on the Router setup tab — it generates the exact idempotent
RouterOS commands (the Auto-configure equivalent), which you paste into the router terminal
yourself. Keep the API user read-only the whole time.

If you'd rather do it by hand, the same steps are:

1. Add the container as a RADIUS server (`/radius add address=172.18.0.2 secret=... service=hotspot`).
2. Set the hotspot profile to use RADIUS and the right login methods
   (`/ip/hotspot/profile set ... use-radius=yes login-by=mac-cookie,http-chap,http-pap`).
3. Name the hotspot server so its redirect points at the container, and add a
   DNS static entry + walled-garden entry so unauthenticated clients can reach it.
4. Download the redirect-shim zip from the admin portal and upload it to the
   router's hotspot directory.

Full details for steps 6.1–6.4 land with Phases 1–4.

## 7. Testing the RADIUS layer (Phase 1)

The container's FreeRADIUS is wired up and seeded with a **Free** plan and a shared
`free` credential out of the box. You can verify it without a router.

From inside the container (`docker exec ... sh` or the router's container shell):

```sh
# Free login → Access-Accept with the plan's MikroTik limits
radtest free free 127.0.0.1 0 testing123
```

Expect `Mikrotik-Rate-Limit = "5M/5M"`, `Mikrotik-Total-Limit = 209715200`
(200 MiB) and `Session-Timeout = 3600`. These come from the `plans` table, projected
into RADIUS by the app — edit the plan and the limits change here too.

To point a **real MikroTik** at the container's RADIUS (manual, pre-wizard):

```
/radius add address=<container-ip> secret=<shared-secret> service=hotspot \
    authentication-port=1812 accounting-port=1813 timeout=3s
/ip/hotspot/profile set <profile> use-radius=yes \
    login-by=mac-cookie,http-chap,http-pap radius-accounting=yes
```

> The container currently trusts the stock `localhost`/`testing123` client for
> testing. Adding your router as a RADIUS client with its own shared secret (so
> real NAS requests are accepted) is handled by the setup wizard in Phase 4; until
> then it can be added manually to the container's `nas` table / `clients.conf`.

## 8. The portal page & the shim files (Phase 2)

Tikspot hosts the **real login page** itself (so you can edit it live and use real
images). The MikroTik only holds small **redirect-shim** files that hand the hotspot
session to the container.

1. **Design the page.** Open the admin editor at `http://<container-ip>/admin`, drag
   on Hotspot blocks (Free login / Voucher / Account / Logo), edit their text via the
   settings panel, and click **Save & publish**. Preview at
   `http://<container-ip>/login`.

2. **Make the container reachable as the hotspot's server name.** The shim redirects
   to `//$(server-name)/login`, so `server-name` must resolve to the container and be
   allowed through the walled-garden:

   ```
   /ip/dns/static/add name=<server-name-host> address=<container-ip>
   /ip/hotspot/walled-garden/ip/add action=accept dst-host=<server-name-host>
   /ip/hotspot/walled-garden/ip/add action=accept dst-address=<container-ip>
   ```

   Name the hotspot server (or its DNS name) so `$(server-name)` is
   `<server-name-host>` (optionally `host|Label` — the shim uses the part before `|`).

3. **Download & upload the shim files.** In the editor, **Download hotspot files**
   (`/api/hotspot/shim.zip`), then upload the extracted files into the router's
   hotspot directory (WinBox Files drag-and-drop, FTP, or `/tool fetch`).

How it flows: client → router serves `login.html` shim → shim POSTs the session
context (mac, ip, `link-login`, `chap-id`, …) to `//<server-name>/login` → the
container renders your page → the user's login form POSTs back to the router's
`$(link-login)` to authenticate (PAP by default; HTTP-CHAP optional).

> Auto-configuring the DNS static + walled-garden + server name over the RouterOS
> API is the job of the Phase 4 setup wizard; the steps above are the manual path.
