// auth/status.cjs —— gh CLI 登录状态判定
// 仅依据真实输出编写；只匹配「已登录 / 未登录」两类，其它一律 unknown。
// 凭据行（含密钥前缀与星号掩码的那行）不进判定行、不进解析、不外带。
const kit = require(process.env.HARNESS_AUTH_KIT);

// 剥 ANSI 颜色码 / 光标控制序列
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '');

(async () => {
  let r;
  try {
    r = kit.cli(['auth', 'status'], { timeoutMs: 12000 });
  } catch (e) {
    // kit.cli 自身异常（spawn 失败、参数错）⇒ 判不了
    kit.emit({ state: 'unknown', detail: 'cli-spawn-failed: ' + (e && e.message || String(e)) });
    return;
  }

  const code = r.code;
  const out = strip((r.stdout || '') + '\n' + (r.stderr || ''));

  // 已登录：exit 0 + 含 "Logged in to <host> account <user>"
  if (code === 0) {
    const m = /\blogged in to \S+ account (\S+)/i.exec(out);
    if (m) {
      kit.emit({ state: 'ok', account: m[1] });
      return;
    }
    // exit 0 但没匹配到登录行 —— 异常态，保守判 unknown
    kit.emit({ state: 'unknown', detail: 'exit-0-no-logged-in-line' });
    return;
  }

  // 未登录：exit 1 + 含 "not logged in"
  if (code === 1) {
    if (/not logged in/i.test(out) || /you are not logged in/i.test(out)) {
      kit.emit({ state: 'red' });
      return;
    }
    // exit 1 但文案不符（凭据过期、被吊销、网络鉴权失败等）—— 也算鉴权问题，按 red
    if (/authentication/i.test(out) || /token/i.test(out) || /credential/i.test(out)) {
      kit.emit({ state: 'red', detail: 'auth-issue-exit-1' });
      return;
    }
    // exit 1 但内容认不出 —— 判不了
    kit.emit({ state: 'unknown', detail: 'exit-1-unrecognized' });
    return;
  }

  // 其他退出码（127 找不到、超时、网络错）⇒ unknown
  kit.emit({ state: 'unknown', detail: 'exit-code-' + code });
})();
