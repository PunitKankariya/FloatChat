import React, { useRef, useEffect, useState } from "react";
import Globe from "react-globe.gl";

export default function HomeScreen() {
  const globeRef = useRef(null);
  const [points, setPoints] = useState([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // seed sample points
  useEffect(() => {
    setPoints([
      { lat: 12.9, lng: 80.3, id: "Float-123", temp: "28°C", sal: "35 PSU" },
      { lat: 15.0, lng: 70.0, id: "Float-456", temp: "26°C", sal: "34.7 PSU" },
      { lat: -5.0, lng: 90.0, id: "Float-789", temp: "29°C", sal: "34.9 PSU" },
    ]);
  }, []);

  // track viewport size
  useEffect(() => {
    const update = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // enforce permanent auto-rotate
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || typeof globe.controls !== "function") return;

    const controls = globe.controls();
    if (!controls) return;

    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.2;
    controls.enableDamping = true;

    let raf = 0;
    const tick = () => {
      if (!controls.autoRotate) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 1.2;
      }
      controls.update();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const ensureRotate = () => {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.2;
    };
    controls.addEventListener?.("start", ensureRotate);
    controls.addEventListener?.("end", ensureRotate);
    controls.addEventListener?.("change", ensureRotate);

    return () => {
      cancelAnimationFrame(raf);
      controls.removeEventListener?.("start", ensureRotate);
      controls.removeEventListener?.("end", ensureRotate);
      controls.removeEventListener?.("change", ensureRotate);
    };
  }, []);

  const handleLogin = () => alert("Log in clicked");
  const handleAskQuestion = () => alert("Ask a Question clicked");

  return (
    <div style={styles.app}>
      {/* Navbar */}
      <nav style={styles.nav} aria-label="Primary">
        <div style={styles.brand}>ARGO Explorer</div>
        <div style={styles.actions}>
          <button style={styles.linkBtn} aria-label="Open Chatbot">
            Chatbot
          </button>
          <button style={styles.linkBtn} aria-label="About the app">
            About
          </button>
          <button style={styles.primaryBtn} onClick={handleLogin} aria-label="Log in">
            Log in
          </button>
        </div>
      </nav>

      {/* Globe */}
      <div style={styles.globeWrap} aria-hidden="true">
        <Globe
          ref={globeRef}
          width={size.w}
          height={size.h}
          globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
          bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
          backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
          pointsData={points}
          pointLat="lat"
          pointLng="lng"
          pointColor={() => "aqua"}
          pointAltitude={0.05}
          pointLabel={(d) => `${d.id}\nTemp: ${d.temp}\nSalinity: ${d.sal}`}
        />
      </div>

      {/* Hero */}
      <main style={styles.hero} aria-label="Hero">
        <h1 style={styles.heroTitle}>Explore the Ocean with AI</h1>
        <p style={styles.heroSubtitle}>
          Ask questions in plain English and see ARGO float data on the globe.
        </p>
        <button
          style={styles.askBtn}
          onClick={handleAskQuestion}
          aria-label="Ask a Question"
        >
          Ask a Question
        </button>
      </main>
    </div>
  );
}

// Styles
const styles = {
  app: {
    position: "relative",
    width: "100vw",
    height: "100vh",
    overflow: "hidden",
    background: "#000",
    color: "#fff",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  nav: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "18px 24px", // ⬆ increased padding
    background: "#0b1220",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  brand: { fontWeight: 700, fontSize: 22, letterSpacing: 0.4 }, // ⬆ increased font size
  actions: { display: "flex", gap: 16, alignItems: "center" }, // ⬆ more spacing
  linkBtn: {
    background: "transparent",
    border: "none",
    color: "#e5e7eb",
    cursor: "pointer",
    padding: "10px 12px",
    fontSize: 15,
  },
  primaryBtn: {
    background: "#3b82f6",
    border: "1px solid #1e40af",
    color: "#fff",
    cursor: "pointer",
    padding: "10px 16px",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 15,
  },
  globeWrap: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
  },
  hero: {
    position: "absolute",
    inset: 0,
    zIndex: 20,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    pointerEvents: "auto",
    padding: "0 16px",
  },
  heroTitle: {
    fontSize: 46,
    fontWeight: 800,
    margin: 0,
    lineHeight: 1.15,
    textShadow: "0 2px 12px rgba(0,0,0,0.55)",
  },
  heroSubtitle: {
    marginTop: 12,
    fontSize: 18,
    color: "#d1d5db",
    textShadow: "0 1px 8px rgba(0,0,0,0.45)",
  },
  askBtn: {
    marginTop: 24,
    background: "#10b981", // teal green for action contrast
    border: "none",
    color: "#fff",
    padding: "12px 20px",
    borderRadius: 10,
    fontWeight: 600,
    fontSize: 16,
    cursor: "pointer",
    transition: "transform 0.2s, background 0.2s",
  },
};


