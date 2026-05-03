import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, ExternalLink, Download, Package, Activity, Terminal as TerminalIcon, AlertCircle, CheckCircle2, Loader2, Globe } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { io } from "socket.io-client";

interface Site {
  slug: string;
  name: string;
  createdAt: string;
  url: string;
}

interface BuildStatus {
  buildId: string;
  step: string;
  status: "idle" | "running" | "success" | "error";
  logs: string[];
}

const socket = io();

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [activeBuild, setActiveBuild] = useState<BuildStatus | null>(null);
  const [uploadData, setUploadData] = useState({ name: "", slug: "" });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    checkAuth();

    socket.on("build-step", ({ buildId, step }) => {
      setActiveBuild(prev => {
        if (!prev || prev.buildId !== buildId) return { buildId, step, status: "running", logs: [] };
        return { ...prev, step, status: "running" };
      });
    });

    socket.on("build-log", ({ buildId, log }) => {
      setActiveBuild(prev => {
        if (!prev || prev.buildId !== buildId) return prev;
        return { ...prev, logs: [...prev.logs, log] };
      });
    });

    socket.on("build-complete", ({ buildId, success, error }) => {
      setActiveBuild(prev => {
        if (!prev || prev.buildId !== buildId) return prev;
        return { ...prev, status: success ? "success" : "error", step: success ? "Completed" : `Error: ${error}` };
      });
      if (success) {
        fetchSites();
        setTimeout(() => setIsUploading(false), 2000);
      }
    });

    return () => {
      socket.off("build-step");
      socket.off("build-log");
      socket.off("build-complete");
    };
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/auth-check");
      const data = await res.json();
      setIsAuthenticated(data.isAuthenticated);
      if (data.isAuthenticated) fetchSites();
    } catch (err) {
      setIsAuthenticated(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginData),
      });
      if (res.ok) {
        setIsAuthenticated(true);
        fetchSites();
      } else {
        setAuthError("Invalid credentials");
      }
    } catch (err) {
      setAuthError("Connection error");
    }
  };

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    setIsAuthenticated(false);
    setSites([]);
  };

  const handleDelete = async (slug: string) => {
    if (!confirm(`Are you sure you want to delete ${slug}?`)) return;
    try {
      await fetch(`/api/sites/${slug}`, { method: "DELETE" });
      fetchSites();
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !uploadData.slug) return;

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("name", uploadData.name);
    formData.append("slug", uploadData.slug);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setActiveBuild({ buildId: data.buildId, step: "Connecting...", status: "running", logs: [] });
    } catch (err) {
      alert("Upload failed. Check console.");
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeBuild?.logs]);

  const fetchSites = async () => {
    try {
      const res = await fetch("/api/sites");
      if (res.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      const data = await res.json();
      setSites(data);
    } catch (err) {
      console.error("Failed to fetch sites", err);
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated === null) return null;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050505] font-sans antialiased">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md p-8 bg-[#111] border border-white/10 rounded-2xl shadow-2xl"
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center font-bold text-white mb-4 shadow-lg shadow-indigo-500/20">MC</div>
            <h1 className="text-xl font-bold text-white">MasterChief Builder</h1>
            <p className="text-xs text-gray-500 mt-2 uppercase tracking-widest">Authentication Required</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 mb-1.5 block tracking-widest">Username</label>
              <input
                required
                type="text"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 text-white transition-colors"
                value={loginData.username}
                onChange={e => setLoginData(p => ({ ...p, username: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-gray-500 mb-1.5 block tracking-widest">Password</label>
              <input
                required
                type="password"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 text-white transition-colors"
                value={loginData.password}
                onChange={e => setLoginData(p => ({ ...p, password: e.target.value }))}
              />
            </div>

            {authError && (
              <p className="text-xs text-red-500 font-medium flex items-center gap-2">
                <AlertCircle className="w-3 h-3" />
                {authError}
              </p>
            )}

            <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold py-3 rounded-lg transition-all shadow-lg shadow-indigo-500/20 mt-4 active:scale-[0.98]">
              Unlock Dashboard
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#050505] text-gray-300 font-sans shadow-2xl border border-white/5">
      {/* Header */}
      <header className="h-16 border-b border-white/10 bg-black/40 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">MC</div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">MasterChief Builder</h1>
            <p className="text-[10px] uppercase tracking-widest text-gray-500 font-mono">vmi3146532 | 62.171.158.235</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
            <span className="text-xs font-mono">Port 3003 Active</span>
          </div>
          <button 
            onClick={handleLogout}
            className="text-[10px] uppercase font-bold text-gray-500 hover:text-white transition-colors border-l border-white/10 pl-6 h-10 flex items-center"
          >
            Logout
          </button>
          <div className="hidden md:flex gap-2 text-[10px] font-mono text-gray-500 border-l border-white/10 pl-6 h-10 items-center">
            <span className="bg-white/5 px-2 py-1 rounded border border-white/10">3000:LOCKED</span>
            <span className="bg-white/5 px-2 py-1 rounded border border-white/10">3001:LOCKED</span>
            <span className="bg-white/5 px-2 py-1 rounded border border-white/10">3002:LOCKED</span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-white/5 p-6 space-y-8 shrink-0 hidden lg:block overflow-y-auto">
          <div>
            <label className="text-[10px] uppercase font-bold text-gray-500 mb-3 block tracking-widest">System Usage</label>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[11px] mb-1 font-mono"><span>CPU</span><span>14%</span></div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 w-[14%] transition-all duration-500"></div></div>
              </div>
              <div>
                <div className="flex justify-between text-[11px] mb-1 font-mono"><span>RAM</span><span>2.4GB / 8GB</span></div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 w-[30%] transition-all duration-500"></div></div>
              </div>
              <div>
                <div className="flex justify-between text-[11px] mb-1 font-mono"><span>DISK</span><span>42%</span></div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 w-[42%] transition-all duration-500"></div></div>
              </div>
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-gray-500 mb-3 block tracking-widest">Quick Actions</label>
            <div className="grid grid-cols-1 gap-2">
              <button disabled className="text-left text-xs p-2.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 transition-colors opacity-50 cursor-not-allowed">Restart Nginx</button>
              <button disabled className="text-left text-xs p-2.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 transition-colors opacity-50 cursor-not-allowed">Flush Logs</button>
              <button disabled className="text-left text-xs p-2.5 rounded bg-white/5 border border-white/10 hover:bg-white/10 transition-colors opacity-50 cursor-not-allowed">Container Shell</button>
            </div>
          </div>

          <div className="pt-4 border-t border-white/5">
            <div className="bg-indigo-500/5 rounded-xl p-4 border border-indigo-500/10">
               <Activity className="w-4 h-4 text-indigo-400 mb-2" />
               <p className="text-[11px] text-indigo-300 font-medium leading-relaxed">
                 All systems operational. Listening on builder.masterchief.co.za
               </p>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1 flex flex-col p-8 space-y-6 overflow-hidden bg-[#080808]">
          {/* Deployment Form Card */}
          <section className="bg-[#111] border border-white/10 rounded-xl p-6 shadow-xl">
            <h2 className="text-sm font-medium text-white mb-4 flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-400" />
              New Deployment from AI Studio Code
            </h2>
            <form onSubmit={handleUpload} className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 w-full md:w-auto">
                <label className="text-[10px] uppercase font-bold text-gray-500 mb-1.5 block tracking-widest">Site Name</label>
                <input
                  required
                  type="text"
                  placeholder="My Awesome App"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 text-white transition-colors"
                  value={uploadData.name}
                  onChange={e => setUploadData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="flex-1 w-full md:w-auto">
                <label className="text-[10px] uppercase font-bold text-gray-500 mb-1.5 block tracking-widest">URL Slug Name</label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-white/10 bg-white/5 text-gray-500 text-[10px] font-mono">/</span>
                  <input
                    required
                    type="text"
                    placeholder="my-awesome-site"
                    className="flex-1 bg-transparent border border-white/10 rounded-r-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 text-white transition-colors"
                    value={uploadData.slug}
                    onChange={e => setUploadData(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                  />
                </div>
              </div>
              <div className="w-full md:w-1/4">
                <label className="text-[10px] uppercase font-bold text-gray-500 mb-1.5 block tracking-widest">Source ZIP</label>
                <div className="relative">
                  <input
                    required
                    type="file"
                    accept=".zip"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                  />
                  <div className={`border border-dashed border-white/20 rounded-lg py-2 px-4 text-xs ${selectedFile ? 'text-indigo-400 font-medium border-indigo-500/50' : 'text-gray-400'} text-center bg-white/5 transition-all`}>
                    {selectedFile ? selectedFile.name : "Select ZIP..."}
                  </div>
                </div>
              </div>
              <button
                disabled={activeBuild?.status === "running"}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:cursor-not-allowed text-white text-xs font-semibold px-6 py-[10px] rounded-lg transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
              >
                {activeBuild?.status === "running" ? "Building..." : "Build & Deploy"}
              </button>
            </form>
          </section>

          {/* Active Deployments Table */}
          <section className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-white">Live Environments</h3>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500 font-mono border border-white/5">{sites.length} Active</span>
              </div>
              <button onClick={fetchSites} className="text-[10px] uppercase font-bold text-indigo-400 hover:text-indigo-300 transition-colors">Refresh</button>
            </div>
            <div className="flex-1 overflow-auto border border-white/10 rounded-xl bg-[#111] scrollbar-console shadow-xl">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead className="sticky top-0 bg-[#111] shadow-sm z-20">
                  <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-white/10">
                    <th className="px-6 py-3 font-bold">Slug URL</th>
                    <th className="px-6 py-3 font-bold">Status</th>
                    <th className="px-6 py-3 font-bold">Name</th>
                    <th className="px-6 py-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-xs font-mono">
                  <AnimatePresence mode="popLayout">
                    {sites.map((site) => (
                      <motion.tr
                        key={site.slug}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="border-b border-white/5 hover:bg-white/[0.02] group transition-colors"
                      >
                        <td className="px-6 py-4 text-indigo-400 font-medium">/{site.slug}</td>
                        <td className="px-6 py-4">
                          <span className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]"></div>
                            <span className="text-[10px] uppercase tracking-widest text-emerald-500/80">LIVE</span>
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-400">{site.name}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-5">
                            <a
                              href={site.url}
                              target="_blank"
                              className="text-gray-400 hover:text-indigo-400 transition-colors uppercase tracking-widest text-[9px] font-bold"
                            >
                              View
                            </a>
                            <a
                              href={`/api/sites/${site.slug}/download`}
                              className="text-gray-400 hover:text-emerald-400 transition-colors uppercase tracking-widest text-[9px] font-bold"
                            >
                              Zip
                            </a>
                            <button
                              onClick={() => handleDelete(site.slug)}
                              className="text-red-500/70 hover:text-red-500 transition-colors uppercase tracking-widest text-[9px] font-bold"
                            >
                              Del
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                  {sites.length === 0 && !loading && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-500 italic">No deployments found. Build your first site above.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Console Footer */}
          <section className="h-48 bg-black border border-white/10 rounded-xl font-mono text-[11px] p-4 text-gray-400 overflow-hidden relative shadow-2xl">
            <div className="absolute top-2 right-4 flex gap-3 text-[9px] uppercase tracking-widest text-gray-600 z-10 bg-black/80 px-2 py-1 rounded">
              <span>Build Console</span>
              {activeBuild?.status === "running" && (
                <span className="text-indigo-400 animate-pulse">● Active</span>
              )}
            </div>
            
            <div 
              ref={scrollRef}
              className="h-full overflow-y-auto scrollbar-console pr-4"
            >
              {!activeBuild && (
                <div className="flex flex-col items-center justify-center h-full space-y-2 opacity-30 select-none">
                  <TerminalIcon className="w-8 h-8" />
                  <p className="tracking-widest">AWAITING BUILD COMMANDS</p>
                </div>
              )}
              
              {activeBuild && (
                <div className="space-y-1">
                  <p className="mb-2 border-b border-white/5 pb-2">
                    <span className="text-gray-500">[{new Date().toLocaleTimeString()}]</span>
                    <span className="text-white ml-2 uppercase tracking-widest"> {activeBuild.step}</span>
                  </p>
                  {activeBuild.logs.map((log, i) => {
                    const isError = log.toLowerCase().includes('error') || log.toLowerCase().includes('fail');
                    const isSuccess = log.toLowerCase().includes('success') || log.toLowerCase().includes('complete');
                    
                    return (
                      <p key={i} className="flex gap-3 leading-relaxed">
                        <span className="text-gray-600 shrink-0">[{i.toString().padStart(3, '0')}]</span>
                        <span className={isError ? 'text-red-400' : isSuccess ? 'text-emerald-400' : 'text-gray-400'}>
                          {log}
                        </span>
                      </p>
                    );
                  })}
                  <div className="h-4" />
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
