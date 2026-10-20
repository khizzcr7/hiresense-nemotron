// Vercel serverless wrapper: mounts the Express app so every /api/* route
// runs as a single Node serverless function. Local `npm start` is unaffected
// (server/index.js only listens when run directly).
const app = require("../server/index.js");

module.exports = (req, res) => app(req, res);
