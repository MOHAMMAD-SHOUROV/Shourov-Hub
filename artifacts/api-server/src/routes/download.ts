import { Router, type IRouter } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import { GetVideoInfoBody, GetVideoInfoResponse, StartDownloadBody, StartDownloadResponse } from "@workspace/api-zod";

const execAsync = promisify(exec);
const router: IRouter = Router();

function detectPlatform(url: string): string {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "YouTube";
  if (url.includes("tiktok.com")) return "TikTok";
  if (url.includes("facebook.com") || url.includes("fb.watch")) return "Facebook";
  if (url.includes("instagram.com")) return "Instagram";
  if (url.includes("twitter.com") || url.includes("x.com")) return "Twitter/X";
  if (url.includes("vimeo.com")) return "Vimeo";
  if (url.includes("dailymotion.com")) return "Dailymotion";
  if (url.includes("reddit.com")) return "Reddit";
  if (url.includes("twitch.tv")) return "Twitch";
  return "Unknown";
}

router.post("/info", async (req, res) => {
  try {
    const parsed = GetVideoInfoBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error", message: "Invalid request body" });
      return;
    }

    const { url } = parsed.data;

    let ytDlpOutput: string;
    try {
      const result = await execAsync(
        `yt-dlp --dump-json --no-playlist --socket-timeout 30 "${url.replace(/"/g, '\\"')}"`,
        { timeout: 60000 }
      );
      ytDlpOutput = result.stdout;
    } catch (err: unknown) {
      req.log.warn({ err, url }, "yt-dlp failed to fetch video info");
      res.status(400).json({
        error: "fetch_failed",
        message: "Could not retrieve video information. Please check the URL and try again.",
      });
      return;
    }

    let info: Record<string, unknown>;
    try {
      info = JSON.parse(ytDlpOutput);
    } catch {
      res.status(400).json({ error: "parse_error", message: "Failed to parse video information" });
      return;
    }

    const rawFormats: Array<Record<string, unknown>> = Array.isArray(info.formats)
      ? (info.formats as Array<Record<string, unknown>>)
      : [];

    interface FormatObj {
      id: string;
      label: string;
      quality: string;
      ext: string;
      filesize: number | null;
      type: "video" | "audio";
    }

    const seen = new Set<string>();
    const formats: FormatObj[] = [];

    const videoQualities = ["1080", "720", "480", "360", "240", "144"];
    for (const q of videoQualities) {
      const fmt = rawFormats.find(
        (f) =>
          typeof f.height === "number" &&
          f.height.toString().includes(q) &&
          f.vcodec !== "none" &&
          f.acodec !== "none"
      );
      if (fmt && !seen.has(q)) {
        seen.add(q);
        const ext = typeof fmt.ext === "string" ? fmt.ext : "mp4";
        formats.push({
          id: `video_${q}p`,
          label: `${q}p HD`,
          quality: `${q}p`,
          ext,
          filesize: typeof fmt.filesize === "number" ? fmt.filesize : null,
          type: "video",
        });
      }
    }

    if (formats.length === 0) {
      const bestVideo = rawFormats.find(
        (f) => f.vcodec !== "none" && f.acodec !== "none"
      );
      if (bestVideo) {
        formats.push({
          id: "video_best",
          label: "Best Quality",
          quality: "best",
          ext: typeof bestVideo.ext === "string" ? bestVideo.ext : "mp4",
          filesize: typeof bestVideo.filesize === "number" ? bestVideo.filesize : null,
          type: "video",
        });
      } else {
        formats.push({
          id: "video_best",
          label: "Best Quality",
          quality: "best",
          ext: "mp4",
          filesize: null,
          type: "video",
        });
      }
    }

    formats.push({
      id: "audio_mp3",
      label: "MP3 Audio",
      quality: "128kbps",
      ext: "mp3",
      filesize: null,
      type: "audio",
    });

    formats.push({
      id: "audio_m4a",
      label: "M4A Audio",
      quality: "High Quality",
      ext: "m4a",
      filesize: null,
      type: "audio",
    });

    const videoInfo = GetVideoInfoResponse.parse({
      title: typeof info.title === "string" ? info.title : "Unknown Video",
      thumbnail: typeof info.thumbnail === "string" ? info.thumbnail : undefined,
      duration: typeof info.duration === "number" ? info.duration : undefined,
      platform: detectPlatform(url),
      formats,
      originalUrl: url,
    });

    res.json(videoInfo);
  } catch (err) {
    req.log.error({ err }, "Error fetching video info");
    res.status(500).json({ error: "internal_error", message: "An internal error occurred" });
  }
});

router.post("/start", async (req, res) => {
  try {
    const parsed = StartDownloadBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error", message: "Invalid request body" });
      return;
    }

    const { url, formatId, type } = parsed.data;

    let ytdlpArgs: string;
    let ext: string;

    if (type === "audio" || formatId.startsWith("audio_")) {
      const audioExt = formatId === "audio_m4a" ? "m4a" : "mp3";
      ext = audioExt;
      ytdlpArgs = `-x --audio-format ${audioExt} --audio-quality 0`;
    } else {
      ext = "mp4";
      if (formatId === "video_best") {
        ytdlpArgs = `-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4`;
      } else {
        const quality = formatId.replace("video_", "").replace("p", "");
        ytdlpArgs = `-f "bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}][ext=mp4]/best[height<=${quality}]" --merge-output-format mp4`;
      }
    }

    const safeUrl = url.replace(/"/g, '\\"');
    const cmd = `yt-dlp ${ytdlpArgs} --no-playlist --get-url --socket-timeout 30 "${safeUrl}"`;

    let downloadUrl: string;
    try {
      const result = await execAsync(cmd, { timeout: 60000 });
      downloadUrl = result.stdout.trim().split("\n")[0];
    } catch {
      const fallbackCmd = `yt-dlp -f best --get-url --no-playlist --socket-timeout 30 "${safeUrl}"`;
      try {
        const fallback = await execAsync(fallbackCmd, { timeout: 60000 });
        downloadUrl = fallback.stdout.trim().split("\n")[0];
        ext = "mp4";
      } catch (fallbackErr) {
        req.log.error({ fallbackErr, url }, "yt-dlp get-url failed");
        res.status(400).json({
          error: "download_failed",
          message: "Could not generate download link. Please try again.",
        });
        return;
      }
    }

    if (!downloadUrl) {
      res.status(400).json({
        error: "no_url",
        message: "No download URL available for this format.",
      });
      return;
    }

    const titleResult = await execAsync(
      `yt-dlp --get-title --no-playlist --socket-timeout 30 "${safeUrl}"`,
      { timeout: 30000 }
    ).catch(() => ({ stdout: "video" }));

    const rawTitle = titleResult.stdout.trim().split("\n")[0] || "video";
    const safeTitle = rawTitle.replace(/[^a-zA-Z0-9\s-]/g, "").trim().slice(0, 50) || "video";
    const filename = `${safeTitle}.${ext}`;

    const result = StartDownloadResponse.parse({
      downloadUrl,
      filename,
      message: "Download link generated successfully",
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Error starting download");
    res.status(500).json({ error: "internal_error", message: "An internal error occurred" });
  }
});

export default router;
