// 生成 launchd plist 并加载。plist 写到用户目录，仓库里不留本机路径。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LABEL = 'com.cyreneclaw.bot';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 优先用软链路径，避免 node 升级后 Cellar 里的具体版本目录消失导致服务起不来
function resolveNode() {
    const real = fs.realpathSync(process.execPath);
    for (const cand of ['/opt/homebrew/bin/node', '/usr/local/bin/node']) {
        try { if (fs.realpathSync(cand) === real) return cand; } catch { /* 不存在则跳过 */ }
    }
    return process.execPath;
}

const nodePath = resolveNode();

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${esc(nodePath)}</string>
    <string>${esc(path.join(root, 'src/index.js'))}</string>
  </array>
  <key>WorkingDirectory</key><string>${esc(root)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>${esc(path.join(root, 'logs/cyreneclaw.out.log'))}</string>
  <key>StandardErrorPath</key><string>${esc(path.join(root, 'logs/cyreneclaw.err.log'))}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin</string>
    <key>HOME</key><string>${esc(os.homedir())}</string>
    <key>TZ</key><string>Asia/Shanghai</string>
  </dict>
</dict>
</plist>
`;

fs.mkdirSync(path.dirname(plistPath), { recursive: true });
fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
fs.writeFileSync(plistPath, plist);
console.log(`已写入 ${plistPath}`);

const uid = process.getuid();
let wasLoaded = false;
try { execSync(`launchctl print gui/${uid}/${LABEL}`, { stdio: 'ignore' }); wasLoaded = true; } catch { /* 未加载 */ }
if (wasLoaded) {
    execSync(`launchctl bootout gui/${uid}/${LABEL}`, { stdio: 'ignore' });
    // launchd 释放 label 需要时间，立刻 bootstrap 会报 Input/output error
    execSync('sleep 5');
}
execSync(`launchctl bootstrap gui/${uid} "${plistPath}"`);
console.log('已加载。查看状态: launchctl print gui/' + uid + '/' + LABEL);
