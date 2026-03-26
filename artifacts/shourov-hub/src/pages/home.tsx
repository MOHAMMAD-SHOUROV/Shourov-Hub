import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Download, Youtube, Facebook, Music, Video, Sparkles, 
  Link as LinkIcon, CheckCircle2, History, Trash2, Smartphone, ShieldCheck
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { 
  useGetVideoInfo, 
  useStartDownload, 
} from "@workspace/api-client-react";
import type { VideoInfo, VideoFormat } from "@workspace/api-client-react/src/generated/api.schemas";
import { useDownloadHistory } from "@/hooks/use-history";

// UI Components built inline for the specific aesthetic
const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' }>(
  ({ className = '', variant = 'primary', ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center font-bold rounded-xl transition-all duration-300 focus:outline-none disabled:opacity-50 disabled:pointer-events-none active:scale-95";
    const variants = {
      primary: "bg-gradient-to-r from-primary to-[#00d0d0] text-primary-foreground shadow-[0_0_20px_rgba(0,255,255,0.3)] hover:shadow-[0_0_30px_rgba(0,255,255,0.5)] border border-primary/50",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-white/5",
      outline: "border-2 border-primary/50 text-primary hover:bg-primary/10",
      ghost: "text-muted-foreground hover:text-foreground hover:bg-white/5",
    };
    
    return (
      <button ref={ref} className={`${baseStyles} ${variants[variant]} ${className}`} {...props} />
    );
  }
);
Button.displayName = "Button";

export default function Home() {
  const [url, setUrl] = useState("");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [selectedFormatType, setSelectedFormatType] = useState<'video' | 'audio'>('video');
  const [selectedFormatId, setSelectedFormatId] = useState<string>('');
  
  const { toast } = useToast();
  const { history, addHistoryItem, clearHistory } = useDownloadHistory();

  // API Hooks
  const { mutate: fetchInfo, isPending: isFetching } = useGetVideoInfo({
    mutation: {
      onSuccess: (data) => {
        setVideoInfo(data);
        // Auto-select highest quality video format
        const videoFormats = data.formats.filter(f => f.type === 'video');
        if (videoFormats.length > 0) {
          setSelectedFormatId(videoFormats[0].id);
        } else if (data.formats.length > 0) {
          setSelectedFormatType('audio');
          setSelectedFormatId(data.formats[0].id);
        }
        toast({
          title: "Video Found!",
          description: "Select your preferred format to download.",
        });
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Error fetching video",
          description: err.message || "Please check the URL and try again.",
        });
      }
    }
  });

  const { mutate: startDownload, isPending: isDownloading } = useStartDownload({
    mutation: {
      onSuccess: (data) => {
        if (videoInfo && selectedFormatId) {
          const format = videoInfo.formats.find(f => f.id === selectedFormatId);
          addHistoryItem({
            title: videoInfo.title,
            platform: videoInfo.platform,
            thumbnail: videoInfo.thumbnail,
            url: videoInfo.originalUrl,
            format: format ? `${format.quality} ${format.ext.toUpperCase()}` : 'Unknown'
          });
        }
        
        toast({
          title: "Download Started",
          description: "Your file is being downloaded.",
        });

        // Trigger the actual download in browser
        const a = document.createElement('a');
        a.href = data.downloadUrl;
        a.download = data.filename || 'download';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      },
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Download Failed",
          description: err.message || "Something went wrong while starting the download.",
        });
      }
    }
  });

  const handleFetch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    fetchInfo({ data: { url: url.trim() } });
  };

  const handleDownload = () => {
    if (!videoInfo || !selectedFormatId) return;
    startDownload({
      data: {
        url: videoInfo.originalUrl,
        formatId: selectedFormatId,
        type: selectedFormatType
      }
    });
  };

  // Filter formats based on selected tab
  const availableFormats = videoInfo?.formats.filter(f => f.type === selectedFormatType) || [];

  // Automatically select first format when switching tabs
  useEffect(() => {
    if (availableFormats.length > 0 && !availableFormats.find(f => f.id === selectedFormatId)) {
      setSelectedFormatId(availableFormats[0].id);
    }
  }, [selectedFormatType, availableFormats, selectedFormatId]);

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col">
      {/* Background Image Elements */}
      <div className="absolute inset-0 pointer-events-none -z-10 opacity-30 mix-blend-screen">
        <img 
          src={`${import.meta.env.BASE_URL}images/bg-glow.png`} 
          alt="" 
          className="w-full h-full object-cover"
        />
      </div>

      {/* Navigation */}
      <nav className="glass-panel-heavy sticky top-0 z-50 border-b-0 border-x-0 rounded-none px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-[0_0_15px_rgba(0,255,255,0.4)]">
              <Download className="w-5 h-5 text-black" />
            </div>
            <span className="text-2xl font-display font-bold text-white tracking-tight">
              Shourov <span className="text-primary">Hub</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 mr-4 text-sm font-medium text-muted-foreground">
              <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse"></span>
              Free forever. No Watermarks.
            </div>
            <a href="https://i.postimg.cc/mkJ1J1pz/IMG-8020.jpg" target="_blank" rel="noreferrer" className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-accent rounded-full opacity-75 group-hover:opacity-100 transition duration-300 blur-sm"></div>
              <img 
                src="https://i.postimg.cc/mkJ1J1pz/IMG-8020.jpg" 
                alt="Shourov" 
                className="relative w-11 h-11 rounded-full object-cover border-2 border-background"
              />
            </a>
          </div>
        </div>
      </nav>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20 flex flex-col items-center">
        
        {/* Hero Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-panel mb-6 border-primary/20 text-sm font-medium text-primary">
            <Sparkles className="w-4 h-4" />
            <span>The Ultimate Social Media Downloader</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-display font-extrabold mb-6 leading-[1.1]">
            Download Any Video. <br/>
            <span className="text-gradient-primary">Zero Watermarks.</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            Instantly save high-quality videos and audio from TikTok, Facebook, YouTube, Instagram, and more. Free, fast, and secure.
          </p>

          {/* Search Form */}
          <form onSubmit={handleFetch} className="relative w-full max-w-2xl mx-auto group">
            <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-2xl opacity-20 group-focus-within:opacity-50 transition duration-500 blur-xl"></div>
            <div className="relative flex flex-col sm:flex-row items-center bg-card/80 backdrop-blur-xl border border-white/10 rounded-2xl p-2 shadow-2xl">
              <div className="flex-1 flex items-center w-full pl-4 py-2 sm:py-0">
                <LinkIcon className="w-6 h-6 text-muted-foreground mr-3" />
                <input 
                  type="url" 
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste your video link here..." 
                  className="w-full bg-transparent text-foreground placeholder:text-muted-foreground text-lg focus:outline-none h-12"
                  required
                />
              </div>
              <Button 
                type="submit" 
                disabled={isFetching || !url} 
                className="w-full sm:w-auto h-14 px-8 mt-2 sm:mt-0 text-lg group-hover:shadow-[0_0_20px_rgba(0,255,255,0.4)]"
              >
                {isFetching ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                    Fetching...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    Start <Download className="w-5 h-5" />
                  </div>
                )}
              </Button>
            </div>
          </form>
          
          <div className="mt-8 flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-primary" /> 100% Free</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-primary" /> No Watermarks</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="w-4 h-4 text-primary" /> High Quality (HD/4K)</span>
          </div>
        </motion.div>

        {/* Results Area */}
        <AnimatePresence mode="wait">
          {videoInfo && (
            <motion.div 
              key="result"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4 }}
              className="w-full max-w-4xl glass-panel rounded-3xl overflow-hidden mb-20 shadow-[0_0_50px_rgba(0,0,0,0.5)]"
            >
              <div className="grid grid-cols-1 md:grid-cols-5 gap-0">
                {/* Thumbnail Side */}
                <div className="md:col-span-2 relative aspect-video md:aspect-auto bg-black/50">
                  {videoInfo.thumbnail ? (
                    <img src={videoInfo.thumbnail} alt={videoInfo.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">No Thumbnail</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                  <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                    <span className="px-3 py-1 rounded-lg bg-black/60 backdrop-blur-md text-xs font-bold text-white border border-white/10 uppercase tracking-wider">
                      {videoInfo.platform}
                    </span>
                    {videoInfo.duration && (
                      <span className="px-2 py-1 rounded bg-black/60 backdrop-blur-md text-xs font-mono text-white">
                        {Math.floor(videoInfo.duration / 60)}:{(videoInfo.duration % 60).toString().padStart(2, '0')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Options Side */}
                <div className="md:col-span-3 p-6 md:p-8 flex flex-col bg-card/40">
                  <h3 className="text-xl md:text-2xl font-bold mb-6 line-clamp-2" title={videoInfo.title}>
                    {videoInfo.title}
                  </h3>

                  {/* Format Tabs */}
                  <div className="flex p-1 bg-black/40 rounded-xl mb-6 border border-white/5">
                    <button 
                      onClick={() => setSelectedFormatType('video')}
                      className={`flex-1 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${selectedFormatType === 'video' ? 'bg-secondary text-primary shadow-lg border border-white/5' : 'text-muted-foreground hover:text-white'}`}
                    >
                      <Video className="w-4 h-4" /> Video
                    </button>
                    <button 
                      onClick={() => setSelectedFormatType('audio')}
                      className={`flex-1 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${selectedFormatType === 'audio' ? 'bg-secondary text-accent shadow-lg border border-white/5' : 'text-muted-foreground hover:text-white'}`}
                    >
                      <Music className="w-4 h-4" /> Audio
                    </button>
                  </div>

                  {/* Quality Selector */}
                  <div className="flex-1 mb-8">
                    <label className="text-sm font-semibold text-muted-foreground mb-3 block">Select Quality</label>
                    <div className="grid grid-cols-2 gap-3">
                      {availableFormats.length > 0 ? (
                        availableFormats.map((fmt) => (
                          <button
                            key={fmt.id}
                            onClick={() => setSelectedFormatId(fmt.id)}
                            className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                              selectedFormatId === fmt.id 
                                ? selectedFormatType === 'video' 
                                  ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(0,255,255,0.15)]'
                                  : 'border-accent bg-accent/10 shadow-[0_0_15px_rgba(255,0,255,0.15)]'
                                : 'border-white/10 bg-white/5 hover:border-white/30'
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
                          No {selectedFormatType} formats available for this platform.
                        </div>
                      )}
                    </div>
                  </div>

                  <Button 
                    onClick={handleDownload}
                    disabled={isDownloading || !selectedFormatId || availableFormats.length === 0}
                    className="w-full h-14 text-lg"
                  >
                    {isDownloading ? 'Processing...' : `Download ${selectedFormatType === 'video' ? 'Video' : 'Audio'}`}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content Sections */}
        <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
          
          {/* How to use */}
          <div className="glass-panel rounded-3xl p-8 flex flex-col">
            <h3 className="text-2xl font-display font-bold mb-6 flex items-center gap-3">
              <Smartphone className="w-6 h-6 text-primary" /> 
              How it works
            </h3>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold shrink-0">1</div>
                <div>
                  <h4 className="font-bold text-lg">Copy the Link</h4>
                  <p className="text-muted-foreground text-sm mt-1">Find the video you want on TikTok, FB, or YouTube and copy its share link.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold shrink-0">2</div>
                <div>
                  <h4 className="font-bold text-lg">Paste & Fetch</h4>
                  <p className="text-muted-foreground text-sm mt-1">Paste the link in the box above and hit Start. We'll grab the highest quality versions.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold shrink-0">3</div>
                <div>
                  <h4 className="font-bold text-lg">Download</h4>
                  <p className="text-muted-foreground text-sm mt-1">Choose your format (Video or Audio MP3) and click Download. It's that simple!</p>
                </div>
              </div>
            </div>
          </div>

          {/* History */}
          <div className="glass-panel rounded-3xl p-8 flex flex-col max-h-[450px]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-display font-bold flex items-center gap-3">
                <History className="w-6 h-6 text-accent" /> 
                Recent Downloads
              </h3>
              {history.length > 0 && (
                <Button variant="ghost" className="h-8 px-2 text-xs" onClick={clearHistory}>
                  <Trash2 className="w-4 h-4 mr-1" /> Clear
                </Button>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
              {history.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-10">
                  <Download className="w-12 h-12 mb-3 opacity-20" />
                  <p>No recent downloads.</p>
                </div>
              ) : (
                history.map(item => (
                  <div key={item.id} className="bg-white/5 rounded-xl p-3 flex gap-3 items-center border border-white/5 hover:bg-white/10 transition-colors">
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt="" className="w-16 h-12 rounded object-cover bg-black" />
                    ) : (
                      <div className="w-16 h-12 rounded bg-secondary flex items-center justify-center">
                        <Video className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate text-white">{item.title}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span className="capitalize">{item.platform}</span>
                        <span>•</span>
                        <span>{item.format}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Supported Platforms Banner */}
        <div className="w-full max-w-5xl py-12 border-y border-white/10 flex flex-col items-center justify-center mb-20">
          <p className="text-sm font-bold text-muted-foreground uppercase tracking-[0.2em] mb-8 text-center">Supported Platforms</p>
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
            {/* Using simple text placeholders or generic icons for brand logos since we don't have SVGs */}
            <div className="flex flex-col items-center gap-2"><div className="font-display font-bold text-2xl">TikTok</div></div>
            <div className="flex flex-col items-center gap-2"><div className="font-display font-bold text-2xl">YouTube</div></div>
            <div className="flex flex-col items-center gap-2"><div className="font-display font-bold text-2xl">Facebook</div></div>
            <div className="flex flex-col items-center gap-2"><div className="font-display font-bold text-2xl">Instagram</div></div>
            <div className="flex flex-col items-center gap-2"><div className="font-display font-bold text-2xl">X / Twitter</div></div>
          </div>
        </div>

        {/* Contact Section */}
        <div id="contact" className="w-full max-w-3xl text-center mb-20">
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Need Help or Custom Tools?</h2>
          <p className="text-muted-foreground mb-8">Reach out directly to the creator. Available for freelance projects and support.</p>
          
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a 
              href="https://www.facebook.com/profile.php?id=61588161951831" 
              target="_blank" 
              rel="noreferrer"
              className="flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-[#1877F2]/10 border border-[#1877F2]/30 text-[#1877F2] font-bold hover:bg-[#1877F2] hover:text-white transition-all duration-300 shadow-[0_0_20px_rgba(24,119,242,0.1)] hover:shadow-[0_0_30px_rgba(24,119,242,0.4)] hover:-translate-y-1"
            >
              <Facebook className="w-6 h-6" />
              Message on Facebook
            </a>
            <a 
              href="https://wa.me/8801709281334" 
              target="_blank" 
              rel="noreferrer"
              className="flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] font-bold hover:bg-[#25D366] hover:text-white transition-all duration-300 shadow-[0_0_20px_rgba(37,211,102,0.1)] hover:shadow-[0_0_30px_rgba(37,211,102,0.4)] hover:-translate-y-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/></svg>
              Chat on WhatsApp
            </a>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-black/50 backdrop-blur-lg py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <span className="font-bold text-white">Shourov Hub</span>
            <span className="text-muted-foreground text-sm ml-2">© {new Date().getFullYear()} All rights reserved.</span>
          </div>
          <div className="text-sm text-muted-foreground text-center md:text-right max-w-md">
            This tool is for educational purposes and downloading publicly available content you have rights to. Please respect copyright laws.
          </div>
        </div>
      </footer>
      
      {/* Global utility styles injected here just in case */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
