// 卸载常驻服务并删除 plist
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

const LABEL = 'com.cyreneclaw.bot';
const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const uid = process.getuid();
try { execSync(`launchctl bootout gui/${uid}/${LABEL}`, { stdio: 'ignore' }); } catch { /* 未加载则忽略 */ }
if (fs.existsSync(plistPath)) { fs.unlinkSync(plistPath); console.log(`已删除 ${plistPath}`); }
console.log('已卸载');
