const { expo } = require('./app.json');

module.exports = () => ({
  ...expo,
  experiments: {
    ...expo.experiments,
    ...(process.env.MANAGER247_WEB_BASE_URL ? { baseUrl: process.env.MANAGER247_WEB_BASE_URL } : {}),
  },
});
