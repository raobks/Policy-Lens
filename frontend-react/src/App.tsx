import React, { useState, useRef, useEffect, useCallback } from "react";
import { Header } from "./components/Header";
import { Particles } from "./components/Particles";
import { Landing } from "./pages/Landing";
import { Auth } from "./pages/Auth";


const API_BASE_URL: string =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_POLICY_AI_API_BASE) ||
  "http://localhost:8000";

type SummaryMapItem = { summary_sentence: string; chunk_index: number; source_paragraph: string };
type KeyPoint = { chunk_index: number; preview: string; source_paragraph: string; summary_sentence: string };
type RedFlag = {
  chunk_index: number;
  severity: "critical" | "high" | "medium";
  category: string;
  trigger: string;
  excerpt: string;
  explanation: string;
  source_paragraph: string;
};
type Page = "landing" | "auth" | "app";
type Step = "upload" | "results";
type AuthTab = "login" | "signup";
type SidebarView = "dashboard" | "new" | "recent" | "saved" | "chatbot" | "comparator" | "tags" | "settings";
type Depth = "Brief" | "Standard" | "Detailed";

interface DocRecord {
  id: string; name: string; date: string; summary: string;
  summaryMap: SummaryMapItem[]; keyPoints: KeyPoint[];
  depth: Depth; tags: string[]; saved: boolean; redFlags: RedFlag[];
}
interface ChatMsg { role: "bot" | "user"; text: string; time: string; sources?: { index: number; text: string }[] }
interface Settings {
  defaultDepth: Depth; autoSave: boolean; theme: "dark";
  fontSize: "small" | "medium" | "large"; showTimestamps: boolean;
  exportFormat: "txt" | "json" | "md";
}

interface StoredUser {
  firstName: string;
  lastName: string;
  email: string;
  org: string;
  password: string;
}

const CURRENT_USER_KEY = "policylens_current_user";

function getCurrentUser(): StoredUser | null {
  try { return JSON.parse(localStorage.getItem(CURRENT_USER_KEY) ?? "null"); } catch { return null; }
}

const DEFAULT_SETTINGS: Settings = {
  defaultDepth: "Standard", autoSave: true, theme: "dark",
  fontSize: "medium", showTimestamps: true, exportFormat: "md",
};
const DEMO_LIMIT = 2;
const DEMO_KEY = "policylens_demo_count";
const HISTORY_KEY = "policylens_history";
const SETTINGS_KEY = "policylens_settings";

function getHistory(): DocRecord[] { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"); } catch { return []; } }
function saveHistory(h: DocRecord[]) { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 50))); }
function getSettings(): Settings { try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") }; } catch { return DEFAULT_SETTINGS; } }
function saveSettings(s: Settings) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }
function getDemoCount(): number { return parseInt(localStorage.getItem(DEMO_KEY) ?? "0"); }
function incDemoCount() { localStorage.setItem(DEMO_KEY, String(getDemoCount() + 1)); }
function ts() { return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

const DEPTH_CONFIG = {
  Brief: { maxKeyPoints: 3, maxSummaryItems: 3, label: "3 key points  2-3 sentence overview only" },
  Standard: { maxKeyPoints: 7, maxSummaryItems: 7, label: "Up to 7 key points  balanced coverage" },
  Detailed: { maxKeyPoints: 15, maxSummaryItems: 15, label: "15 key points  full clause-by-clause analysis" },
};
const DEPTH_ICONS: Record<Depth, string> = { Brief: "zap", Standard: "list", Detailed: "search" };

function depthHint(d: Depth): string {
  const icons: Record<Depth, string> = { Brief: "⚡", Standard: "📋", Detailed: "🔍" };
  return `${icons[d]} ${DEPTH_CONFIG[d].label}`;
}

// ── Backend API helpers ──

async function uploadToBackend(file: File, depth: Depth) {
  const form = new FormData();
  form.append("file", file);
  const resp = await fetch(`${API_BASE_URL}/upload?depth=${encodeURIComponent(depth)}`, {
    method: "POST", body: form,
  });
  if (!resp.ok) throw new Error((await resp.text()) || resp.statusText);
  return resp.json() as Promise<{
    summary: string; summary_map: SummaryMapItem[];
    key_points: KeyPoint[]; red_flags: RedFlag[]; depth: string; chunks?: string[];
  }>;
}

async function summarizeAtDepth(filename: string, depth: Depth) {
  const resp = await fetch(`${API_BASE_URL}/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, depth }),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json() as Promise<{ summary: string; summary_map: SummaryMapItem[]; depth: string }>;
}

async function queryBackend(
  question: string, filename: string,
  history: { role: string; content: string }[]
): Promise<{ answer: string; sources: { index: number; text: string }[] }> {
  const resp = await fetch(`${API_BASE_URL}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, filename, history }),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

async function compareDocsViaBackend(docA: DocRecord, docB: DocRecord): Promise<string> {
  const question = [
    `Compare these two policy documents and provide a structured analysis.`,
    `DOCUMENT A: "${docA.name}" (${docA.depth} depth)`,
    `Summary: ${docA.summary}`,
    `Key Points:\n${docA.keyPoints.slice(0, 7).map((k, i) => `${i + 1}. ${k.preview}`).join("\n")}`,
    `DOCUMENT B: "${docB.name}" (${docB.depth} depth)`,
    `Summary: ${docB.summary}`,
    `Key Points:\n${docB.keyPoints.slice(0, 7).map((k, i) => `${i + 1}. ${k.preview}`).join("\n")}`,
    `Provide sections: 1) SIMILARITIES  2) DIFFERENCES  3) SCOPE (which is broader)  4) UNIQUE PROVISIONS in each`,
  ].join("\n\n");
  try {
    const data = await queryBackend(question, docA.name, []);
    return data.answer;
  } catch {
    return `To compare these documents via AI, ensure both "${docA.name}" and "${docB.name}" are loaded in the current server session (re-upload if needed). The comparison prompt has been prepared.`;
  }
}

// ── ChatPanel as a STABLE top-level component (avoids textarea losing focus) ──
interface ChatPanelProps {
  chatMessages: Array<{ role: "bot" | "user"; text: string; time: string; sources?: { index: number; text: string }[] }>;
  chatTyping: boolean;
  chatInput: string;
  setChatInput: (v: string) => void;
  sendChat: () => void;
  currentDocName: string;
  chatEndRef: React.RefObject<HTMLDivElement>;
  showTimestamps: boolean;
}

const ChatPanelView: React.FC<ChatPanelProps> = ({
  chatMessages, chatTyping, chatInput, setChatInput,
  sendChat, currentDocName, chatEndRef, showTimestamps,
}) => (
  <div className="chat-panel" style={{ flex: 1 }}>
    <div className="chat-header">
      <div className="chat-avatar">⚖</div>
      <div style={{ flex: 1 }}>
        <div className="chat-name">PolicyBot</div>
        <div className="chat-status">
          <span className="status-dot" />
          {currentDocName
            ? `RAG · ${currentDocName.length > 24 ? currentDocName.slice(0, 24) + "…" : currentDocName}`
            : "No document loaded"}
        </div>
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "right", lineHeight: 1.5 }}>
        Llama 3.1:8b<br />FAISS RAG
      </div>
    </div>
    <div className="chat-messages">
      {chatMessages.map((m, i) => (
        <div key={i} className={`msg msg-${m.role}`}>
          <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
          {m.sources && m.sources.length > 0 && (
            <div className="chat-sources">
              <div className="chat-sources-label">Retrieved from document:</div>
              {m.sources.slice(0, 2).map((s, si) => (
                <div key={si} className="chat-source-item">
                  <span className="chat-source-num">§{s.index + 1}</span>
                  {s.text.slice(0, 100)}{s.text.length > 100 ? "…" : ""}
                </div>
              ))}
            </div>
          )}
          {showTimestamps && <div className="msg-time">{m.time}</div>}
        </div>
      ))}
      {chatTyping && (
        <div className="typing-indicator">
          <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
        </div>
      )}
      <div ref={chatEndRef} />
    </div>
    <div className="chat-input-wrap">
      <textarea
        className="chat-input"
        placeholder={currentDocName ? "Ask about any clause, provision, or implication…" : "Upload a document first…"}
        value={chatInput}
        rows={1}
        onChange={(e) => setChatInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendChat();
          }
        }}
      />
      <button className="chat-send" onClick={sendChat} disabled={chatTyping || !currentDocName}>
        ➤
      </button>
    </div>
  </div>
);

export const App: React.FC = () => {
  const [page, setPage] = useState<Page>("landing");
  const [authTab, setAuthTab] = useState<AuthTab>("login");
  const [isLoggedIn, setIsLoggedIn] = useState(!!getCurrentUser());
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(getCurrentUser);

  useEffect(() => {
  const params = new URLSearchParams(window.location.search);

  const email = params.get("email");
  const name = params.get("name");

  if (email) {
    const user = {
      firstName: name || "User",
      lastName: "",
      email,
      org: "",
      password: ""
    };

    localStorage.setItem("policylens_current_user", JSON.stringify(user));

    setIsLoggedIn(true);
    setCurrentUser(user);

    window.history.replaceState({}, document.title, "/");

    setPage("app");
  }
}, []);
  const [sidebarView, setSidebarView] = useState<SidebarView>("new");

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState("");
  const [summaryMap, setSummaryMap] = useState<SummaryMapItem[]>([]);
  const [keyPoints, setKeyPoints] = useState<KeyPoint[]>([]);
  const [redFlags, setRedFlags] = useState<RedFlag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStage, setAnalyzeStage] = useState("Processing…");
  const [depth, setDepth] = useState<Depth>("Standard");
  const [depthLoading, setDepthLoading] = useState(false);
  const [currentDocName, setCurrentDocName] = useState("");
  const [currentDocId, setCurrentDocId] = useState("");

  const [history, setHistory] = useState<DocRecord[]>(getHistory);
  const [allTags, setAllTags] = useState<string[]>(() => Array.from(new Set(getHistory().flatMap((d) => d.tags))));
  const [newTagInput, setNewTagInput] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([
    { role: "bot", text: "Upload a document first, then ask me anything about its clauses, provisions, or implications. I use FAISS retrieval + Llama to answer accurately.", time: ts() },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatTyping, setChatTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [compareResult, setCompareResult] = useState("");
  const [comparing, setComparing] = useState(false);

  const [settings, setSettings] = useState<Settings>(getSettings);
  const [demoCount, setDemoCount] = useState(getDemoCount);
  const [showDemoGate, setShowDemoGate] = useState(false);

  useEffect(() => { saveHistory(history); }, [history]);
  useEffect(() => { saveSettings(settings); }, [settings]);
  useEffect(() => { setDepth(settings.defaultDepth); }, []); // eslint-disable-line

  const navigate = (p: Page, tab?: AuthTab) => {
    setPage(p);
    if (tab) setAuthTab(tab);
    if (p === "app") setSidebarView("dashboard");
    window.scrollTo(0, 0);
  };
  const handleAuthSuccess = () => { setIsLoggedIn(true); setCurrentUser(getCurrentUser()); navigate("app"); };
  const handleLogout = () => { setIsLoggedIn(false); setCurrentUser(null); localStorage.removeItem(CURRENT_USER_KEY); handleNewDoc(); navigate("landing"); };
  const handleTryDemo = () => {
    const c = getDemoCount();
    if (c >= DEMO_LIMIT) { setShowDemoGate(true); return; }
    incDemoCount(); setDemoCount(c + 1); navigate("app");
  };

  const STAGES = [
    "Parsing PDF…", "Segmenting into chunks…", "Generating sentence embeddings…",
    "Building FAISS index…", "Running Llama summarization…",
    "Scanning chunks for red flags…", "Mapping summary to source paragraphs…", "Extracting key points…",
  ];

  const handleUpload = async () => {
    if (!file) { setError("Please select a PDF file."); return; }
    if (!isLoggedIn) {
      const c = getDemoCount();
      if (c >= DEMO_LIMIT) { setShowDemoGate(true); return; }
    }
    setError(null); setLoading(true); setAnalyzing(true); setAnalyzeStage(STAGES[0]);
    let si = 0;
    const stageTimer = setInterval(() => {
      si = Math.min(si + 1, STAGES.length - 1);
      setAnalyzeStage(STAGES[si]);
    }, 2000);
    try {
      const data = await uploadToBackend(file, depth);
      const sm: SummaryMapItem[] = data.summary_map ?? [];
      const kp: KeyPoint[] = data.key_points ?? [];
      const rf: RedFlag[] = data.red_flags ?? [];
      const sumText = data.summary ?? sm.map((s) => s.summary_sentence).join(" ");
      setSummary(sumText); setSummaryMap(sm); setKeyPoints(kp); setRedFlags(rf);
      const docId = Date.now().toString();
      setCurrentDocId(docId); setCurrentDocName(file.name);
      const record: DocRecord = {
        id: docId, name: file.name, date: new Date().toLocaleDateString(),
        summary: sumText, summaryMap: sm, keyPoints: kp,
        depth, tags: [], saved: settings.autoSave, redFlags: rf,
      };
      setHistory((h) => [record, ...h]);
      if (!isLoggedIn) { incDemoCount(); setDemoCount((c) => c + 1); }
      setChatMessages([{
        role: "bot",
        text: `"${file.name}" analyzed at ${depth} depth. ${kp.length} key point${kp.length !== 1 ? "s" : ""} extracted${rf.length > 0 ? ` · ⚠ ${rf.length} red flag${rf.length !== 1 ? "s" : ""} detected` : " · no red flags found"}. Ask me anything about the document.`,
        time: ts(),
      }]);
      setStep("results");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Upload failed: ${msg}. Ensure FastAPI is running at ${API_BASE_URL}.`);
    } finally { clearInterval(stageTimer); setLoading(false); setAnalyzing(false); }
  };

  const handleDepthChange = async (newDepth: Depth) => {
    setDepth(newDepth);
    if (!currentDocName || step !== "results") return;
    setDepthLoading(true);
    try {
      const data = await summarizeAtDepth(currentDocName, newDepth);
      const sm = data.summary_map ?? [];
      const sumText = data.summary ?? sm.map((s) => s.summary_sentence).join(" ");
      setSummary(sumText); setSummaryMap(sm);
      setKeyPoints((prev) => prev.slice(0, DEPTH_CONFIG[newDepth].maxKeyPoints));
      setHistory((h) => h.map((d) => d.id === currentDocId ? { ...d, summary: sumText, summaryMap: sm, depth: newDepth } : d));
    } catch (e: unknown) {
      // Graceful fallback — slice existing data
      setSummaryMap((prev) => prev.slice(0, DEPTH_CONFIG[newDepth].maxSummaryItems));
      setKeyPoints((prev) => prev.slice(0, DEPTH_CONFIG[newDepth].maxKeyPoints));
    } finally { setDepthLoading(false); }
  };

  const handleNewDoc = () => {
    setStep("upload"); setFile(null); setSummary(""); setSummaryMap([]); setKeyPoints([]);
    setError(null); setCurrentDocId(""); setCurrentDocName(""); setRedFlags([]);
    setChatMessages([{ role: "bot", text: "Upload a document to begin.", time: ts() }]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f?.type === "application/pdf") setFile(f);
  };

  const openDoc = (doc: DocRecord) => {
    setSummary(doc.summary); setSummaryMap(doc.summaryMap); setKeyPoints(doc.keyPoints); setRedFlags(doc.redFlags ?? []);
    setDepth(doc.depth); setCurrentDocId(doc.id); setCurrentDocName(doc.name);
    setChatMessages([{ role: "bot", text: `Loaded "${doc.name}" (${doc.depth}). For live RAG answers, re-upload the PDF. Ask anything!`, time: ts() }]);
    setStep("results"); setSidebarView("new");
  };

  const toggleSaved = (id: string) => setHistory((h) => h.map((d) => d.id === id ? { ...d, saved: !d.saved } : d));

  const addTagToDoc = (tag: string) => {
    const t = tag.trim(); if (!t || !currentDocId) return;
    setHistory((h) => h.map((d) => d.id === currentDocId ? { ...d, tags: d.tags.includes(t) ? d.tags : [...d.tags, t] } : d));
    setAllTags((prev) => prev.includes(t) ? prev : [...prev, t]);
    setNewTagInput("");
  };
  const removeTagFromDoc = (docId: string, tag: string) =>
    setHistory((h) => h.map((d) => d.id === docId ? { ...d, tags: d.tags.filter((t) => t !== tag) } : d));

  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatTyping) return;
    if (!currentDocName) {
      setChatMessages((p) => [...p, { role: "bot", text: "Please upload a document first. PolicyBot uses FAISS retrieval on the actual document to answer.", time: ts() }]);
      return;
    }
    setChatMessages((p) => [...p, { role: "user", text, time: ts() }]);
    setChatInput(""); setChatTyping(true);
    const historyForApi = chatMessages.filter((_, i) => i > 0).slice(-6)
      .map((m) => ({ role: m.role === "bot" ? "assistant" : "user", content: m.text }));
    try {
      const data = await queryBackend(text, currentDocName, historyForApi);
      setChatMessages((p) => [...p, { role: "bot", text: data.answer, time: ts(), sources: data.sources }]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setChatMessages((p) => [...p, {
        role: "bot",
        text: msg.includes("Failed to fetch") || msg.includes("404")
          ? `Could not reach backend at ${API_BASE_URL}/query. Make sure your FastAPI server is running.`
          : `Error: ${msg}`,
        time: ts(),
      }]);
    } finally {
      setChatTyping(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [chatInput, chatTyping, currentDocName, chatMessages]);

  const runComparison = async () => {
    const docA = history.find((d) => d.id === compareA);
    const docB = history.find((d) => d.id === compareB);
    if (!docA || !docB) return;
    setComparing(true); setCompareResult("");
    try { setCompareResult(await compareDocsViaBackend(docA, docB)); }
    catch (e: unknown) { setCompareResult(`Comparison failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setComparing(false); }
  };

  const exportSummary = () => {
    const doc = history.find((d) => d.id === currentDocId); if (!doc) return;
    const content = settings.exportFormat === "md"
      ? `# ${doc.name}\n**Date:** ${doc.date} | **Depth:** ${doc.depth}\n\n## Summary\n${doc.summary}\n\n## Key Points\n${doc.keyPoints.map((k, i) => `${i + 1}. ${k.preview}`).join("\n")}\n\n## Tags\n${doc.tags.join(", ") || "None"}`
      : settings.exportFormat === "json"
        ? JSON.stringify({ name: doc.name, date: doc.date, depth: doc.depth, summary: doc.summary, keyPoints: doc.keyPoints.map((k) => k.preview), tags: doc.tags }, null, 2)
        : `${doc.name}\n${"=".repeat(40)}\nDate: ${doc.date} | Depth: ${doc.depth}\n\nSUMMARY\n${doc.summary}\n\nKEY POINTS\n${doc.keyPoints.map((k, i) => `${i + 1}. ${k.preview}`).join("\n")}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    a.download = `${doc.name.replace(/\s+/g, "_")}_summary.${settings.exportFormat}`;
    a.click();
  };

  const savedDocs = history.filter((d) => d.saved);
  const taggedDocs = tagFilter ? history.filter((d) => d.tags.includes(tagFilter)) : history;
  const currentDoc = history.find((d) => d.id === currentDocId);
  const fontSizeMap = { small: "12px", medium: "14px", large: "16px" };

  return (
    <div className="app" style={{ fontSize: fontSizeMap[settings.fontSize] }}>
      <div className="bg-grid" />
      <Particles />
      <Header currentPage={page} onNavigate={navigate} isLoggedIn={isLoggedIn} onLogout={handleLogout} />

      {showDemoGate && (
        <div className="modal-overlay" onClick={() => setShowDemoGate(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">🔒</div>
            <h3 className="modal-title">Demo limit reached</h3>
            <p className="modal-desc">You've used {DEMO_LIMIT} free demo analyses. Create a free account for unlimited access.</p>
            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button className="submit-btn" style={{ flex: 1 }} onClick={() => { setShowDemoGate(false); navigate("auth", "signup"); }}>Create Free Account →</button>
              <button className="back-btn" onClick={() => setShowDemoGate(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {page === "landing" && <Landing onGetStarted={() => navigate("auth", "signup")} onTryDemo={handleTryDemo} demoUsed={demoCount} demoLimit={DEMO_LIMIT} />}
      {page === "auth" && <Auth initialTab={authTab} onSuccess={handleAuthSuccess} />}

      {page === "app" && (
        <div className="app-layout">
          {analyzing && (
            <div className="analyzing-overlay">
              <div className="analyze-spinner" />
              <div className="analyze-text">{analyzeStage}</div>
              <div className="analyze-sub">Depth: {depth} · Llama 3.1:8b · FAISS IndexFlatL2</div>
            </div>
          )}

          <aside className="sidebar">
            <div className="sidebar-section">
              <div className="sidebar-label">workspace</div>
              {([["new", "📋", "New Analysis"], ["recent", "🕒", "Recent Docs"], ["saved", "⭐", "Saved Summaries"]] as [SidebarView, string, string][]).map(([v, icon, label]) => (
                <div key={v} className={`sidebar-item${sidebarView === v ? " active" : ""}`} onClick={() => setSidebarView(v)}>
                  <span className="sidebar-icon">{icon}</span>{label}
                  {v === "recent" && history.length > 0 && <span className="sidebar-count">{history.length}</span>}
                  {v === "saved" && savedDocs.length > 0 && <span className="sidebar-count">{savedDocs.length}</span>}
                </div>
              ))}
            </div>
            <div className="sidebar-section">
              <div className="sidebar-label">tools</div>
              {([["chatbot", "🤖", "AI Chatbot"], ["comparator", "📊", "Comparator"], ["tags", "🏷", "Tag Manager"]] as [SidebarView, string, string][]).map(([v, icon, label]) => (
                <div key={v} className={`sidebar-item${sidebarView === v ? " active" : ""}`} onClick={() => setSidebarView(v)}>
                  <span className="sidebar-icon">{icon}</span>{label}
                </div>
              ))}
            </div>
            <div className="sidebar-section">
              <div className="sidebar-label">account</div>
              <div className={`sidebar-item${sidebarView === "dashboard" ? " active" : ""}`} onClick={() => setSidebarView("dashboard")}>
                <span className="sidebar-icon">👤</span>My Profile
              </div>
              <div className={`sidebar-item${sidebarView === "settings" ? " active" : ""}`} onClick={() => setSidebarView("settings")}>
                <span className="sidebar-icon">⚙</span>Settings
              </div>
              <div className="sidebar-item" onClick={handleLogout}><span className="sidebar-icon">←</span>Sign Out</div>
            </div>
          </aside>

          <main className="main-content">

            {/* DASHBOARD */}
            {sidebarView === "dashboard" && (() => {
              const totalDocs = history.length;
              const savedCount = history.filter(d => d.saved).length;
              const flaggedDocs = history.filter(d => d.redFlags && d.redFlags.length > 0).length;
              const totalFlags = history.reduce((acc, d) => acc + (d.redFlags?.length ?? 0), 0);
              const depthCounts = { Brief: 0, Standard: 0, Detailed: 0 } as Record<string, number>;
              history.forEach(d => { if (depthCounts[d.depth] !== undefined) depthCounts[d.depth]++; });
              const recentDocs = [...history].slice(0, 4);
              const joinDate = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
              const user = currentUser;
              const displayName = user ? `${user.firstName}${user.lastName ? " " + user.lastName : ""}` : "Demo User";
              const initials = user ? `${user.firstName[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() : "DU";
              return (
                <div className="dashboard-page">
                  {/* ── PROFILE HERO ── */}
                  <div className="dash-profile-hero">
                    <div className="dash-avatar-wrap">
                      <div className="dash-avatar">{initials}</div>
                      <div className="dash-avatar-ring" />
                    </div>
                    <div className="dash-profile-info">
                      <div className="dash-name">{displayName}</div>
                      {user?.email && <div className="dash-email">{user.email}</div>}
                      {user?.org && <div className="dash-org">🏛 {user.org}</div>}
                      <div className="dash-joined">Member since {joinDate}</div>
                    </div>
                    <div className="dash-profile-actions">
                      <button className="nav-btn nav-outline" onClick={() => setSidebarView("new")}>
                        + New Analysis
                      </button>
                      <button className="nav-btn nav-ghost" style={{ border: "1px solid var(--rim)" }} onClick={() => setSidebarView("settings")}>
                        ⚙ Settings
                      </button>
                    </div>
                  </div>

                  {/* ── STATS ROW ── */}
                  <div className="dash-stats-row">
                    {[
                      { icon: "📄", value: String(totalDocs), label: "Documents Analyzed", color: "var(--cyan)" },
                      { icon: "⭐", value: String(savedCount), label: "Saved Summaries", color: "#fbbf24" },
                      { icon: "🚩", value: String(totalFlags), label: "Red Flags Found", color: "#f87171" },
                      { icon: "🏷", value: String(allTags.length), label: "Tags Created", color: "#a78bfa" },
                    ].map(({ icon, value, label, color }) => (
                      <div key={label} className="dash-stat-card">
                        <div className="dash-stat-icon" style={{ color }}>{icon}</div>
                        <div className="dash-stat-value" style={{ color }}>{value}</div>
                        <div className="dash-stat-label">{label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="dash-grid">
                    {/* ── LEFT COLUMN ── */}
                    <div className="dash-col">

                      {/* Account Details card */}
                      <div className="card">
                        <div className="card-header">
                          <div className="card-title-row">
                            <span className="card-icon">👤</span>
                            <h2 className="card-title">Account Details</h2>
                          </div>
                        </div>
                        <div className="dash-detail-list">
                          {[
                            { label: "Full Name", value: displayName },
                            { label: "Email", value: user?.email ?? "—" },
                            { label: "Organization", value: user?.org || "Not specified" },
                            { label: "Account Type", value: isLoggedIn ? "Registered" : "Demo" },
                            { label: "Member Since", value: joinDate },
                          ].map(({ label, value }) => (
                            <div key={label} className="dash-detail-row">
                              <span className="dash-detail-label">{label}</span>
                              <span className="dash-detail-value">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Analysis Breakdown card */}
                      <div className="card" style={{ marginTop: 20 }}>
                        <div className="card-header">
                          <div className="card-title-row">
                            <span className="card-icon">📊</span>
                            <h2 className="card-title">Analysis Breakdown</h2>
                          </div>
                        </div>
                        <div className="dash-detail-list">
                          {[
                            { label: "Brief summaries", value: depthCounts.Brief },
                            { label: "Standard summaries", value: depthCounts.Standard },
                            { label: "Detailed summaries", value: depthCounts.Detailed },
                            { label: "Docs with red flags", value: flaggedDocs },
                            { label: "Total red flags", value: totalFlags },
                          ].map(({ label, value }) => (
                            <div key={label} className="dash-detail-row">
                              <span className="dash-detail-label">{label}</span>
                              <div className="dash-bar-wrap">
                                <div className="dash-bar-track">
                                  <div className="dash-bar-fill" style={{ width: totalDocs > 0 ? `${Math.min(100, (value / Math.max(totalDocs, 1)) * 100)}%` : "0%" }} />
                                </div>
                                <span className="dash-detail-value">{value}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* ── RIGHT COLUMN ── */}
                    <div className="dash-col">

                      {/* Recent Activity */}
                      <div className="card">
                        <div className="card-header">
                          <div className="card-title-row">
                            <span className="card-icon">🕒</span>
                            <h2 className="card-title">Recent Activity</h2>
                            {history.length > 0 && (
                              <button className="nav-btn nav-ghost" style={{ marginLeft: "auto", fontSize: 11, padding: "4px 10px", border: "1px solid var(--rim)" }}
                                onClick={() => setSidebarView("recent")}>View all →</button>
                            )}
                          </div>
                        </div>
                        {recentDocs.length === 0 ? (
                          <div style={{ padding: "24px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
                            No documents yet. <span style={{ color: "var(--cyan)", cursor: "pointer" }} onClick={() => setSidebarView("new")}>Upload your first →</span>
                          </div>
                        ) : (
                          <ul className="dash-activity-list">
                            {recentDocs.map((doc) => (
                              <li key={doc.id} className="dash-activity-item" onClick={() => { setSummary(doc.summary); setSummaryMap(doc.summaryMap); setKeyPoints(doc.keyPoints); setRedFlags(doc.redFlags ?? []); setDepth(doc.depth); setCurrentDocId(doc.id); setCurrentDocName(doc.name); setStep("results"); setSidebarView("new"); }}>
                                <div className="dash-activity-icon">📄</div>
                                <div className="dash-activity-body">
                                  <div className="dash-activity-name">{doc.name}</div>
                                  <div className="dash-activity-meta">
                                    {doc.date} · {doc.depth} · {doc.keyPoints.length} key points
                                    {doc.redFlags && doc.redFlags.length > 0 && (
                                      <span className="dash-activity-flags">⚠ {doc.redFlags.length} flag{doc.redFlags.length > 1 ? "s" : ""}</span>
                                    )}
                                  </div>
                                </div>
                                <div className="dash-activity-arrow">›</div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Quick Actions */}
                      <div className="card" style={{ marginTop: 20 }}>
                        <div className="card-header">
                          <div className="card-title-row">
                            <span className="card-icon">⚡</span>
                            <h2 className="card-title">Quick Actions</h2>
                          </div>
                        </div>
                        <div className="dash-actions-grid">
                          {[
                            { icon: "📋", label: "New Analysis", sub: "Upload a PDF", action: () => setSidebarView("new") },
                            { icon: "🤖", label: "AI Chatbot", sub: "Ask about a document", action: () => setSidebarView("chatbot") },
                            { icon: "📊", label: "Compare Docs", sub: "Side-by-side analysis", action: () => setSidebarView("comparator") },
                            { icon: "⭐", label: "Saved Summaries", sub: `${savedCount} saved`, action: () => setSidebarView("saved") },
                            { icon: "🏷", label: "Tag Manager", sub: `${allTags.length} tags`, action: () => setSidebarView("tags") },
                            { icon: "⚙", label: "Settings", sub: "Preferences & export", action: () => setSidebarView("settings") },
                          ].map(({ icon, label, sub, action }) => (
                            <div key={label} className="dash-action-card" onClick={action}>
                              <div className="dash-action-icon">{icon}</div>
                              <div className="dash-action-label">{label}</div>
                              <div className="dash-action-sub">{sub}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* NEW ANALYSIS */}
            {sidebarView === "new" && (
              <>
                {step === "upload" && (
                  <>
                    <div className="page-header">
                      <div>
                        <div className="page-title">New Analysis</div>
                        <div className="page-subtitle">Upload a PDF — processed by Llama 3.1 + FAISS locally</div>
                      </div>
                      {!isLoggedIn && <div className="demo-badge">{DEMO_LIMIT - demoCount} demo{DEMO_LIMIT - demoCount !== 1 ? "s" : ""} remaining</div>}
                    </div>

                    <div className={`drop-zone${dragOver ? " drag-over" : ""}${file ? " has-file" : ""}`}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)} onDrop={handleDrop}>
                      <div className="drop-icon">{file ? "✅" : "📤"}</div>
                      {file ? (
                        <><div className="drop-title">{file.name}</div><div className="drop-desc">{(file.size / 1024).toFixed(0)} KB · Click to change</div></>
                      ) : (
                        <><div className="drop-title">Drop your PDF here</div><div className="drop-desc">Drag & drop or click to browse</div>
                          <div className="format-tags"><span className="format-tag">PDF</span></div></>
                      )}
                      <input ref={fileInputRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                    </div>

                    <div className="text-paste-card" style={{ marginTop: 20 }}>
                      <div className="paste-label">⚙ ANALYSIS DEPTH — controls how much Llama summarizes</div>
                      <div className="options-row" style={{ marginTop: 8 }}>
                        <span className="options-label">Depth:</span>
                        {(["Brief", "Standard", "Detailed"] as Depth[]).map((d) => (
                          <div key={d} className={`option-pill${depth === d ? " selected" : ""}`} onClick={() => setDepth(d)}>{d}</div>
                        ))}
                        <button className="analyze-btn" onClick={handleUpload} disabled={!file || loading}>
                          {loading ? "Analyzing…" : "Analyze →"}
                        </button>
                      </div>
                      <div className="depth-hint">{depthHint(depth)}</div>
                      <div className="depth-engine-note">Powered by Llama 3.1:8b via Ollama · all-MiniLM-L6-v2 embeddings · FAISS IndexFlatL2</div>
                    </div>
                    {error && <div className="error-msg">⚠ {error}</div>}
                  </>
                )}

                {step === "results" && (
                  <>
                    <div className="results-topbar">
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <button className="back-btn" onClick={handleNewDoc}>← New Document</button>
                        <span className="result-complete-badge">✓ Analysis Complete</span>
                        <div className="depth-inline-switcher">
                          <span style={{ fontSize: 11, color: "var(--muted)" }}>Depth:</span>
                          {(["Brief", "Standard", "Detailed"] as Depth[]).map((d) => (
                            <button key={d} className={`depth-inline-btn${depth === d ? " active" : ""}`}
                              onClick={() => handleDepthChange(d)} disabled={depthLoading} title={depthHint(d)}>{d}</button>
                          ))}
                          {depthLoading && <span className="depth-loading">↻ Re-summarizing with Llama…</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="nav-btn nav-outline" onClick={() => currentDocId && toggleSaved(currentDocId)}>
                          {currentDoc?.saved ? "★ Saved" : "☆ Save"}
                        </button>
                        <button className="nav-btn nav-outline" onClick={exportSummary}>⬇ Export</button>
                        <button className="nav-btn nav-ghost" style={{ border: "1px solid var(--rim)" }}
                          onClick={() => navigator.clipboard.writeText(`${currentDocName}\n\n${summary}\n\nKey Points:\n${keyPoints.map((k, i) => `${i + 1}. ${k.preview}`).join("\n")}`)}>
                          📋 Copy
                        </button>
                      </div>
                    </div>

                    <div className="progress-wrap">
                      <div className="progress-label">
                        <span>Analysis complete · {depth} depth · Llama 3.1:8b + FAISS</span>
                        <span style={{ color: "var(--cyan)" }}>100%</span>
                      </div>
                      <div className="progress-bar"><div className="progress-fill" style={{ width: "100%" }} /></div>
                    </div>

                    <div className="results-grid-single">
                      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                        {/* Key Points */}
                        <div className="card">
                          <div className="card-header">
                            <div className="card-title-row">
                              <span className="card-icon">📌</span>
                              <h2 className="card-title">Key Points</h2>
                              <span className="count-badge">{keyPoints.length}</span>
                              <span className="depth-badge">{depth}</span>
                            </div>
                            <p className="section-hint">Click any point to reveal the source paragraph from the document.</p>
                          </div>
                          <ul className="bullet-list">
                            {keyPoints.length === 0 && <li style={{ padding: "16px 24px", color: "var(--muted)", fontSize: 13 }}>No key points extracted.</li>}
                            {keyPoints.map((kp, i) => (
                              <li key={i} className="bullet-item">
                                <details>
                                  <summary><span className="kp-num">{i + 1}</span>{kp.preview}<span className="chevron">›</span></summary>
                                  <div className="trace-content">
                                    {kp.summary_sentence && (
                                      <div className="trace-block">
                                        <span className="trace-label">Mapped summary sentence</span>
                                        <p>{kp.summary_sentence}</p>
                                      </div>
                                    )}
                                    <div className="trace-block">
                                      <span className="trace-label">Source — paragraph {kp.chunk_index + 1}</span>
                                      <p className="source-para">{kp.source_paragraph}</p>
                                    </div>
                                  </div>
                                </details>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Red Flags — always shown, content depends on findings */}
                        <div className={`card red-flags-card${redFlags.length === 0 ? " rf-clean" : ""}`}>
                          <div className="card-header">
                            <div className="card-title-row">
                              <span className="card-icon">{redFlags.length > 0 ? "🚩" : "✅"}</span>
                              <h2 className="card-title">
                                {redFlags.length > 0 ? "Red Flags Detected" : "Risk Analysis"}
                              </h2>
                              {redFlags.length > 0
                                ? <><span className="count-badge rf-count">{redFlags.length}</span>
                                  <span className="rf-disclaimer">Review before signing</span></>
                                : <span className="rf-clean-badge">No red flags found</span>
                              }
                            </div>
                            <p className="section-hint">
                              {redFlags.length > 0
                                ? "These clauses were automatically detected as potentially unfavourable. Click any flag to see the exact excerpt and why it matters."
                                : "No high-risk clauses were detected in this document. This covers unlimited liability, irrevocable rights transfers, auto-renewals, data sales, mandatory arbitration, and 11 other risk categories."}
                            </p>
                          </div>

                          {redFlags.length > 0 && (
                            <>
                              <div className="rf-severity-bar">
                                {["critical", "high", "medium"].map((sev) => {
                                  const cnt = redFlags.filter(f => f.severity === sev).length;
                                  return cnt > 0 ? (
                                    <span key={sev} className={`rf-sev-pill rf-sev-${sev}`}>
                                      {sev === "critical" ? "🔴" : sev === "high" ? "🟠" : "🟡"}
                                      {" "}{cnt} {sev}
                                    </span>
                                  ) : null;
                                })}
                                <span className="rf-categories-scanned">
                                  15 risk categories scanned
                                </span>
                              </div>
                              <ul className="rf-list">
                                {redFlags.map((flag, i) => (
                                  <li key={i} className={`rf-item rf-item-${flag.severity}`}>
                                    <details>
                                      <summary className="rf-summary">
                                        <span className={`rf-badge rf-badge-${flag.severity}`}>
                                          {flag.severity === "critical" ? "CRITICAL" : flag.severity === "high" ? "HIGH" : "MEDIUM"}
                                        </span>
                                        <span className="rf-category">{flag.category}</span>
                                        <span className="chevron">›</span>
                                      </summary>
                                      <div className="rf-detail">
                                        <div className="rf-explanation">{flag.explanation}</div>
                                        <div className="rf-excerpt-wrap">
                                          <div className="trace-label">Flagged excerpt — paragraph {flag.chunk_index + 1}</div>
                                          <blockquote className="rf-excerpt">"{flag.excerpt}"</blockquote>
                                        </div>
                                        <div className="rf-trigger-row">
                                          <span className="trace-label">Matched pattern:</span>
                                          <code className="rf-trigger">{flag.trigger}</code>
                                        </div>
                                        <details className="rf-source-toggle">
                                          <summary style={{ fontSize: 11, color: "var(--muted)", cursor: "pointer" }}>Show full source paragraph</summary>
                                          <p className="source-para" style={{ marginTop: 8 }}>{flag.source_paragraph}</p>
                                        </details>
                                      </div>
                                    </details>
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}

                          {redFlags.length === 0 && (
                            <div className="rf-clean-body">
                              <div className="rf-clean-categories">
                                {[
                                  "Unlimited Liability", "Irrevocable Rights", "Unilateral Modification",
                                  "Data Sale", "Mandatory Arbitration", "Auto-Renewal", "Hidden Fees",
                                  "One-Sided Termination", "Broad Indemnification", "Warranty Disclaimer",
                                  "Non-Compete", "Force Majeure", "Governing Law", "Confidentiality Trap", "Surveillance",
                                ].map((cat) => (
                                  <span key={cat} className="rf-clean-cat">✓ {cat}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Summary */}
                        <div className="card">
                          <div className="card-header">
                            <div className="card-title-row">
                              <span className="card-icon">📋</span>
                              <h2 className="card-title">Document Summary</h2>
                              <span className="depth-badge">{depth}</span>
                            </div>
                            <p className="section-hint">Click any sentence to see the source paragraph it was derived from.</p>
                          </div>
                          <div className="summary-blocks">
                            {summaryMap.length > 0 ? summaryMap.map((sm, i) => (
                              <details key={i} className="summary-detail">
                                <summary>
                                  <span className="summary-bullet" />
                                  {sm.summary_sentence}{!sm.summary_sentence.endsWith(".") && "."}
                                  <span className="chevron">›</span>
                                </summary>
                                <div className="trace-content">
                                  <span className="trace-label">Source — chunk {sm.chunk_index + 1}</span>
                                  <p className="source-para">{sm.source_paragraph}</p>
                                </div>
                              </details>
                            )) : <p className="summary-text">{summary || "No summary available."}</p>}
                          </div>
                        </div>

                        {/* Tags */}
                        <div className="card" style={{ padding: 20 }}>
                          <div className="card-title-row" style={{ marginBottom: 12 }}>
                            <span className="card-icon">🏷</span><span className="card-title">Tags</span>
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                            {(currentDoc?.tags ?? []).map((tag) => (
                              <span key={tag} className="tag-chip">{tag}
                                <button className="tag-remove" onClick={() => currentDocId && removeTagFromDoc(currentDocId, tag)}>×</button>
                              </span>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <input className="form-input" style={{ flex: 1, padding: "8px 12px" }} placeholder="Add a tag…"
                              value={newTagInput} onChange={(e) => setNewTagInput(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && addTagToDoc(newTagInput)} />
                            <button className="nav-btn nav-outline" onClick={() => addTagToDoc(newTagInput)}>Add</button>
                          </div>
                          {allTags.length > 0 && (
                            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {allTags.map((t) => <span key={t} className="tag-suggestion" onClick={() => addTagToDoc(t)}>{t}</span>)}
                            </div>
                          )}
                        </div>
                      </div>

                    </div>

                    <div className="action-row">
                      <button className="nav-btn nav-ghost" style={{ border: "1px solid var(--rim)" }} onClick={handleNewDoc}>← New Document</button>
                      <button className="nav-btn nav-outline" onClick={exportSummary}>⬇ Export Summary</button>
                      <button className="nav-btn nav-outline" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => setSidebarView("chatbot")}>
                        🤖 Ask PolicyBot
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {/* RECENT DOCS */}
            {sidebarView === "recent" && (
              <div>
                <div className="page-header"><div><div className="page-title">Recent Documents</div><div className="page-subtitle">Your analysis history — click to reopen</div></div></div>
                {history.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon">🕒</div><div className="empty-title">No history yet</div><p className="empty-desc">Analyzed documents appear here automatically.</p></div>
                ) : (
                  <div className="doc-list">
                    {history.map((doc) => (
                      <div key={doc.id} className="doc-card" onClick={() => openDoc(doc)}>
                        <div className="doc-card-left">
                          <div className="doc-card-icon">📄</div>
                          <div>
                            <div className="doc-card-name">{doc.name}</div>
                            <div className="doc-card-meta">{doc.date} · {doc.depth} · {doc.keyPoints.length} key points</div>
                            {doc.tags.length > 0 && <div style={{ display: "flex", gap: 4, marginTop: 4 }}>{doc.tags.map((t) => <span key={t} className="tag-chip-sm">{t}</span>)}</div>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                          <button className="icon-btn" onClick={() => toggleSaved(doc.id)}>{doc.saved ? "★" : "☆"}</button>
                          <button className="nav-btn nav-outline" style={{ fontSize: 11, padding: "5px 12px" }} onClick={() => openDoc(doc)}>Open →</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SAVED SUMMARIES */}
            {sidebarView === "saved" && (
              <div>
                <div className="page-header"><div><div className="page-title">Saved Summaries</div><div className="page-subtitle">Starred documents for quick access</div></div></div>
                {savedDocs.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon">⭐</div><div className="empty-title">No saved summaries</div><p className="empty-desc">Star any document from results or history.</p></div>
                ) : (
                  <div className="doc-list">
                    {savedDocs.map((doc) => (
                      <div key={doc.id} className="doc-card">
                        <div className="doc-card-left">
                          <div className="doc-card-icon">📄</div>
                          <div>
                            <div className="doc-card-name">{doc.name}</div>
                            <div className="doc-card-meta">{doc.date} · {doc.depth}</div>
                            <div className="doc-card-summary">{doc.summary.slice(0, 140)}…</div>
                            {doc.tags.length > 0 && <div style={{ display: "flex", gap: 4, marginTop: 6 }}>{doc.tags.map((t) => <span key={t} className="tag-chip-sm">{t}</span>)}</div>}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <button className="icon-btn active" onClick={() => toggleSaved(doc.id)}>★</button>
                          <button className="nav-btn nav-outline" style={{ fontSize: 11, padding: "5px 12px" }} onClick={() => openDoc(doc)}>Open →</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* CHATBOT STANDALONE */}
            {sidebarView === "chatbot" && (
              <div className="chatbot-page">
                <div className="page-header">
                  <div>
                    <div className="page-title">AI Chatbot</div>
                    <div className="page-subtitle">
                      {currentDocName
                        ? `Discussing: ${currentDocName}`
                        : "Upload a document via New Analysis to begin chatting"}
                    </div>
                  </div>
                  <div className="llm-badge">Llama 3.1:8b · FAISS RAG</div>
                </div>
                <ChatPanelView
                  chatMessages={chatMessages}
                  chatTyping={chatTyping}
                  chatInput={chatInput}
                  setChatInput={setChatInput}
                  sendChat={sendChat}
                  currentDocName={currentDocName}
                  chatEndRef={chatEndRef}
                  showTimestamps={settings.showTimestamps}
                />
              </div>
            )}

            {/* COMPARATOR */}
            {sidebarView === "comparator" && (
              <div>
                <div className="page-header">
                  <div><div className="page-title">Document Comparator</div>
                    <div className="page-subtitle">AI-powered comparison of two documents via Llama + FAISS</div>
                  </div>
                </div>
                {history.length < 2 ? (
                  <div className="empty-state"><div className="empty-icon">📊</div><div className="empty-title">Need 2+ documents</div><p className="empty-desc">Analyze at least two documents to use the comparator.</p></div>
                ) : (
                  <>
                    <div className="comparator-selectors">
                      <div className="compare-selector-card">
                        <div className="compare-selector-label">DOCUMENT A</div>
                        <select className="form-input" value={compareA} onChange={(e) => setCompareA(e.target.value)}>
                          <option value="">Select document…</option>
                          {history.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.date} · {d.depth})</option>)}
                        </select>
                        {compareA && <div className="compare-preview">{history.find(d => d.id === compareA)?.summary.slice(0, 160)}…</div>}
                      </div>
                      <div className="compare-vs">VS</div>
                      <div className="compare-selector-card">
                        <div className="compare-selector-label">DOCUMENT B</div>
                        <select className="form-input" value={compareB} onChange={(e) => setCompareB(e.target.value)}>
                          <option value="">Select document…</option>
                          {history.filter(d => d.id !== compareA).map((d) => <option key={d.id} value={d.id}>{d.name} ({d.date} · {d.depth})</option>)}
                        </select>
                        {compareB && <div className="compare-preview">{history.find(d => d.id === compareB)?.summary.slice(0, 160)}…</div>}
                      </div>
                    </div>
                    <button className="cta-primary" style={{ marginTop: 20 }} onClick={runComparison} disabled={!compareA || !compareB || comparing}>
                      {comparing ? "Comparing with Llama…" : "Run AI Comparison →"}
                    </button>
                    {compareResult && (
                      <div className="card" style={{ marginTop: 20 }}>
                        <div className="card-header">
                          <div className="card-title-row">
                            <span className="card-icon">📊</span>
                            <h2 className="card-title">Comparison Result</h2>
                            <div className="llm-badge" style={{ marginLeft: "auto" }}>Llama 3.1:8b</div>
                          </div>
                        </div>
                        <div style={{ padding: "20px 24px" }}>
                          <p style={{ fontSize: 13, lineHeight: 1.9, color: "var(--text)", whiteSpace: "pre-wrap" }}>{compareResult}</p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* TAG MANAGER */}
            {sidebarView === "tags" && (
              <div>
                <div className="page-header"><div><div className="page-title">Tag Manager</div><div className="page-subtitle">Organize documents by tag for fast retrieval</div></div></div>
                <div className="tag-manager-layout">
                  <div className="tag-sidebar-panel">
                    <div className="panel-label">ALL TAGS ({allTags.length})</div>
                    <div className="tag-cloud">
                      <div className={`tag-cloud-item${tagFilter === null ? " active" : ""}`} onClick={() => setTagFilter(null)}>All Documents <span className="tag-cloud-count">{history.length}</span></div>
                      {allTags.map((tag) => {
                        const cnt = history.filter(d => d.tags.includes(tag)).length;
                        return <div key={tag} className={`tag-cloud-item${tagFilter === tag ? " active" : ""}`} onClick={() => setTagFilter(tag === tagFilter ? null : tag)}>{tag} <span className="tag-cloud-count">{cnt}</span></div>;
                      })}
                    </div>
                    {allTags.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>No tags yet.</div>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="panel-label">{tagFilter ? `TAGGED "${tagFilter}"` : "ALL DOCUMENTS"} ({taggedDocs.length})</div>
                    {taggedDocs.length === 0 ? (
                      <div className="empty-state" style={{ marginTop: 16 }}><div className="empty-icon">🔍</div><div className="empty-title">No documents with this tag</div></div>
                    ) : (
                      <div className="doc-list">
                        {taggedDocs.map((doc) => (
                          <div key={doc.id} className="doc-card">
                            <div className="doc-card-left">
                              <div className="doc-card-icon">📄</div>
                              <div>
                                <div className="doc-card-name">{doc.name}</div>
                                <div className="doc-card-meta">{doc.date} · {doc.depth}</div>
                                <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                                  {doc.tags.map((t) => <span key={t} className="tag-chip">{t}<button className="tag-remove" onClick={() => removeTagFromDoc(doc.id, t)}>×</button></span>)}
                                </div>
                              </div>
                            </div>
                            <button className="nav-btn nav-outline" style={{ fontSize: 11, padding: "5px 12px" }} onClick={() => openDoc(doc)}>Open →</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SETTINGS */}
            {sidebarView === "settings" && (
              <div>
                <div className="page-header"><div><div className="page-title">Settings</div><div className="page-subtitle">Customize your PolicyLens experience</div></div></div>
                <div className="settings-grid">
                  <div className="settings-card">
                    <div className="settings-card-title">⚡ Analysis Defaults</div>
                    <div className="settings-row">
                      <div className="settings-label"><span>Default Summary Depth</span><span className="settings-hint">Applied to every new analysis</span></div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {(["Brief", "Standard", "Detailed"] as Depth[]).map((d) => (
                          <button key={d} className={`option-pill${settings.defaultDepth === d ? " selected" : ""}`} onClick={() => setSettings(s => ({ ...s, defaultDepth: d }))}>{d}</button>
                        ))}
                      </div>
                    </div>
                    <div className="settings-row">
                      <div className="settings-label"><span>Auto-save documents</span><span className="settings-hint">Star every analysis automatically</span></div>
                      <button className={`toggle-btn${settings.autoSave ? " on" : ""}`} onClick={() => setSettings(s => ({ ...s, autoSave: !s.autoSave }))}>{settings.autoSave ? "ON" : "OFF"}</button>
                    </div>
                  </div>
                  <div className="settings-card">
                    <div className="settings-card-title">🖥 Display</div>
                    <div className="settings-row">
                      <div className="settings-label"><span>Font Size</span><span className="settings-hint">Affects all dashboard text</span></div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {(["small", "medium", "large"] as const).map((s) => (
                          <button key={s} className={`option-pill${settings.fontSize === s ? " selected" : ""}`} style={{ textTransform: "capitalize" }} onClick={() => setSettings(st => ({ ...st, fontSize: s }))}>{s}</button>
                        ))}
                      </div>
                    </div>
                    <div className="settings-row">
                      <div className="settings-label"><span>Show timestamps</span><span className="settings-hint">Display time on chat messages</span></div>
                      <button className={`toggle-btn${settings.showTimestamps ? " on" : ""}`} onClick={() => setSettings(s => ({ ...s, showTimestamps: !s.showTimestamps }))}>{settings.showTimestamps ? "ON" : "OFF"}</button>
                    </div>
                  </div>
                  <div className="settings-card">
                    <div className="settings-card-title">📤 Export</div>
                    <div className="settings-row">
                      <div className="settings-label"><span>Export format</span><span className="settings-hint">Used when exporting summaries</span></div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {(["md", "json", "txt"] as const).map((f) => (
                          <button key={f} className={`option-pill${settings.exportFormat === f ? " selected" : ""}`} style={{ textTransform: "uppercase", fontSize: 11 }} onClick={() => setSettings(s => ({ ...s, exportFormat: f }))}>{f}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="settings-card">
                    <div className="settings-card-title">🗂 Data Management</div>
                    <div className="settings-row">
                      <div className="settings-label"><span>Analysis history</span><span className="settings-hint">{history.length} documents in browser storage</span></div>
                      <button style={{ background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", color: "#fda4af", fontSize: 12, padding: "6px 14px", borderRadius: 6, cursor: "pointer" }}
                        onClick={() => { if (window.confirm("Clear all history?")) { { setHistory([]); localStorage.removeItem(HISTORY_KEY); } } }}>Clear History</button>
                    </div>
                    <div className="settings-row">
                      <div className="settings-label"><span>Demo uses remaining</span><span className="settings-hint">Resets on sign-in</span></div>
                      <span style={{ fontSize: 13, color: "var(--cyan)" }}>{Math.max(0, DEMO_LIMIT - demoCount)} / {DEMO_LIMIT}</span>
                    </div>
                  </div>
                  <div className="settings-card">
                    <div className="settings-card-title">⚙ Backend Stack</div>
                    <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 2 }}>
                      <div>API: <span style={{ color: "var(--cyan)", fontFamily: "DM Mono,monospace" }}>{API_BASE_URL}</span></div>
                      <div>LLM: <span style={{ color: "var(--text)" }}>Llama 3.1:8b via Ollama</span></div>
                      <div>Embeddings: <span style={{ color: "var(--text)" }}>all-MiniLM-L6-v2 (384d)</span></div>
                      <div>Vector Store: <span style={{ color: "var(--text)" }}>FAISS IndexFlatL2</span></div>
                      <div>Chat: <span style={{ color: "var(--text)" }}>RAG via /query endpoint</span></div>
                      <div>Re-summarize: <span style={{ color: "var(--text)" }}>via /summarize endpoint</span></div>
                    </div>
                  </div>
                  <div className="settings-card">
                    <div className="settings-card-title">ℹ About PolicyLens</div>
                    <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 2 }}>
                      <div>Version: <span style={{ color: "var(--text)" }}>2.5.0</span></div>
                      <div>Storage: <span style={{ color: "var(--text)" }}>Browser only · no cloud upload</span></div>
                      <div style={{ marginTop: 10, fontSize: 11, color: "var(--faint)" }}>© 2025 PolicyLens. Built for civic transparency.</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </main>
        </div>
      )}
    </div>
  );
};
