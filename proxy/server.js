// server.js
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import NodeCache from 'node-cache';

const app = express();
const cache = new NodeCache({ stdTTL: 600 }); // cache for 10 minutes

app.use(cors()); // allow all origins

// Dynamic proxy endpoint
app.get('/api/treasure/:file', async (req, res) => {
  const file = req.params.file; // e.g., "00.json"
  const url = `https://a.windbornesystems.com/treasure/${file}`;

  try {
    // Check cache first
    const cached = cache.get(file);
    if (cached) {
      return res.json(cached);
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0" // some APIs block non-browser requests
      }
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
      return res.status(response.status).json({ error: `Failed to fetch: ${response.statusText}` });
    }

    const text = await response.text();

    // Basic check if JSON
    if (!text.trim().startsWith('[') && !text.trim().startsWith('{')) {
      console.error(`Response from ${url} is not JSON:`, text.substring(0, 100));
      return res.status(500).json({ error: 'Response is not valid JSON' });
    }

    const data = JSON.parse(text);

    // Save to cache
    cache.set(file, data);

    res.json(data);
  } catch (err) {
    console.error(`Error fetching ${url}:`, err);
    res.status(500).json({ error: 'Failed to fetch JSON', message: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Proxy running on port ${PORT}`));