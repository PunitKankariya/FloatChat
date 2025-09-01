import React, { useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup
} from "react-leaflet";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import "leaflet/dist/leaflet.css";

export default function ChatScreen() {
  const [activeTab, setActiveTab] = useState("map");

  const tempData = [
    { month: "Jan", temp: 22 },
    { month: "Feb", temp: 23 },
    { month: "Mar", temp: 27 },
    { month: "Apr", temp: 30 },
    { month: "May", temp: 32 },
    { month: "Jun", temp: 29 }
  ];

  return (
    <div style={styles.viewport}>
      {/* MAIN SECTION */}
      <div style={styles.main}>
        {/* Chat Container */}
        <div style={styles.chatContainer}>
          <div style={styles.chatScroll}>
            <div style={styles.messageBubbleUser}>
              🌊 Show me the nearest floats to Lakshadweep
            </div>
            <div style={styles.messageBubbleBot}>
              Here’s a demo map of float positions 🌍
            </div>
          </div>

          {/* Input Area */}
          <div style={styles.inputArea}>
            <input
              style={styles.input}
              placeholder="Ask me about the ocean..."
            />
            <button style={styles.sendButton}>Send</button>
          </div>
        </div>

        {/* Side Panel */}
        <div style={styles.panelSection}>
          {/* Tabs */}
          <div style={styles.tabs}>
            <button
              onClick={() => setActiveTab("map")}
              style={{
                ...styles.tab,
                backgroundColor:
                  activeTab === "map" ? "#1E40AF" : "transparent"
              }}
            >
              🗺️ Map
            </button>
            <button
              onClick={() => setActiveTab("graph")}
              style={{
                ...styles.tab,
                backgroundColor:
                  activeTab === "graph" ? "#1E40AF" : "transparent"
              }}
            >
              📊 Graph
            </button>
          </div>

          {/* Content */}
          <div style={styles.panel}>
            {activeTab === "map" ? (
              <MapContainer
                center={[10.57, 72.64]}
                zoom={5}
                style={{ flex: 1, borderRadius: "12px" }}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={[10.57, 72.64]}>
                  <Popup>Float near Lakshadweep 🌊</Popup>
                </Marker>
              </MapContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tempData}>
                  <Line
                    type="monotone"
                    dataKey="temp"
                    stroke="#3B82F6"
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                  <CartesianGrid stroke="#374151" strokeDasharray="5 5" />
                  <XAxis dataKey="month" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 🎨 Styles
const styles = {
  viewport: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100vw",
    backgroundColor: "#111827", // dark neutral
    color: "white",
    overflow: "hidden"
  },
  main: {
    display: "flex",
    flex: 1,
    width: "100%",
    height: "100%",
    overflow: "hidden"
  },
  chatContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid #374151",
    overflow: "hidden",
    minWidth: 0
  },
  chatScroll: {
    flex: 1,
    overflowY: "auto",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    minHeight: 0
  },
  messageBubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: "#2563EB",
    padding: "12px 16px",
    borderRadius: "16px",
    maxWidth: "70%",
    fontSize: "15px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)"
  },
  messageBubbleBot: {
    alignSelf: "flex-start",
    backgroundColor: "#1F2937",
    padding: "12px 16px",
    borderRadius: "16px",
    maxWidth: "70%",
    fontSize: "15px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)"
  },
  inputArea: {
    display: "flex",
    padding: "12px",
    borderTop: "1px solid #374151",
    backgroundColor: "#1F2937"
  },
  input: {
    flex: 1,
    padding: "10px",
    borderRadius: "8px",
    border: "none",
    outline: "none",
    fontSize: "15px"
  },
  sendButton: {
    marginLeft: "8px",
    backgroundColor: "#2563EB",
    border: "none",
    borderRadius: "8px",
    padding: "10px 16px",
    color: "white",
    cursor: "pointer",
    transition: "background 0.2s ease"
  },
  panelSection: {
    width: "420px",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#1F2937",
    borderLeft: "1px solid #374151",
    height: "100%"
  },
  tabs: {
    display: "flex",
    gap: "8px",
    padding: "10px",
    borderBottom: "1px solid #374151"
  },
  tab: {
    flex: 1,
    border: "none",
    borderRadius: "8px",
    padding: "8px 12px",
    cursor: "pointer",
    color: "white",
    fontWeight: "500",
    transition: "background 0.2s ease"
  },
  panel: {
    flex: 1,
    padding: "12px",
    height: "100%",
    width: "100%",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column"
  }
};
