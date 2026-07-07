var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_config = require("dotenv/config");
var import_http = __toESM(require("http"), 1);
var import_express = __toESM(require("express"), 1);
var import_vite = require("vite");
var import_path = __toESM(require("path"), 1);
var import_axios = __toESM(require("axios"), 1);
var import_firebase_admin = __toESM(require("firebase-admin"), 1);
var import_cookie_parser = __toESM(require("cookie-parser"), 1);

// firebase-applet-config.json
var firebase_applet_config_default = {
  projectId: "airpick-reservation",
  appId: "1:417452643834:web:b42b0c3f863b3b7c370043",
  apiKey: "AIzaSyDbZyPUwzp166aX8PzDmoIzqER8bDV8tyo",
  authDomain: "airpick-reservation.firebaseapp.com",
  storageBucket: "airpick-reservation.firebasestorage.app",
  messagingSenderId: "417452643834",
  measurementId: "G-258VBKY6C2"
};

// server.ts
function logError(label, err) {
  if (err instanceof Error) {
    console.error(`[${label}]`, err.message);
    if (err.stack) console.error(err.stack);
    const code = err.code;
    if (code) console.error(`  code: ${code}`);
  } else {
    console.error(`[${label}]`, err);
  }
}
function registerProcessErrorHandlers() {
  process.on("uncaughtException", (err) => {
    logError("uncaughtException \u2014 process will exit", err);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    logError("unhandledRejection \u2014 process will exit", reason);
    process.exit(1);
  });
  process.on("SIGINT", () => {
    console.log("\n[server] SIGINT received, shutting down...");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    console.log("\n[server] SIGTERM received, shutting down...");
    process.exit(0);
  });
}
registerProcessErrorHandlers();
try {
  if (!import_firebase_admin.default.apps.length) {
    import_firebase_admin.default.initializeApp({
      projectId: firebase_applet_config_default.projectId
    });
  }
} catch (err) {
  logError("firebase-admin init (non-fatal, OAuth may fail)", err);
}
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = Number(process.env.PORT) || 3e3;
  const isProduction = process.env.NODE_ENV === "production";
  const httpServer = import_http.default.createServer(app);
  httpServer.on("error", (err) => {
    logError("httpServer error", err);
    if (err.code === "EADDRINUSE") {
      console.error(
        `
[server] Port ${PORT} is already in use.
  Stop the other process:  netstat -ano | findstr :${PORT}
  Then:  taskkill /PID <pid> /F
  Or use another port:  $env:PORT=3001; npm run dev
`
      );
    }
    process.exit(1);
  });
  app.use(import_express.default.json());
  app.use((0, import_cookie_parser.default)());
  app.get("/auth/naver", (req, res) => {
    const clientId = process.env.NAVER_CLIENT_ID;
    if (!clientId) {
      return res.status(500).send(`
        <div style="font-family: sans-serif; padding: 20px; text-align: center;">
          <h3 style="color: #e11d48;">\uC124\uC815 \uC624\uB958</h3>
          <p>NAVER_CLIENT_ID\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.</p>
          <button onclick="window.close()" style="padding: 8px 16px; background: #eee; border: 1px solid #ccc; border-radius: 4px;">\uB2EB\uAE30</button>
        </div>
      `);
    }
    const frontendOrigin = req.query.origin;
    const baseUrl = (frontendOrigin || process.env.APP_URL || `https://${req.get("host")}`).replace(/\/$/, "");
    const redirectUri = `${baseUrl}/api/auth/naver/callback`;
    const stateObj = {
      nonce: Math.random().toString(36).substring(7),
      origin: baseUrl
    };
    const state = Buffer.from(JSON.stringify(stateObj)).toString("base64");
    const url = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    console.log("Redirecting to Naver:", url);
    res.redirect(url);
  });
  app.get("/api/auth/naver/url", (req, res) => {
    const clientId = process.env.NAVER_CLIENT_ID;
    const frontendOrigin = req.query.origin;
    const baseUrl = (frontendOrigin || process.env.APP_URL || `https://${req.get("host")}`).replace(/\/$/, "");
    const redirectUri = `${baseUrl}/api/auth/naver/callback`;
    const stateObj = {
      nonce: Math.random().toString(36).substring(7),
      origin: baseUrl
    };
    const state = Buffer.from(JSON.stringify(stateObj)).toString("base64");
    const url = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    res.json({ url });
  });
  app.get("/api/auth/naver/callback", async (req, res) => {
    const { code, state, error, error_description } = req.query;
    if (error || error_description) {
      console.log("[Naver Auth] Callback received with error:", { error, error_description });
    }
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    console.log("[Naver Auth] Env check:", { clientId: !!clientId, clientSecret: !!clientSecret });
    if (error) {
      console.error("[Naver Auth] Error from Query:", error, error_description);
      return res.status(400).send(`
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #fca5a5; background: #fef2f2; border-radius: 8px;">
          <h3 style="color: #dc2626;">\uB124\uC774\uBC84 \uC778\uC99D \uC5D0\uB7EC</h3>
          <p><b>\uC5D0\uB7EC \uCF54\uB4DC:</b> ${error}</p>
          <p><b>\uC0C1\uC138 \uB0B4\uC6A9:</b> ${error_description}</p>
          <button onclick="window.close()" style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">\uB2EB\uAE30</button>
        </div>
      `);
    }
    if (!clientId || !clientSecret) {
      console.error("[Naver Auth] Missing NAVER_CLIENT_ID or NAVER_CLIENT_SECRET");
      return res.status(500).send(`
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #fca5a5; background: #fef2f2; border-radius: 8px;">
          <h3 style="color: #dc2626;">\uC11C\uBC84 \uC124\uC815 \uC624\uB958</h3>
          <p>NAVER_CLIENT_ID \uB610\uB294 NAVER_CLIENT_SECRET \uD658\uACBD \uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.</p>
          <p>AI Studio \uC124\uC815 \uBA54\uB274\uC5D0\uC11C \uD658\uACBD \uBCC0\uC218\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.</p>
          <button onclick="window.close()" style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">\uB2EB\uAE30</button>
        </div>
      `);
    }
    let baseUrl = `https://${req.get("host")}`;
    try {
      if (state) {
        const decodedState = JSON.parse(Buffer.from(state, "base64").toString());
        if (decodedState.origin) {
          baseUrl = decodedState.origin.replace(/\/$/, "");
        }
      }
    } catch (e) {
      console.error("[Naver Auth] Error decoding state:", e);
    }
    const redirectUri = `${baseUrl}/api/auth/naver/callback`;
    console.log("[Naver Auth] Using Redirect URI:", redirectUri);
    try {
      console.log("[Naver Auth] Requesting access token...");
      const tokenRes = await import_axios.default.get(`https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${clientId}&client_secret=${clientSecret}&code=${code}&state=${state}`);
      if (tokenRes.data.error) {
        console.error("[Naver Auth] Token Exchange Error:", tokenRes.data.error_description);
        throw new Error(`Token Error: ${tokenRes.data.error_description}`);
      }
      const accessToken = tokenRes.data.access_token;
      console.log("[Naver Auth] Access token obtained successfully");
      console.log("[Naver Auth] Requesting user profile...");
      const profileRes = await import_axios.default.get("https://openapi.naver.com/v1/nid/me", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const profile = profileRes.data.response;
      console.log("[Naver Auth] Profile obtained for user:", profile.id);
      const uid = `naver:${profile.id}`;
      let customToken = null;
      try {
        console.log("[Naver Auth] Attempting to generate custom token for uid:", uid);
        customToken = await import_firebase_admin.default.auth().createCustomToken(uid);
        console.log("[Naver Auth] Custom token generated successfully");
      } catch (adminErr) {
        console.error("[Naver Auth] Firebase Admin Error (Custom Token):", adminErr.message);
        if (adminErr.message.includes("IAM Service Account Credentials API")) {
          console.error("[Naver Auth] CRITICAL: IAM Service Account Credentials API is disabled. Please enable it in the Google Cloud Console: https://console.developers.google.com/apis/api/iamcredentials.googleapis.com/overview?project=577050804627");
        }
      }
      const authData = {
        uid,
        email: profile.email || `${profile.id}@naver.com`,
        nickname: profile.nickname || profile.name,
        profile_image: profile.profile_image,
        provider: "naver",
        customToken
        // Include custom token if generated
      };
      console.log("[Naver Auth] Sending auth data to client (Custom Token:", !!customToken, ")");
      sendSuccess(res, authData, "naver", baseUrl);
    } catch (error2) {
      const errorMsg = error2.message || "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.";
      const errorDetail = error2.response?.data ? JSON.stringify(error2.response.data) : errorMsg;
      console.error("[Naver Auth] Exception:", errorDetail);
      res.status(500).send(`
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #fca5a5; background: #fef2f2; border-radius: 8px;">
          <h3 style="color: #dc2626;">\uB124\uC774\uBC84 \uC778\uC99D \uCC98\uB9AC \uC911 \uC624\uB958 \uBC1C\uC0DD</h3>
          <p style="font-size: 14px; color: #666;">${errorDetail.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
          <p style="font-size: 12px; color: #999;">Redirect URI \uC124\uC815\uC774\uB098 API \uD0A4 \uAD8C\uD55C\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.</p>
          <button onclick="window.close()" style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">\uB2EB\uAE30</button>
        </div>
      `);
    }
  });
  function sendSuccess(res, authData, provider, baseUrl) {
    res.send(`
      <html>
        <head>
          <title>${provider === "naver" ? "\uB124\uC774\uBC84" : "\uCE74\uCE74\uC624"} \uB85C\uADF8\uC778 \uC644\uB8CC</title>
          <meta charset="utf-8">
        </head>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background-color: #f9f9f9;">
          <div style="display: inline-block; padding: 30px; background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); max-width: 320px; width: 90%;">
            <h2 style="color: ${provider === "naver" ? "#03C75A" : "#FEE500"}; margin-bottom: 15px;">\uB85C\uADF8\uC778 \uC131\uACF5</h2>
            <p style="color: #666; line-height: 1.5; font-size: 14px;">\uC778\uC99D\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.<br>\uC7A0\uC2DC \uD6C4 \uC790\uB3D9\uC73C\uB85C \uB2EB\uD799\uB2C8\uB2E4.</p>
            <button id="completeBtn" style="margin-top: 20px; width: 100%; padding: 12px; background: ${provider === "naver" ? "#03C75A" : "#FEE500"}; color: ${provider === "naver" ? "white" : "#3C1E1E"}; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">
              \uD655\uC778
            </button>
          </div>
          <script>
            const messageData = { 
              type: 'AUTH_SUCCESS_PROFILE_DATA', 
              authData: ${JSON.stringify(authData)},
              timestamp: Date.now()
            };
            
            console.log('Auth success, sending data...', messageData);
            
            const channel = new BroadcastChannel('social_auth_channel');
            
            function sendAuthData() {
              localStorage.setItem('social_auth_data', JSON.stringify(messageData));
              if (window.opener) {
                window.opener.postMessage(messageData, '*');
              }
              try { channel.postMessage(messageData); } catch (e) {}
            }

            sendAuthData();
            setTimeout(sendAuthData, 500);

            document.getElementById('completeBtn').onclick = () => {
              sendAuthData();
              window.close();
            };
            setTimeout(() => { window.close(); }, 3000);
          </script>
        </body>
      </html>
    `);
  }
  app.get("/auth/kakao", (req, res) => {
    const clientId = process.env.KAKAO_CLIENT_ID;
    if (!clientId) {
      return res.status(500).send(`
        <div style="font-family: sans-serif; padding: 20px; text-align: center;">
          <h3 style="color: #e11d48;">\uC124\uC815 \uC624\uB958</h3>
          <p>KAKAO_CLIENT_ID\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.</p>
          <button onclick="window.close()" style="padding: 8px 16px; background: #eee; border: 1px solid #ccc; border-radius: 4px;">\uB2EB\uAE30</button>
        </div>
      `);
    }
    const frontendOrigin = req.query.origin;
    const baseUrl = (frontendOrigin || process.env.APP_URL || `https://${req.get("host")}`).replace(/\/$/, "");
    const redirectUri = `${baseUrl}/api/auth/kakao/callback`;
    const stateObj = {
      nonce: Math.random().toString(36).substring(7),
      origin: baseUrl
    };
    const state = Buffer.from(JSON.stringify(stateObj)).toString("base64");
    const url = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    console.log("Redirecting to Kakao:", url);
    res.redirect(url);
  });
  app.get("/api/auth/kakao/url", (req, res) => {
    const clientId = process.env.KAKAO_CLIENT_ID;
    const frontendOrigin = req.query.origin;
    const baseUrl = (frontendOrigin || process.env.APP_URL || `https://${req.get("host")}`).replace(/\/$/, "");
    const redirectUri = `${baseUrl}/api/auth/kakao/callback`;
    const stateObj = {
      nonce: Math.random().toString(36).substring(7),
      origin: baseUrl
    };
    const state = Buffer.from(JSON.stringify(stateObj)).toString("base64");
    const url = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    res.json({ url });
  });
  app.get("/api/auth/kakao/callback", async (req, res) => {
    const { code, state, error, error_description } = req.query;
    if (error || error_description) {
      console.log("[Kakao Auth] Callback received with error:", { error, error_description });
    }
    const clientId = process.env.KAKAO_CLIENT_ID;
    const clientSecret = process.env.KAKAO_CLIENT_SECRET;
    console.log("[Kakao Auth] Env check:", { clientId: !!clientId, clientSecret: !!clientSecret });
    if (error) {
      console.error("[Kakao Auth] Error from Query:", error, error_description);
      return res.status(400).send(`
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #fca5a5; background: #fef2f2; border-radius: 8px;">
          <h3 style="color: #dc2626;">\uCE74\uCE74\uC624 \uC778\uC99D \uC5D0\uB7EC</h3>
          <p><b>\uC5D0\uB7EC \uCF54\uB4DC:</b> ${error}</p>
          <p><b>\uC0C1\uC138 \uB0B4\uC6A9:</b> ${error_description}</p>
          <button onclick="window.close()" style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">\uB2EB\uAE30</button>
        </div>
      `);
    }
    if (!clientId || !clientSecret) {
      console.error("[Kakao Auth] Missing KAKAO_CLIENT_ID or KAKAO_CLIENT_SECRET");
      return res.status(500).send(`
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #fca5a5; background: #fef2f2; border-radius: 8px;">
          <h3 style="color: #dc2626;">\uC11C\uBC84 \uC124\uC815 \uC624\uB958</h3>
          <p>KAKAO_CLIENT_ID \uB610\uB294 KAKAO_CLIENT_SECRET \uD658\uACBD \uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.</p>
          <button onclick="window.close()" style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">\uB2EB\uAE30</button>
        </div>
      `);
    }
    let baseUrl = `https://${req.get("host")}`;
    try {
      if (state) {
        const decodedState = JSON.parse(Buffer.from(state, "base64").toString());
        if (decodedState.origin) {
          baseUrl = decodedState.origin.replace(/\/$/, "");
        }
      }
    } catch (e) {
      console.error("[Kakao Auth] Error decoding state:", e);
    }
    const redirectUri = `${baseUrl}/api/auth/kakao/callback`;
    console.log("[Kakao Auth] Using Redirect URI:", redirectUri);
    try {
      console.log("[Kakao Auth] Requesting access token...");
      const tokenRes = await import_axios.default.post(
        "https://kauth.kakao.com/oauth/token",
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );
      const accessToken = tokenRes.data.access_token;
      console.log("[Kakao Auth] Access token obtained successfully");
      console.log("[Kakao Auth] Requesting user profile...");
      const profileRes = await import_axios.default.get("https://kapi.kakao.com/v2/user/me", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const profile = profileRes.data;
      console.log("[Kakao Auth] Profile obtained for user:", profile.id);
      const uid = `kakao:${profile.id}`;
      let customToken = null;
      try {
        console.log("[Kakao Auth] Attempting to generate custom token for uid:", uid);
        customToken = await import_firebase_admin.default.auth().createCustomToken(uid);
        console.log("[Kakao Auth] Custom token generated successfully");
      } catch (adminErr) {
        console.error("[Kakao Auth] Firebase Admin Error (Custom Token):", adminErr.message);
        if (adminErr.message.includes("IAM Service Account Credentials API")) {
          console.error("[Kakao Auth] CRITICAL: IAM Service Account Credentials API is disabled. Please enable it in the Google Cloud Console: https://console.developers.google.com/apis/api/iamcredentials.googleapis.com/overview?project=577050804627");
        }
      }
      const authData = {
        uid,
        email: profile.kakao_account?.email || `${profile.id}@kakao.com`,
        nickname: profile.properties?.nickname,
        profile_image: profile.properties?.profile_image,
        provider: "kakao",
        customToken
      };
      console.log("[Kakao Auth] Sending auth data to client (Custom Token:", !!customToken, ")");
      sendSuccess(res, authData, "kakao", baseUrl);
    } catch (error2) {
      const errorMsg = error2.message || "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.";
      const errorDetail = error2.response?.data ? JSON.stringify(error2.response.data) : errorMsg;
      console.error("[Kakao Auth] Exception:", errorDetail);
      res.status(500).send(`
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #fca5a5; background: #fef2f2; border-radius: 8px;">
          <h3 style="color: #dc2626;">\uCE74\uCE74\uC624 \uC778\uC99D \uCC98\uB9AC \uC911 \uC624\uB958 \uBC1C\uC0DD</h3>
          <p style="font-size: 14px; color: #666;">${errorDetail.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
          <p style="font-size: 12px; color: #999;">Redirect URI \uC124\uC815\uC774\uB098 API \uD0A4 \uAD8C\uD55C\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.</p>
          <button onclick="window.close()" style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">\uB2EB\uAE30</button>
        </div>
      `);
    }
  });
  if (!isProduction) {
    console.log("[server] Starting Vite dev middleware (HMR on same HTTP port)...");
    try {
      const vite = await (0, import_vite.createServer)({
        configFile: import_path.default.join(process.cwd(), "vite.config.ts"),
        server: {
          middlewareMode: { server: httpServer },
          hmr: process.env.DISABLE_HMR === "true" ? false : { server: httpServer }
        },
        appType: "spa"
      });
      app.use(vite.middlewares);
      console.log("[server] Vite ready.");
    } catch (err) {
      logError("Vite startup failed", err);
      throw err;
    }
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      const ext = import_path.default.extname(req.path).toLowerCase();
      if (req.path.startsWith("/assets/") || [".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf"].includes(ext)) {
        res.status(404).type("text/plain").send("Resource not found");
      } else {
        res.sendFile(import_path.default.join(distPath, "index.html"));
      }
    });
  }
  await new Promise((resolve, reject) => {
    const onListenError = (err) => {
      reject(err);
    };
    httpServer.once("error", onListenError);
    httpServer.listen(PORT, "0.0.0.0", () => {
      httpServer.removeListener("error", onListenError);
      console.log(`[server] Running \u2014 open http://localhost:${PORT}`);
      console.log(`[server] Mode: ${isProduction ? "production" : "development"} | PID: ${process.pid}`);
      resolve();
    });
  });
  return httpServer;
}
startServer().catch((err) => {
  logError("startServer failed", err);
  process.exit(1);
});
//# sourceMappingURL=server.cjs.map
