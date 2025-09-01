import React, { useState } from "react";
import HomeScreen from "./homescreen.jsx";
import ChatScreen from "./chatscreen.jsx";

function App() {
  const [currentScreen, setCurrentScreen] = useState("home");

  const navigateToChat = () => setCurrentScreen("chat");
  const navigateToHome = () => setCurrentScreen("home");

  return (
    <div style={{ width: "100%", height: "100vh" }}>
      {currentScreen === "home" ? (
        <HomeScreen onNavigateToChat={navigateToChat} />
      ) : (
        <ChatScreen onBack={navigateToHome} />
      )}
    </div>
  );
}

export default App;
