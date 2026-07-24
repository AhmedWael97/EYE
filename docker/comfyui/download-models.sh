#!/usr/bin/env bash
# Run once on the GPU box after `docker compose up -d` to pull the two models
# our workflows use: SDXL-Turbo (fast images, few steps) and SVD-XT (short
# image-to-video clips). Both are gated on Hugging Face — accept the license
# on each model page first, then export a read token:
#   export HF_TOKEN=hf_xxxxxxxxxxxx
set -euo pipefail

if [ -z "${HF_TOKEN:-}" ]; then
  echo "Set HF_TOKEN first (a Hugging Face read token — https://huggingface.co/settings/tokens)."
  exit 1
fi

CKPT_DIR="$(docker volume inspect comfyui_models --format '{{ .Mountpoint }}' 2>/dev/null || echo /var/lib/docker/volumes/comfyui_models/_data)/checkpoints"
mkdir -p "$CKPT_DIR"

echo "Downloading SDXL-Turbo..."
wget --header="Authorization: Bearer $HF_TOKEN" -O "$CKPT_DIR/sd_xl_turbo_1.0_fp16.safetensors" \
  "https://huggingface.co/stabilityai/sdxl-turbo/resolve/main/sd_xl_turbo_1.0_fp16.safetensors"

echo "Downloading SVD-XT (image-to-video)..."
wget --header="Authorization: Bearer $HF_TOKEN" -O "$CKPT_DIR/svd_xt.safetensors" \
  "https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/resolve/main/svd_xt.safetensors"

echo "Done. Restart the container so ComfyUI picks the models up: docker compose restart comfyui"
