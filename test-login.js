// Test the exact same flow as the mobile app
const API_BASE = "https://rafiki-games.onrender.com/api";

async function testLogin() {
  console.log('[Test] Starting login request...');
  const startTime = Date.now();
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.log('[Test] Timeout triggered after 70s');
      controller.abort();
    }, 70000);

    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "abelhazina", password: "2323" }),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`[Test] Response received in ${elapsed}s:`, res.status);
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Login failed" }));
      console.error('[Test] Login failed:', err);
      return;
    }
    
    const data = await res.json();
    console.log('[Test] Login successful!');
    console.log('[Test] Token:', data.token.substring(0, 20) + '...');
    console.log('[Test] Teacher:', data.teacher);
    
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`[Test] Error after ${elapsed}s:`, err.message);
  }
}

testLogin();
