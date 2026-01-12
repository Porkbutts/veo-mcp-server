# Veo MCP Server

An MCP (Model Context Protocol) server for Google's Veo video generation API. This server allows AI assistants to generate videos from text prompts or images using Google's Veo models.

## Features

- **Text-to-Video Generation**: Create videos from descriptive text prompts
- **Image-to-Video Generation**: Animate still images with motion
- **Multiple Models**: Support for Veo 2, Veo 3, and Veo 3.1 variants
- **Async Operations**: Poll for completion or wait with configurable timeout
- **Native Audio**: Veo 3+ models include AI-generated audio

## Prerequisites

- Node.js 18 or higher
- A Google AI API key (get one at https://aistudio.google.com/apikey)

## Installation

```bash
npm install
npm run build
```

## Configuration

Set your Gemini API key as an environment variable:

```bash
export GEMINI_API_KEY="your-api-key-here"
```

## Usage with Claude Code

```bash
claude mcp add-json veo '{
  "command": "node",
  "args": ["/path/to/veo-mcp-server/dist/index.js"],
  "env": {
    "GEMINI_API_KEY": "your-api-key-here"
  }
}'
```

## Available Tools

### `veo_generate_video`

Generate a video from a text prompt.

**Parameters:**
- `prompt` (required): Text description of the video to generate
- `model` (optional): Veo model to use (default: `veo-3.0-generate-001`)
- `aspect_ratio` (optional): `16:9` (landscape) or `9:16` (portrait)
- `duration_seconds` (optional): 4, 6, or 8 seconds (Veo 3/3.1) or 5, 6, or 8 (Veo 2)
- `resolution` (optional): `720p` or `1080p` (Veo 3/3.1 only)
- `negative_prompt` (optional): Elements to exclude from the video

**Example:**
```
Generate a video of a cat wearing a superhero cape flying through clouds
```

### `veo_generate_video_from_image`

Generate a video using an image as the first frame.

**Parameters:**
- `prompt` (required): Description of the motion/action to apply
- `image_base64` (required): Base64-encoded image data
- `image_mime_type` (optional): MIME type of input image (default: `image/png`)
- `model`, `aspect_ratio`, `duration_seconds`, `resolution`: Same as `veo_generate_video`

**Example:**
```
Animate this landscape photo with gently flowing water and clouds drifting across the sky
```

### `veo_get_operation_status`

Check the status of a video generation operation.

**Parameters:**
- `operation_name` (required): The operation name from a generation request
- `response_format` (optional): `markdown` or `json` (default: `markdown`)

### `veo_wait_for_video`

Poll until a video completes or fails.

**Parameters:**
- `operation_name` (required): The operation name from a generation request
- `poll_interval_seconds` (optional): Time between checks (default: 10)
- `timeout_seconds` (optional): Maximum wait time (default: 300)
- `response_format` (optional): `markdown` or `json` (default: `markdown`)

### `veo_download_video`

Download a completed video to a local file.

**Parameters:**
- `video_uri` (required): The video URI from a completed operation
- `output_path` (required): Local file path to save the video

### `veo_list_models`

List available Veo models for video generation.

**Parameters:**
- `response_format` (optional): `markdown` or `json` (default: `markdown`)

## Prompting Tips

For best results with Veo, describe:
- **Shot type**: Wide shot, close-up, tracking shot, aerial view
- **Subject**: What/who is in the video
- **Action**: What is happening, how things move
- **Setting**: Where it takes place, environment details
- **Lighting**: Time of day, mood, atmosphere

Example: "Cinematic aerial shot of a coastal town at golden hour, camera slowly descending toward the harbor, warm sunlight reflecting off calm waters."

## Models

| Model | Best For | Speed | Audio |
|-------|----------|-------|-------|
| veo-3.1-generate-preview | Highest quality, 1080p | Slow | Yes |
| veo-3.1-fast-generate-preview | Quality with faster iteration | Fast | Yes |
| veo-3.0-generate-001 | Production quality | Medium | Yes |
| veo-3.0-fast-generate-001 | Prototyping, iteration | Fast | Yes |
| veo-2.0-generate-001 | Basic generation | Medium | No |

## Notes

- Video generation takes 11 seconds to 6 minutes depending on model and settings
- Generated videos are stored on Google's servers for 2 days
- Output is MP4 at 24fps with SynthID watermark
- Veo 3+ models include natively generated audio

## Development

```bash
# Watch mode with auto-reload
npm run dev

# Build
npm run build

# Run
npm start
```

## License

MIT
