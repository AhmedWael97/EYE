# ComfyUI GPU box — EYE social-post image/video generation

Self-hosted alternative to the per-user OpenAI key for the social composer
(`dashboard/social` → Compose & Schedule): SDXL-Turbo images, SVD short
video clips. Runs on its own GPU droplet — **not** the main app server,
which has no GPU.

## What's here

- `Dockerfile` — CUDA + ComfyUI (cloned from Comfy-Org/ComfyUI at build time).
- `docker-compose.yml` — standalone compose for the GPU box (named volumes
  for `models`/`output`/`input`, GPU reservation via the nvidia driver).
- `download-models.sh` — pulls SDXL-Turbo + SVD-XT (gated on Hugging Face,
  needs `HF_TOKEN`).
- `workflows/txt2img_sdxl_turbo.json` — reference copy of the txt2img graph.
  **Solid** — standard, well-documented ComfyUI pattern.
- `workflows/img2vid_svd.json` — reference copy of the img2vid graph.
  **Best-effort** — written from ComfyUI's known official SVD example, but
  not tested against a live instance. Before relying on it: open ComfyUI's
  web UI on the box (`http://<box-ip>:8188`), load/rebuild this graph
  visually, run it once by hand, then re-export via the UI's "Save (API
  Format)" and compare against this file — fix node names/inputs that don't
  match your actual ComfyUI version's node set.

The backend's real, running copies of these workflows are inlined in
`backend/app/Services/ComfyUiService.php` (`txt2imgWorkflow()` /
`img2vidWorkflow()`) so the app doesn't depend on this folder's path at
runtime — if you fix the video workflow in the UI, port the fix into that
PHP method too, not just this JSON file.

## First-time setup on the GPU droplet

```bash
# on the GPU box
git clone <this repo> eye && cd eye/docker/comfyui
docker compose up -d --build

# nvidia-container-toolkit (if the base image didn't already include it —
# DigitalOcean's "AI/ML Ready" image usually does):
#   https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html

export HF_TOKEN=hf_xxxxxxxxxxxx   # https://huggingface.co/settings/tokens
                                   # accept the license on both model pages first:
                                   #   stabilityai/sdxl-turbo
                                   #   stabilityai/stable-video-diffusion-img2vid-xt
./download-models.sh
docker compose restart comfyui
```

Sanity check: `curl http://localhost:8188/system_stats` should return JSON
(confirms ComfyUI is up and can see the GPU).

## Wiring it into EYE

On the **main app server**, add to `backend/.env`:

```
COMFYUI_HOST=http://<gpu-box-ip>:8188
```

Then a normal targeted backend deploy (rebuild php-fpm, migrate). Once
`COMFYUI_HOST` is set, `ScheduledPostController::generateImage()` uses it
automatically (no per-user OpenAI key needed) and `generate-video` becomes
available. Leave `COMFYUI_HOST` unset and everything falls back to the
existing per-user-OpenAI-key path unchanged.

**Security note**: port 8188 has no auth by default — restrict it to the
main app server's IP only (`ufw allow from <app-server-ip> to any port 8188`),
don't expose it publicly.
