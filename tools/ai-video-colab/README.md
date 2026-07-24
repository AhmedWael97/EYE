# AI talking-avatar test video (free, Google Colab)

First-try pipeline for the "someone at a laptop explaining a marketing tip"
video format: script → voice → avatar → lip-sync → final vertical MP4.
Runs on Colab's free T4 GPU — no cost, no GPU box needed for this test.

## Stack

- **SDXL-Turbo** (via `diffusers`) — generates the avatar portrait.
- **Edge-TTS** — free Microsoft neural voice, no API key.
- **SadTalker** — lip-syncs the portrait to the voice track.
- **ffmpeg** — crops to 9:16, burns in a watermark, muxes the final file.

## Run it

1. Open `generate_test_video.ipynb` in Google Colab (upload it, or File → Open
   notebook → GitHub, paste this repo's URL).
2. Runtime → Change runtime type → **T4 GPU**.
3. Accept the license on https://huggingface.co/stabilityai/sdxl-turbo (once,
   with your HF account), then get a read token from
   https://huggingface.co/settings/tokens.
4. Run cells top to bottom. Cell 2 will prompt for the HF token.
5. Edit `avatar_prompt` (cell 3) and `script_text` (cell 4) for your own
   character/topic before re-running for a real video.

## Known rough edges (first try, not a finished pipeline)

- SadTalker's own install step (`download_models.sh`) can be flaky on a
  fresh Colab runtime if their model-hosting links change — if cell 1 errors,
  paste it back and we patch the install step.
- Captions are just a static watermark right now, not per-word synced
  captions — that's a real follow-up (needs word-level timestamps from the
  TTS step or a forced-aligner) once the base pipeline is proven out.
- One avatar image per run — for brand consistency across videos, save a
  good `avatar.png` you like and skip cell 3 on future runs, reusing that file.
- ~3-6 minutes total per video on a free T4 (mostly the SadTalker step) —
  fine for a few videos/day within Colab's free session limits.

## Once this works and you want it automated

This notebook proves the pipeline manually. The next step (once you have a
dedicated GPU box) is folding SDXL-Turbo generation into the ComfyUI setup
in `docker/comfyui/` and adding SadTalker as a second service there, called
from `ScheduledPostController` the same way image/video generation already
are — no more manually running a notebook each day.
