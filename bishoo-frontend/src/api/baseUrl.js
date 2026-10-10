// The one place the frontend decides which backend it talks to.
//
// Production builds get REACT_APP_API_URL from the host (render.yaml sets it
// for the live site). Without it the app talks to a backend on this computer
// -- never to the live API -- so a local run cannot read or change live data.
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
