import Foundation

// GUI 进程里 which 不可靠，按常见安装位置逐个探
enum NodeLocator {
    static let candidates = ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"]

    static func find() -> String? {
        let fm = FileManager.default
        for c in candidates where fm.isExecutableFile(atPath: c) { return c }
        // 兜底：读 launchd plist 里机器人实际用的那个 node
        if let root = ProjectRoot.cached,
           let args = launchAgentProgramArguments(),
           let first = args.first,
           fm.isExecutableFile(atPath: first) {
            _ = root
            return first
        }
        return nil
    }

    private static func launchAgentProgramArguments() -> [String]? {
        let url = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents/\(Labels.bot).plist")
        guard let data = try? Data(contentsOf: url),
              let dict = try? PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
        else { return nil }
        return dict["ProgramArguments"] as? [String]
    }
}
