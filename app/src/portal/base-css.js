// Base captive-portal styles. Intentionally minimal and neutral — the design's
// own CSS (from the editor) layers on top. Mobile-first; the page must look right
// in the small in-app browser captive-portal clients use.

export const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
.tk-body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  background:#f4f5f7;color:#1d1f23;padding:24px;line-height:1.5}
.tk-page{width:100%;max-width:380px;background:#fff;border-radius:16px;padding:28px 24px;
  box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.08)}
.tk-brand{display:block;max-width:140px;margin:0 auto 16px}
.tk-page h1{font-size:20px;font-weight:650;margin:0 0 6px;text-align:center}
.tk-page p{margin:0 0 18px;text-align:center;color:#5b606b;font-size:14px}
.tk-form{display:flex;flex-direction:column;gap:10px;margin:14px 0 0}
.tk-input{width:100%;padding:12px 14px;font-size:15px;border:1px solid #d7dae0;border-radius:10px;
  background:#fff;color:#1d1f23;outline:none;transition:border-color .15s,box-shadow .15s}
.tk-input:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.18)}
.tk-btn{width:100%;padding:12px 16px;font-size:15px;font-weight:600;border:0;border-radius:10px;
  background:#2563eb;color:#fff;cursor:pointer;transition:background .15s,opacity .15s}
.tk-btn:hover{background:#1d4ed8}
.tk-btn:disabled{opacity:.6;cursor:default}
.tk-error{background:#fdecec;color:#b3261e;border:1px solid #f5c2c0;border-radius:10px;
  padding:10px 12px;font-size:14px;margin:0 0 14px;text-align:center}
.tk-muted{color:#8a909b;font-size:12px;text-align:center;margin-top:16px}
.tk-notice{background:#fff7e6;color:#7a4f01;border:1px solid #f3d68a;border-radius:10px;
  padding:12px 14px;font-size:13px;margin:0 0 16px;text-align:center;line-height:1.5}
.tk-notice-link{display:inline-block;margin-top:6px;color:#2563eb;font-weight:600;text-decoration:none}
.tk-notice.flash{animation:tk-flash .9s ease}
@keyframes tk-flash{0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,0)}30%{box-shadow:0 0 0 4px rgba(245,158,11,.45)}}
.tk-btn-disabled{opacity:.55}
`;
