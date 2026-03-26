import { Router, type IRouter } from "express";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { createReadStream, statSync, existsSync } from "fs";
import { unlink, mkdir, readdir } from "fs/promises";
import { join } from "path";
import {
  GetVideoInfoBody,
  GetVideoInfoResponse,
  StartDownloadBody,
  StartDownloadResponse,
  SearchVideosBody,
  SearchVideosResponse,
} from "@workspace/api-zod";

const execAsync = promisify(exec);
const router: IRouter = Router();

/* ── use the latest yt-dlp if available ──────────────────── */
const YTDLP = existsSync("/tmp/yt-dlp-new") ? "/tmp/yt-dlp-new" : "yt-dlp";

/* ── shared tmp dir ──────────────────────────────────────── */
const TMP_DIR = "/tmp/shourov-dl";

async function ensureTmpDir() {
  await mkdir(TMP_DIR, { recursive: true });
}

/* ── detect platform ─────────────────────────────────────── */
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

function isYouTube(url: string) {
  return url.includes("youtube.com") || url.includes("youtu.be");
}

/* ── extra args for YouTube (bypass SABR) ────────────────── */
function youtubeExtraArgs(url: string): string {
  if (!isYouTube(url)) return "";
  return `--extractor-args "youtube:player_client=ios,mweb" `;
}

/* ── clean up old files in tmp dir ───────────────────────── */
async function cleanupOldFiles() {
  try {
    const files = await readdir(TMP_DIR);
    const now = Date.now();
    await Promise.all(
      files.map(async (f) => {
        const fp = join(TMP_DIR, f);
        try {
          const st = statSync(fp);
          if (now - st.mtimeMs > 30 * 60 * 1000) await unlink(fp); // older than 30 min
        } catch { /* ignore */ }
      })
    );
  } catch { /* ignore */ }
}

/* ─────────────────────────────────────────────────────────────
   SEARCH
───────────────────────────────────────────────────────────── */
router.post("/search", async (req, res) => {
  try {
    const parsed = SearchVideosBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error", message: "Invalid request body" });
      return;
    }

    const { query, limit = 8 } = parsed.data;
    const safeQuery = query.replace(/"/g, '\\"');
    const count = Math.min(Number(limit) || 8, 15);

    let output: string;
    try {
      const result = await execAsync(
        `${YTDLP} "ytsearch${count}:${safeQuery}" --dump-json --flat-playlist --no-playlist --socket-timeout 30`,
        { timeout: 35000 }
      );
      output = result.stdout;
    } catch (err) {
      req.log.warn({ err, query }, "search failed");
      res.status(400).json({ error: "search_failed", message: "Search failed. Please try again." });
      return;
    }

    const lines = output.trim().split("\n").filter(Boolean);
    const results = [];

    for (const line of lines) {
      try {
        const item = JSON.parse(line) as Record<string, unknown>;
        const videoId = typeof item.id === "string" ? item.id : String(item.id ?? "");
        const url = typeof item.url === "string" ? item.url : `https://www.youtube.com/watch?v=${videoId}`;
        results.push({
          id: videoId,
          title: typeof item.title === "string" ? item.title : "Unknown",
          thumbnail: typeof item.thumbnail === "string"
            ? item.thumbnail
            : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          duration: typeof item.duration === "number" ? item.duration : undefined,
          platform: "YouTube",
          url,
          uploader: typeof item.uploader === "string" ? item.uploader : undefined,
          viewCount: typeof item.view_count === "number" ? item.view_count : undefined,
        });
      } catch { /* skip */ }
    }

    const response = SearchVideosResponse.parse({ results });
    res.json(response);
  } catch (err) {
    req.log.error({ err }, "Error searching videos");
    res.status(500).json({ error: "internal_error", message: "An internal error occurred" });
  }
});

/* ─────────────────────────────────────────────────────────────
   INFO
───────────────────────────────────────────────────────────── */
router.post("/info", async (req, res) => {
  try {
    const parsed = GetVideoInfoBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error", message: "Invalid request body" });
      return;
    }

    const { url } = parsed.data;
    const extra = youtubeExtraArgs(url);

    let ytDlpOutput: string;
    try {
      const result = await execAsync(
        `${YTDLP} --dump-json --no-playlist --socket-timeout 30 ${extra}"${url.replace(/"/g, '\\"')}"`,
        { timeout: 60000 }
      );
      ytDlpOutput = result.stdout;
    } catch (err) {
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

    interface FormatObj { id: string; label: string; quality: string; ext: string; filesize: number | null; type: "video" | "audio"; }
    const seen = new Set<string>();
    const formats: FormatObj[] = [];

    for (const q of ["1080", "720", "480", "360", "240", "144"]) {
      const fmt = rawFormats.find(
        (f) => typeof f.height === "number" && f.height.toString().includes(q) && f.vcodec !== "none"
      );
      if (fmt && !seen.has(q)) {
        seen.add(q);
        formats.push({
          id: `video_${q}p`,
          label: `${q}p HD`,
          quality: `${q}p`,
          ext: typeof fmt.ext === "string" ? fmt.ext : "mp4",
          filesize: typeof fmt.filesize === "number" ? fmt.filesize : null,
          type: "video",
        });
      }
    }

    if (formats.length === 0) {
      formats.push({ id: "video_best", label: "Best Quality", quality: "best", ext: "mp4", filesize: null, type: "video" });
    }

    formats.push({ id: "audio_mp3", label: "MP3 Audio", quality: "128kbps", ext: "mp3", filesize: null, type: "audio" });
    formats.push({ id: "audio_m4a", label: "M4A Audio", quality: "High Quality", ext: "m4a", filesize: null, type: "audio" });

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

/* ─────────────────────────────────────────────────────────────
   STREAM (for video player preview)
───────────────────────────────────────────────────────────── */
router.post("/stream", async (req, res) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "validation_error", message: "URL required" });
      return;
    }
    const extra = youtubeExtraArgs(url);
    const safeUrl = url.replace(/"/g, '\\"');
    const cmd = `${YTDLP} -f "best[ext=mp4]/best" --get-url --no-playlist --socket-timeout 30 ${extra}"${safeUrl}"`;
    const result = await execAsync(cmd, { timeout: 60000 });
    const streamUrl = result.stdout.trim().split("\n")[0];
    if (!streamUrl) {
      res.status(400).json({ error: "no_url", message: "No stream URL available" });
      return;
    }
    res.json({ streamUrl });
  } catch (err) {
    req.log.error({ err }, "Error getting stream URL");
    res.status(500).json({ error: "internal_error", message: "Could not get stream URL" });
  }
});

/* ─────────────────────────────────────────────────────────────
   DOWNLOAD — server-side download then stream to client
───────────────────────────────────────────────────────────── */
router.post("/start", async (req, res) => {
  try {
    const parsed = StartDownloadBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error", message: "Invalid request body" });
      return;
    }

    const { url, formatId, type } = parsed.data;
    await ensureTmpDir();
    cleanupOldFiles();  // async, don't await

    const extra = youtubeExtraArgs(url);
    const safeUrl = url.replace(/"/g, '\\"');
    const tmpId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const outputTemplate = join(TMP_DIR, `${tmpId}.%(ext)s`);

    let ytdlpArgs: string;
    let preferredExt: string;

    if (type === "audio" || formatId.startsWith("audio_")) {
      const audioExt = formatId === "audio_m4a" ? "m4a" : "mp3";
      preferredExt = audioExt;
      ytdlpArgs = `-x --audio-format ${audioExt} --audio-quality 0`;
    } else {
      preferredExt = "mp4";
      if (formatId === "video_best") {
        ytdlpArgs = `-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best" --merge-output-format mp4`;
      } else {
        const quality = formatId.replace("video_", "").replace("p", "");
        ytdlpArgs = `-f "bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]/best" --merge-output-format mp4`;
      }
    }

    /* ── Actually download the file to disk ── */
    const dlCmd = `${YTDLP} ${ytdlpArgs} ${extra}--no-playlist --socket-timeout 60 -o "${outputTemplate}" "${safeUrl}"`;
    req.log.info({ dlCmd, url }, "Starting download");

    try {
      await execAsync(dlCmd, { timeout: 5 * 60 * 1000 }); // 5 min max
    } catch (dlErr: unknown) {
      req.log.warn({ dlErr, url }, "Primary download failed, trying fallback");
      // Fallback: just best available
      const fallbackCmd = `${YTDLP} ${extra}--no-playlist --socket-timeout 60 -o "${outputTemplate}" "${safeUrl}"`;
      await execAsync(fallbackCmd, { timeout: 5 * 60 * 1000 });
    }

    /* ── Find the downloaded file ── */
    const files = await readdir(TMP_DIR);
    const dlFile = files.find((f) => f.startsWith(tmpId));
    if (!dlFile) {
      res.status(500).json({ error: "file_not_found", message: "Download failed: file not found" });
      return;
    }

    const filePath = join(TMP_DIR, dlFile);
    const ext = dlFile.split(".").pop() || preferredExt;

    /* ── Sanitize filename from title ── */
    let safeTitle = "video";
    try {
      const titleResult = await execAsync(
        `${YTDLP} --get-title --no-playlist --socket-timeout 20 ${extra}"${safeUrl}"`,
        { timeout: 30000 }
      );
      safeTitle = titleResult.stdout.trim().split("\n")[0]
        .replace(/[^\w\s-]/g, "")
        .trim()
        .slice(0, 60) || "video";
    } catch { /* ignore */ }

    const filename = `${safeTitle}.${ext}`;

    /* ── Stream the file to the browser ── */
    const stat = statSync(filePath);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Cache-Control", "no-cache");

    const stream = createReadStream(filePath);
    stream.pipe(res);
    stream.on("end", () => {
      unlink(filePath).catch(() => {});
    });
    stream.on("error", () => {
      unlink(filePath).catch(() => {});
    });

  } catch (err: unknown) {
    req.log.error({ err, body: req.body }, "Error in /start download");
    if (!res.headersSent) {
      const msg = err instanceof Error ? err.message : "Download failed";
      const isYtError = msg.includes("nsig") || msg.includes("SABR") || msg.includes("format");
      res.status(400).json({
        error: "download_failed",
        message: isYtError
          ? "This video cannot be downloaded due to platform restrictions. Try a different quality."
          : "Download failed. Please try again.",
      });
    }
  }
});

export default router;
