# EYE's self-hosted image/video generation backend (SDXL images, SVD short
# video clips) for the social-manager composer — runs on a separate GPU box,
# NOT the main app server (which has no GPU). See docker/comfyui/README.md.
FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv git wget ffmpeg libgl1 \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/Comfy-Org/ComfyUI.git /app/ComfyUI
WORKDIR /app/ComfyUI

RUN pip3 install --no-cache-dir -r requirements.txt \
    && pip3 install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cu121

EXPOSE 8188
CMD ["python3", "main.py", "--listen", "0.0.0.0", "--port", "8188"]
