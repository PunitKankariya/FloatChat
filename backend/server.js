// const express = require("express");
// const cors = require("cors");
// const routes = require("./src/routes");

// const app = express();
// const PORT = 5000;

// app.use(cors());
// app.use(express.json());

// // API routes
// app.use("/", routes);

// app.listen(PORT, () => {
//   console.log(`🚀 Backend running at http://localhost:${PORT}`);
// });
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 5000;

// Middleware
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

// Root route
app.get("/", (req, res) => {
  res.redirect('/api/test');
});

// Test route
app.get("/api/test", (req, res) => {
  res.json({ message: "Backend working fine!" });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
