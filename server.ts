import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import admin from "firebase-admin";
import cookieParser from "cookie-parser";
import firebaseConfig from "./firebase-applet-config.json";

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());

  // Naver OAuth Redirect
  app.get("/auth/naver", (req, res) => {
    const clientId = process.env.NAVER_CLIENT_ID;
    if (!clientId) {
      return res.status(500).send(`
        <div style="font-family: sans-serif; padding: 20px; text-align: center;">
          <h3 style="color: #e11d48;">설정 오류</h3>
          <p>NAVER_CLIENT_ID가 설정되지 않았습니다.</p>
          <button onclick="window.close()" style="padding: 8px 16px; background: #eee; border: 1px solid #ccc; border-radius: 4px;">닫기</button>
        </div>
      `);
    }

    const frontendOrigin = req.query.origin as string;
    const baseUrl = (frontendOrigin || process.env.APP_URL || `https://${req.get('host')}`).replace(/\/$/, '');
    const redirectUri = `${baseUrl}/api/auth/naver/callback`;
    // Pass origin in state to maintain it through the callback
    const stateObj = {
      nonce: Math.random().toString(36).substring(7),
      origin: baseUrl
    };
    const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');
    
    const url = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    console.log('Redirecting to Naver:', url);
    res.redirect(url);
  });

  // Naver OAuth URL (Legacy JSON endpoint, keeping for compatibility if needed)
  app.get("/api/auth/naver/url", (req, res) => {
    const clientId = process.env.NAVER_CLIENT_ID;
    const frontendOrigin = req.query.origin as string;
    const baseUrl = (frontendOrigin || process.env.APP_URL || `https://${req.get('host')}`).replace(/\/$/, '');
    const redirectUri = `${baseUrl}/api/auth/naver/callback`;
    const stateObj = {
      nonce: Math.random().toString(36).substring(7),
      origin: baseUrl
    };
    const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');
    
    const url = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    res.json({ url });
  });

  // Naver Callback
  app.get("/api/auth/naver/callback", async (req, res) => {
    const { code, state, error, error_description } = req.query;
    if (error || error_description) {
      console.log('[Naver Auth] Callback received with error:', { error, error_description });
    }
    
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    console.log('[Naver Auth] Env check:', { clientId: !!clientId, clientSecret: !!clientSecret });
    
    if (error) {
      console.error("[Naver Auth] Error from Query:", error, error_description);
      return res.status(400).send(`
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #fca5a5; background: #fef2f2; border-radius: 8px;">
          <h3 style="color: #dc2626;">네이버 인증 에러</h3>
          <p><b>에러 코드:</b> ${error}</p>
          <p><b>상세 내용:</b> ${error_description}</p>
          <button onclick="window.close()" style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">닫기</button>
        </div>
      `);
    }

    if (!clientId || !clientSecret) {
      console.error("[Naver Auth] Missing NAVER_CLIENT_ID or NAVER_CLIENT_SECRET");
      return res.status(500).send(`
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #fca5a5; background: #fef2f2; border-radius: 8px;">
          <h3 style="color: #dc2626;">서버 설정 오류</h3>
          <p>NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 환경 변수가 설정되지 않았습니다.</p>
          <p>AI Studio 설정 메뉴에서 환경 변수를 확인해 주세요.</p>
          <button onclick="window.close()" style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">닫기</button>
        </div>
      `);
    }

    // Try to recover baseUrl from state
    let baseUrl = `https://${req.get('host')}`;
    try {
      if (state) {
        const decodedState = JSON.parse(Buffer.from(state as string, 'base64').toString());
        if (decodedState.origin) {
          baseUrl = decodedState.origin.replace(/\/$/, '');
        }
      }
    } catch (e) {
      console.error("[Naver Auth] Error decoding state:", e);
    }
    
    const redirectUri = `${baseUrl}/api/auth/naver/callback`;
    console.log('[Naver Auth] Using Redirect URI:', redirectUri);

    try {
      // 1. Get Access Token
      console.log('[Naver Auth] Requesting access token...');
      const tokenRes = await axios.get(`https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${clientId}&client_secret=${clientSecret}&code=${code}&state=${state}`);
      
      if (tokenRes.data.error) {
        console.error("[Naver Auth] Token Exchange Error:", tokenRes.data.error_description);
        throw new Error(`Token Error: ${tokenRes.data.error_description}`);
      }

      const accessToken = tokenRes.data.access_token;
      console.log('[Naver Auth] Access token obtained successfully');

      // 2. Get Profile
      console.log('[Naver Auth] Requesting user profile...');
      const profileRes = await axios.get("https://openapi.naver.com/v1/nid/me", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const profile = profileRes.data.response;
      console.log('[Naver Auth] Profile obtained for user:', profile.id);

      // 3. Generate Custom Token (Standard Firebase Auth way)
      const uid = `naver:${profile.id}`;
      let customToken = null;
      try {
        console.log('[Naver Auth] Attempting to generate custom token for uid:', uid);
        customToken = await admin.auth().createCustomToken(uid);
        console.log('[Naver Auth] Custom token generated successfully');
      } catch (adminErr: any) {
        console.error('[Naver Auth] Firebase Admin Error (Custom Token):', adminErr.message);
        if (adminErr.message.includes('IAM Service Account Credentials API')) {
          console.error('[Naver Auth] CRITICAL: IAM Service Account Credentials API is disabled. Please enable it in the Google Cloud Console: https://console.developers.google.com/apis/api/iamcredentials.googleapis.com/overview?project=577050804627');
        }
        // Fallback to client-side auth if admin fails (e.g. permission issues)
      }

      const authData = {
        uid: uid,
        email: profile.email || `${profile.id}@naver.com`,
        nickname: profile.nickname || profile.name,
        profile_image: profile.profile_image,
        provider: 'naver',
        customToken: customToken // Include custom token if generated
      };
      
      console.log('[Naver Auth] Sending auth data to client (Custom Token:', !!customToken, ')');
      sendSuccess(res, authData, 'naver', baseUrl);
    } catch (error: any) {
      const errorMsg = error.message || '알 수 없는 오류가 발생했습니다.';
      const errorDetail = error.response?.data ? JSON.stringify(error.response.data) : errorMsg;
      console.error("[Naver Auth] Exception:", errorDetail);
      res.status(500).send(`
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #fca5a5; background: #fef2f2; border-radius: 8px;">
          <h3 style="color: #dc2626;">네이버 인증 처리 중 오류 발생</h3>
          <p style="font-size: 14px; color: #666;">${errorDetail.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          <p style="font-size: 12px; color: #999;">Redirect URI 설정이나 API 키 권한을 확인해 주세요.</p>
          <button onclick="window.close()" style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">닫기</button>
        </div>
      `);
    }
  });

  // Helper to send success response
  function sendSuccess(res: any, authData: any, provider: string, baseUrl: string) {
    res.send(`
      <html>
        <head>
          <title>${provider === 'naver' ? '네이버' : '카카오'} 로그인 완료</title>
          <meta charset="utf-8">
        </head>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px; background-color: #f9f9f9;">
          <div style="display: inline-block; padding: 30px; background: white; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); max-width: 320px; width: 90%;">
            <h2 style="color: ${provider === 'naver' ? '#03C75A' : '#FEE500'}; margin-bottom: 15px;">로그인 성공</h2>
            <p style="color: #666; line-height: 1.5; font-size: 14px;">인증이 완료되었습니다.<br>잠시 후 자동으로 닫힙니다.</p>
            <button id="completeBtn" style="margin-top: 20px; width: 100%; padding: 12px; background: ${provider === 'naver' ? '#03C75A' : '#FEE500'}; color: ${provider === 'naver' ? 'white' : '#3C1E1E'}; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">
              확인
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

  // Kakao OAuth Redirect
  app.get("/auth/kakao", (req, res) => {
    const clientId = process.env.KAKAO_CLIENT_ID;
    if (!clientId) {
      return res.status(500).send(`
        <div style="font-family: sans-serif; padding: 20px; text-align: center;">
          <h3 style="color: #e11d48;">설정 오류</h3>
          <p>KAKAO_CLIENT_ID가 설정되지 않았습니다.</p>
          <button onclick="window.close()" style="padding: 8px 16px; background: #eee; border: 1px solid #ccc; border-radius: 4px;">닫기</button>
        </div>
      `);
    }

    const frontendOrigin = req.query.origin as string;
    const baseUrl = (frontendOrigin || process.env.APP_URL || `https://${req.get('host')}`).replace(/\/$/, '');
    const redirectUri = `${baseUrl}/api/auth/kakao/callback`;
    // Pass origin in state
    const stateObj = {
      nonce: Math.random().toString(36).substring(7),
      origin: baseUrl
    };
    const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');
    
    const url = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    console.log('Redirecting to Kakao:', url);
    res.redirect(url);
  });

  // Kakao OAuth URL (Legacy JSON endpoint)
  app.get("/api/auth/kakao/url", (req, res) => {
    const clientId = process.env.KAKAO_CLIENT_ID;
    const frontendOrigin = req.query.origin as string;
    const baseUrl = (frontendOrigin || process.env.APP_URL || `https://${req.get('host')}`).replace(/\/$/, '');
    const redirectUri = `${baseUrl}/api/auth/kakao/callback`;
    const stateObj = {
      nonce: Math.random().toString(36).substring(7),
      origin: baseUrl
    };
    const state = Buffer.from(JSON.stringify(stateObj)).toString('base64');
    
    const url = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    res.json({ url });
  });

  // Kakao Callback
  app.get("/api/auth/kakao/callback", async (req, res) => {
    const { code, state, error, error_description } = req.query;
    if (error || error_description) {
      console.log('[Kakao Auth] Callback received with error:', { error, error_description });
    }

    const clientId = process.env.KAKAO_CLIENT_ID;
    const clientSecret = process.env.KAKAO_CLIENT_SECRET;
    console.log('[Kakao Auth] Env check:', { clientId: !!clientId, clientSecret: !!clientSecret });

    if (error) {
      console.error("[Kakao Auth] Error from Query:", error, error_description);
      return res.status(400).send(`
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #fca5a5; background: #fef2f2; border-radius: 8px;">
          <h3 style="color: #dc2626;">카카오 인증 에러</h3>
          <p><b>에러 코드:</b> ${error}</p>
          <p><b>상세 내용:</b> ${error_description}</p>
          <button onclick="window.close()" style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">닫기</button>
        </div>
      `);
    }

    if (!clientId || !clientSecret) {
      console.error("[Kakao Auth] Missing KAKAO_CLIENT_ID or KAKAO_CLIENT_SECRET");
      return res.status(500).send(`
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #fca5a5; background: #fef2f2; border-radius: 8px;">
          <h3 style="color: #dc2626;">서버 설정 오류</h3>
          <p>KAKAO_CLIENT_ID 또는 KAKAO_CLIENT_SECRET 환경 변수가 설정되지 않았습니다.</p>
          <button onclick="window.close()" style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">닫기</button>
        </div>
      `);
    }

    // Try to recover baseUrl from state
    let baseUrl = `https://${req.get('host')}`;
    try {
      if (state) {
        const decodedState = JSON.parse(Buffer.from(state as string, 'base64').toString());
        if (decodedState.origin) {
          baseUrl = decodedState.origin.replace(/\/$/, '');
        }
      }
    } catch (e) {
      console.error("[Kakao Auth] Error decoding state:", e);
    }
    
    const redirectUri = `${baseUrl}/api/auth/kakao/callback`;
    console.log('[Kakao Auth] Using Redirect URI:', redirectUri);

    try {
      // 1. Get Access Token
      console.log('[Kakao Auth] Requesting access token...');
      const tokenRes = await axios.post("https://kauth.kakao.com/oauth/token", 
        new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId!,
          client_secret: clientSecret!,
          redirect_uri: redirectUri,
          code: code as string
        }).toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );
      const accessToken = tokenRes.data.access_token;
      console.log('[Kakao Auth] Access token obtained successfully');

      // 2. Get Profile
      console.log('[Kakao Auth] Requesting user profile...');
      const profileRes = await axios.get("https://kapi.kakao.com/v2/user/me", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const profile = profileRes.data;
      console.log('[Kakao Auth] Profile obtained for user:', profile.id);

      // 3. Generate Custom Token
      const uid = `kakao:${profile.id}`;
      let customToken = null;
      try {
        console.log('[Kakao Auth] Attempting to generate custom token for uid:', uid);
        customToken = await admin.auth().createCustomToken(uid);
        console.log('[Kakao Auth] Custom token generated successfully');
      } catch (adminErr: any) {
        console.error('[Kakao Auth] Firebase Admin Error (Custom Token):', adminErr.message);
        if (adminErr.message.includes('IAM Service Account Credentials API')) {
          console.error('[Kakao Auth] CRITICAL: IAM Service Account Credentials API is disabled. Please enable it in the Google Cloud Console: https://console.developers.google.com/apis/api/iamcredentials.googleapis.com/overview?project=577050804627');
        }
      }

      const authData = {
        uid: uid,
        email: profile.kakao_account?.email || `${profile.id}@kakao.com`,
        nickname: profile.properties?.nickname,
        profile_image: profile.properties?.profile_image,
        provider: 'kakao',
        customToken: customToken
      };
      
      console.log('[Kakao Auth] Sending auth data to client (Custom Token:', !!customToken, ')');
      sendSuccess(res, authData, 'kakao', baseUrl);
    } catch (error: any) {
      const errorMsg = error.message || '알 수 없는 오류가 발생했습니다.';
      const errorDetail = error.response?.data ? JSON.stringify(error.response.data) : errorMsg;
      console.error("[Kakao Auth] Exception:", errorDetail);
      res.status(500).send(`
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #fca5a5; background: #fef2f2; border-radius: 8px;">
          <h3 style="color: #dc2626;">카카오 인증 처리 중 오류 발생</h3>
          <p style="font-size: 14px; color: #666;">${errorDetail.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          <p style="font-size: 12px; color: #999;">Redirect URI 설정이나 API 키 권한을 확인해 주세요.</p>
          <button onclick="window.close()" style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer;">닫기</button>
        </div>
      `);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
