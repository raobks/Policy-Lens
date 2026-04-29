import React from "react";

type Page = "landing" | "auth" | "app";

interface HeaderProps {
  currentPage: Page;
  onNavigate: (page: Page, authTab?: "login" | "signup") => void;
  isLoggedIn: boolean;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPage,
  onNavigate,
  isLoggedIn,
  onLogout,
}) => {
  return (
    <header className="header">
      {/* Logo — always navigates to landing */}
      <button className="logo" onClick={() => onNavigate("landing")}>
        <div className="logo-icon">⚖</div>
        Policy<span>Lens</span>
      </button>

      <nav className="header-nav">
        {/* Home link — hide when already on landing */}
        {currentPage !== "landing" && currentPage !== "app" && (
          <button className="nav-btn nav-ghost" onClick={() => onNavigate("landing")}>
            Home
          </button>
        )}

        {isLoggedIn ? (
          <>
            {/* Dashboard — always visible when logged in.
                Clicking it when already on the app page resets to New Analysis
                because navigate("app") now calls setSidebarView("new") + setStep("upload"). */}
            <button
              className={`nav-btn ${currentPage === "app" ? "nav-outline" : "nav-ghost"}`}
              onClick={() => onNavigate("app")}
            >
              Dashboard
            </button>
            <button className="nav-btn nav-outline" onClick={onLogout}>
              Sign Out
            </button>
          </>
        ) : (
          <>
            <button
              className="nav-btn nav-ghost"
              onClick={() => onNavigate("auth", "login")}
            >
              Log In
            </button>
            <button
              className="nav-btn nav-solid"
              onClick={() => onNavigate("auth", "signup")}
            >
              Sign Up
            </button>
          </>
        )}
      </nav>
    </header>
  );
};