# veo-mcp-server

MCP server for Google Gemini Veo video generation API.

## Features

- **Text-to-video**: Generate videos from text prompts
- **Image-to-video**: Animate images with motion
- **Multiple models**: Support for Veo 2, Veo 3, and Veo 3.1 variants
- **Async operations**: Poll for completion or wait with timeout

## Installation

```bash
npm install
npm run build
```

## Configuration

Set your Gemini API key:

```bash
export GEMINI_API_KEY="your-api-key"
```

### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "veo": {
      "command": "node",
      "args": ["/path/to/veo-mcp-server/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `veo_generate_video` | Generate video from text prompt |
| `veo_generate_video_from_image` | Generate video using an image as first frame |
| `veo_get_operation_status` | Check status of a generation operation |
| `veo_wait_for_video` | Poll until video completes (with timeout) |
| `veo_download_video` | Download completed video to local file |
| `veo_list_models` | List available Veo models |

## Models

| Model | ID | Features |
|-------|-----|----------|
| Veo 3.1 | `veo-3.1-generate-preview` | Text/image-to-video, extension, interpolation, reference images, audio, 720p/1080p |
| Veo 3.1 Fast | `veo-3.1-fast-generate-preview` | Same as Veo 3.1, speed optimized |
| Veo 3 | `veo-3.0-generate-001` | Text/image-to-video, audio, 720p/1080p |
| Veo 3 Fast | `veo-3.0-fast-generate-001` | Same as Veo 3, speed optimized |
| Veo 2 | `veo-2.0-generate-001` | Text/image-to-video, no audio, 720p only |

## Parameters

### Duration
- Veo 3/3.1: 4, 6, or 8 seconds
- Veo 2: 5, 6, or 8 seconds

### Resolution
- Veo 3.1: 720p (default), 1080p (requires 8s duration)
- Veo 3: 720p (default), 1080p (requires 16:9 aspect ratio)
- Veo 2: Not configurable (720p)

### Aspect Ratio
- All models: 16:9 (landscape) or 9:16 (portrait)

### Person Generation
- Text-to-video (Veo 3/3.1): `allow_all` only
- Image-to-video (Veo 3/3.1): `allow_adult` only
- Veo 2: `allow_all`, `allow_adult`, `dont_allow`

## Usage Example

```
Generate a 4-second video of a cat wearing a superhero cape flying through clouds
```

The server will return an operation name. Use `veo_wait_for_video` to poll until completion and get the video URL.

## Notes

- Video generation takes 11 seconds to 6 minutes
- Generated videos are stored for 2 days
- Output is MP4 at 24fps with SynthID watermark
- Veo 3+ models include natively generated audio

## License

MIT
