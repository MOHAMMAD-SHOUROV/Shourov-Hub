import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download, Facebook, Music, Video, Sparkles, Play,
  Link as LinkIcon, CheckCircle2, History, Trash2,
  Search, Clock, Eye, X, Maximize2, Volume2, VolumeX,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useStartDownload, useSearchVideos, useGetVideoInfo } from "@workspace/api-client-react";
import type { VideoInfo, VideoFormat, SearchResult } from "@workspace/api-client-react/src/generated/api.schemas";
import { useDownloadHistory } from "@/hooks/use-history";

/* ─── helpers ─────────────────────────────────────────────── */
const Btn = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
    size?: "sm" | "md" | "lg";
  }
>(({ className = "", variant = "primary", size = "md", ...props }, ref) => {
  const base = "inline-flex items-center justify-center font-bold rounded-xl transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:pointer-events-none active:scale-[0.97]";
  const v = {
    primary: "bg-gradient-to-r from-primary to-[#00d0d0] text-black shadow-[0_0_18px_rgba(0,255,255,0.3)] hover:shadow-[0_0_28px_rgba(0,255,255,0.5)]",
    secondary: "bg-white/10 text-white hover:bg-white/15 border border-white/10",
    outline: "border border-primary/50 text-primary hover:bg-primary/10",
    ghost: "text-muted-foreground hover:text-foreground hover:bg-white/5",
    danger: "text-red-400 hover:text-red-300 hover:bg-red-500/10",
  };
  const s = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" };
  return <button ref={ref} className={`${base} ${v[variant]} ${s[size]} ${className}`} {...props} />;
});
Btn.displayName = "Btn";

function fmtDur(s?: number | null) {
  if (!s) return null;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function fmtViews(n?: number | null) {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function isUrl(s: string) {
  return /^https?:\/\//i.test(s.trim()) || /^www\./i.test(s.trim());
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/\s]{11})/);
  return m ? m[1] : null;
}

function isYouTube(url: string) {
  return url.includes("youtube.com") || url.includes("youtu.be");
}

/* ─── Video Player ──────────────────────────────────────────── */
function VideoPlayer({ url, title, thumbnail, platform }: {
  url: string; title: string; thumbnail?: string | null; platform: string;
}) {
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [loadingStream, setLoadingStream] = useState(false);

  const goFullscreen = () => {
    const el = playerRef.current;
    if (!el) return;
    if (el.requestFullscreen) el.requestFullscreen();
    else if ((el as unknown as { webkitRequestFullscreen?: () => void }).webkitRequestFullscreen)
      (el as unknown as { webkitRequestFullscreen: () => void }).webkitRequestFullscreen();
  };

  const handlePlay = async () => {
    if (isYouTube(url)) { setPlaying(true); return; }
    setLoadingStream(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/download/stream`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }),
      });
      const data = await res.json() as { streamUrl?: string };
      if (data.streamUrl) { setStreamUrl(data.streamUrl); setPlaying(true); }
    } catch { /* ignore */ }
    setLoadingStream(false);
  };

  if (isYouTube(url)) {
    const vid = extractYouTubeId(url);
    return (
      <div ref={playerRef} className="relative w-full bg-black rounded-xl overflow-hidden" style={{ aspectRatio: "16/9" }}>
        {playing && vid ? (
          <iframe
            src={`https://www.youtube.com/embed/${vid}?autoplay=1&rel=0&modestbranding=1`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0"
            title={title}
          />
        ) : (
          <div className="relative w-full h-full">
            {thumbnail && <img src={thumbnail} alt={title} className="w-full h-full object-cover opacity-80" />}
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <button onClick={handlePlay}
                className="w-16 h-16 rounded-full bg-primary flex items-center justify-center shadow-[0_0_30px_rgba(0,255,255,0.5)] hover:scale-110 transition-transform">
                <Play className="w-7 h-7 text-black ml-1" />
              </button>
            </div>
          </div>
        )}
        <button onClick={goFullscreen} className="absolute top-2 right-2 z-10 w-8 h-8 rounded-lg bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors">
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={playerRef} className="relative w-full bg-black rounded-xl overflow-hidden" style={{ aspectRatio: "16/9" }}>
      {playing && streamUrl ? (
        <>
          <video
            ref={videoRef}
            src={streamUrl}
            controls
            autoPlay
            muted={muted}
            className="w-full h-full"
            crossOrigin="anonymous"
          />
          <div className="absolute top-2 right-2 flex gap-1 z-10">
            <button onClick={() => { setMuted(m => !m); }}
              className="w-8 h-8 rounded-lg bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors">
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button onClick={goFullscreen}
              className="w-8 h-8 rounded-lg bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors">
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </>
      ) : (
        <div className="relative w-full h-full">
          {thumbnail && <img src={thumbnail} alt={title} className="w-full h-full object-cover opacity-80" />}
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            {loadingStream ? (
              <div className="w-12 h-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            ) : (
              <button onClick={handlePlay}
                className="w-16 h-16 rounded-full bg-primary flex items-center justify-center shadow-[0_0_30px_rgba(0,255,255,0.5)] hover:scale-110 transition-transform">
                <Play className="w-7 h-7 text-black ml-1" />
              </button>
            )}
          </div>
          <button onClick={goFullscreen} className="absolute top-2 right-2 z-10 w-8 h-8 rounded-lg bg-black/60 flex items-center justify-center text-white">
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Download Sheet ────────────────────────────────────────── */
interface SheetProps {
  open: boolean;
  onClose: () => void;
  videoInfo: VideoInfo | null;
  isLoadingInfo: boolean;
  onDownload: (formatId: string, type: "video" | "audio") => void;
  isDownloading: boolean;
  pendingUrl: string | null;
}

function DownloadSheet({ open, onClose, videoInfo, isLoadingInfo, onDownload, isDownloading, pendingUrl }: SheetProps) {
  const [tab, setTab] = useState<"video" | "audio">("video");
  const [selectedId, setSelectedId] = useState("");
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (videoInfo) {
      const vids = videoInfo.formats.filter(f => f.type === "video");
      if (vids.length) { setTab("video"); setSelectedId(vids[0].id); }
      else if (videoInfo.formats.length) { setTab("audio"); setSelectedId(videoInfo.formats[0].id); }
    }
  }, [videoInfo]);

  const formats: VideoFormat[] = videoInfo?.formats.filter(f => f.type === tab) || [];
  useEffect(() => {
    if (formats.length && !formats.find(f => f.id === selectedId)) setSelectedId(formats[0].id);
  }, [tab, formats, selectedId]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="bd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }} className="fixed inset-0 bg-black/75 backdrop-blur-sm z-40"
            onClick={onClose} />

          <motion.div key="sh" ref={sheetRef}
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto bg-[#0e0e14] border-t border-white/10 rounded-t-3xl shadow-2xl"
            style={{ maxHeight: "92vh", overflowY: "auto" }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2 sticky top-0 bg-[#0e0e14] z-10">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {isLoadingInfo ? (
              <div className="flex flex-col items-center py-16 gap-4">
                <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-muted-foreground text-sm">Loading video info…</p>
              </div>
            ) : videoInfo && pendingUrl ? (
              <div className="px-4 pb-10">
                {/* Close */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-sm line-clamp-2 leading-snug">{videoInfo.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] px-2 py-0.5 bg-white/10 rounded-full text-muted-foreground font-medium">{videoInfo.platform}</span>
                      {videoInfo.duration && <span className="text-[11px] text-muted-foreground">{fmtDur(videoInfo.duration)}</span>}
                    </div>
                  </div>
                  <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-muted-foreground hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* ── VIDEO PLAYER ── */}
                <div className="mb-4">
                  <VideoPlayer
                    url={pendingUrl}
                    title={videoInfo.title}
                    thumbnail={videoInfo.thumbnail}
                    platform={videoInfo.platform}
                  />
                </div>

                {/* Format tabs */}
                <div className="flex p-1 bg-black/40 rounded-xl mb-3 border border-white/5">
                  {(["video", "audio"] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${tab === t ? "bg-white/10 text-white shadow" : "text-muted-foreground"}`}>
                      {t === "video" ? <Video className="w-4 h-4" /> : <Music className="w-4 h-4" />}
                      {t === "video" ? "Video" : "Audio"}
                    </button>
                  ))}
                </div>

                {/* Quality grid */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {formats.length > 0 ? formats.map(fmt => (
                    <button key={fmt.id} onClick={() => setSelectedId(fmt.id)}
                      className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                        selectedId === fmt.id
                          ? "border-primary bg-primary/15 shadow-[0_0_12px_rgba(0,255,255,0.2)]"
                          : "border-white/8 bg-white/5 hover:border-white/20"
                      }`}>
                      <span className="font-bold text-white text-sm">{fmt.label}</span>
                      <span className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">
                        {fmt.ext}{fmt.filesize ? ` · ${(fmt.filesize / 1024 / 1024).toFixed(0)} MB` : ""}
                      </span>
                    </button>
                  )) : (
                    <div className="col-span-2 py-6 text-center text-muted-foreground text-sm bg-white/5 rounded-xl border border-white/5">
                      No {tab} formats available
                    </div>
                  )}
                </div>

                <Btn variant="primary" size="lg" className="w-full"
                  onClick={() => { if (selectedId) onDownload(selectedId, tab); }}
                  disabled={isDownloading || !selectedId || formats.length === 0}>
                  {isDownloading
                    ? <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin mr-2" />Preparing…</>
                    : <><Download className="w-5 h-5 mr-2" />Download {tab === "video" ? "Video" : "Audio"}</>}
                </Btn>
                <p className="text-center text-[11px] text-muted-foreground mt-2">No watermark · Free forever</p>
              </div>
            ) : null}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─── Main ──────────────────────────────────────────────────── */
export default function Home() {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"downloader" | "history">("downloader");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetVideoInfo, setSheetVideoInfo] = useState<VideoInfo | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { toast } = useToast();
  const { history, addHistoryItem, clearHistory } = useDownloadHistory();

  const { mutate: searchVideos, data: searchResults, isPending: isSearching } = useSearchVideos({ mutation: {} });

  const { mutate: fetchInfoForSheet, isPending: isLoadingSheet } = useGetVideoInfo({
    mutation: {
      onSuccess: (data) => setSheetVideoInfo(data),
      onError: () => {
        toast({ variant: "destructive", title: "Error", description: "Could not load video. Try again." });
        setSheetOpen(false);
      },
    },
  });

  const { mutate: startDownload, isPending: isDownloading } = useStartDownload({
    mutation: {
      onSuccess: (data) => {
        if (sheetVideoInfo) {
          addHistoryItem({
            title: sheetVideoInfo.title,
            platform: sheetVideoInfo.platform,
            thumbnail: sheetVideoInfo.thumbnail,
            url: sheetVideoInfo.originalUrl,
            format: data.filename || "download",
          });
        }
        toast({ title: "Download Started!", description: "File is saving to your device." });
        const a = document.createElement("a");
        a.href = data.downloadUrl;
        a.download = data.filename || "download";
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => setSheetOpen(false), 900);
      },
      onError: (err) => {
        toast({ variant: "destructive", title: "Download Failed", description: (err as Error).message || "Try again." });
      },
    },
  });

  const openSheet = useCallback((url: string) => {
    setPendingUrl(url);
    setSheetVideoInfo(null);
    setSheetOpen(true);
    fetchInfoForSheet({ data: { url } });
  }, [fetchInfoForSheet]);

  const triggerSearch = useCallback((q: string) => {
    if (q.trim().length < 2) return;
    setSearchQuery(q);
    searchVideos({ data: { query: q, limit: 10 } });
    setShowSuggestions(true);
  }, [searchVideos]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!isUrl(val) && val.trim().length >= 2) {
      debounceRef.current = setTimeout(() => triggerSearch(val.trim()), 400);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    if (isUrl(inputValue)) { setShowSuggestions(false); openSheet(inputValue.trim()); }
    else triggerSearch(inputValue.trim());
  };

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (suggestionsRef.current?.contains(e.target as Node) || inputRef.current?.contains(e.target as Node)) return;
      setShowSuggestions(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const suggestions: SearchResult[] = searchResults?.results || [];

  const platforms = ["YouTube", "TikTok", "Facebook", "Instagram", "Twitter/X", "Vimeo"];

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#080810]">
      {/* Ambient bg */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/8 blur-[100px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-accent/6 blur-[120px] rounded-full" />
      </div>

      {/* ── NAV ── */}
      <nav className="relative z-30 flex items-center justify-between px-4 py-3 border-b border-white/5 bg-black/30 backdrop-blur-xl shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Download className="w-4 h-4 text-black" />
          </div>
          <span className="text-lg font-display font-bold text-white">
            Shourov <span className="text-primary">Hub</span>
          </span>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 bg-white/5 rounded-xl p-1 border border-white/8">
          <button onClick={() => setActiveTab("downloader")}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${activeTab === "downloader" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-white"}`}>
            Downloader
          </button>
          <button onClick={() => setActiveTab("history")}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${activeTab === "history" ? "bg-accent/20 text-accent" : "text-muted-foreground hover:text-white"}`}>
            <History className="w-3 h-3" />
            History
            {history.length > 0 && (
              <span className="bg-accent text-black text-[9px] font-black px-1.5 rounded-full leading-[1.6]">{history.length}</span>
            )}
          </button>
        </div>

        {/* Profile */}
        <div className="flex flex-col items-center shrink-0">
          <div className="relative group cursor-pointer">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-accent rounded-full opacity-60 blur-sm" />
            <img src="https://i.postimg.cc/mkJ1J1pz/IMG-8020.jpg" alt="Shourov"
              className="relative w-9 h-9 rounded-full object-cover border-2 border-[#080810]" />
          </div>
          <p className="text-[8px] text-muted-foreground mt-0.5 whitespace-nowrap">Dev. Alihsan Shourov</p>
        </div>
      </nav>

      {/* ── CONTENT ── */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">

          {/* ══ DOWNLOADER ══ */}
          {activeTab === "downloader" && (
            <motion.div key="dl" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 flex flex-col items-stretch px-4 pt-8 pb-4">

              {/* Hero */}
              <div className="text-center mb-6 flex-shrink-0">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] font-semibold text-primary mb-3">
                  <Sparkles className="w-3 h-3" />
                  The Ultimate Social Media Downloader
                </div>
                <h1 className="text-[28px] sm:text-4xl font-display font-extrabold text-white leading-tight">
                  Download Any Video<br />
                  <span className="bg-gradient-to-r from-primary to-pink-400 bg-clip-text text-transparent">Zero Watermarks</span>
                </h1>
                <p className="text-xs text-muted-foreground mt-2">
                  TikTok · YouTube · Facebook · Instagram · Twitter/X & more
                </p>
              </div>

              {/* Search Box */}
              <div className="flex-shrink-0 relative mb-3">
                <form onSubmit={handleSubmit}>
                  <div className="flex items-center bg-white/5 border border-white/12 rounded-2xl px-3 py-2 gap-2 focus-within:border-primary/40 focus-within:bg-white/8 transition-all shadow-lg">
                    {isUrl(inputValue)
                      ? <LinkIcon className="w-4 h-4 text-primary shrink-0" />
                      : <Search className="w-4 h-4 text-muted-foreground shrink-0" />}
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputValue}
                      onChange={handleInputChange}
                      onFocus={() => !isUrl(inputValue) && suggestions.length > 0 && setShowSuggestions(true)}
                      placeholder="Search or paste video link..."
                      className="flex-1 bg-transparent text-white placeholder:text-muted-foreground text-sm focus:outline-none h-10"
                      autoComplete="off"
                      autoCorrect="off"
                    />
                    {inputValue && (
                      <button type="button" onClick={() => { setInputValue(""); setShowSuggestions(false); }}
                        className="text-muted-foreground hover:text-white shrink-0">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                    <Btn type="submit" size="sm" className="shrink-0 h-9 px-4">
                      {isLoadingSheet || isSearching
                        ? <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        : isUrl(inputValue) ? <><Download className="w-3.5 h-3.5 mr-1" />Get</> : <><Search className="w-3.5 h-3.5 mr-1" />Search</>}
                    </Btn>
                  </div>
                </form>

                {/* Dropdown */}
                <AnimatePresence>
                  {showSuggestions && suggestions.length > 0 && (
                    <motion.div ref={suggestionsRef}
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#111118] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                          "{searchQuery}" results
                        </span>
                        <button onClick={() => setShowSuggestions(false)} className="text-muted-foreground hover:text-white">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="max-h-[52vh] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                        {suggestions.map((r) => (
                          <div key={r.id}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 cursor-pointer group"
                            onClick={() => { setShowSuggestions(false); openSheet(r.url); }}>
                            {/* Thumb */}
                            <div className="relative shrink-0 w-[72px] h-[42px] rounded-lg overflow-hidden bg-black/60">
                              {r.thumbnail
                                ? <img src={r.thumbnail} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center"><Video className="w-4 h-4 text-muted-foreground/40" /></div>}
                              {r.duration && (
                                <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-white text-[8px] font-mono px-1 rounded leading-tight">{fmtDur(r.duration)}</span>
                              )}
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-white line-clamp-2 leading-snug">{r.title}</p>
                              <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                                {r.uploader && <span className="truncate max-w-[100px]">{r.uploader}</span>}
                                {r.viewCount && <><span>·</span><span className="flex items-center gap-0.5"><Eye className="w-2.5 h-2.5" />{fmtViews(r.viewCount)}</span></>}
                              </div>
                            </div>
                            {/* Download icon */}
                            <button
                              onClick={(e) => { e.stopPropagation(); setShowSuggestions(false); openSheet(r.url); }}
                              className="shrink-0 w-8 h-8 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary hover:bg-primary hover:text-black transition-all active:scale-90">
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Badges */}
              <div className="flex-shrink-0 flex flex-wrap justify-center gap-x-4 gap-y-1 mb-4">
                {["100% Free", "No Watermarks", "HD Quality", "MP3 Extract"].map(b => (
                  <span key={b} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <CheckCircle2 className="w-3 h-3 text-primary" />{b}
                  </span>
                ))}
              </div>

              {/* Platforms */}
              <div className="flex-shrink-0 flex flex-wrap justify-center gap-2 mb-5">
                {platforms.map(p => (
                  <span key={p} className="text-[11px] px-3 py-1 rounded-full bg-white/5 border border-white/8 text-muted-foreground">{p}</span>
                ))}
              </div>

              {/* Contact */}
              <div className="flex-shrink-0 flex flex-col items-center gap-2 mt-auto">
                <p className="text-[11px] text-muted-foreground">Problem? Contact us:</p>
                <div className="flex gap-2.5">
                  <a href="https://www.facebook.com/profile.php?id=61588161951831" target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1877F2]/10 border border-[#1877F2]/25 text-[#1877F2] text-xs font-bold hover:bg-[#1877F2] hover:text-white transition-all">
                    <Facebook className="w-3.5 h-3.5" /> Facebook
                  </a>
                  <a href="https://wa.me/8801709281334" target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#25D366]/10 border border-[#25D366]/25 text-[#25D366] text-xs font-bold hover:bg-[#25D366] hover:text-white transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    WhatsApp
                  </a>
                </div>
              </div>
            </motion.div>
          )}

          {/* ══ HISTORY ══ */}
          {activeTab === "history" && (
            <motion.div key="hist" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 overflow-y-auto px-4 py-5">
              <div className="max-w-lg mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold flex items-center gap-2 text-white">
                    <History className="w-5 h-5 text-accent" /> Download History
                  </h2>
                  {history.length > 0 && (
                    <Btn variant="danger" size="sm" onClick={clearHistory}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear
                    </Btn>
                  )}
                </div>

                {history.length === 0 ? (
                  <div className="flex flex-col items-center py-20 text-muted-foreground">
                    <Clock className="w-14 h-14 mb-4 opacity-10" />
                    <p className="font-semibold mb-1 text-white/60">No downloads yet</p>
                    <p className="text-sm text-center">Your download history will appear here after you download a video.</p>
                    <Btn variant="outline" size="sm" className="mt-6" onClick={() => setActiveTab("downloader")}>
                      Start Downloading
                    </Btn>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {history.map(item => (
                      <motion.div key={item.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                        className="flex gap-3 items-center bg-white/5 rounded-2xl p-3 border border-white/5 hover:bg-white/8 transition-colors group">
                        <div className="w-[60px] h-[38px] rounded-lg overflow-hidden bg-black/60 shrink-0">
                          {item.thumbnail
                            ? <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><Video className="w-4 h-4 text-muted-foreground/30" /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white text-xs line-clamp-1">{item.title}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                            <span className="px-1.5 py-0.5 rounded-full bg-white/10">{item.platform}</span>
                            <span>·</span>
                            <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => { setActiveTab("downloader"); openSheet(item.url); }}
                          className="shrink-0 w-8 h-8 rounded-xl border border-white/10 bg-white/5 hover:bg-primary/20 hover:border-primary/40 flex items-center justify-center text-muted-foreground hover:text-primary transition-all opacity-0 group-hover:opacity-100">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── SHEET ── */}
      <DownloadSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        videoInfo={sheetVideoInfo}
        isLoadingInfo={isLoadingSheet}
        onDownload={(fmtId, type) => {
          if (!sheetVideoInfo) return;
          startDownload({ data: { url: sheetVideoInfo.originalUrl, formatId: fmtId, type } });
        }}
        isDownloading={isDownloading}
        pendingUrl={pendingUrl}
      />
    </div>
  );
}
