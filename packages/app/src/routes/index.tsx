import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession } from "~/lib/auth-client";
import { ThemeToggle } from "~/components/ThemeToggle";
import { useTheme } from "~/editor/contexts/ThemeContext";
import { LuGithub } from "react-icons/lu";
import "~/styles/home.css";
import heroImage from "../../../../artwork/hero.jpg";
import heroDarkImage from "../../../../artwork/hero-dark.jpg";
import electricDarkLogo from "../../../../artwork/showcase/electric-dark.svg";
import electricLightLogo from "../../../../artwork/showcase/electric-light.svg";
import durableStreamsLogo from "../../../../artwork/showcase/durable-streams.png";
import tanstackLogo from "../../../../artwork/showcase/tanstack-100.png";

export const Route = createFileRoute("/")({
  ssr: false, // Client-only: user-facing route
  component: Home,
});

function Home() {
  const { data: session } = useSession();
  const { theme } = useTheme();
  const currentHeroImage = theme === "dark" ? heroDarkImage : heroImage;

  // Add Google Fonts for Caveat
  useEffect(() => {
    // Preconnect to Google Fonts
    const preconnect1 = document.createElement("link");
    preconnect1.rel = "preconnect";
    preconnect1.href = "https://fonts.googleapis.com";
    document.head.appendChild(preconnect1);

    const preconnect2 = document.createElement("link");
    preconnect2.rel = "preconnect";
    preconnect2.href = "https://fonts.gstatic.com";
    preconnect2.crossOrigin = "anonymous";
    document.head.appendChild(preconnect2);

    // Add Caveat font
    const fontLink = document.createElement("link");
    fontLink.href = "https://fonts.googleapis.com/css2?family=Caveat:wght@400..700&display=swap";
    fontLink.rel = "stylesheet";
    document.head.appendChild(fontLink);

    // Cleanup on unmount
    return () => {
      document.head.removeChild(preconnect1);
      document.head.removeChild(preconnect2);
      document.head.removeChild(fontLink);
    };
  }, []);

  return (
    <div className="home">
      <div className="home-top-actions">
        <ThemeToggle />
        <a
          href="https://github.com/samwillis/solidtype"
          target="_blank"
          rel="noopener noreferrer"
          className="home-top-github"
          aria-label="GitHub"
        >
          <LuGithub />
        </a>
        {session?.user ? (
          <Link to="/dashboard" className="home-top-button">
            Go to Dashboard
          </Link>
        ) : (
          <>
            <Link to="/login" className="home-top-link">
              Sign in
            </Link>
            <Link to="/signup" className="home-top-button">
              Get started
            </Link>
          </>
        )}
      </div>

      <main className="home-main">
        <section className="home-hero">
          <div className="home-hero-image-container">
            <img src={currentHeroImage} alt="SolidType" className="home-hero-image" />
          </div>
          <div className="home-hero-content">
            <div className="home-hero-alpha-badge">Very Alpha!</div>
            <h1 className="home-hero-title">Modern CAD, Built for the Web</h1>
            <h2 className="home-hero-subtitle">
              Demonstrating how to build a collaborative application with agentic AI, using{" "}
              <a href="https://electric-sql.com/" target="_blank" rel="noopener noreferrer">
                ElectricSQL
              </a>
              ,{" "}
              <a href="https://tanstack.com/db" target="_blank" rel="noopener noreferrer">
                TanStack&nbsp;DB
              </a>{" "}
              and{" "}
              <a href="https://tanstack.com/ai" target="_blank" rel="noopener noreferrer">
                AI
              </a>
              ,{" "}
              <a
                href="https://github.com/durable-streams/durable-streams"
                target="_blank"
                rel="noopener noreferrer"
              >
                Durable&nbsp;Streams
              </a>
              , and{" "}
              <a href="https://yjs.dev/" target="_blank" rel="noopener noreferrer">
                Yjs
              </a>
              .
            </h2>
            <p className="home-hero-strap">
              A web-based parametric CAD application powered by{" "}
              <a href="https://ocjs.org" target="_blank" rel="noopener noreferrer">
                OpenCascade.js
              </a>
              . Create complex 3D models with 2D sketches, constraints, and AI assistance—all in
              your browser.
            </p>
            <div className="home-hero-actions">
              <Link to="/signup" className="home-cta-primary">
                Get started free
              </Link>
              <Link to="/dashboard" className="home-cta-secondary">
                View dashboard
              </Link>
              <a
                href="https://github.com/samwillis/solidtype"
                target="_blank"
                rel="noopener noreferrer"
                className="home-cta-secondary home-cta-github"
              >
                <LuGithub />
                <span>View on GitHub</span>
              </a>
            </div>
          </div>
        </section>

        <section className="home-features">
          <div className="home-features-grid">
            <div className="home-feature">
              <div className="home-feature-icon">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 19l7-7 3 3-7 7-3-3z" />
                  <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                </svg>
              </div>
              <h3 className="home-feature-title">Sketch-Based Modeling</h3>
              <p className="home-feature-description">
                Create precise 2D sketches with geometric constraints, then extrude, revolve, or
                sweep them into 3D models.
              </p>
            </div>

            <div className="home-feature">
              <div className="home-feature-icon">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 9h6v6H9z" />
                </svg>
              </div>
              <h3 className="home-feature-title">Parametric Design</h3>
              <p className="home-feature-description">
                Edit parameters and dimensions at any time. Your model updates automatically with
                full history tracking.
              </p>
            </div>

            <div className="home-feature">
              <div className="home-feature-icon">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  <path d="M13 8H7M17 12H7" />
                </svg>
              </div>
              <h3 className="home-feature-title">AI-Assisted Design</h3>
              <p className="home-feature-description">
                Use natural language to create and modify models. Let AI handle the complexity while
                you focus on design.
              </p>
            </div>

            <div className="home-feature">
              <div className="home-feature-icon">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className="home-feature-title">Real-Time Collaboration</h3>
              <p className="home-feature-description">
                Work together seamlessly with multi-user workspaces, branching, and conflict-free
                merging using CRDTs.
              </p>
            </div>

            <div className="home-feature">
              <div className="home-feature-icon">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </div>
              <h3 className="home-feature-title">Web-Native</h3>
              <p className="home-feature-description">
                No downloads, no plugins. Runs entirely in your browser with WebAssembly for
                performance.
              </p>
            </div>

            <div className="home-feature">
              <div className="home-feature-icon">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <h3 className="home-feature-title">Battle-Tested Kernel</h3>
              <p className="home-feature-description">
                Powered by OpenCascade.js—30+ years of development, trusted by FreeCAD, KiCad, and
                commercial products.
              </p>
            </div>
          </div>
        </section>

        <section className="home-showcase">
          <div className="home-showcase-content">
            <h2 className="home-showcase-title">Demo Showcase</h2>
            <p className="home-showcase-description">
              SolidType is an open-source project and a comprehensive demonstration of modern sync
              technologies. This project showcases how to build a production-ready collaborative
              application using Electric + Durable Streams for different data types.
            </p>
            <div className="home-showcase-tech">
              <a
                href="https://electric-sql.com"
                target="_blank"
                rel="noopener noreferrer"
                className="home-showcase-tech-item"
              >
                <div className="home-showcase-logo">
                  <img
                    src={theme === "dark" ? electricDarkLogo : electricLightLogo}
                    alt="Electric SQL"
                    className="home-showcase-logo-img"
                    style={{ width: "200px", height: "60px" }}
                  />
                </div>
                <h3>Electric SQL</h3>
                <p>
                  Real-time Postgres sync for structured metadata with live queries and optimistic
                  mutations
                </p>
              </a>
              <a
                href="https://github.com/durable-streams/durable-streams"
                target="_blank"
                rel="noopener noreferrer"
                className="home-showcase-tech-item"
              >
                <div className="home-showcase-logo">
                  <img
                    src={durableStreamsLogo}
                    alt="Durable Streams"
                    className="home-showcase-logo-img home-showcase-logo-durable"
                    style={{ width: "60px", height: "60px" }}
                  />
                </div>
                <h3>Durable Streams</h3>
                <p>Append-only streams for Yjs document persistence with conflict-free merging</p>
              </a>
              <a
                href="https://tanstack.com/db"
                target="_blank"
                rel="noopener noreferrer"
                className="home-showcase-tech-item"
              >
                <div className="home-showcase-logo">
                  <img
                    src={tanstackLogo}
                    alt="TanStack DB"
                    className="home-showcase-logo-img"
                    style={{ width: "60px", height: "60px" }}
                  />
                </div>
                <h3>TanStack DB</h3>
                <p>Client-side embedded database with live queries powered by Electric SQL</p>
              </a>
              <a
                href="https://tanstack.com/ai"
                target="_blank"
                rel="noopener noreferrer"
                className="home-showcase-tech-item"
              >
                <div className="home-showcase-logo">
                  <img
                    src={tanstackLogo}
                    alt="TanStack AI"
                    className="home-showcase-logo-img"
                    style={{ width: "60px", height: "60px" }}
                  />
                </div>
                <h3>TanStack AI</h3>
                <p>Unified AI interface across providers with type-safe tool calling support</p>
              </a>
            </div>
            <p className="home-showcase-also">
              Also built with{" "}
              <a href="https://tanstack.com/start" target="_blank" rel="noopener noreferrer">
                TanStack Start
              </a>
              ,{" "}
              <a href="https://orm.drizzle.team" target="_blank" rel="noopener noreferrer">
                Drizzle
              </a>
              , and{" "}
              <a href="https://ocjs.org" target="_blank" rel="noopener noreferrer">
                OpenCascade.js
              </a>
              .
            </p>
          </div>
        </section>

        <section className="home-cta-section">
          <div className="home-cta-content">
            <h2 className="home-cta-title">Ready to start designing?</h2>
            <p className="home-cta-subtitle">
              Join SolidType and experience modern CAD design in your browser.
            </p>
            <div className="home-cta-actions">
              <Link to="/signup" className="home-cta-large">
                Get started free
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <div className="home-footer-content">
          <p className="home-footer-text">
            SolidType is an open-source, modern, parametric CAD application demonstrating how to
            build collaborative, local-first applications with real-time sync and AI assistance.
          </p>
          <p className="home-footer-links">
            <a
              href="https://github.com/samwillis/solidtype"
              target="_blank"
              rel="noopener noreferrer"
              className="home-footer-link"
            >
              View on GitHub
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
