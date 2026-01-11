#!/usr/bin/env node
/**
 * MCP Server for Google Gemini Veo Video Generation API.
 *
 * This server provides tools to generate AI videos using Google's Veo models,
 * including text-to-video, image-to-video, and video extension capabilities.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios, { AxiosError } from "axios";

// Constants
const API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const CHARACTER_LIMIT = 25000;
const DEFAULT_POLL_INTERVAL = 10000; // 10 seconds
const DEFAULT_TIMEOUT = 600000; // 10 minutes

// Get API key from environment
function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }
  return apiKey;
}

// Veo model definitions
const VEO_MODELS = [
  {
    id: "veo-3.1-generate-preview",
    name: "Veo 3.1",
    status: "preview",
    description: "Latest Veo model with 720p/1080p, extension, interpolation, and reference images",
    features: ["text-to-video", "image-to-video", "video-extension", "interpolation", "reference-images", "audio"],
    resolutions: ["720p", "1080p"],
    durations: [4, 6, 8],
    supportsResolution: true
  },
  {
    id: "veo-3.1-fast-generate-preview",
    name: "Veo 3.1 Fast",
    status: "preview",
    description: "Speed-optimized variant of Veo 3.1 with all features",
    features: ["text-to-video", "image-to-video", "video-extension", "interpolation", "reference-images", "audio"],
    resolutions: ["720p", "1080p"],
    durations: [4, 6, 8],
    supportsResolution: true
  },
  {
    id: "veo-3.0-generate-001",
    name: "Veo 3",
    status: "stable",
    description: "Stable Veo model with audio (1080p only with 16:9)",
    features: ["text-to-video", "image-to-video", "audio"],
    resolutions: ["720p", "1080p"],
    durations: [4, 6, 8],
    supportsResolution: true
  },
  {
    id: "veo-3.0-fast-generate-001",
    name: "Veo 3 Fast",
    status: "stable",
    description: "Speed-optimized variant of Veo 3",
    features: ["text-to-video", "image-to-video", "audio"],
    resolutions: ["720p", "1080p"],
    durations: [4, 6, 8],
    supportsResolution: true
  },
  {
    id: "veo-2.0-generate-001",
    name: "Veo 2",
    status: "stable",
    description: "Silent video generation (no audio, no resolution control)",
    features: ["text-to-video", "image-to-video"],
    resolutions: ["720p"],
    durations: [5, 6, 8],
    supportsResolution: false
  }
] as const;

// Enums
enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}

enum AspectRatio {
  LANDSCAPE = "16:9",
  PORTRAIT = "9:16"
}

enum Resolution {
  HD = "720p",
  FULL_HD = "1080p"
}

enum PersonGeneration {
  ALLOW_ALL = "allow_all",
  ALLOW_ADULT = "allow_adult",
  DONT_ALLOW = "dont_allow"
}

// Type definitions
interface VeoGenerateRequest {
  instances: Array<{
    prompt: string;
    image?: {
      bytesBase64Encoded?: string;
      gcsUri?: string;
      mimeType: string;
    };
    lastFrame?: {
      bytesBase64Encoded?: string;
      gcsUri?: string;
      mimeType: string;
    };
    video?: {
      bytesBase64Encoded?: string;
      gcsUri?: string;
      mimeType: string;
    };
    referenceImages?: Array<{
      referenceImage: {
        bytesBase64Encoded?: string;
        gcsUri?: string;
        mimeType: string;
      };
      referenceType: "REFERENCE_TYPE_STYLE" | "REFERENCE_TYPE_SUBJECT";
      referenceId?: number;
    }>;
  }>;
  parameters: {
    aspectRatio?: string;
    negativePrompt?: string;
    personGeneration?: string;
    durationSeconds?: number;
    resolution?: string;
  };
}

interface OperationResponse {
  name: string;
  done?: boolean;
  error?: {
    code: number;
    message: string;
  };
  response?: {
    generateVideoResponse?: {
      generatedSamples: Array<{
        video: {
          uri: string;
        };
      }>;
    };
  };
  metadata?: {
    "@type": string;
  };
}

// Shared utility functions
async function makeVeoRequest<T>(
  endpoint: string,
  method: "GET" | "POST" = "GET",
  data?: unknown
): Promise<T> {
  const apiKey = getApiKey();
  const url = `${API_BASE_URL}/${endpoint}`;

  try {
    const response = await axios({
      method,
      url,
      data,
      timeout: 60000,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      }
    });
    return response.data;
  } catch (error) {
    throw error;
  }
}

function handleApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{ error?: { message?: string; code?: number } }>;
    if (axiosError.response) {
      const status = axiosError.response.status;
      const errorData = axiosError.response.data;
      const message = errorData?.error?.message || axiosError.message;

      switch (status) {
        case 400:
          return `Error: Invalid request. ${message}. Check your parameters and try again.`;
        case 401:
          return "Error: Invalid API key. Please check your GEMINI_API_KEY environment variable.";
        case 403:
          return `Error: Access denied. ${message}. Ensure your API key has Veo access enabled.`;
        case 404:
          return `Error: Resource not found. ${message}. Check the operation name or model ID.`;
        case 429:
          return "Error: Rate limit exceeded. Please wait before making more requests.";
        case 500:
          return `Error: Server error. ${message}. Please try again later.`;
        default:
          return `Error: API request failed with status ${status}. ${message}`;
      }
    } else if (axiosError.code === "ECONNABORTED") {
      return "Error: Request timed out. Video generation can take several minutes. Use veo_get_operation_status to check progress.";
    } else if (axiosError.code === "ENOTFOUND") {
      return "Error: Network error. Please check your internet connection.";
    }
  }
  return `Error: Unexpected error occurred: ${error instanceof Error ? error.message : String(error)}`;
}

function formatOperationStatus(operation: OperationResponse, format: ResponseFormat): string {
  const status = operation.done ? "completed" : "in_progress";
  const hasError = !!operation.error;
  const hasVideo = !!operation.response?.generateVideoResponse?.generatedSamples?.length;

  if (format === ResponseFormat.JSON) {
    return JSON.stringify({
      operation_name: operation.name,
      status: hasError ? "failed" : status,
      done: operation.done ?? false,
      error: operation.error ?? null,
      video_urls: hasVideo
        ? operation.response!.generateVideoResponse!.generatedSamples.map(s => s.video.uri)
        : []
    }, null, 2);
  }

  const lines: string[] = [];
  lines.push("# Video Generation Status");
  lines.push("");
  lines.push(`**Operation:** \`${operation.name}\``);
  lines.push(`**Status:** ${hasError ? "❌ Failed" : operation.done ? "✅ Completed" : "⏳ In Progress"}`);

  if (hasError) {
    lines.push("");
    lines.push("## Error");
    lines.push(`- **Code:** ${operation.error!.code}`);
    lines.push(`- **Message:** ${operation.error!.message}`);
  }

  if (hasVideo) {
    lines.push("");
    lines.push("## Generated Videos");
    operation.response!.generateVideoResponse!.generatedSamples.forEach((sample, idx) => {
      lines.push(`${idx + 1}. ${sample.video.uri}`);
    });
  }

  if (!operation.done && !hasError) {
    lines.push("");
    lines.push("*Video generation typically takes 11 seconds to 6 minutes. Use `veo_get_operation_status` to check progress.*");
  }

  return lines.join("\n");
}

// Zod schemas
const ModelIdSchema = z.enum([
  "veo-3.1-generate-preview",
  "veo-3.1-fast-generate-preview",
  "veo-3.0-generate-001",
  "veo-3.0-fast-generate-001",
  "veo-2.0-generate-001"
]).describe("Veo model ID to use for generation");

const GenerateVideoInputSchema = z.object({
  prompt: z.string()
    .min(1, "Prompt is required")
    .max(5000, "Prompt must not exceed 5000 characters")
    .describe("Text description of the video to generate. For best results, describe shot type, subject, action, setting, and lighting. Example: 'Wide shot of a child flying a red kite in a grassy park, golden hour sunlight, camera slowly pans upward.'"),
  model: ModelIdSchema.default("veo-3.0-generate-001"),
  negative_prompt: z.string()
    .max(1000, "Negative prompt must not exceed 1000 characters")
    .optional()
    .describe("Elements to exclude from the video"),
  aspect_ratio: z.nativeEnum(AspectRatio)
    .default(AspectRatio.LANDSCAPE)
    .describe("Video aspect ratio: '16:9' (landscape) or '9:16' (portrait)"),
  duration_seconds: z.union([z.literal(4), z.literal(5), z.literal(6), z.literal(8)])
    .default(4)
    .describe("Video duration in seconds. Veo 3/3.1: 4, 6, or 8. Veo 2: 5, 6, or 8"),
  resolution: z.nativeEnum(Resolution)
    .optional()
    .describe("Video resolution: '720p' or '1080p'. Only for Veo 3/3.1 (ignored for Veo 2). Veo 3.1: 1080p requires 8s duration. Veo 3: 1080p requires 16:9 aspect ratio"),
  person_generation: z.nativeEnum(PersonGeneration)
    .default(PersonGeneration.ALLOW_ALL)
    .describe("Controls people generation. For text-to-video: Veo 3/3.1 only supports 'allow_all'; Veo 2 supports 'allow_all', 'allow_adult', 'dont_allow'"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable")
}).strict();

const GenerateVideoFromImageInputSchema = z.object({
  prompt: z.string()
    .min(1, "Prompt is required")
    .max(5000, "Prompt must not exceed 5000 characters")
    .describe("Text description of the action/motion to apply to the reference image"),
  image_base64: z.string()
    .min(1, "Image data is required")
    .describe("Base64-encoded image data to use as the first frame"),
  image_mime_type: z.enum(["image/png", "image/jpeg", "image/webp"])
    .default("image/png")
    .describe("MIME type of the input image"),
  model: ModelIdSchema.default("veo-3.0-generate-001"),
  negative_prompt: z.string()
    .max(1000, "Negative prompt must not exceed 1000 characters")
    .optional()
    .describe("Elements to exclude from the video"),
  aspect_ratio: z.nativeEnum(AspectRatio)
    .default(AspectRatio.LANDSCAPE)
    .describe("Video aspect ratio: '16:9' (landscape) or '9:16' (portrait). Should match input image aspect ratio."),
  duration_seconds: z.union([z.literal(4), z.literal(5), z.literal(6), z.literal(8)])
    .default(4)
    .describe("Video duration in seconds. Veo 3/3.1: 4, 6, or 8. Veo 2: 5, 6, or 8"),
  resolution: z.nativeEnum(Resolution)
    .optional()
    .describe("Video resolution: '720p' or '1080p'. Only for Veo 3/3.1 (ignored for Veo 2)"),
  person_generation: z.nativeEnum(PersonGeneration)
    .default(PersonGeneration.ALLOW_ADULT)
    .describe("Controls people generation. For image-to-video: Veo 3/3.1 only supports 'allow_adult'; Veo 2 supports 'allow_adult', 'dont_allow'"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable")
}).strict();

const GetOperationStatusInputSchema = z.object({
  operation_name: z.string()
    .min(1, "Operation name is required")
    .describe("The operation name returned from a video generation request (e.g., 'operations/...')"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable")
}).strict();

const WaitForVideoInputSchema = z.object({
  operation_name: z.string()
    .min(1, "Operation name is required")
    .describe("The operation name returned from a video generation request"),
  poll_interval_seconds: z.number()
    .int()
    .min(5)
    .max(60)
    .default(10)
    .describe("Seconds between status checks (default: 10)"),
  timeout_seconds: z.number()
    .int()
    .min(30)
    .max(600)
    .default(300)
    .describe("Maximum seconds to wait before timing out (default: 300)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable")
}).strict();

const ListModelsInputSchema = z.object({
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable")
}).strict();

// Type definitions from schemas
type GenerateVideoInput = z.infer<typeof GenerateVideoInputSchema>;
type GenerateVideoFromImageInput = z.infer<typeof GenerateVideoFromImageInputSchema>;
type GetOperationStatusInput = z.infer<typeof GetOperationStatusInputSchema>;
type WaitForVideoInput = z.infer<typeof WaitForVideoInputSchema>;
type ListModelsInput = z.infer<typeof ListModelsInputSchema>;

// Create MCP server instance
const server = new McpServer({
  name: "veo-mcp-server",
  version: "1.0.0"
});

// Register tools
server.registerTool(
  "veo_generate_video",
  {
    title: "Generate Video",
    description: `Generate a video from a text prompt using Google's Veo models.

This tool creates AI-generated videos from descriptive text prompts. For best results:
- Describe shot type (wide, close-up, tracking, etc.)
- Specify subject and action clearly
- Include setting and environment details
- Mention lighting and atmosphere
- Add camera movement instructions if desired

Args:
  - prompt (string): Text description of the video to generate
  - model (string): Veo model ID (default: 'veo-3.0-generate-001')
  - negative_prompt (string, optional): Elements to exclude
  - aspect_ratio ('16:9' | '9:16'): Video aspect ratio (default: '16:9')
  - duration_seconds (4 | 6 | 8): Video duration (default: 4)
  - resolution ('720p' | '1080p'): Video resolution (default: '720p')
  - person_generation: Controls people generation (model-dependent, see schema)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Operation name for tracking the video generation job. Use veo_get_operation_status or veo_wait_for_video to check completion and get the video URL.

Notes:
  - Video generation takes 11 seconds to 6 minutes
  - Videos are stored server-side for 2 days maximum
  - Output is MP4 at 24fps with SynthID watermark
  - Veo 3+ models include natively generated audio`,
    inputSchema: GenerateVideoInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    }
  },
  async (params: GenerateVideoInput) => {
    try {
      // Veo 2 doesn't support resolution parameter
      const isVeo2 = params.model === "veo-2.0-generate-001";
      const effectiveResolution = isVeo2 ? undefined : (params.resolution ?? Resolution.HD);

      const request: VeoGenerateRequest = {
        instances: [{
          prompt: params.prompt
        }],
        parameters: {
          aspectRatio: params.aspect_ratio,
          durationSeconds: params.duration_seconds,
          personGeneration: params.person_generation,
          ...(effectiveResolution ? { resolution: effectiveResolution } : {}),
          ...(params.negative_prompt ? { negativePrompt: params.negative_prompt } : {})
        }
      };

      const operation = await makeVeoRequest<OperationResponse>(
        `models/${params.model}:predictLongRunning`,
        "POST",
        request
      );

      const output = {
        operation_name: operation.name,
        model: params.model,
        status: "submitted",
        message: "Video generation started. Use veo_get_operation_status or veo_wait_for_video to track progress."
      };

      if (params.response_format === ResponseFormat.JSON) {
        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output
        };
      }

      const configLines = [
        `- **Duration:** ${params.duration_seconds} seconds`,
        `- **Aspect Ratio:** ${params.aspect_ratio}`
      ];
      if (effectiveResolution) {
        configLines.push(`- **Resolution:** ${effectiveResolution}`);
      }

      const markdown = [
        "# Video Generation Started",
        "",
        `**Operation:** \`${operation.name}\``,
        `**Model:** ${params.model}`,
        `**Status:** ⏳ Submitted`,
        "",
        "## Configuration",
        ...configLines,
        "",
        "*Use `veo_get_operation_status` or `veo_wait_for_video` to track progress and get the video URL when complete.*"
      ].join("\n");

      return {
        content: [{ type: "text", text: markdown }],
        structuredContent: output
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: handleApiError(error) }]
      };
    }
  }
);

server.registerTool(
  "veo_generate_video_from_image",
  {
    title: "Generate Video from Image",
    description: `Generate a video using an image as the first frame reference.

The image guides the visual style and composition of the generated video. This is useful for:
- Animating still images
- Creating consistent visual style
- Extending existing content

Args:
  - prompt (string): Description of the action/motion to apply
  - image_base64 (string): Base64-encoded image data
  - image_mime_type ('image/png' | 'image/jpeg' | 'image/webp'): Image format
  - model (string): Veo model ID (default: 'veo-3.0-generate-001')
  - negative_prompt (string, optional): Elements to exclude
  - aspect_ratio ('16:9' | '9:16'): Should match input image (default: '16:9')
  - duration_seconds (4 | 6 | 8): Video duration (default: 4)
  - resolution ('720p' | '1080p'): Video resolution (default: '720p')
  - person_generation: Controls people generation (model-dependent, see schema)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Operation name for tracking. Use veo_get_operation_status or veo_wait_for_video to check completion.`,
    inputSchema: GenerateVideoFromImageInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true
    }
  },
  async (params: GenerateVideoFromImageInput) => {
    try {
      // Strip data URI prefix if present
      let imageData = params.image_base64;
      const dataUriMatch = imageData.match(/^data:[^;]+;base64,(.+)$/);
      if (dataUriMatch) {
        imageData = dataUriMatch[1];
      }

      // Veo 2 doesn't support resolution parameter
      const isVeo2 = params.model === "veo-2.0-generate-001";
      const effectiveResolution = isVeo2 ? undefined : (params.resolution ?? Resolution.HD);

      const request: VeoGenerateRequest = {
        instances: [{
          prompt: params.prompt,
          image: {
            bytesBase64Encoded: imageData,
            mimeType: params.image_mime_type
          }
        }],
        parameters: {
          aspectRatio: params.aspect_ratio,
          durationSeconds: params.duration_seconds,
          personGeneration: params.person_generation,
          ...(effectiveResolution ? { resolution: effectiveResolution } : {}),
          ...(params.negative_prompt ? { negativePrompt: params.negative_prompt } : {})
        }
      };

      const operation = await makeVeoRequest<OperationResponse>(
        `models/${params.model}:predictLongRunning`,
        "POST",
        request
      );

      const output = {
        operation_name: operation.name,
        model: params.model,
        status: "submitted",
        message: "Image-to-video generation started. Use veo_get_operation_status or veo_wait_for_video to track progress."
      };

      if (params.response_format === ResponseFormat.JSON) {
        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output
        };
      }

      const configLines = [
        `- **Duration:** ${params.duration_seconds} seconds`,
        `- **Aspect Ratio:** ${params.aspect_ratio}`
      ];
      if (effectiveResolution) {
        configLines.push(`- **Resolution:** ${effectiveResolution}`);
      }
      configLines.push(`- **Image Format:** ${params.image_mime_type}`);

      const markdown = [
        "# Image-to-Video Generation Started",
        "",
        `**Operation:** \`${operation.name}\``,
        `**Model:** ${params.model}`,
        `**Status:** ⏳ Submitted`,
        "",
        "## Configuration",
        ...configLines,
        "",
        "*Use `veo_get_operation_status` or `veo_wait_for_video` to track progress and get the video URL when complete.*"
      ].join("\n");

      return {
        content: [{ type: "text", text: markdown }],
        structuredContent: output
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: handleApiError(error) }]
      };
    }
  }
);

server.registerTool(
  "veo_get_operation_status",
  {
    title: "Get Operation Status",
    description: `Check the status of a video generation operation.

Use this to poll for completion after starting video generation.

Args:
  - operation_name (string): The operation name from a generation request
  - response_format ('markdown' | 'json'): Output format

Returns:
  - status: 'in_progress', 'completed', or 'failed'
  - video_urls: Array of download URLs when completed
  - error: Error details if failed`,
    inputSchema: GetOperationStatusInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: GetOperationStatusInput) => {
    try {
      // Use operation name as-is if it contains a path, otherwise assume it's a bare ID
      const operationPath = params.operation_name.includes("/")
        ? params.operation_name
        : `operations/${params.operation_name}`;

      const operation = await makeVeoRequest<OperationResponse>(operationPath, "GET");

      const text = formatOperationStatus(operation, params.response_format);

      const output = {
        operation_name: operation.name,
        status: operation.error ? "failed" : operation.done ? "completed" : "in_progress",
        done: operation.done ?? false,
        error: operation.error ?? null,
        video_urls: operation.response?.generateVideoResponse?.generatedSamples?.map(s => s.video.uri) ?? []
      };

      return {
        content: [{ type: "text", text }],
        structuredContent: output
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: handleApiError(error) }]
      };
    }
  }
);

server.registerTool(
  "veo_wait_for_video",
  {
    title: "Wait for Video Completion",
    description: `Poll a video generation operation until it completes or fails.

This tool continuously checks the operation status until the video is ready, making it convenient for workflows that need to wait for the result.

Args:
  - operation_name (string): The operation name from a generation request
  - poll_interval_seconds (number): Seconds between checks (default: 10, range: 5-60)
  - timeout_seconds (number): Maximum wait time (default: 300, range: 30-600)
  - response_format ('markdown' | 'json'): Output format

Returns:
  Final operation status with video URLs if successful, or error details if failed.

Notes:
  - Video generation typically takes 11 seconds to 6 minutes
  - Consider using longer timeouts for complex videos`,
    inputSchema: WaitForVideoInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  },
  async (params: WaitForVideoInput) => {
    try {
      // Use operation name as-is if it contains a path, otherwise assume it's a bare ID
      const operationPath = params.operation_name.includes("/")
        ? params.operation_name
        : `operations/${params.operation_name}`;

      const startTime = Date.now();
      const timeoutMs = params.timeout_seconds * 1000;
      const pollIntervalMs = params.poll_interval_seconds * 1000;

      let operation: OperationResponse;
      let pollCount = 0;

      while (true) {
        pollCount++;
        operation = await makeVeoRequest<OperationResponse>(operationPath, "GET");

        if (operation.done || operation.error) {
          break;
        }

        const elapsed = Date.now() - startTime;
        if (elapsed >= timeoutMs) {
          const output = {
            operation_name: operation.name,
            status: "timeout",
            done: false,
            elapsed_seconds: Math.round(elapsed / 1000),
            poll_count: pollCount,
            message: `Timed out after ${params.timeout_seconds} seconds. The video may still be generating. Use veo_get_operation_status to check later.`
          };

          if (params.response_format === ResponseFormat.JSON) {
            return {
              content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
              structuredContent: output
            };
          }

          return {
            content: [{
              type: "text",
              text: [
                "# Video Generation Timeout",
                "",
                `**Operation:** \`${operation.name}\``,
                `**Status:** ⏱️ Timed out after ${params.timeout_seconds} seconds`,
                `**Polls:** ${pollCount}`,
                "",
                "*The video may still be generating. Use `veo_get_operation_status` to check later.*"
              ].join("\n")
            }],
            structuredContent: output
          };
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }

      const text = formatOperationStatus(operation, params.response_format);
      const elapsed = Date.now() - startTime;

      const output = {
        operation_name: operation.name,
        status: operation.error ? "failed" : "completed",
        done: true,
        elapsed_seconds: Math.round(elapsed / 1000),
        poll_count: pollCount,
        error: operation.error ?? null,
        video_urls: operation.response?.generateVideoResponse?.generatedSamples?.map(s => s.video.uri) ?? []
      };

      return {
        content: [{ type: "text", text }],
        structuredContent: output
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: handleApiError(error) }]
      };
    }
  }
);

server.registerTool(
  "veo_list_models",
  {
    title: "List Veo Models",
    description: `List available Google Veo models for video generation.

Returns information about each supported model including capabilities, status, and recommended use cases.

Args:
  - response_format ('markdown' | 'json'): Output format

Returns:
  List of available Veo models with their features and specifications.`,
    inputSchema: ListModelsInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (params: ListModelsInput) => {
    const output = {
      models: VEO_MODELS.map(m => ({
        id: m.id,
        name: m.name,
        status: m.status,
        description: m.description,
        features: [...m.features],
        resolutions: [...m.resolutions],
        durations: [...m.durations]
      }))
    };

    if (params.response_format === ResponseFormat.JSON) {
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }

    const lines: string[] = ["# Available Veo Models", ""];

    for (const model of VEO_MODELS) {
      const statusEmoji = model.status === "stable" ? "✅" : "🔬";
      lines.push(`## ${model.name} ${statusEmoji}`);
      lines.push(`**Model ID:** \`${model.id}\``);
      lines.push(`**Status:** ${model.status}`);
      lines.push("");
      lines.push(model.description);
      lines.push("");
      lines.push("**Features:**");
      model.features.forEach(f => lines.push(`- ${f}`));
      lines.push("");
      lines.push(`**Resolutions:** ${model.resolutions.join(", ")}`);
      lines.push(`**Durations:** ${model.durations.join(", ")} seconds`);
      lines.push("");
    }

    return {
      content: [{ type: "text", text: lines.join("\n") }],
      structuredContent: output
    };
  }
);

// Main function
async function main() {
  // Validate API key on startup
  try {
    getApiKey();
  } catch (error) {
    console.error("ERROR: GEMINI_API_KEY environment variable is required");
    console.error("Set it in your environment before running this server.");
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Veo MCP server running via stdio");
}

main().catch(error => {
  console.error("Server error:", error);
  process.exit(1);
});
