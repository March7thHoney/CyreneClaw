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

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${esc(process.execPath)}</string>
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
try { execSync(`launchctl bootout gui/${uid}/${LABEL}`, { stdio: 'ignore' }); } catch { /* 未加载则忽略 */ }
execSync(`launchctl bootstrap gui/${uid} "${plistPath}"`);
console.log('已加载。查看状态: launchctl print gui/' + uid + '/' + LABEL);
