import Foundation

// 动作不是瞬时的，发完命令先进过渡态，再轮询到目标态为止
extension ServicesModel {
    func startBot() { runLaunchd(key: "bot", label: Labels.bot, action: .start) }
    func stopBot() { runLaunchd(key: "bot", label: Labels.bot, action: .stop) }
    func restartBot() { runLaunchd(key: "bot", label: Labels.bot, action: .restart) }

    func startBridge() { runLaunchd(key: "bridge", label: Labels.bridge, action: .start) }
    func stopBridge() { runLaunchd(key: "bridge", label: Labels.bridge, action: .stop) }
    func restartBridge() { runLaunchd(key: "bridge", label: Labels.bridge, action: .restart) }

    enum LaunchdAction { case start, stop, restart }

    private func runLaunchd(key: String, label: String, action: LaunchdAction) {
        guard !busy.contains(key) else { return }
        busy.insert(key)
        lastError = nil
        if key == "bot" { bot = action == .stop ? .stopping : .starting }
        if key == "bridge" { bridge = action == .stop ? .stopping : .starting }

        Task {
            defer { busy.remove(key) }
            do {
                switch action {
                case .start: try await Launchctl.start(label)
                case .stop: try await Launchctl.stop(label)
                case .restart: try await Launchctl.restart(label)
                }
            } catch {
                lastError = error.localizedDescription
                await refresh()
                return
            }
            let want: LaunchdStatus.Kind = action == .stop ? .stopped : .running
            let deadline = Date().addingTimeInterval(action == .stop ? 25 : 30)
            while Date() < deadline {
                try? await Task.sleep(for: .milliseconds(700))
                let s = await Launchctl.status(label)
                if s.kind == want { break }
            }
            busy.remove(key)
            await refresh()
        }
    }

    // 安装常驻服务复用仓库里的现成脚本，app 不重复实现 plist 生成
    func installBotService() {
        runNodeScript(key: "bot", script: "scripts/install-service.mjs",
                      note: "正在生成 plist 并加载…", timeout: 60)
    }

    func startVoice() {
        guard let root, !busy.contains("voice") else { return }
        busy.insert("voice")
        voice = .starting
        hint["voice"] = "正在拉起并加载模型，冷启动约 1-3 分钟…"
        lastError = nil
        Task {
            defer { busy.remove("voice"); hint["voice"] = nil }
            guard let node = NodeLocator.find() else { lastError = ConfigError.noNode.localizedDescription; return }
            let script = root.appendingPathComponent("scripts/gpt-sovits.mjs").path
            // 脚本自己要等模型加载完才返回，不能同步等，探活才是可信信号
            Task.detached { _ = try? await Shell.run(node, [script, "start"], cwd: root.path, timeout: 210) }
            let deadline = Date().addingTimeInterval(210)
            while Date() < deadline {
                try? await Task.sleep(for: .seconds(2))
                if await HealthProbe.reachable("\(config.voiceEndpoint)/change_refer") { break }
            }
            busy.remove("voice")
            await refresh()
        }
    }

    func stopVoice() {
        runNodeScript(key: "voice", script: "scripts/gpt-sovits.mjs", args: ["stop"],
                      note: "正在停止…", timeout: 30)
    }

    func enableVoice() {
        Task {
            await saveConfig(["voice.enabled": true])
            await reloadConfig()
        }
    }

    private func runNodeScript(key: String, script: String, args: [String] = [],
                               note: String, timeout: TimeInterval) {
        guard let root, !busy.contains(key) else { return }
        busy.insert(key)
        hint[key] = note
        lastError = nil
        Task {
            defer { busy.remove(key); hint[key] = nil }
            guard let node = NodeLocator.find() else { lastError = ConfigError.noNode.localizedDescription; return }
            let path = root.appendingPathComponent(script).path
            do {
                let r = try await Shell.run(node, [path] + args, cwd: root.path, timeout: timeout)
                if r.code != 0 { lastError = r.err.isEmpty ? r.out : r.err }
            } catch {
                lastError = error.localizedDescription
            }
            busy.remove(key)
            await refresh()
        }
    }

    func saveConfig(_ updates: [String: Any]) async {
        guard let root else { return }
        do {
            try await ConfigStore.apply(updates, root: root)
            configDirty = true
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }
}
