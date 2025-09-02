export const getChatbotResponse = async (message) => {
  if (message.toLowerCase().includes("hello")) {
    return "Hi there! 👋 How can I help you today?";
  }
  if (message.toLowerCase().includes("bye")) {
    return "Goodbye! Have a great day! 🌟";
  }
  return "I'm a simple chatbot. Try saying 'hello' or 'bye'.";
};
