import React from "react";

export const Footer: React.FC = () => (
  <footer className="footer">
    <div className="footer-inner">
      <div>
        <div className="footer-logo">
          Policy<span>Lens</span>
        </div>
        <p className="footer-desc">
          Making government policy readable for citizens, researchers,
          and journalists worldwide.
        </p>
      </div>

      <div className="footer-col">
        <h4>Product</h4>
        <a href="#">Features</a>
        <a href="#">Pricing</a>
        <a href="#">API Access</a>
        <a href="#">Changelog</a>
      </div>

      <div className="footer-col">
        <h4>Resources</h4>
        <a href="#">Documentation</a>
        <a href="#">Policy Library</a>
        <a href="#">Case Studies</a>
        <a href="#">Blog</a>
      </div>

      <div className="footer-col">
        <h4>Company</h4>
        <a href="#">About</a>
        <a href="#">Privacy Policy</a>
        <a href="#">Terms of Use</a>
        <a href="#">Contact</a>
      </div>
    </div>

    <div className="footer-bottom">
      <span>© 2025 PolicyLens Inc. All rights reserved.</span>
      <span>Built with ◈ for civic transparency</span>
    </div>
  </footer>
);
