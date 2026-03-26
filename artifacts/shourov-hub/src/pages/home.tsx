import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download, Facebook, Music, Video, Sparkles,
  Link as LinkIcon, CheckCircle2, History, Trash2, Smartphone, ShieldCheck,
  Search, Clock, Eye, X, ChevronDown
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useGetVideoInfo,
  useStartDownload,
  useSearchVideos,
} from "@workspace/api-client-react";
import type { VideoInfo, VideoFormat, SearchResult } from "@workspace/api-client-react/src/generated/api.schemas";
import { useDownloadHistory } from "@/hooks/use-history";

const Btn = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "outline" | "ghost" }
>(({ className = "", variant = "primary", ...props }, ref) => {
  const base = "inline-flex items-center justify-center font-bold rounded-xl transition-all duration-300 focus:outline-none disabled:opacity-50 disabled:pointer-events-none active:scale-95";
  const variants = {
    primary: "bg-gradient-to-r from-primary to-[#00d0d0] text-primary-foreground shadow-[0_0_20px_rgba(0,255,255,0.3)] hover:shadow-[0_0_30px_rgba(0,255,255,0.5)] border border-primary/50",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-white/5",
    outline: "border-2 border-primary/50 text-primary hover:bg-primary/10",
    ghost: "text-muted-foreground hover:text-foreground hover:bg-white/5",
  };
  return <button ref={ref} className={`${base} ${variants[variant]} ${className}`} {...props} />;
});
Btn.displayName = "Btn";

function formatDuration(seconds?: number | null) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatViews(n?: number | null) {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K views`;
  return `${n} views`;
}

function isUrl(str: string) {
  return /^https?:\/\//i.test(str.trim()) || /^www\./i.test(str.trim());
}

export default function Home() {
  const [inputValue, setInputValue] = useState("");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [selectedFormatType, setSelectedFormatType] = useState<"video" | "audio">("video");
  const [selectedFormatId, setSelectedFormatId] = useState<string>("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"downloader" | "history">("downloader");
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { toast } = useToast();
  const { history, addHistoryItem, clearHistory } = useDownloadHistory();

  const { mutate: searchVideos, data: searchResults, isPending: isSearching } = useSearchVideos({
    mutation: {},
  });

  const { mutate: fetchInfo, isPending: isFetching } = useGetVideoInfo({
    mutation: {
      onSuccess: (data) => {
        setVideoInfo(data);
        setShowSuggestions(false);
        const videoFormats = data.formats.filter((f) => f.type === "video");
        if (videoFormats.length > 0) {
          setSelectedFormatId(videoFormats[0].id);
        } else if (data.formats.length > 0) {
          setSelectedFormatType("audio");
          setSelectedFormatId(data.formats[0].id);
        }
        toast({ title: "Video Found!", description: "Select your preferred format to download." });
      },
      onError: (err) => {
        toast({ variant: "destructive", title: "Error", description: (err as Error).message || "Please check the URL and try again." });
      },
    },
  });

  const { mutate: startDownload, isPending: isDownloading } = useStartDownload({
    mutation: {
      onSuccess: (data) => {
        if (videoInfo && selectedFormatId) {
          const fmt = videoInfo.formats.find((f) => f.id === selectedFormatId);
          addHistoryItem({
            title: videoInfo.title,
            platform: videoInfo.platform,
            thumbnail: videoInfo.thumbnail,
            url: videoInfo.originalUrl,
            format: fmt ? `${fmt.quality} ${fmt.ext.toUpperCase()}` : "Unknown",
          });
        }
        toast({ title: "Download Started", description: "Your file is being downloaded." });
        const a = document.createElement("a");
        a.href = data.downloadUrl;
        a.download = data.filename || "download";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      },
      onError: (err) => {
        toast({ variant: "destructive", title: "Download Failed", description: (err as Error).message || "Something went wrong." });
      },
    },
  });

  const triggerSearch = useCallback(
    (q: string) => {
      if (q.trim().length < 2) return;
      setSearchQuery(q);
      searchVideos({ data: { query: q, limit: 8 } });
      setShowSuggestions(true);
    },
    [searchVideos]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    setVideoInfo(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!isUrl(val) && val.trim().length >= 2) {
      debounceRef.current = setTimeout(() => triggerSearch(val.trim()), 450);
    } else {
      setShowSuggestions(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    if (isUrl(inputValue)) {
      setShowSuggestions(false);
      fetchInfo({ data: { url: inputValue.trim() } });
    } else {
      triggerSearch(inputValue.trim());
    }
  };

  const handleSuggestionClick = (result: SearchResult) => {
    setInputValue(result.url);
    setShowSuggestions(false);
    fetchInfo({ data: { url: result.url } });
  };

  const handleDownload = () => {
    if (!videoInfo || !selectedFormatId) return;
    startDownload({ data: { url: videoInfo.originalUrl, formatId: selectedFormatId, type: selectedFormatType } });
  };

  const availableFormats: VideoFormat[] = videoInfo?.formats.filter((f) => f.type === selectedFormatType) || [];

  useEffect(() => {
    if (availableFormats.length > 0 && !availableFormats.find((f) => f.id === selectedFormatId)) {
      setSelectedFormatId(availableFormats[0].id);
    }
  }, [selectedFormatType, availableFormats, selectedFormatId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const suggestions: SearchResult[] = searchResults?.results || [];

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 pointer-events-none -z-10 opacity-30 mix-blend-screen">
        <img src={`${import.meta.env.BASE_URL}images/bg-glow.png`} alt="" className="w-full h-full object-cover" />
      </div>

      {/* NAV */}
      <nav className="glass-panel-heavy sticky top-0 z-50 border-b border-white/5 rounded-none px-4 sm:px-6 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-[0_0_15px_rgba(0,255,255,0.4)]">
              <Download className="w-5 h-5 text-black" />
            </div>
            <span className="text-2xl font-display font-bold text-white tracking-tight">
              Shourov <span className="text-primary">Hub</span>
            </span>
          </div>

          {/* Tab switcher */}
          <div className="hidden sm:flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/10">
            <button
              onClick={() => setActiveTab("downloader")}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === "downloader" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-white"}`}
            >
              Downloader
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === "history" ? "bg-accent/20 text-accent" : "text-muted-foreground hover:text-white"}`}
            >
              <History className="w-4 h-4" />
              History
              {history.length > 0 && (
                <span className="bg-accent text-black text-xs font-black px-1.5 py-0.5 rounded-full leading-none">
                  {history.length}
                </span>
              )}
            </button>
          </div>

          {/* Profile */}
          <div className="flex flex-col items-center">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-accent rounded-full opacity-75 group-hover:opacity-100 transition duration-300 blur-sm" />
              <img
                src="https://i.postimg.cc/mkJ1J1pz/IMG-8020.jpg"
                alt="Shourov"
                className="relative w-11 h-11 rounded-full object-cover border-2 border-background"
              />
            </div>
            <span className="text-[10px] text-muted-foreground mt-0.5 font-medium whitespace-nowrap">
              Developer Alihsan Shourov
            </span>
          </div>
        </div>
      </nav>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-16 flex flex-col items-center">

        {/* Mobile tab buttons */}
        <div className="flex sm:hidden items-center gap-2 mb-8 self-start">
          <button
            onClick={() => setActiveTab("downloader")}
            className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${activeTab === "downloader" ? "border-primary/50 bg-primary/10 text-primary" : "border-white/10 text-muted-foreground"}`}
          >
            Downloader
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all flex items-center gap-2 ${activeTab === "history" ? "border-accent/50 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground"}`}
          >
            <History className="w-4 h-4" />
            History
            {history.length > 0 && <span className="bg-accent text-black text-xs font-black px-1.5 rounded-full">{history.length}</span>}
          </button>
        </div>

        <AnimatePresence mode="wait">

          {/* ============ DOWNLOADER TAB ============ */}
          {activeTab === "downloader" && (
            <motion.div
              key="downloader"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
              className="w-full flex flex-col items-center"
            >
              {/* Hero */}
              <div className="text-center max-w-3xl mx-auto mb-12">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-panel mb-6 border-primary/20 text-sm font-medium text-primary">
                  <Sparkles className="w-4 h-4" />
                  <span>The Ultimate Social Media Downloader</span>
                </div>
                <h1 className="text-5xl md:text-7xl font-display font-extrabold mb-5 leading-[1.1]">
                  Download Any Video.<br />
                  <span className="text-gradient-primary">Zero Watermarks.</span>
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                  Instantly save high-quality videos and audio from TikTok, Facebook, YouTube, Instagram, and more. Free, fast, and secure.
                </p>
              </div>

              {/* Search / URL Box */}
              <div className="w-full max-w-2xl mx-auto mb-10 relative">
                <form onSubmit={handleSubmit} className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-2xl opacity-20 group-focus-within:opacity-50 transition duration-500 blur-xl" />
                  <div className="relative flex flex-col sm:flex-row items-center bg-card/80 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-2xl">
                    <div className="flex-1 flex items-center w-full pl-4 py-2 sm:py-0">
                      {isUrl(inputValue) ? (
                        <LinkIcon className="w-5 h-5 text-primary mr-3 shrink-0" />
                      ) : (
                        <Search className="w-5 h-5 text-muted-foreground mr-3 shrink-0" />
                      )}
                      <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        onFocus={() => !isUrl(inputValue) && suggestions.length > 0 && setShowSuggestions(true)}
                        placeholder="Search videos or paste a link..."
                        className="w-full bg-transparent text-foreground placeholder:text-muted-foreground text-base focus:outline-none h-12"
                        autoComplete="off"
                      />
                      {inputValue && (
                        <button
                          type="button"
                          onClick={() => { setInputValue(""); setVideoInfo(null); setShowSuggestions(false); }}
                          className="mr-2 text-muted-foreground hover:text-white transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <Btn
                      type="submit"
                      disabled={(isFetching || isSearching) && !inputValue}
                      className="w-full sm:w-auto h-14 px-8 mt-2 sm:mt-0 text-base"
                    >
                      {isFetching ? (
                        <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />Fetching...</span>
                      ) : isSearching ? (
                        <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />Searching...</span>
                      ) : (
                        <span className="flex items-center gap-2">
                          {isUrl(inputValue) ? <><Download className="w-4 h-4" /> Get Video</> : <><Search className="w-4 h-4" /> Search</>}
                        </span>
                      )}
                    </Btn>
                  </div>
                </form>

                {/* Search Suggestions Dropdown */}
                <AnimatePresence>
                  {showSuggestions && suggestions.length > 0 && (
                    <motion.div
                      ref={suggestionsRef}
                      initial={{ opacity: 0, y: -8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.98 }}
                      transition={{ duration: 0.2 }}
                      className="absolute left-0 right-0 top-full mt-2 z-50 glass-panel rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
                    >
                      <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                          Search Results for "{searchQuery}"
                        </span>
                        <button onClick={() => setShowSuggestions(false)} className="text-muted-foreground hover:text-white">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="max-h-[420px] overflow-y-auto custom-scrollbar">
                        {suggestions.map((result) => (
                          <button
                            key={result.id}
                            onClick={() => handleSuggestionClick(result)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-white/5 last:border-0"
                          >
                            <div className="relative shrink-0 w-24 h-14 rounded-lg overflow-hidden bg-black/40">
                              {result.thumbnail ? (
                                <img src={result.thumbnail} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Video className="w-5 h-5 text-muted-foreground" />
                                </div>
                              )}
                              {result.duration && (
                                <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-mono px-1 rounded">
                                  {formatDuration(result.duration)}
                                </span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white line-clamp-2 leading-snug">{result.title}</p>
                              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                {result.uploader && <span>{result.uploader}</span>}
                                {result.uploader && result.viewCount && <span>·</span>}
                                {result.viewCount && <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatViews(result.viewCount)}</span>}
                              </div>
                            </div>
                            <Download className="w-4 h-4 text-primary shrink-0 opacity-60" />
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground mb-12">
                <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-primary" /> 100% Free</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-primary" /> No Watermarks</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-primary" /> HD / 4K Quality</span>
                <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-primary" /> MP3 Audio Extract</span>
              </div>

              {/* Video Result Card */}
              <AnimatePresence mode="wait">
                {videoInfo && (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.4 }}
                    className="w-full max-w-4xl glass-panel rounded-3xl overflow-hidden mb-16 shadow-[0_0_50px_rgba(0,0,0,0.5)]"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-5">
                      {/* Thumbnail */}
                      <div className="md:col-span-2 relative aspect-video md:aspect-auto bg-black/50">
                        {videoInfo.thumbnail ? (
                          <img src={videoInfo.thumbnail} alt={videoInfo.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground">No Thumbnail</div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                        <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                          <span className="px-3 py-1 rounded-lg bg-black/60 backdrop-blur-md text-xs font-bold text-white border border-white/10 uppercase tracking-wider">
                            {videoInfo.platform}
                          </span>
                          {videoInfo.duration && (
                            <span className="px-2 py-1 rounded bg-black/60 backdrop-blur-md text-xs font-mono text-white">
                              {formatDuration(videoInfo.duration)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Options */}
                      <div className="md:col-span-3 p-6 md:p-8 flex flex-col bg-card/40">
                        <h3 className="text-xl md:text-2xl font-bold mb-6 line-clamp-2">{videoInfo.title}</h3>

                        {/* Format Tabs */}
                        <div className="flex p-1 bg-black/40 rounded-xl mb-6 border border-white/5">
                          {(["video", "audio"] as const).map((t) => (
                            <button
                              key={t}
                              onClick={() => setSelectedFormatType(t)}
                              className={`flex-1 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${selectedFormatType === t ? (t === "video" ? "bg-secondary text-primary shadow-lg border border-white/5" : "bg-secondary text-accent shadow-lg border border-white/5") : "text-muted-foreground hover:text-white"}`}
                            >
                              {t === "video" ? <Video className="w-4 h-4" /> : <Music className="w-4 h-4" />}
                              {t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                          ))}
                        </div>

                        {/* Quality Grid */}
                        <div className="flex-1 mb-8">
                          <label className="text-sm font-semibold text-muted-foreground mb-3 block">Select Quality / Size</label>
                          <div className="grid grid-cols-2 gap-3">
                            {availableFormats.length > 0 ? (
                              availableFormats.map((fmt) => (
                                <button
                                  key={fmt.id}
                                  onClick={() => setSelectedFormatId(fmt.id)}
                                  className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                                    selectedFormatId === fmt.id
                                      ? selectedFormatType === "video"
                                        ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(0,255,255,0.15)]"
                                        : "border-accent bg-accent/10 shadow-[0_0_15px_rgba(255,0,255,0.15)]"
                                      : "border-white/10 bg-white/5 hover:border-white/30"
                                  }`}
                                >
                                  <span className="font-bold text-white">{fmt.label || fmt.quality}</span>
                                  <span className="text-xs text-muted-foreground mt-1 flex justify-between">
                                    <span>{fmt.ext.toUpperCase()}</span>
                                    {fmt.filesize && <span>{(fmt.filesize / 1024 / 1024).toFixed(1)} MB</span>}
                                  </span>
                                </button>
                              ))
                            ) : (
                              <div className="col-span-2 py-4 text-center text-muted-foreground bg-white/5 rounded-xl border border-white/5">
                                No {selectedFormatType} formats available.
                              </div>
                            )}
                          </div>
                        </div>

                        <Btn
                          onClick={handleDownload}
                          disabled={isDownloading || !selectedFormatId || availableFormats.length === 0}
                          className="w-full h-14 text-lg"
                        >
                          {isDownloading ? "Processing..." : `Download ${selectedFormatType === "video" ? "Video" : "Audio"}`}
                        </Btn>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* How it works + Platforms */}
              <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
                <div className="glass-panel rounded-3xl p-8">
                  <h3 className="text-2xl font-display font-bold mb-6 flex items-center gap-3">
                    <Smartphone className="w-6 h-6 text-primary" /> How It Works
                  </h3>
                  {[
                    { n: 1, title: "Search or Paste Link", desc: "Type a keyword to search, or paste any social media video URL directly." },
                    { n: 2, title: "Choose Format", desc: "Pick Video (HD/SD) or Audio (MP3/M4A). No watermarks — ever." },
                    { n: 3, title: "Download", desc: "Click Download. Your file saves directly to your device in seconds." },
                  ].map(({ n, title, desc }) => (
                    <div key={n} className="flex gap-4 mb-6 last:mb-0">
                      <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold shrink-0">{n}</div>
                      <div>
                        <h4 className="font-bold text-lg">{title}</h4>
                        <p className="text-muted-foreground text-sm mt-1">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="glass-panel rounded-3xl p-8">
                  <h3 className="text-2xl font-display font-bold mb-6">Supported Platforms</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {["YouTube", "TikTok", "Facebook", "Instagram", "Twitter / X", "Vimeo", "Dailymotion", "Reddit & more"].map((p) => (
                      <div key={p} className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/5">
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-sm font-medium">{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ============ HISTORY TAB ============ */}
          {activeTab === "history" && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
              className="w-full max-w-3xl"
            >
              <div className="glass-panel rounded-3xl p-6 sm:p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-display font-bold flex items-center gap-3">
                    <History className="w-6 h-6 text-accent" /> Download History
                  </h2>
                  {history.length > 0 && (
                    <Btn variant="ghost" className="h-9 px-3 text-xs text-destructive hover:text-red-400" onClick={clearHistory}>
                      <Trash2 className="w-4 h-4 mr-1" /> Clear All
                    </Btn>
                  )}
                </div>

                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <Clock className="w-14 h-14 mb-4 opacity-20" />
                    <p className="text-lg font-medium mb-1">No downloads yet</p>
                    <p className="text-sm">Your download history will appear here.</p>
                    <Btn variant="outline" className="mt-6 h-10 px-6 text-sm" onClick={() => setActiveTab("downloader")}>
                      Start Downloading
                    </Btn>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.map((item) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="bg-white/5 rounded-2xl p-4 flex gap-4 items-center border border-white/5 hover:bg-white/10 transition-colors group"
                      >
                        <div className="w-20 h-14 rounded-xl overflow-hidden bg-black/40 shrink-0">
                          {item.thumbnail ? (
                            <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Video className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white line-clamp-1">{item.title}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/60 font-medium">{item.platform}</span>
                            <span>·</span>
                            <span>{item.format}</span>
                            <span>·</span>
                            <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => { setInputValue(item.url); setActiveTab("downloader"); fetchInfo({ data: { url: item.url } }); }}
                          className="shrink-0 w-9 h-9 rounded-xl border border-white/10 bg-white/5 hover:bg-primary/20 hover:border-primary/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-all opacity-0 group-hover:opacity-100"
                          title="Download again"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-white/10 bg-black/60 backdrop-blur-lg py-10 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Contact Banner */}
          <div className="glass-panel rounded-3xl p-6 sm:p-8 mb-8 text-center">
            <p className="text-lg font-bold text-white mb-2">If you have any problem, please contact us</p>
            <p className="text-sm text-muted-foreground mb-6">Available for support and feedback anytime.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <a
                href="https://www.facebook.com/profile.php?id=61588161951831"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-[#1877F2]/10 border border-[#1877F2]/30 text-[#1877F2] font-bold hover:bg-[#1877F2] hover:text-white transition-all duration-300 shadow-[0_0_20px_rgba(24,119,242,0.1)] hover:shadow-[0_0_30px_rgba(24,119,242,0.4)] hover:-translate-y-1"
              >
                <Facebook className="w-6 h-6" />
                Message on Facebook
              </a>
              <a
                href="https://wa.me/8801709281334"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-bold hover:bg-[#25D366] hover:text-white transition-all duration-300 shadow-[0_0_20px_rgba(37,211,102,0.1)] hover:shadow-[0_0_30px_rgba(37,211,102,0.4)] hover:-translate-y-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Chat on WhatsApp (+880 1709-281334)
              </a>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <span className="font-bold text-white">Shourov Hub</span>
              <span className="text-muted-foreground text-sm">© {new Date().getFullYear()} All rights reserved.</span>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              For personal use only. Please respect copyright laws when downloading content.
            </p>
          </div>
        </div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); border-radius: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
}
