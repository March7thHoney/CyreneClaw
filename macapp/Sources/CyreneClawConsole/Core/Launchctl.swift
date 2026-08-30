import Foundation

struct LaunchdStatus {
    enum Kind { case notInstalled, stopped, running, unknown }
    var kind: Kind = .unknown
    var pid: Int32?
    var runs: Int?
    var lastExitCode: Int32?
}

// 启停用 kickstart / kill 而非 bootout，否则 print 返回 113 会把「主动停止」误报成「未安装」
enum Launchctl {
    static let bin = "/bin/launchctl"
    static var domain: String { "gui/\(getuid())" }

    static func plistURL(_ label: String) -> URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents/\(label).plist")
    }

    static func isInstalled(_ label: String) -> Bool {
        FileManager.default.fileExists(atPath: plistURL(label).path)
    }

    static func status(_ label: String) async -> LaunchdStatus {
        guard let r = try? await Shell.run(bin, ["print", "\(domain)/\(label)"], timeout: 8) else {
            return LaunchdStatus(kind: .unknown)
        }
        // 退出码 113 是稳定契约，比解析文本可靠
        if r.code == 113 { return LaunchdStatus(kind: .notInstalled) }
        if r.code != 0 && r.out.isEmpty { return LaunchdStatus(kind: .unknown) }
        let pid = firstInt(r.out, #"(?m)^\s*pid\s*=\s*(\d+)"#)
        return LaunchdStatus(kind: pid != nil ? .running : .stopped,
                             pid: pid.map(Int32.init),
                             runs: firstInt(r.out, #"(?m)^\s*runs\s*=\s*(\d+)"#),
                             lastExitCode: firstInt(r.out, #"(?m)^\s*last exit code\s*=\s*(-?\d+)"#).map(Int32.init))
    }

    static func start(_ label: String) async throws {
        _ = try await Shell.run(bin, ["kickstart", "\(domain)/\(label)"], timeout: 15)
    }

    // index.js 收到 SIGTERM 优雅退出且退出码 0，KeepAlive.SuccessfulExit=false 保证不被拉起
    static func stop(_ label: String) async throws {
        _ = try await Shell.run(bin, ["kill", "SIGTERM", "\(domain)/\(label)"], timeout: 12)
    }

    static func restart(_ label: String) async throws {
        _ = try await Shell.run(bin, ["kickstart", "-k", "\(domain)/\(label)"], timeout: 15)
    }

    private static func firstInt(_ text: String, _ pattern: String) -> Int? {
        guard let re = try? NSRegularExpression(pattern: pattern),
              let m = re.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let r = Range(m.range(at: 1), in: text) else { return nil }
        return Int(text[r])
    }
}
