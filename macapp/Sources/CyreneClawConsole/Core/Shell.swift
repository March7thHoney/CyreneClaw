import Foundation

struct ShellResult {
    let code: Int32
    let out: String
    let err: String
}

enum ShellError: LocalizedError {
    case launchFailed(String)
    case timedOut

    var errorDescription: String? {
        switch self {
        case .launchFailed(let m): return "无法执行命令：\(m)"
        case .timedOut: return "命令执行超时"
        }
    }
}

enum Shell {
    // GUI 进程不继承登录 shell 的 PATH，和 launchd plist 里保持一致
    static let path = "/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin"

    static func run(_ launchPath: String, _ args: [String],
                    cwd: String? = nil, stdin: String? = nil,
                    timeout: TimeInterval = 20) async throws -> ShellResult {
        try await withCheckedThrowingContinuation { cont in
            DispatchQueue.global(qos: .userInitiated).async {
                do { cont.resume(returning: try runSync(launchPath, args, cwd: cwd, stdin: stdin, timeout: timeout)) }
                catch { cont.resume(throwing: error) }
            }
        }
    }

    private static func runSync(_ launchPath: String, _ args: [String],
                                cwd: String?, stdin: String?, timeout: TimeInterval) throws -> ShellResult {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: launchPath)
        p.arguments = args
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = path
        p.environment = env
        if let cwd { p.currentDirectoryURL = URL(fileURLWithPath: cwd) }

        let outPipe = Pipe(), errPipe = Pipe()
        p.standardOutput = outPipe
        p.standardError = errPipe
        if stdin != nil { p.standardInput = Pipe() }

        do { try p.run() } catch { throw ShellError.launchFailed(error.localizedDescription) }

        if let stdin, let inPipe = p.standardInput as? Pipe {
            inPipe.fileHandleForWriting.write(Data(stdin.utf8))
            try? inPipe.fileHandleForWriting.close()
        }

        // 管道缓冲区满了会让子进程卡死，两条流必须并发排空
        let lock = NSLock()
        var outData = Data(), errData = Data()
        let group = DispatchGroup()
        for (pipe, isOut) in [(outPipe, true), (errPipe, false)] {
            group.enter()
            DispatchQueue.global(qos: .userInitiated).async {
                let d = pipe.fileHandleForReading.readDataToEndOfFile()
                lock.lock()
                if isOut { outData = d } else { errData = d }
                lock.unlock()
                group.leave()
            }
        }

        let deadline = Date().addingTimeInterval(timeout)
        while p.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.02) }
        if p.isRunning {
            p.terminate()
            Thread.sleep(forTimeInterval: 0.3)
            if p.isRunning { kill(p.processIdentifier, SIGKILL) }
            _ = group.wait(timeout: .now() + 2)
            throw ShellError.timedOut
        }
        p.waitUntilExit()
        _ = group.wait(timeout: .now() + 5)

        lock.lock()
        let o = String(data: outData, encoding: .utf8) ?? ""
        let e = String(data: errData, encoding: .utf8) ?? ""
        lock.unlock()
        return ShellResult(code: p.terminationStatus, out: o, err: e)
    }
}
