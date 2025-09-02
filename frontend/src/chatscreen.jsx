import React, { useEffect, useMemo, useRef, useState } from "react"
import L from "leaflet"
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet"
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts"
import "leaflet/dist/leaflet.css"

// Fix Leaflet marker icons in bundlers
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

// Color palette (exactly 5)
// Primary: #2563EB
// Neutrals: #1F2937 (bg), #334155 (panel), #475569 (borders)
// White: #FFFFFF

const LAK_CENTER = [10.57, 72.64]

const baseMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
const baseTemp = [22, 23, 27, 30, 32, 29]

function makeTempData(offset = 0) {
  return baseMonths.map((m, i) => ({
    month: m,
    temp: Math.round((baseTemp[i] + offset) * 10) / 10,
  }))
}

const floats = [
  { id: 1, name: "LD-01", coords: [10.57, 72.64], latestTemp: 29.1, offset: 0.2 },
  { id: 2, name: "LD-02", coords: [11.2, 73.05], latestTemp: 28.4, offset: -0.3 },
  { id: 3, name: "LD-03", coords: [9.9, 72.1], latestTemp: 30.2, offset: 0.6 },
]

function toRad(d) {
  return (d * Math.PI) / 180
}
function haversine(a, b) {
  const R = 6371
  const dLat = toRad(b[0] - a[0])
  const dLon = toRad(b[1] - a[1])
  const lat1 = toRad(a[0])
  const lat2 = toRad(b[0])
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * R * Math.asin(Math.sqrt(x))
}

function Recenter({ lat, lng, zoom = 6 }) {
  const map = useMap()
  useEffect(() => {
    if (lat != null && lng != null) {
      map.flyTo([lat, lng], zoom, { duration: 0.75 })
    }
  }, [lat, lng, zoom, map])
  return null
}

export default function ChatScreen() {
  const [activeTab, setActiveTab] = useState("map")
  const [messages, setMessages] = useState([
    { id: "u1", role: "user", content: "Show me the nearest floats to Lakshadweep" },
    { id: "b1", role: "bot", content: "Here is a demo map of float positions" },
  ])
  const [input, setInput] = useState("")
  const [isThinking, setIsThinking] = useState(false)
  const [selectedFloatId, setSelectedFloatId] = useState(1)
  const chatEndRef = useRef(null)

  const selectedFloat = useMemo(
    () => floats.find((f) => f.id === selectedFloatId) || floats[0],
    [selectedFloatId]
  )
  const floatTempData = useMemo(() => makeTempData(selectedFloat?.offset || 0), [selectedFloat])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isThinking])

  function addMessage(role, content) {
    setMessages((prev) => [...prev, { id: Math.random().toString(36).slice(2), role, content }])
  }

  function respondSmart(text) {
    const t = text.toLowerCase()
    if (t.includes("float") || t.includes("nearest") || t.includes("lakshadweep")) {
      const ranked = floats
        .map((f) => ({ ...f, distance: haversine(LAK_CENTER, f.coords) }))
        .sort((a, b) => a.distance - b.distance)
      const top = ranked.slice(0, 3)
      const reply =
        "Here are the nearest floats to Lakshadweep:\n" +
        top
          .map(
            (f, i) => `${i + 1}. ${f.name} — ${f.distance.toFixed(1)} km, latest SST ${f.latestTemp.toFixed(1)}°C`
          )
          .join("\n") +
        "\n\nI have centered the map."
      setActiveTab("map")
      setSelectedFloatId(top[0].id)
      return reply
    }
    if (t.includes("graph") || t.includes("temp") || t.includes("trend")) {
      setActiveTab("graph")
      return "Switched to the temperature trend graph. Hover to inspect monthly values."
    }
    return "I can show nearest floats on the map or switch to the temperature graph. Try: “Nearest floats” or “Show temp graph”."
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || isThinking) return
    addMessage("user", text)
    setInput("")
    setIsThinking(true)
    await new Promise((r) => setTimeout(r, 500))
    const reply = respondSmart(text)
    await new Promise((r) => setTimeout(r, 500))
    addMessage("bot", reply)
    setIsThinking(false)
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function quickAsk(text) {
    if (isThinking) return
    addMessage("user", text)
    setInput("")
    setIsThinking(true)
    setTimeout(() => {
      const reply = respondSmart(text)
      setTimeout(() => {
        addMessage("bot", reply)
        setIsThinking(false)
      }, 400)
    }, 300)
  }

  const tempLegendLabel = `Temp at ${selectedFloat?.name}`

  return (
    <div style={styles.viewport}>
      {/* Leaflet dark styles (lighter variant to match UI) */}
      <style>{`
        .leaflet-container { background: #1F2937; }
        .leaflet-control-zoom a {
          background: #334155;
          color: #FFFFFF;
          border: 1px solid #475569;
          border-radius: 6px;
          box-shadow: none;
        }
        .leaflet-control-zoom a:hover {
          background: #2563EB;
          border-color: #2563EB;
          color: #FFFFFF;
        }
        .leaflet-bar a, .leaflet-bar a:hover {
          border-bottom: 1px solid #475569;
        }
        .leaflet-popup-content-wrapper {
          background: #334155;
          color: #FFFFFF;
          border: 1px solid #475569;
          border-radius: 10px;
        }
        .leaflet-popup-tip {
          background: #334155;
          border: 1px solid #475569;
        }
        .leaflet-control-attribution {
          background: rgba(31,41,55,0.7);
          color: #E5E7EB;
          border-radius: 6px;
          padding: 0 6px;
        }
      `}</style>

      {/* Top Navigation */}
      <header style={styles.nav} role="banner">
        <button
          type="button"
          onClick={() => window.history.back()}
          style={styles.backButton}
          aria-label="Go back"
        >
          ←
        </button>
        <h1 style={styles.navTitle}>FloatChat</h1>
        <div style={{ width: 36 }} /> {/* spacer to balance layout */}
      </header>

      {/* Main Content */}
      <div style={styles.main}>
        {/* Chat Section */}
        <section style={styles.chatContainer} aria-label="Chat">
          <div style={styles.chatScroll} role="log" aria-live="polite" aria-relevant="additions">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} style={styles.messageBubbleUser}>
                  {m.content}
                </div>
              ) : (
                <div key={m.id} style={styles.messageBubbleBot}>
                  {m.content.split("\n").map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )
            )}
            {isThinking && <div style={styles.messageBubbleBot}>Thinking…</div>}
            <div ref={chatEndRef} />
          </div>

          {/* Quick suggestions */}
          <div style={styles.quickRow}>
            <button style={styles.quickChip} onClick={() => quickAsk("Nearest floats to Lakshadweep")}>
              Nearest floats
            </button>
            <button style={styles.quickChip} onClick={() => quickAsk("Show temp graph")}>
              Show temp graph
            </button>
            <button style={styles.quickChip} onClick={() => quickAsk(`Center on ${selectedFloat?.name}`)}>
              Center on {selectedFloat?.name}
            </button>
          </div>

          {/* Input Area */}
          <div style={styles.inputArea}>
            <input
              style={styles.input}
              placeholder="Ask me about the ocean..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Message input"
              disabled={isThinking}
            />
            <button
              style={{
                ...styles.sendButton,
                opacity: isThinking ? 0.7 : 1,
                cursor: isThinking ? "not-allowed" : "pointer",
              }}
              onClick={handleSend}
              disabled={isThinking}
              aria-label="Send message"
            >
              Send
            </button>
          </div>
        </section>

        {/* Side Panel */}
        <aside style={styles.panelSection} aria-label="Side panel">
          {/* Tabs */}
          <div style={styles.tabs} role="tablist" aria-label="View switcher">
            <button
              role="tab"
              aria-selected={activeTab === "map"}
              onClick={() => setActiveTab("map")}
              style={{
                ...styles.tab,
                backgroundColor: activeTab === "map" ? "#2563EB" : "transparent",
              }}
            >
              Map
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "graph"}
              onClick={() => setActiveTab("graph")}
              style={{
                ...styles.tab,
                backgroundColor: activeTab === "graph" ? "#2563EB" : "transparent",
              }}
            >
              Graph
            </button>
          </div>

          {/* Float selector */}
          <div style={styles.floatRow} aria-label="Float selector">
            {floats.map((f) => {
              const active = f.id === selectedFloatId
              return (
                <button
                  key={f.id}
                  style={{
                    ...styles.floatChip,
                    backgroundColor: active ? "rgba(37, 99, 235, 0.15)" : "transparent",
                    borderColor: active ? "#2563EB" : "#475569",
                  }}
                  onClick={() => {
                    setSelectedFloatId(f.id)
                    if (activeTab !== "map") setActiveTab("graph")
                  }}
                  aria-pressed={active}
                >
                  {f.name}
                </button>
              )
            })}
          </div>

          {/* Content */}
          <div style={styles.panel}>
            {activeTab === "map" ? (
              <div style={styles.mapWrap}>
                <MapContainer center={LAK_CENTER} zoom={6} style={styles.mapCanvas}>
                  {/* Softer dark basemap */}
                  <TileLayer
                    url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
                    attribution="&copy; OpenMapTiles &copy; OpenStreetMap contributors &copy; Stadia Maps"
                    noWrap={true}
                  />
                  <Recenter
                    lat={floats.find((f) => f.id === selectedFloatId)?.coords[0]}
                    lng={floats.find((f) => f.id === selectedFloatId)?.coords[1]}
                    zoom={6}
                  />
                  {floats.map((f) => (
                    <Marker
                      key={f.id}
                      position={f.coords}
                      eventHandlers={{ click: () => setSelectedFloatId(f.id) }}
                    >
                      <Popup>
                        <div style={{ minWidth: 160 }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>{f.name}</div>
                          <div>Latest SST: {f.latestTemp.toFixed(1)}°C</div>
                          <div style={{ marginTop: 8 }}>
                            <button style={styles.popupButton} onClick={() => setActiveTab("graph")}>
                              View temp trend
                            </button>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            ) : (
              <div style={styles.graphWrap}>
                <div style={styles.graphHeader}>
                  <div style={styles.graphTitle}>Temperature Trend — {selectedFloat?.name}</div>
                  <div style={styles.graphMeta}>
                    Latest: <b>{selectedFloat?.latestTemp.toFixed(1)}°C</b>
                  </div>
                </div>
                <div style={{ flex: 1, minHeight: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={floatTempData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                      <CartesianGrid stroke="#475569" strokeDasharray="5 5" />
                      <XAxis dataKey="month" stroke="rgba(255,255,255,0.85)" />
                      <YAxis stroke="rgba(255,255,255,0.85)" />
                      <Tooltip
                        contentStyle={{
                          background: "#334155",
                          border: "1px solid #475569",
                          borderRadius: 8,
                          color: "#FFFFFF",
                        }}
                      />
                      <Legend wrapperStyle={{ color: "#FFFFFF", paddingTop: 8 }} iconType="circle" />
                      <Line
                        type="monotone"
                        dataKey="temp"
                        name={tempLegendLabel}
                        stroke="#2563EB"
                        strokeWidth={3}
                        dot={{ r: 4, stroke: "#2563EB", fill: "#FFFFFF" }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

// Styles
const styles = {
  // Full screen with internal nav
  viewport: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100vw",
    backgroundColor: "#1F2937",
    color: "#FFFFFF",
    overflow: "hidden",
  },

  // Nav
  nav: {
    height: 56,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "0 12px",
    backgroundColor: "#1F2937",
    borderBottom: "1px solid #475569",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  backButton: {
    width: 36,
    height: 36,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    color: "#FFFFFF",
    border: "1px solid #475569",
    borderRadius: 8,
    cursor: "pointer",
  },
  navTitle: {
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: 0.2,
    margin: 0,
    flex: 1,
    textAlign: "center",
  },

  // Main split
  main: {
    display: "flex",
    flex: 1,
    width: "100%",
    overflow: "hidden",
  },

  // Chat
  chatContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid #475569",
    overflow: "hidden",
    minWidth: 0,
    backgroundColor: "#1F2937",
  },
  chatScroll: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 24px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    minHeight: 0,
  },
  messageBubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: "#2563EB",
    padding: "12px 16px",
    borderRadius: "16px",
    maxWidth: "70%",
    fontSize: "15px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.45,
  },
  messageBubbleBot: {
    alignSelf: "flex-start",
    backgroundColor: "#334155",
    padding: "12px 16px",
    borderRadius: "16px",
    maxWidth: "70%",
    fontSize: "15px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.45,
    border: "1px solid #475569",
  },

  quickRow: {
    display: "flex",
    gap: 8,
    padding: "8px 12px",
    borderTop: "1px solid #475569",
    backgroundColor: "#1F2937",
    flexWrap: "wrap",
  },
  quickChip: {
    background: "rgba(37, 99, 235, 0.12)",
    border: "1px solid #2563EB",
    color: "#FFFFFF",
    padding: "6px 10px",
    borderRadius: 999,
    cursor: "pointer",
    fontSize: 13,
  },

  inputArea: {
    display: "flex",
    padding: "12px",
    borderTop: "1px solid #475569",
    backgroundColor: "#334155",
    gap: 8,
  },
  input: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #475569",
    background: "#1F2937",
    color: "#FFFFFF",
    outline: "none",
    fontSize: "15px",
  },
  sendButton: {
    backgroundColor: "#2563EB",
    border: "none",
    borderRadius: "8px",
    padding: "10px 16px",
    color: "white",
    cursor: "pointer",
    transition: "background 0.2s ease",
  },

  // Side panel
  panelSection: {
    width: "420px",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#334155",
    borderLeft: "1px solid #475569",
  },
  tabs: {
    display: "flex",
    gap: "8px",
    padding: "10px",
    borderBottom: "1px solid #475569",
    backgroundColor: "#334155",
  },
  tab: {
    flex: 1,
    border: "1px solid #475569",
    borderRadius: "8px",
    padding: "8px 12px",
    cursor: "pointer",
    color: "white",
    fontWeight: 500,
    transition: "background 0.2s ease, border-color 0.2s ease",
  },

  floatRow: {
    display: "flex",
    gap: 8,
    padding: "10px",
    borderBottom: "1px solid #475569",
    flexWrap: "wrap",
  },
  floatChip: {
    border: "1px solid #475569",
    color: "#FFFFFF",
    padding: "6px 10px",
    borderRadius: 999,
    cursor: "pointer",
    fontSize: 13,
    background: "transparent",
  },

  panel: {
    flex: 1,
    padding: "12px",
    width: "100%",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  mapWrap: {
    flex: 1,
    minHeight: 280,
    borderRadius: 12,
    overflow: "hidden",
    border: "1px solid #475569",
    background: "#1F2937",
  },
  mapCanvas: { width: "100%", height: "100%" },

  popupButton: {
    background: "#2563EB",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 6,
    padding: "6px 8px",
    cursor: "pointer",
  },

  graphWrap: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minHeight: 280,
    borderRadius: 12,
    overflow: "hidden",
    border: "1px solid #475569",
    background: "#1F2937",
  },
  graphHeader: {
    padding: "12px 12px 0 12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  graphTitle: { fontWeight: 600 },
  graphMeta: { color: "#FFFFFF" },
}