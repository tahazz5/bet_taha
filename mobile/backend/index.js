const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { DIST_PATH, PORT } = require('./config');
const routes = require('./routes');

const app = express();
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));
app.use(express.static(DIST_PATH, { index: false }));
app.use('/api', routes);
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(DIST_PATH, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend listening on port ${PORT}`);
});