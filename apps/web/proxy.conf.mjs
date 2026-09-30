// Dev-server proxy: the browser calls same-origin /api, so the refresh cookie stays
// first-party and there's no CORS. BFF_URL lets E2E point at a separate BFF instance.
export default {
  '/api': {
    target: process.env['BFF_URL'] ?? 'http://localhost:3000',
    secure: false,
  },
};
