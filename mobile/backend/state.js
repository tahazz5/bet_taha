const fs = require('fs');
const { DATA_FILE, DEFAULT_STATE } = require('./config');

let currentState = DEFAULT_STATE;

const loadState = () => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Failed to load server state:', error);
  }
  return DEFAULT_STATE;
};

const saveState = () => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(currentState, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save server state:', error);
  }
};

const getState = () => currentState;

const setState = (state) => {
  currentState = state;
  saveState();
};

currentState = loadState();

module.exports = {
  getState,
  setState,
};
