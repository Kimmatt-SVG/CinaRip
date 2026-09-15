# CinaRip Freezer encode worker

Compress titles that are already in `Freezer/` on a **PC or other machine with RAM**. Do **not** run this on the ASUSTOR NAS (1 GB). The NAS CinaRip image does not include ffmpeg and should not be rebuilt with it.

## What this does

The NAS app only **moves** movies/shows into `Videos/Freezer/` (TV keeps `Season NN`). This worker:

1. Scans `Freezer/` for videos that are not compressed yet (sidecar `.cinarip-compress.json`).
2. Keeps a copy of the original under `Freezer/.originals/` (same relative path).
3. Encodes to a temp file next to the source (H.264 + AAC, 720p cap, CRF ~24).
4. Checks duration and streams with ffprobe, then replaces the playback file only if the check passes.
5. Leaves the original untouched if encode/verify fails.

Open **http://localhost:8791** after `docker compose up`. Encoding does **not** start until you click a button.

- **Start Freezer** — begin the pending queue (“Needs to be frozen”).
- **Cool Down** — run the encode pass (those titles move into “Cooling down”).

The worker page always shows mount/NAS connection and live download/upload speeds (idle shows —). Cooling-down items use a real progress bar for download (copy original aside), encode (ffmpeg `-progress`), and upload (write the compressed file back).

## Install Docker

- Windows / Mac: [Docker Desktop](https://docs.docker.com/get-docker/)
- Linux: Docker Engine + Compose plugin

## Mount your Videos folder

The container path `/videos` must be your library root — the same folder CinaRip calls Videos. `Freezer/` is created **inside the container at startup** and probed for write access. Docker needs write access to that folder (NAS share credentials or Docker Desktop file sharing).

The worker talks to NAS CinaRip at **https://cinarip.matthewsuess.com** by default (no Tailscale needed for the web app). On the worker page, **Save / Connect** stores:

- CinaRip URL
- SMB host (`100.95.66.124` on LAN/Tailscale for the owner PC), share (`Public`), Videos path (`Videos`)
- Username and password (masked; saved in the container `/config` volume, never logged)

With credentials saved, the worker mounts `//host/share` onto `/mnt/nas` and uses `/mnt/nas/Videos`. That wins over a local `CINARIP_VIDEOS` bind when the mount succeeds.

Examples:

| Host | `CINARIP_VIDEOS` |
| --- | --- |
| NAS share mapped as `T:\Videos` | `T:\Videos` |
| SMB/Tailscale mount | `/mnt/nas/Videos` |
| Local copy of the library | `D:\CinaRip\Videos` |

The worker will look for `/videos/Freezer`.

## Run

Unzip this folder, then from this directory:

**Windows PowerShell**

```powershell
$env:CINARIP_VIDEOS="T:\Videos"
docker compose up --build
```

**Linux / macOS**

```bash
export CINARIP_VIDEOS=/mnt/nas/Videos
docker compose up --build
```

NAS HTTP is already set to https://cinarip.matthewsuess.com. Override only if CinaRip is somewhere else:

```powershell
$env:NAS_ORIGIN="https://cinarip.matthewsuess.com"
```

Then open http://localhost:8791 — **Start Freezer**, then **Cool Down** if you want the encode pass explicit. Both buttons start work; Cool Down is the encode-in-progress action.

Stop with Ctrl+C or `docker compose down`.

## Markers

- Sidecar: `Movie.mp4.cinarip-compress.json` (`pending` / `encoding` / `done` / `failed`)
- Original: `Freezer/.originals/...` mirroring the path under `Freezer/`
- Already-`done` files are not re-encoded
- Restore/discard original is done in the NAS CinaRip **Freezer** page, not here
