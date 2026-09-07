import { PORT } from './config.js';
import { server } from './app.js';

server.listen(PORT, () => {
  console.log(`BetFriends API listening on http://localhost:${PORT} (Northstar football demo)`);
});
