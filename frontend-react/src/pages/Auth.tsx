import React, { useState } from "react";

type AuthTab = "login" | "signup";

interface AuthProps {
  initialTab?: AuthTab;
  onSuccess: () => void;
}

const STORAGE_KEY = "policylens_users";
const CURRENT_USER_KEY = "policylens_current_user";

interface StoredUser {
  firstName: string;
  lastName: string;
  email: string;
  org: string;
  password: string;
}

function getUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveUser(user: StoredUser) {
  const users = getUsers();
  users.push(user);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

function findUser(email: string, password: string): StoredUser | null {
  return getUsers().find(
    (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  ) ?? null;
}

function emailExists(email: string): boolean {
  return getUsers().some((u) => u.email.toLowerCase() === email.toLowerCase());
}

export const Auth: React.FC<AuthProps> = ({ initialTab = "login", onSuccess }) => {
  const [tab, setTab] = useState<AuthTab>(initialTab);

  // ── Signup state ──
  const [signupFirstName, setSignupFirstName] = useState("");
  const [signupLastName, setSignupLastName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupOrg, setSignupOrg] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupError, setSignupError] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState(false);

  // ── Login state ──
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  // ── Signup submit ──
  const handleSignup = () => {
    setSignupError(null);
    if (!signupFirstName.trim()) { setSignupError("First name is required."); return; }
    if (!signupEmail.trim() || !/\S+@\S+\.\S+/.test(signupEmail)) { setSignupError("Enter a valid email address."); return; }
    if (signupPassword.length < 8) { setSignupError("Password must be at least 8 characters."); return; }
    if (emailExists(signupEmail)) { setSignupError("An account with this email already exists."); return; }

    saveUser({
      firstName: signupFirstName.trim(),
      lastName: signupLastName.trim(),
      email: signupEmail.trim(),
      org: signupOrg.trim(),
      password: signupPassword,
    });

    setSignupSuccess(true);

    // After 1.6s show success → switch to login with email pre-filled
    setTimeout(() => {
      setLoginEmail(signupEmail.trim());
      setLoginPassword("");
      setLoginError(null);
      setSignupSuccess(false);
      setSignupFirstName(""); setSignupLastName("");
      setSignupEmail(""); setSignupOrg(""); setSignupPassword("");
      setTab("login");
    }, 1600);
  };

  // ── Login submit ──
  const handleLogin = () => {
    setLoginError(null);
    if (!loginEmail.trim()) { setLoginError("Please enter your email."); return; }
    if (!loginPassword) { setLoginError("Please enter your password."); return; }

    const user = findUser(loginEmail, loginPassword);
    if (!user) {
      setLoginError("No account found with these credentials. Please sign up first.");
      return;
    }
    // Save current user so App.tsx can show their profile details
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    onSuccess();
  };

  const switchTab = (t: AuthTab) => {
    setSignupError(null);
    setLoginError(null);
    setTab(t);
  };

  return (
    <div className="auth-page">
      {/* Animated background orb */}
      <div className="auth-orb" />

      <div className="auth-container">
        <div className="auth-card">

          {/* Logo */}
          <div className="auth-header">
            <div className="auth-logo-wrap">
              <div className="auth-logo-icon">⚖</div>
              <div className="auth-logo">Policy<span>Lens</span></div>
            </div>
            <div className="auth-tagline">Decode policy. Drive decisions.</div>
          </div>

          {/* Tab switcher */}
          <div className="tab-switch">
            <button
              className={`tab-btn${tab === "login" ? " active" : ""}`}
              onClick={() => switchTab("login")}
            >
              Log In
            </button>
            <button
              className={`tab-btn${tab === "signup" ? " active" : ""}`}
              onClick={() => switchTab("signup")}
            >
              Sign Up
            </button>
          </div>

          {/* ── LOGIN FORM ── */}
          {tab === "login" && (
            <div className="auth-form-body" key="login">
              <div className="form-group">
                <label className="form-label">EMAIL ADDRESS</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="you@agency.gov"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">PASSWORD</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>

              {loginError && (
                <div className="auth-error">
                  <span className="auth-error-icon">⚠</span>
                  {loginError}
                </div>
              )}

              <button className="submit-btn" onClick={handleLogin}>
                Access PolicyLens →
              </button>

              <div className="auth-divider">or continue with</div>
              <button
                className="social-btn"
                onClick={() => {
                  window.location.href = "http://127.0.0.1:8000/auth/google";
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Continue with Google
              </button>
              <button className="social-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
                  <path d="M11.4 24H0V12.6L11.4 24zM12.6 24H24V12.6L12.6 24zM24 11.4V0H12.6L24 11.4zM11.4 0H0v11.4L11.4 0z" />
                </svg>
                Continue with Microsoft
              </button>

              <div className="auth-footer-text">
                No account yet?{" "}
                <span className="auth-link" onClick={() => switchTab("signup")}>
                  Create one free →
                </span>
              </div>
            </div>
          )}

          {/* ── SIGNUP FORM ── */}
          {tab === "signup" && (
            <div className="auth-form-body" key="signup">

              {/* Success flash */}
              {signupSuccess && (
                <div className="auth-success">
                  <span>✓</span> Account created! Redirecting to login…
                </div>
              )}

              {!signupSuccess && (
                <>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">FIRST NAME</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Alex"
                        value={signupFirstName}
                        onChange={(e) => setSignupFirstName(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">LAST NAME</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Rivera"
                        value={signupLastName}
                        onChange={(e) => setSignupLastName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">WORK EMAIL</label>
                    <input
                      type="email"
                      className="form-input"
                      placeholder="you@agency.gov"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">ORGANIZATION</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Department / Agency / University"
                      value={signupOrg}
                      onChange={(e) => setSignupOrg(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">PASSWORD</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Min. 8 characters"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSignup()}
                    />
                    {signupPassword.length > 0 && (
                      <div className="password-strength">
                        <div
                          className="password-strength-bar"
                          style={{
                            width:
                              signupPassword.length < 8 ? "33%" :
                                signupPassword.length < 12 ? "66%" : "100%",
                            background:
                              signupPassword.length < 8 ? "var(--rose, #f43f5e)" :
                                signupPassword.length < 12 ? "var(--amber, #f59e0b)" : "var(--success)",
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {signupError && (
                    <div className="auth-error">
                      <span className="auth-error-icon">⚠</span>
                      {signupError}
                    </div>
                  )}

                  <button className="submit-btn" onClick={handleSignup}>
                    Create Account →
                  </button>

                  <div className="auth-footer-text">
                    Already have an account?{" "}
                    <span className="auth-link" onClick={() => switchTab("login")}>
                      Log in
                    </span>
                  </div>
                  <div className="auth-footer-text" style={{ marginTop: 10, fontSize: 11 }}>
                    By signing up you agree to our{" "}
                    <span className="auth-link">Terms</span> and{" "}
                    <span className="auth-link">Privacy Policy</span>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};