import React, { useEffect, useMemo, useRef, useState } from "react"
import L from "leaflet"
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet"
import { LineChart, Line, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Label } from "recharts"
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
  { 
    name: "Kochi Coast", 
    coords: [9.9312, 76.2673], 
    risk: "high",
    radius: 50000,
    population: "2.1 million",
    lastTsunami: "2004",
    color: '#FF6B6B',
    gradient: ['#FF6B6B', '#FF8E8E', '#FFD6D6'],
    features: ['Major port', 'High population density', 'Tourist hotspot']
  },
  { 
    name: "Visakhapatnam Coast", 
    coords: [17.6868, 83.2185], 
    risk: "high",
    radius: 60000,
    population: "2.3 million",
    lastTsunami: "2004",
    color: '#4ECDC4',
    gradient: ['#4ECDC4', '#88D8D0', '#C6F6F1'],
    features: ['Naval base', 'Industrial area', 'Major city']
  },
  { 
    name: "Goa Coast", 
    coords: [15.2993, 74.1240], 
    risk: "high",
    radius: 40000,
    population: "1.5 million",
    lastTsunami: "2004",
    color: '#FFD166',
    gradient: ['#FFD166', '#FFDF8C', '#FFEDB3'],
    features: ['Tourist destination', 'Beach resorts', 'Low-lying areas']
  },
  { 
    name: "Haldia Coast", 
    coords: [22.0257, 88.0583], 
    risk: "high",
    radius: 45000,
    population: "1.1 million",
    lastTsunami: "2004",
    color: '#A78BFA',
    gradient: ['#A78BFA', '#C4B5FD', '#DDD6FE'],
    features: ['Major port', 'Industrial area', 'River delta']
  },
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
  const mapRef = useRef(null)
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

  // Create a simple red spot for alert areas
  const createMarkerIcon = () => {
    return L.divIcon({
      className: 'alert-marker',
      html: `
        <div style="
          width: 14px;
          height: 14px;
          background: #ff0000;
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 0 0 2px rgba(255,0,0,0.5);
        "></div>
      `,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -7]
    });
  };

  return (
    <div style={styles.viewport}>
      <style>{`
        .leaflet-container { 
          background: #f5f5f5;
        } {
          filter: hue-rotate(200deg) saturate(1.8) brightness(0.8) contrast(1.2);
        }
        
        /* Enhanced popup styling */
        .leaflet-popup-content-wrapper {
          background: rgba(15, 23, 42, 0.95);
          backdrop-filter: blur(8px);
          border: 1px solid #3B82F6;
          border-radius: 10px;
          box-shadow: 0 5px 25px rgba(0,0,0,0.4);
          transition: all 0.3s ease;
        }
        
        .leaflet-popup-content {
          color: #E2E8F0;
          margin: 12px 16px;
          line-height: 1.5;
          font-size: 13px;
        }
        
        .leaflet-popup-tip {
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid #3B82F6;
          border-top-color: transparent !important;
          border-left-color: transparent !important;
        }
        
        /* Enhanced zoom controls */
        .leaflet-bar {
          box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
          border: none !important;
          border-radius: 6px !important;
          overflow: hidden;
        }
        
        .leaflet-bar a {
          width: 32px !important;
          height: 32px !important;
          line-height: 32px !important;
          font-size: 16px !important;
          border: none !important;
          border-bottom: 1px solid #334155 !important;
          transition: all 0.2s !important;
        }
        
        .leaflet-bar a:first-child {
          border-top-left-radius: 6px !important;
          border-top-right-radius: 6px !important;
        }
        
        .leaflet-bar a:last-child {
          border-bottom-left-radius: 6px !important;
          border-bottom-right-radius: 6px !important;
          border-bottom: none !important;
        }
        
        /* Fullscreen control */
        .leaflet-control-fullscreen a {
          background: #1E293B;
          color: #E2E8F0;
          border-radius: 4px;
          transition: all 0.2s;
        }
        
        .leaflet-control-fullscreen a:hover {
          background: #3B82F6;
          color: white;
        }
        
        /* Scale control */
        .leaflet-control-scale-line {
          background: rgba(15, 23, 42, 0.8);
          color: #E2E8F0;
          border: 1px solid #334155;
          border-bottom: none;
          font-size: 11px;
          padding: 2px 5px;
          white-space: nowrap;
          line-height: 1.1;
        }
        .leaflet-popup-content { 
          color: #1F2937;
          margin: 8px 12px;
          line-height: 1.4;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .risk-popup h4 {
          margin: 0 0 8px 0;
          color: #dc2626;
          font-size: 16px;
          font-weight: 600;
        }
        .risk-info {
          margin: 8px 0;
          font-size: 13px;
        }
        .risk-info strong {
          color: #111827;
        }
        .risk-level {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          background-color: #fef2f2;
          color: #dc2626;
          margin-bottom: 8px;
        }
        .map-legend {
          position: absolute;
          bottom: 30px;
          right: 10px;
          z-index: 1000;
          background: rgba(31, 41, 55, 0.9);
          padding: 10px 14px;
          border-radius: 6px;
          color: white;
          font-size: 12px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          border: 1px solid #374151;
        }
        .map-legend h4 {
          margin: 0 0 8px 0;
          font-size: 13px;
          color: #f3f4f6;
        }
        .legend-item {
          display: flex;
          align-items: center;
          margin-bottom: 6px;
        }
        .legend-color {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          margin-right: 8px;
          position: relative;
        }
        .pulse::after {
          content: '';
          position: absolute;
          width: 100%;
          height: 100%;
          top: 0;
          left: 0;
          background: inherit;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }
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
                  // Extract numbers from message content
                  const numbers = m.content.match(/\b\d+(?:\.\d+)?\b/g)?.map(Number) || [];
                  const hasNumbers = numbers.length > 0;
                  
                  // Only show chart if we have at least 2 numbers
                  const showChart = hasNumbers && numbers.length >= 2;
                  
                  // Prepare chart data for Recharts
                  const chartData = showChart ? 
                    numbers.map((value, index) => ({
                      name: `#${index + 1}`,
                      value: value
                    })) : [];

                  return (
                    <div key={m.id} style={styles.messageBubbleBot}>
                      {/* Message text */}
                      <div>
                        {m.content ? m.content.split("\n").map((line, i) => (
                          <div key={i} style={{ margin: '4px 0' }}>{line}</div>
                        )) : null}
                      </div>
                      
                      {/* Chart */}
                      {showChart && (
                        <div style={{ 
                          marginTop: '16px',
                          backgroundColor: '#1F2937',
                          borderRadius: '8px',
                          padding: '12px',
                          border: '1px solid #374151'
                        }}>
                          <div style={{ 
                            fontSize: '14px', 
                            color: '#9CA3AF',
                            marginBottom: '8px',
                            fontWeight: 500
                          }}>
                            Data Visualization
                          </div>
                          <div style={{ height: '280px', width: '100%', marginTop: '16px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart
                                data={chartData}
                                margin={{ top: 20, right: 20, bottom: 20, left: 0 }}
                              >
                                <defs>
                                  {/* Gradient for the area under the line */}
                                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
                                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.1}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                <XAxis 
                                  dataKey="name" 
                                  stroke="#9CA3AF"
                                  tick={{ fontSize: 12 }}
                                  tickLine={{ stroke: '#4B5563' }}
                                  axisLine={{ stroke: '#4B5563' }}
                                />
                                <YAxis 
                                  stroke="#9CA3AF"
                                  tick={{ fontSize: 12 }}
                                  tickLine={{ stroke: 'transparent' }}
                                  axisLine={{ stroke: '#4B5563' }}
                                  width={40}
                                />
                                <Tooltip 
                                  contentStyle={{
                                    backgroundColor: '#1F2937',
                                    border: '1px solid #4B5563',
                                    borderRadius: '6px',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                    padding: '8px 12px'
                                  }}
                                  labelStyle={{ 
                                    color: '#E5E7EB',
                                    fontWeight: 600,
                                    marginBottom: '4px'
                                  }}
                                  itemStyle={{ 
                                    color: '#E5E7EB',
                                    fontSize: '13px',
                                    padding: '2px 0'
                                  }}
                                  formatter={(value) => [value, 'Value']}
                                  labelFormatter={(label) => `Point: ${label}`}
                                />
                                {/* Area under the line */}
                                <Area 
                                  type="monotone" 
                                  dataKey="value" 
                                  stroke="#3B82F6"
                                  fillOpacity={1} 
                                  fill="url(#colorValue)"
                                  strokeWidth={2}
                                />
                                <Line 
                                  type="monotone" 
                                  dataKey="value" 
                                  stroke="#3B82F6" 
                                  dot={{ 
                                    fill: '#3B82F6', 
                                    stroke: '#fff',
                                    strokeWidth: 2, 
                                    r: 4,
                                    fillOpacity: 1
                                  }}
                                  activeDot={{ 
                                    r: 6, 
                                    stroke: '#fff', 
                                    strokeWidth: 2,
                                    fill: '#2563EB'
                                  }}
                                  strokeWidth={2}
                                  name="Value"
                                />
                                {/* Threshold line for affected areas */}
                                {chartData.length > 0 && (
                                  <ReferenceLine 
                                    y={Math.max(...chartData.map(item => item.value)) * 0.7} 
                                    stroke="#EF4444" 
                                    strokeDasharray="3 3"
                                    strokeWidth={1.5}
                                  >
                                    <Label 
                                      value="Affected Threshold" 
                                      position="right" 
                                      fill="#EF4444"
                                      style={{ fontSize: '12px' }}
                                    />
                                  </ReferenceLine>
                                )}
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
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
                  style={{ height: "100%", width: "100%" }}
                  whenCreated={(mapInstance) => {
                    mapRef.current = mapInstance;
                    // Add scale control
                    L.control.scale().addTo(mapInstance);
                    // Update map size when it becomes visible
                    setTimeout(() => mapInstance.invalidateSize(), 100);
                  }}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  
                  {/* High Risk Area Markers */}
                  {tsunamiRiskLocations.map((location, index) => (
                    <Marker key={`tsunami-${index}`} position={location.coords} icon={createMarkerIcon()}>
                      <Popup>
                        <div style={{ padding: '8px', minWidth: '180px' }}>
                          <h4 style={{ margin: '0 0 8px', color: '#dc2626' }}>
                            {location.name}
                          </h4>
                          <div style={{
                            background: 'linear-gradient(135deg, rgba(255, 90, 95, 0.15) 0%, rgba(255, 90, 95, 0.2) 100%)',
                            color: '#FF5A5F',
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '5px 12px',
                            borderRadius: '12px',
                            textTransform: 'uppercase',
                            display: 'inline-block',
                            marginBottom: '14px',
                            letterSpacing: '0.5px',
                            border: '1px solid rgba(255, 90, 95, 0.3)',
                            boxShadow: '0 2px 8px rgba(255, 90, 95, 0.2)'
                          }}>
                            High Risk Zone
                          </div>
                          <div style={{ marginTop: '8px' }}>
                            <div style={{ marginBottom: '8px' }}>
                              <div style={{ fontSize: '10px', color: '#64748b' }}>Population</div>
                              <div style={{ fontWeight: 600, fontSize: '13px' }}>{location.population || 'N/A'}</div>
                            </div>
                            <div style={{ marginBottom: '8px' }}>
                              <div style={{ fontSize: '10px', color: '#64748b' }}>Last Tsunami</div>
                              <div style={{ fontWeight: 600, fontSize: '13px' }}>{location.lastTsunami || 'N/A'}</div>
                            </div>
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                  
                  {/* Simple Legend */}
                  <div style={{
                    position: 'absolute',
                    bottom: '20px',
                    right: '20px',
                    backgroundColor: 'white',
                    padding: '8px',
                    borderRadius: '4px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    zIndex: 1000
                  }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>High Risk Areas</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{
                        width: '12px',
                        height: '12px',
                        backgroundColor: '#ef4444',
                        borderRadius: '50%',
                        border: '2px solid white',
                        boxShadow: '0 0 0 1px #ef4444'
                      }}></div>
                      <span>High Risk Zone</span>
                    </div>
                  </div>
                  
                  <Recenter lat={LAK_CENTER[0]} lng={LAK_CENTER[1]} />
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
    backgroundColor: "#1F2937"
  },
  nav: {
    backgroundColor: "#111827",
    borderBottom: "1px solid #1F2937",
    position: 'sticky',
    top: 0,
    zIndex: 50,
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    gap: '16px' // Added gap between header items
  },
  navTitle: {
    fontSize: '22px',
    fontWeight: 700,
    color: '#FFFFFF',
    margin: 0,
    background: 'linear-gradient(90deg, #3B82F6 0%, #8B5CF6 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    letterSpacing: '0.5px',
    padding: '4px 0',
    textShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  main: {
    display: "flex",
    flex: 1,
    height: 'calc(100vh - 56px)', // Subtract header height (56px)
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#1F2937',
  },
  chatContainer: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#1F2937',
    maxHeight: '100vh',
  },
  chatScroll: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    scrollBehavior: "smooth",
    '&::-webkit-scrollbar': {
      width: '8px',
    },
    '&::-webkit-scrollbar-track': {
      background: '#1F2937',
      borderRadius: '4px',
    },
    '&::-webkit-scrollbar-thumb': {
      background: '#4B5563',
      borderRadius: '4px',
      '&:hover': {
        background: '#6B7280',
      },
    },
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
    position: 'sticky',
    bottom: 0,
    backgroundColor: '#1F2937',
    padding: '12px 16px',
    borderTop: '1px solid #475569',
    zIndex: 10,
    gap: '8px',
    boxSizing: 'border-box',
    marginTop: 'auto',
    flexShrink: 0,
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
    padding: '12px 20px',
    backgroundColor: "#1F2937",
    borderBottom: '1px solid #475569',
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'center',
    flexShrink: 0,
    paddingLeft: '24px', // Added more left padding
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
