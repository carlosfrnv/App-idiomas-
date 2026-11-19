// Servidor de pruebas compatible con la API de chat de Groq (OpenAI). Sólo para E2E.
import http from 'node:http';
let last = null;
http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/__last') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(last)); }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.url !== '/openai/v1/chat/completions' || req.headers.authorization !== 'Bearer test-key') { res.statusCode = 401; return res.end('unauthorized'); }
    const json = JSON.parse(body);
    last = { headers: req.headers, body: json };
    const prompt = json.messages.at(-1).content;
    if (prompt.includes('LIMITE')) { res.statusCode = 429; return res.end('rate limited'); }
    let text = 'Brillan las luces de la ciudad\nbusco en la noche mi libertad';
    if (prompt.startsWith('Da rimas')) text = 'Consonantes: ciudad, verdad, soledad\nAsonantes: mar, andar\nFrases que riman: sin piedad; a la mitad';
    else if (prompt.includes('Reescribe')) text = 'Versión mejorada de la línea';
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: text } }] }));
  });
}).listen(5199);
