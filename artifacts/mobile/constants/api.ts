// Where the phones reach the server. Production builds always use Render;
// development uses the Replit dev domain when present, else a local server.
export const API_BASE = __DEV__
  ? (process.env.EXPO_PUBLIC_DOMAIN
      ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
      : "http://localhost:3000/api")
  : "https://rafiki-games.onrender.com/api";
