import { createFileRoute, Link } from '@tanstack/react-router';
import { useSession } from '~/lib/auth-client';
import { ThemeToggle } from '~/components/ThemeToggle';
import { useTheme } from '~/editor/contexts/ThemeContext';
import '~/styles/home.css';
import heroImage from '../../../../artwork/hero.jpg';
import heroDarkImage from '../../../../artwork/hero-dark.jpg';

export const Route = createFileRoute('/')({
  ssr: false, // Client-only: user-facing route
  component: Home,
});

function Home() {
  const { data: session } = useSession();
  const { theme } = useTheme();
  const currentHeroImage = theme === 'dark' ? heroDarkImage : heroImage;

  return (
    <div className="home">
      <div className="home-top-actions">
        <ThemeToggle />
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
            <h1 className="home-hero-title">
              Modern CAD, Built for the Web
            </h1>
            <p className="home-hero-subtitle">
              A world-class parametric CAD application powered by OpenCascade.js.
              Create complex 3D models with 2D sketches, constraints, and AI assistance—all in your browser.
            </p>
            <div className="home-hero-actions">
              <Link to="/signup" className="home-cta-primary">
                Get started free
              </Link>
              <Link to="/dashboard" className="home-cta-secondary">
                View dashboard
              </Link>
            </div>
          </div>
        </section>

        <section className="home-features">
          <div className="home-features-grid">
            <div className="home-feature">
              <div className="home-feature-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 19l7-7 3 3-7 7-3-3z" />
                  <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                </svg>
              </div>
              <h3 className="home-feature-title">Sketch-Based Modeling</h3>
              <p className="home-feature-description">
                Create precise 2D sketches with geometric constraints, then extrude, revolve, or sweep them into 3D models.
              </p>
            </div>

            <div className="home-feature">
              <div className="home-feature-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 9h6v6H9z" />
                </svg>
              </div>
              <h3 className="home-feature-title">Parametric Design</h3>
              <p className="home-feature-description">
                Edit parameters and dimensions at any time. Your model updates automatically with full history tracking.
              </p>
            </div>

            <div className="home-feature">
              <div className="home-feature-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  <path d="M13 8H7M17 12H7" />
                </svg>
              </div>
              <h3 className="home-feature-title">AI-Assisted Design</h3>
              <p className="home-feature-description">
                Use natural language to create and modify models. Let AI handle the complexity while you focus on design.
              </p>
            </div>

            <div className="home-feature">
              <div className="home-feature-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className="home-feature-title">Real-Time Collaboration</h3>
              <p className="home-feature-description">
                Work together seamlessly with multi-user workspaces, branching, and conflict-free merging using CRDTs.
              </p>
            </div>

            <div className="home-feature">
              <div className="home-feature-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </div>
              <h3 className="home-feature-title">Web-Native</h3>
              <p className="home-feature-description">
                No downloads, no plugins. Runs entirely in your browser with WebAssembly for performance.
              </p>
            </div>

            <div className="home-feature">
              <div className="home-feature-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <h3 className="home-feature-title">Battle-Tested Kernel</h3>
              <p className="home-feature-description">
                Powered by OpenCascade.js—30+ years of development, trusted by FreeCAD, KiCad, and commercial products.
              </p>
            </div>
          </div>
        </section>

        <section className="home-cta-section">
          <div className="home-cta-content">
            <h2 className="home-cta-title">Ready to start designing?</h2>
            <p className="home-cta-subtitle">
              Join SolidType and experience modern CAD design in your browser.
            </p>
            <Link to="/signup" className="home-cta-large">
              Get started free
            </Link>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <div className="home-footer-content">
          <p className="home-footer-text">
            Built with TypeScript, React, and OpenCascade.js
          </p>
        </div>
      </footer>
    </div>
  );
}
