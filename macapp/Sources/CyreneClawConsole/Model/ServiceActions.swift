import Foundation

// 动作不是瞬时的，发完命令先进过渡态，再轮询到目标态为止
extension ServicesModel {
    func startBot() { runLaunchd(action: .start) }
    func stopBot() { runLaunchd(action: .stop) }
    func restartBot() { runLaunchd(action: .restart) }

    enum LaunchdAction { case start, stop, restart }

    private func runLaunchd(action: LaunchdAction) {
        guard !busy.contains("bot") else { return }
        busy.insert("bot")
        lastError = nil
        bot = action == .stop ? .stopping : .starting

        Task {
            defer { busy.remove("bot") }
            do {
                switch action {
                case .start: try await Launchctl.start(Labels.bot)
                case .stop: try await Launchctl.stop(Labels.bot)
                case .restart: try await Launchctl.restart(Labels.bot)
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
                let s = await Launchctl.status(Labels.bot)
                if s.kind == want { break }
            }
            busy.remove("bot")
            await refresh()
        }
    }

    // 安装常驻服务复用仓库里的现成脚本，app 不重复实现 plist 生成
    func installBotService() {
        guard let root, !busy.contains("bot") else { return }
        busy.insert("bot")
        hint["bot"] = "正在生成 plist 并加载…"
        lastError = nil
        Task {
            defer { busy.remove("bot"); hint["bot"] = nil }
            guard let node = NodeLocator.find() else { lastError = ConfigError.noNode.localizedDescription; return }
            let path = root.appendingPathComponent("scripts/install-service.mjs").path
            do {
                let r = try await Shell.run(node, [path], cwd: root.path, timeout: 60)
                if r.code != 0 { lastError = r.err.isEmpty ? r.out : r.err }
            } catch {
                lastError = error.localizedDescription
            }
            busy.remove("bot")
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
