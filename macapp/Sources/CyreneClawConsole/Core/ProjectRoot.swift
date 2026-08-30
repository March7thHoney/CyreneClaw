import AppKit
import Foundation

enum Labels {
    static let bot = "com.cyreneclaw.bot"
    static let bridge = "com.stclaudebridge.server"
}

// 定位 CyreneClaw 项目根。仓库里不能有本机路径，全部靠运行时发现
enum ProjectRoot {
    private static let defaultsKey = "projectRootPath"
    private(set) static var cached: URL?

    static func discover() -> URL? {
        if let p = UserDefaults.standard.string(forKey: defaultsKey),
           let u = validate(URL(fileURLWithPath: p)) { cached = u; return u }
        if let u = fromLaunchAgent() { remember(u); return u }
        if let u = fromBundleNeighbour() { remember(u); return u }
        return nil
    }

    // 解析机器人 plist 的 WorkingDirectory，这是最准的一条线索
    private static func fromLaunchAgent() -> URL? {
        let url = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents/\(Labels.bot).plist")
        guard let data = try? Data(contentsOf: url),
              let dict = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
        else { return nil }
        if let wd = dict["WorkingDirectory"] as? String, let u = validate(URL(fileURLWithPath: wd)) { return u }
        if let args = dict["ProgramArguments"] as? [String], args.count > 1 {
            return validate(URL(fileURLWithPath: args[1]).deletingLastPathComponent().deletingLastPathComponent())
        }
        return nil
    }

    // 开发期从 macapp/build/ 直接跑时，往上几级就是项目根
    private static func fromBundleNeighbour() -> URL? {
        var u = Bundle.main.bundleURL
        for _ in 0..<5 {
            u.deleteLastPathComponent()
            if let v = validate(u) { return v }
        }
        return nil
    }

    static func validate(_ url: URL) -> URL? {
        let fm = FileManager.default
        let marks = ["package.json", "src/index.js", "scripts/config-set.mjs"]
        guard marks.allSatisfy({ fm.fileExists(atPath: url.appendingPathComponent($0).path) }) else { return nil }
        guard let d = try? Data(contentsOf: url.appendingPathComponent("package.json")),
              let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              j["name"] as? String == "cyreneclaw" else { return nil }
        return url.standardizedFileURL
    }

    static func remember(_ url: URL) {
        cached = url
        UserDefaults.standard.set(url.path, forKey: defaultsKey)
    }

    @MainActor
    static func chooseInteractively() -> URL? {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "选择"
        panel.message = "请选择 CyreneClaw 项目根目录（含 package.json 与 src/index.js）"
        guard panel.runModal() == .OK, let url = panel.url, let ok = validate(url) else { return nil }
        remember(ok)
        return ok
    }
}
