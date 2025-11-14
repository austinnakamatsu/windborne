import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
app.use(cors()); // allow all origins

// Proxy endpoint
app.get('/api/treasure/:file', async (req, res) => {
  const file = req.params.file; // e.g., "00.json"
  const url = `https://a.windbornesystems.com/treasure/${file}`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      res.status(response.status).json({ error: `Failed to fetch: ${response.statusText}` });
      return;
    }

    const text = await response.text();
    
    // Check if response is actually JSON
    if (!text.trim().startsWith('[') && !text.trim().startsWith('{')) {
      console.error(`Response from ${url} is not JSON:`, text.substring(0, 100));
      res.status(500).json({ error: 'Response is not valid JSON' });
      return;
    }

    res.set('Content-Type', 'application/json');
    res.send(text);
  } catch (err) {
    console.error(`Error fetching ${url}:`, err);
    res.status(500).json({ error: 'Failed to fetch JSON', message: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));
