import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download, Facebook, Music, Video, Sparkles,
  Link as LinkIcon, CheckCircle2, History, Trash2, ShieldCheck,
  Search, Clock, Eye, X, ArrowDown
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useGetVideoInfo,
  useStartDownload,
  useSearchVideos,
} from "@workspace/api-client-react";
import type { VideoInfo, VideoFormat, SearchResult } from "@workspace/api-client-react/src/generated/api.schemas";
import { useDownloadHistory } from "@/hooks/use-history";

/* ─── tiny helpers ─────────────────────────────────────────── */
const Btn = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" }
>(({ className = "", variant = "primary", ...props }, ref) => {
  const base = "inline-flex items-center justify-center font-bold rounded-xl transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:pointer-events-none active:scale-95";
  const v = {
    primary: "bg-gradient-to-r from-primary to-[#00d0d0] text-black shadow-[0_0_20px_rgba(0,255,255,0.3)] hover:shadow-[0_0_30px_rgba(0,255,255,0.5)] border border-primary/50",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-white/5",
    outline: "border-2 border-primary/50 text-primary hover:bg-primary/10",
    ghost: "text-muted-foreground hover:text-foreground hover:bg-white/5",
    danger: "text-red-400 hover:text-red-300 hover:bg-red-500/10",
  };
  return <button ref={ref} className={`${base} ${v[variant]} ${className}`} {...props} />;
});
Btn.displayName = "Btn";

function fmtDur(s?: number | null) {
  if (!s) return null;
  const m = Math.floor(s / 60), sec = s % 60;
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

/* ─── Download Bottom Sheet ─────────────────────────────────── */
interface SheetProps {
  open: boolean;
  onClose: () => void;
  videoInfo: VideoInfo | null;
  isLoadingInfo: boolean;
  onDownload: (formatId: string, type: "video" | "audio") => void;
  isDownloading: boolean;
}
function DownloadSheet({ open, onClose, videoInfo, isLoadingInfo, onDownload, isDownloading }: SheetProps) {
  const [tab, setTab] = useState<"video" | "audio">("video");
  const [selectedId, setSelectedId] = useState("");

  const formats: VideoFormat[] = videoInfo?.formats.filter(f => f.type === tab) || [];

  useEffect(() => {
    if (videoInfo) {
      const vids = videoInfo.formats.filter(f => f.type === "video");
      if (vids.length) { setTab("video"); setSelectedId(vids[0].id); }
      else if (videoInfo.formats.length) { setTab("audio"); setSelectedId(videoInfo.formats[0].id); }
    }
  }, [videoInfo]);

  useEffect(() => {
    if (formats.length && !formats.find(f => f.id === selectedId)) setSelectedId(formats[0].id);
  }, [tab, formats, selectedId]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          {/* Sheet */}
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-[#111] border-t border-white/10 shadow-2xl max-w-2xl mx-auto"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {isLoadingInfo ? (
              <div className="flex flex-col items-center py-12 gap-4">
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-muted-foreground text-sm">Fetching video info…</p>
              </div>
            ) : videoInfo ? (
              <div className="px-5 pb-8 pt-2">
                {/* Video preview row */}
                <div className="flex gap-3 mb-5">
                  <div className="w-20 h-14 rounded-xl overflow-hidden bg-black/60 shrink-0">
                    {videoInfo.thumbnail
                      ? <img src={videoInfo.thumbnail} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Video className="w-5 h-5 text-muted-foreground" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-sm line-clamp-2 leading-snug">{videoInfo.title}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className="px-2 py-0.5 rounded-full bg-white/10 font-medium">{videoInfo.platform}</span>
                      {videoInfo.duration && <span>{fmtDur(videoInfo.duration)}</span>}
                    </div>
                  </div>
                  <button onClick={onClose} className="shrink-0 text-muted-foreground hover:text-white"><X className="w-5 h-5" /></button>
                </div>

                {/* Tabs */}
                <div className="flex p-1 bg-black/40 rounded-xl mb-4 border border-white/5">
                  {(["video", "audio"] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${tab === t ? "bg-white/10 text-white shadow" : "text-muted-foreground"}`}>
                      {t === "video" ? <Video className="w-4 h-4" /> : <Music className="w-4 h-4" />}
                      {t === "video" ? "Video" : "Audio"}
                    </button>
                  ))}
                </div>

                {/* Quality grid */}
                <div className="grid grid-cols-2 gap-2 mb-5">
                  {formats.length > 0 ? formats.map(fmt => (
                    <button key={fmt.id} onClick={() => setSelectedId(fmt.id)}
                      className={`flex flex-col text-left p-3 rounded-xl border transition-all ${selectedId === fmt.id ? "border-primary bg-primary/15 shadow-[0_0_12px_rgba(0,255,255,0.2)]" : "border-white/10 bg-white/5 hover:border-white/25"}`}>
                      <span className="font-bold text-white text-sm">{fmt.label}</span>
                      <span className="text-xs text-muted-foreground mt-0.5">{fmt.ext.toUpperCase()}{fmt.filesize ? ` · ${(fmt.filesize / 1024 / 1024).toFixed(1)} MB` : ""}</span>
                    </button>
                  )) : (
                    <div className="col-span-2 py-4 text-center text-muted-foreground text-sm bg-white/5 rounded-xl border border-white/5">
                      No {tab} formats available
                    </div>
                  )}
                </div>

                {/* Download button */}
                <Btn onClick={() => { if (selectedId) onDownload(selectedId, tab); }} disabled={isDownloading || !selectedId || formats.length === 0} className="w-full h-13 text-base py-3.5">
                  {isDownloading
                    ? <><span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin mr-2" />Processing…</>
                    : <><Download className="w-5 h-5 mr-2" />Download {tab === "video" ? "Video" : "Audio"}</>}
                </Btn>
                <p className="text-center text-xs text-muted-foreground mt-2">No watermarks • Free forever</p>
              </div>
            ) : null}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function Home() {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"downloader" | "history">("downloader");

  // Bottom-sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetVideoInfo, setSheetVideoInfo] = useState<VideoInfo | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { toast } = useToast();
  const { history, addHistoryItem, clearHistory } = useDownloadHistory();

  const { mutate: searchVideos, data: searchResults, isPending: isSearching } = useSearchVideos({ mutation: {} });

  // Fetch info for the sheet
  const { mutate: fetchInfoForSheet, isPending: isLoadingSheet } = useGetVideoInfo({
    mutation: {
      onSuccess: (data) => {
        setSheetVideoInfo(data);
      },
      onError: () => {
        toast({ variant: "destructive", title: "Error", description: "Could not fetch video info. Please try again." });
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
        toast({ title: "Download Started!", description: "Your file is downloading to your device." });
        // Trigger browser download
        const a = document.createElement("a");
        a.href = data.downloadUrl;
        a.download = data.filename || "download";
        a.target = "_blank";
        a.rel = "noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Auto-close sheet after short delay
        setTimeout(() => setSheetOpen(false), 800);
      },
      onError: (err) => {
        toast({ variant: "destructive", title: "Download Failed", description: (err as Error).message || "Something went wrong." });
      },
    },
  });

  const openSheet = useCallback((url: string) => {
    setPendingUrl(url);
    setSheetVideoInfo(null);
    setSheetOpen(true);
    fetchInfoForSheet({ data: { url } });
  }, [fetchInfoForSheet]);

  const handleSheetDownload = (formatId: string, type: "video" | "audio") => {
    if (!sheetVideoInfo) return;
    startDownload({ data: { url: sheetVideoInfo.originalUrl, formatId, type } });
  };

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
    if (isUrl(inputValue)) {
      setShowSuggestions(false);
      openSheet(inputValue.trim());
    } else {
      triggerSearch(inputValue.trim());
    }
  };

  const handleSuggestionDownload = (e: React.MouseEvent, result: SearchResult) => {
    e.stopPropagation();
    setShowSuggestions(false);
    openSheet(result.url);
  };

  const handleSuggestionRowClick = (result: SearchResult) => {
    setInputValue(result.url);
    setShowSuggestions(false);
    openSheet(result.url);
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

  return (
    <div className="h-screen flex flex-col overflow-hidden relative">
      {/* BG */}
      <div className="absolute inset-0 pointer-events-none -z-10 opacity-25 mix-blend-screen">
        <img src={`${import.meta.env.BASE_URL}images/bg-glow.png`} alt="" className="w-full h-full object-cover" />
      </div>

      {/* ── NAV ── */}
      <nav className="shrink-0 glass-panel-heavy border-b border-white/5 rounded-none px-4 py-2.5 z-30">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-[0_0_12px_rgba(0,255,255,0.4)]">
              <Download className="w-4 h-4 text-black" />
            </div>
            <span className="text-xl font-display font-bold text-white">
              Shourov <span className="text-primary">Hub</span>
            </span>
          </div>

          {/* Tab buttons (center-ish) */}
          <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/10">
            <button onClick={() => setActiveTab("downloader")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === "downloader" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}>
              Downloader
            </button>
            <button onClick={() => setActiveTab("history")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${activeTab === "history" ? "bg-accent/20 text-accent" : "text-muted-foreground"}`}>
              <History className="w-3.5 h-3.5" />
              History
              {history.length > 0 && <span className="bg-accent text-black text-[10px] font-black px-1.5 rounded-full">{history.length}</span>}
            </button>
          </div>

          {/* Profile */}
          <div className="flex flex-col items-center">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-accent rounded-full opacity-70 group-hover:opacity-100 transition duration-300 blur-sm" />
              <img src="https://i.postimg.cc/mkJ1J1pz/IMG-8020.jpg" alt="Shourov"
                className="relative w-9 h-9 rounded-full object-cover border-2 border-background" />
            </div>
            <span className="text-[9px] text-muted-foreground mt-0.5 font-medium whitespace-nowrap leading-none">
              Developer Alihsan Shourov
            </span>
          </div>
        </div>
      </nav>

      {/* ── CONTENT (fills remaining height, no scroll on downloader) ── */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">

          {/* ══ DOWNLOADER TAB ══ */}
          {activeTab === "downloader" && (
            <motion.div key="dl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
              className="h-full flex flex-col items-center justify-center px-4 pb-4">

              {/* Compact Hero */}
              <div className="text-center mb-6 max-w-lg">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full glass-panel mb-3 border-primary/20 text-xs font-semibold text-primary">
                  <Sparkles className="w-3 h-3" />
                  The Ultimate Social Media Downloader
                </div>
                <h1 className="text-3xl sm:text-4xl font-display font-extrabold leading-tight mb-2">
                  Download Any Video.<br />
                  <span className="text-gradient-primary">Zero Watermarks.</span>
                </h1>
                <p className="text-sm text-muted-foreground">
                  TikTok · Facebook · YouTube · Instagram · Twitter and more
                </p>
              </div>

              {/* Search Box + Dropdown */}
              <div className="w-full max-w-lg relative mb-4">
                <form onSubmit={handleSubmit} className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-2xl opacity-20 group-focus-within:opacity-40 transition duration-500 blur-lg" />
                  <div className="relative flex items-center bg-card/80 backdrop-blur-xl border border-white/10 rounded-2xl px-3 py-2 shadow-2xl gap-2">
                    {isUrl(inputValue)
                      ? <LinkIcon className="w-5 h-5 text-primary shrink-0" />
                      : <Search className="w-5 h-5 text-muted-foreground shrink-0" />}
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputValue}
                      onChange={handleInputChange}
                      onFocus={() => !isUrl(inputValue) && suggestions.length > 0 && setShowSuggestions(true)}
                      placeholder="Search videos or paste a link..."
                      className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-sm focus:outline-none h-11"
                      autoComplete="off"
                    />
                    {inputValue && (
                      <button type="button" onClick={() => { setInputValue(""); setShowSuggestions(false); }}
                        className="text-muted-foreground hover:text-white shrink-0"><X className="w-4 h-4" /></button>
                    )}
                    <Btn type="submit" className="shrink-0 h-10 px-5 text-sm">
                      {isLoadingSheet || isSearching
                        ? <span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                        : isUrl(inputValue) ? <><Download className="w-4 h-4 mr-1" />Get</> : <><Search className="w-4 h-4 mr-1" />Search</>}
                    </Btn>
                  </div>
                </form>

                {/* Suggestions dropdown */}
                <AnimatePresence>
                  {showSuggestions && suggestions.length > 0 && (
                    <motion.div
                      ref={suggestionsRef}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 right-0 top-full mt-2 z-50 glass-panel rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
                    >
                      <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
                          Results for "{searchQuery}"
                        </span>
                        <button onClick={() => setShowSuggestions(false)} className="text-muted-foreground hover:text-white">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="max-h-[55vh] overflow-y-auto custom-scrollbar">
                        {suggestions.map((r) => (
                          <div key={r.id}
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 cursor-pointer"
                            onClick={() => handleSuggestionRowClick(r)}>
                            {/* Thumbnail */}
                            <div className="relative shrink-0 w-20 h-12 rounded-lg overflow-hidden bg-black/40">
                              {r.thumbnail
                                ? <img src={r.thumbnail} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center"><Video className="w-4 h-4 text-muted-foreground" /></div>}
                              {r.duration && (
                                <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-white text-[9px] font-mono px-1 rounded">
                                  {fmtDur(r.duration)}
                                </span>
                              )}
                            </div>
                            {/* Meta */}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-white line-clamp-2 leading-snug">{r.title}</p>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground">
                                {r.uploader && <span>{r.uploader}</span>}
                                {r.viewCount && <><span>·</span><span className="flex items-center gap-0.5"><Eye className="w-2.5 h-2.5" />{fmtViews(r.viewCount)}</span></>}
                              </div>
                            </div>
                            {/* Download icon — opens sheet */}
                            <button
                              onClick={(e) => handleSuggestionDownload(e, r)}
                              className="shrink-0 w-9 h-9 rounded-xl border border-primary/30 bg-primary/10 flex items-center justify-center text-primary hover:bg-primary hover:text-black transition-all active:scale-90"
                              title="Download"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Trust badges */}
              <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
                {["100% Free", "No Watermarks", "HD / 4K Quality", "MP3 Extract"].map(b => (
                  <span key={b} className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary" />{b}
                  </span>
                ))}
              </div>

              {/* Supported platforms row */}
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {["YouTube", "TikTok", "Facebook", "Instagram", "Twitter/X", "Vimeo"].map(p => (
                  <span key={p} className="text-xs px-3 py-1 rounded-full bg-white/5 border border-white/10 text-muted-foreground">{p}</span>
                ))}
              </div>

              {/* Footer contact (compact) */}
              <div className="mt-6 flex flex-col items-center gap-2">
                <p className="text-xs text-muted-foreground">If you have any problem, please contact us</p>
                <div className="flex gap-3">
                  <a href="https://www.facebook.com/profile.php?id=61588161951831" target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1877F2]/10 border border-[#1877F2]/30 text-[#1877F2] text-xs font-bold hover:bg-[#1877F2] hover:text-white transition-all">
                    <Facebook className="w-4 h-4" /> Facebook
                  </a>
                  <a href="https://wa.me/8801709281334" target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] text-xs font-bold hover:bg-[#25D366] hover:text-white transition-all">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    WhatsApp
                  </a>
                </div>
              </div>
            </motion.div>
          )}

          {/* ══ HISTORY TAB ══ */}
          {activeTab === "history" && (
            <motion.div key="hist" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
              className="h-full overflow-y-auto custom-scrollbar px-4 py-5">
              <div className="max-w-lg mx-auto">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-xl font-display font-bold flex items-center gap-2">
                    <History className="w-5 h-5 text-accent" /> Download History
                  </h2>
                  {history.length > 0 && (
                    <Btn variant="danger" className="h-8 px-3 text-xs" onClick={clearHistory}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear All
                    </Btn>
                  )}
                </div>

                {history.length === 0 ? (
                  <div className="flex flex-col items-center py-20 text-muted-foreground">
                    <Clock className="w-12 h-12 mb-3 opacity-20" />
                    <p className="font-medium mb-1">No downloads yet</p>
                    <p className="text-sm">Your history will appear here.</p>
                    <Btn variant="outline" className="mt-5 h-9 px-5 text-sm" onClick={() => setActiveTab("downloader")}>
                      Start Downloading
                    </Btn>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {history.map(item => (
                      <motion.div key={item.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                        className="bg-white/5 rounded-2xl p-3.5 flex gap-3 items-center border border-white/5 hover:bg-white/8 transition-colors group">
                        <div className="w-16 h-11 rounded-lg overflow-hidden bg-black/40 shrink-0">
                          {item.thumbnail
                            ? <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><Video className="w-4 h-4 text-muted-foreground" /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white text-sm line-clamp-1">{item.title}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                            <span className="px-1.5 py-0.5 rounded-full bg-white/10">{item.platform}</span>
                            <span>·</span>
                            <span>{item.format}</span>
                            <span>·</span>
                            <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => { setInputValue(item.url); setActiveTab("downloader"); openSheet(item.url); }}
                          className="shrink-0 w-8 h-8 rounded-xl border border-white/10 bg-white/5 hover:bg-primary/20 hover:border-primary/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-all opacity-0 group-hover:opacity-100"
                          title="Download again"
                        >
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

      {/* ── DOWNLOAD BOTTOM SHEET ── */}
      <DownloadSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        videoInfo={sheetVideoInfo}
        isLoadingInfo={isLoadingSheet}
        onDownload={handleSheetDownload}
        isDownloading={isDownloading}
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); border-radius: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
}
