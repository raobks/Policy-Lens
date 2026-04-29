import React from "react";
import { Footer } from "../components/Footer";

interface LandingProps {
  onGetStarted: () => void;
  onTryDemo: () => void;
  demoUsed: number;
  demoLimit: number;
}

const FEATURES = [
  { icon: "📄", title: "Multi-format Upload", desc: "Drop PDFs, DOCX, TXT, or paste raw text directly. Automatic extraction and chunking." },
  { icon: "⚡", title: "Depth-Aware Summary", desc: "Choose Brief, Standard, or Detailed — the AI adjusts scope, length, and granularity accordingly." },
  { icon: "🤖", title: "Policy Chatbot", desc: "Ask specific questions about any section post-summarization. Powered by Claude with full document context." },
  { icon: "🏷", title: "Tag Manager", desc: "Organize your documents with custom tags. Filter and retrieve any analysis instantly." },
  { icon: "📊", title: "Document Comparator", desc: "Select two analyzed documents and get a structured AI comparison of similarities, differences, and scope." },
  { icon: "🔒", title: "Local-First & Secure", desc: "All history stored in your browser only. No documents leave your device without your action." },
];

export const Landing: React.FC<LandingProps> = ({ onGetStarted, onTryDemo, demoUsed, demoLimit }) => {
  const remaining = Math.max(0, demoLimit - demoUsed);

  return (
    <div className="landing-page">
      {/* Hero */}
      <section className="hero">
        <div className="orb-wrap">
          <div className="orb" />
          <div className="orb-ring" />
          <div className="orb-ring-2" />
        </div>

        <div className="badge">
          <span className="badge-dot" />
          AI-Powered · Government Policy · v2.4
        </div>

        <h1 className="hero-title">
          Understand <em>any</em> policy<br />document instantly
        </h1>

        <p className="hero-sub">
          PolicyLens distills hundreds of pages of government legislation,
          regulations, and policy briefs into clear, actionable summaries
          in seconds — with full source tracing.
        </p>

        <div className="hero-cta">
          <button className="cta-primary" onClick={onGetStarted}>
            Start for free →
          </button>
          <button
            className="cta-secondary"
            onClick={onTryDemo}
            disabled={remaining === 1}
            style={remaining === 1 ? { opacity: 0.5, cursor: "not-allowed" } : {}}
          >
            {remaining > 0 ? `Try demo (${remaining} left)` : "Demo limit reached"}
          </button>
        </div>

        <div className="stats-row">
          {[
            ["140+", "Documents Analyzed"],
            ["98%",  "Accuracy Rate"],
            ["60sec", "Avg. Summary Time"],
            ["100+", "Gov. Agencies Covered"],
          ].map(([num, label]) => (
            <div key={label} className="stat">
              <div className="stat-num" dangerouslySetInnerHTML={{ __html: num.replace(/([A-Za-z%+]+)/, "<span>$1</span>") }} />
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <div className="section">
        <div className="section-label">// capabilities</div>
        <h2 className="section-title">
          Everything you need to<br /><em>decode</em> government language
        </h2>

        <div className="features-grid-new">
          {FEATURES.map((f) => (
            <div key={f.title} className="feat-card-new">
              <div className="feat-icon-new">{f.icon}</div>
              <div>
                <div className="feat-title-new">{f.title}</div>
                <p className="feat-desc-new">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="section" style={{ paddingTop: 0 }}>
        <div className="section-label">// how it works</div>
        <h2 className="section-title">Three steps to clarity</h2>
        <div className="steps-row">
          {[
            { n: "01", title: "Upload or Paste", desc: "Drop a PDF or paste any policy text directly into the editor." },
            { n: "02", title: "Choose Your Depth", desc: "Select Brief, Standard, or Detailed — the AI calibrates its output accordingly." },
            { n: "03", title: "Explore & Question", desc: "Read the traceable summary, drill into sources, and chat with PolicyBot." },
          ].map((s) => (
            <div key={s.n} className="step-card">
              <div className="step-num">{s.n}</div>
              <div className="step-title">{s.title}</div>
              <p className="step-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <Footer />
    </div>
  );
};