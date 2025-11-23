const express = require('express');
const path = require('path');
const app = express();
const PORT = 3002;

app.use(express.json());

// Serve landing page at root
app.use('/', express.static(path.join(__dirname, 'landing-public')));

// Serve auth pages at /auth
app.use('/auth', express.static(path.join(__dirname, 'auth-public')));

// Simple in-memory session store (replace with proper auth later)
const sessions = new Map();

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  // Mock authentication - replace with real auth
  if (email && password) {
    const sessionId = Math.random().toString(36).substring(7);
    sessions.set(sessionId, { email, timestamp: Date.now() });
    res.json({ success: true, sessionId, email });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

app.post('/api/auth/signup', (req, res) => {
  const { email, password, name } = req.body;
  
  // Mock signup - replace with real database
  if (email && password && name) {
    const sessionId = Math.random().toString(36).substring(7);
    sessions.set(sessionId, { email, name, timestamp: Date.now() });
    res.json({ success: true, sessionId, email, name });
  } else {
    res.status(400).json({ success: false, message: 'Missing required fields' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Landing page running on http://localhost:${PORT}`);
  console.log(`🔐 Auth pages available at http://localhost:${PORT}/auth`);
});
