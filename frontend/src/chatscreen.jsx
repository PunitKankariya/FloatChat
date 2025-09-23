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

// Color palette
// Primary: #2563EB
// Neutrals: #1F2937 (bg), #334155 (panel), #475569 (borders)
// White: #FFFFFF

const LAK_CENTER = [20.5937, 78.9629]; // Center of India
const baseMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
const baseTemp = [22, 23, 27, 30, 32, 29]

function makeTempData(offset = 0) {
  return baseMonths.map((m, i) => ({
    month: m,
    temp: Math.round((baseTemp[i] + offset) * 10) / 10,
  }))
}

// Tsunami risk locations with their coordinates and risk levels
const tsunamiRiskLocations = [
  { name: "Kochi Coast", coords: [9.9312, 76.2673], risk: "high" },
  { name: "Visakhapatnam Coast", coords: [17.6868, 83.2185], risk: "high" },
  { name: "Goa Coast", coords: [15.2993, 74.1240], risk: "high" },
  { name: "Haldia Coast", coords: [22.0257, 88.0583], risk: "high" },
];

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
  const [showMap, setShowMap] = useState(false)
  const [messages, setMessages] = useState([
    { id: "b1", role: "bot", content: "Hello! I'm your FloatChat assistant. Ask me about ocean data, SQL databases, or CSV/XLSX files!" }
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [chatType, setChatType] = useState("Q&A with stored CSV/XLSX SQL-DB")
  const [availableChatTypes, setAvailableChatTypes] = useState([])
  const [selectedFloatId, setSelectedFloatId] = useState(1)
  const chatEndRef = useRef(null)

  const selectedFloat = useMemo(
    () => floats.find((f) => f.id === selectedFloatId) || floats[0],
    [selectedFloatId]
  )
  const floatTempData = useMemo(() => makeTempData(selectedFloat?.offset || 0), [selectedFloat])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isLoading])

  // Fetch available chat types on component mount
  useEffect(() => {
    fetchChatTypes();
  }, []);

  const fetchChatTypes = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/chat-types');
      const data = await response.json();
      setAvailableChatTypes(data.chat_types);
    } catch (error) {
      console.error('Error fetching chat types:', error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);

    // Add user message to chat
    const userMessageObj = { id: Date.now().toString(), role: "user", content: userMessage };
    setMessages(prev => [...prev, userMessageObj]);

    try {
      console.log('Sending message to backend:', { message: userMessage, chatType });
      const response = await fetch('http://localhost:8000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          chat_type: chatType,
          app_functionality: "Chat"
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server response error:', errorText);
        throw new Error(`Server error: ${response.status} - ${response.statusText}`);
      }

      // Parse the response as JSON
      const responseData = await response.json();
      console.log('API Response:', {
        hasResponse: !!responseData,
        responseText: responseData?.response,
        hasGraphData: !!responseData?.graph_data,
        graphDataType: typeof responseData?.graph_data,
        graphDataLength: responseData?.graph_data?.length,
        graphDataStart: responseData?.graph_data?.substring(0, 50),
        fullResponse: responseData
      });
      
      // Create an array to hold all bot messages (text and graph)
      const botMessages = [];
      
      // Add text response if available
      if (responseData.response) {
        botMessages.push({
          id: Date.now().toString() + '-text',
          role: 'bot',
          content: responseData.response,
          type: 'text'
        });
      }
      
      // Add graph if available
      if (responseData.graph_data) {
        // Ensure the graph data has the proper data URI prefix
        let graphData = responseData.graph_data;
        if (!graphData.startsWith('data:image/')) {
          graphData = `data:image/png;base64,${graphData}`;
        }
        
        botMessages.push({
          id: Date.now().toString() + '-graph',
          role: 'bot',
          content: graphData,
          type: 'graph',
          mimeType: graphData.startsWith('data:') ? 
                   graphData.split(';')[0].substring(5) : 
                   'image/png'  // Default MIME type if not specified
        });
        
        console.log('Added graph data to messages:', {
          hasData: !!graphData,
          startsWithData: graphData.startsWith('data:image/'),
          length: graphData.length
        });
      }
      
      // Add error message if present
      if (responseData.error) {
        botMessages.push({
          id: Date.now().toString() + '-error',
          role: 'bot',
          content: `Error: ${responseData.error}`,
          type: 'error'
        });
      }
      
      // Add all bot messages to the chat
      if (botMessages.length > 0) {
        setMessages(prev => [...prev, ...botMessages]);
      } else {
        // Fallback if no valid response was found
        setMessages(prev => [
          ...prev, 
          { 
            id: Date.now().toString() + '-error',
            role: "bot", 
            content: 'No valid response received from the server.',
            type: 'error'
          }
        ]);
      }
      
    } catch (error) {
      console.error('Error in sendMessage:', error);
      setMessages(prev => [
        ...prev, 
        { 
          id: Date.now().toString() + 'e', 
          role: "bot", 
          content: `Error: ${error.message}. Please check the console for details.` 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const tempLegendLabel = `Temp at ${selectedFloat?.name}`

  // Create a red icon for high-risk tsunami areas
  const redIcon = new L.Icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });

  return (
    <div style={styles.viewport}>
      {/* Leaflet dark styles */}
      <style>{`
        .leaflet-container { background: #1F2937; }
        .leaflet-popup-content { color: #1F2937; }
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
        <div style={{ width: 36 }} /> {/* spacer */}
      </header>

      {/* Main Content */}
      <div style={styles.main}>
        {/* Chat Section */}
        <section style={styles.chatContainer} aria-label="Chat">
          {/* Chat Type Selector */}
          <div style={styles.chatTypeSelector}>
            <label style={styles.chatTypeLabel}>Chat Mode:</label>
            <select 
              value={chatType} 
              onChange={(e) => setChatType(e.target.value)}
              style={styles.chatTypeSelect}
            >
              {availableChatTypes.length > 0 ? (
                availableChatTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))
              ) : (
                <option value="Q&A with stored CSV/XLSX SQL-DB">Q&A with SQL Database</option>
              )}
            </select>
          </div>

          <div style={styles.chatScroll} role="log" aria-live="polite" aria-relevant="additions">
            {messages.map((m) => {
              if (m.role === "user") {
                return (
                  <div key={m.id} style={styles.messageBubbleUser}>
                    {m.content}
                  </div>
                );
              }
              
              // Bot messages
              switch (m.type) {
                case 'graph':
                  return (
                    <div key={m.id} style={{...styles.messageBubbleBot, maxWidth: '100%', padding: '10px'}}>
                      <div style={{ 
                        maxWidth: '100%', 
                        overflow: 'auto',
                        borderRadius: '8px',
                        border: '1px solid #475569',
                        margin: '8px 0',
                        backgroundColor: '#1F2937',
                        padding: '8px'
                      }}>
                        <img 
                          src={m.content} 
                          alt="Data visualization" 
                          style={{
                            maxWidth: '100%',
                            height: 'auto',
                            display: 'block',
                            margin: '0 auto'
                          }}
                        />
                      </div>
                    </div>
                  );
                  
                case 'error':
                  return (
                    <div key={m.id} style={{...styles.messageBubbleBot, backgroundColor: '#7f1d1d', color: '#fecaca'}}>
                      {m.content}
                    </div>
                  );
                  
                case 'text':
                default:
                  return (
                    <div key={m.id} style={styles.messageBubbleBot}>
                      {m.content ? m.content.split("\n").map((line, i) => (
                        <div key={i} style={{ margin: '4px 0' }}>{line}</div>
                      )) : null}
                    </div>
                  );
              }
            })}
            {isLoading && <div style={styles.messageBubbleBot}><div style={{fontStyle: 'italic'}}>Thinking…</div></div>}
            <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          <div style={styles.inputArea}>
            <input
              style={styles.input}
              placeholder="Ask me anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Message input"
              disabled={isLoading}
            />
            <button
              style={{
                ...styles.sendButton,
                opacity: isLoading || !input.trim() ? 0.7 : 1,
                cursor: isLoading || !input.trim() ? "not-allowed" : "pointer",
              }}
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
            >
              {isLoading ? 'Sending...' : 'Send'}
            </button>
          </div>
        </section>

        {/* Side Panel */}
        <aside style={styles.panelSection} aria-label="Side panel">
          <div style={styles.sectionHeader}>
            <button 
              onClick={() => setShowMap(!showMap)}
              style={styles.mapToggleButton}
            >
              {showMap ? 'Hide Map' : 'Show Map'}
            </button>
          </div>

          {/* Map View */}
          {showMap && (
            <div style={{
              flex: 1,
              position: 'relative',
              backgroundColor: '#1F2937',
              borderTop: '1px solid #475569',
              minHeight: '400px',
              height: '100%',
              width: '100%'
            }}>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}>
                <MapContainer 
                  center={LAK_CENTER} 
                  zoom={6} 
                  style={{ 
                    flex: 1,
                    width: '100%',
                    minHeight: '400px'
                  }}
                  whenCreated={mapInstance => {
                    // Force update the map size when it becomes visible
                    setTimeout(() => {
                      mapInstance.invalidateSize();
                    }, 100);
                  }}
                >
                  <TileLayer
                    url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>'
                  />
                  {/* Tsunami Risk Markers */}
                  {tsunamiRiskLocations.map((location, index) => (
                    <Marker 
                      key={`tsunami-${index}`}
                      position={location.coords}
                      icon={redIcon}
                    >
                      <Popup>
                        <div style={{ minWidth: 160 }}>
                          <div style={{ 
                            fontWeight: 600, 
                            marginBottom: 4,
                            color: '#dc2626'
                          }}>
                            {location.name}
                          </div>
                          <div>Tsunami Risk: <strong style={{ color: '#dc2626' }}>High</strong></div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                  <Recenter 
                    lat={LAK_CENTER[0]} 
                    lng={LAK_CENTER[1]} 
                  />
                </MapContainer>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

// Styles
const styles = {
  viewport: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100vw",
    backgroundColor: "#1F2937",
    color: "#FFFFFF",
    overflow: "hidden",
  },
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
  main: {
    display: "flex",
    flex: 1,
    height: 'calc(100vh - 56px)', // Subtract header height
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1F2937',
  },
  chatContainer: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#1F2937',
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    paddingBottom: '80px', // Space for input area
  },
  panel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    backgroundColor: "#1F2937",
    overflow: "hidden",
    position: 'relative',
    height: '100%',
    width: '100%'
  },
  panelSection: {
    backgroundColor: "#1F2937",
    borderLeft: "1px solid #475569",
    width: "40%",
    minWidth: "400px",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: 'relative',
    height: '100%',
    chatContainer: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      height: '100%',
      position: 'relative',
      overflow: 'hidden',
      height: '100%'
    }
  },
  messageBubbleBot: {
    backgroundColor: '#334155',
    color: '#FFFFFF',
    padding: '12px 16px',
    borderRadius: '18px',
    marginBottom: '12px',
    alignSelf: 'flex-start',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    lineHeight: 1.5,
    maxWidth: '85%',
    fontSize: '15px',
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
    border: '1px solid #475569',
  },
  inputArea: {
    display: "flex",
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: '40%', // Account for side panel
    backgroundColor: '#1F2937',
    padding: '12px 16px',
    borderTop: '1px solid #475569',
    zIndex: 10,
    gap: '8px',
    boxSizing: 'border-box',
    height: '80px',
  },
  input: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: "8px",
    border: "1px solid #475569",
    color: "#FFFFFF",
    fontSize: "15px",
    outline: "none",
  },
  sendButton: {
    backgroundColor: "#2563EB",
    color: "#FFFFFF",
    border: "none",
    borderRadius: "8px",
    padding: "10px 16px",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "14px"
  },
  sectionHeader: {
    padding: '12px 16px',
    backgroundColor: "#1F2937",
    borderBottom: '1px solid #475569',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  mapToggleButton: {
    backgroundColor: '#2563EB',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#1D4ED8'
    }
  }
};
