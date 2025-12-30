import { createFileRoute, Link } from '@tanstack/react-router';
import '~/styles/home.css';

export const Route = createFileRoute('/')({
  ssr: false, // Client-only: user-facing route
  component: Home,
});

function Home() {
  return (
    <div className="home">
      <div className="home-content">
        <div className="home-hero">
          <h1 className="home-title">SolidType</h1>
          <p className="home-subtitle">
            A modern CAD application built with TypeScript
          </p>
        </div>

        <div className="home-actions">
          <Link to="/editor" className="home-cta">
            Open Editor
          </Link>
        </div>

        <div className="home-features">
          <div className="home-feature">
            <div className="home-feature-icon">✏️</div>
            <h3>Sketch-Based Modeling</h3>
            <p>Create 2D sketches with constraints and extrude them to 3D</p>
          </div>
          <div className="home-feature">
            <div className="home-feature-icon">🔧</div>
            <h3>Parametric Design</h3>
            <p>Edit parameters and watch your model update automatically</p>
          </div>
          <div className="home-feature">
            <div className="home-feature-icon">🤖</div>
            <h3>AI-Assisted</h3>
            <p>Use AI to help you design and iterate faster</p>
          </div>
        </div>
      </div>
    </div>
  );
}
