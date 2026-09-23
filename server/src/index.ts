import { createAppServer } from './server.js';

const PORT = Number(process.env.PORT ?? 3001);

const { http } = createAppServer();

http.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
