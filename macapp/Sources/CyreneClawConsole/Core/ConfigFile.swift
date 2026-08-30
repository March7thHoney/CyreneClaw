import Foundation

// 定时消息的一行。channels 在界面上是逗号分隔的单行文本，存盘时才拆开
struct ScheduleEntry: Identifiable, Equatable {
    static let slotCount = 5
    static var emptySlots: [ScheduleEntry] { (0..<slotCount).map { _ in ScheduleEntry() } }

    let id = UUID()
    var enabled = false
    var time = ""
    var text = ""
    var channels = ""

    // id 每次读配置都会新生成，算进相等性的话表单会永远显示成有改动
    static func == (a: ScheduleEntry, b: ScheduleEntry) -> Bool {
        a.enabled == b.enabled && a.time == b.time && a.text == b.text && a.channels == b.channels
    }
}

// config.json 里控制台关心的那几项，其余字段一律不解析
struct ConsoleConfig {
    var ownerUserId = ""
    var ownerDisplayName = ""
    var dmEnabled = true
    var cadenceEnabled = true
    var replyEveryN = 10
    var voiceEnabled = false
    var model = ""
    var schedule = ScheduleEntry.emptySlots
    var tokenConfigured = false

    // 探活用，不开放编辑
    var bridgeOrigin = "http://127.0.0.1:5599"
    var voiceEndpoint = "http://127.0.0.1:9880"
}

enum ConfigError: LocalizedError {
    case noNode
    case badOutput(String)
    case rejected([String])

    var errorDescription: String? {
        switch self {
        case .noNode: return "找不到 node，请确认已安装 Node.js"
        case .badOutput(let s): return s.isEmpty ? "配置脚本没有返回结果" : s
        case .rejected(let list): return list.joined(separator: "\n")
        }
    }
}

enum ConfigStore {
    private struct GetResponse: Decodable {
        let ok: Bool
        let values: [String: JSONAny]?
        let tokenConfigured: Bool?
        let errors: [FieldError]?
    }

    private struct SetResponse: Decodable {
        let ok: Bool
        let errors: [FieldError]?
    }

    struct FieldError: Decodable {
        let key: String
        let message: String
    }

    static func load(root: URL) async throws -> ConsoleConfig {
        guard let node = NodeLocator.find() else { throw ConfigError.noNode }
        let script = root.appendingPathComponent("scripts/config-set.mjs").path
        let r = try await Shell.run(node, [script, "--get"], cwd: root.path, timeout: 15)
        guard let line = lastJSONLine(r.out), let data = line.data(using: .utf8),
              let resp = try? JSONDecoder().decode(GetResponse.self, from: data), resp.ok
        else { throw ConfigError.badOutput(r.err.isEmpty ? r.out : r.err) }

        var c = ConsoleConfig()
        let v = resp.values ?? [:]
        c.ownerUserId = v["discord.owner.userId"]?.string ?? ""
        c.ownerDisplayName = v["discord.owner.displayName"]?.string ?? ""
        c.dmEnabled = v["discord.dm.enabled"]?.bool ?? true
        c.cadenceEnabled = v["discord.cadence.enabled"]?.bool ?? true
        c.replyEveryN = v["discord.cadence.replyEveryN"]?.int ?? 10
        c.voiceEnabled = v["voice.enabled"]?.bool ?? false
        c.model = v["llm.model"]?.string ?? ""
        c.schedule = parseSchedule(v["discord.schedule"]?.array)
        c.tokenConfigured = resp.tokenConfigured ?? false
        readEndpoints(root: root, into: &c)
        return c
    }

    // 界面固定 5 槽，配置里不足就补空行，这样第 3 行永远是第 3 行
    private static func parseSchedule(_ raw: [JSONAny]?) -> [ScheduleEntry] {
        var list = (raw ?? []).prefix(ScheduleEntry.slotCount).map { item -> ScheduleEntry in
            let o = item.object ?? [:]
            var e = ScheduleEntry()
            e.enabled = o["enabled"]?.bool ?? false
            e.time = o["time"]?.string ?? ""
            e.text = o["text"]?.string ?? ""
            e.channels = (o["channels"]?.array ?? []).compactMap { $0.string }.joined(separator: ", ")
            return e
        }
        while list.count < ScheduleEntry.slotCount { list.append(ScheduleEntry()) }
        return list
    }

    // 探活地址直接读原文件，不必经过写回脚本的白名单
    private static func readEndpoints(root: URL, into c: inout ConsoleConfig) {
        guard let data = try? Data(contentsOf: root.appendingPathComponent("config.json")),
              let j = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        if let llm = j["llm"] as? [String: Any], let base = llm["baseUrl"] as? String,
           let u = URL(string: base), let host = u.host {
            c.bridgeOrigin = "\(u.scheme ?? "http")://\(host):\(u.port ?? 80)"
        }
        if let voice = j["voice"] as? [String: Any], let ep = voice["endpoint"] as? String {
            c.voiceEndpoint = ep
        }
    }

    // 走 stdin 传 JSON，彻底绕开 shell 引用与中文、等号的坑
    static func apply(_ updates: [String: Any], root: URL) async throws {
        guard let node = NodeLocator.find() else { throw ConfigError.noNode }
        let script = root.appendingPathComponent("scripts/config-set.mjs").path
        let payload = try JSONSerialization.data(withJSONObject: updates)
        let r = try await Shell.run(node, [script, "--json"], cwd: root.path,
                                    stdin: String(data: payload, encoding: .utf8), timeout: 15)
        guard let line = lastJSONLine(r.out), let data = line.data(using: .utf8),
              let resp = try? JSONDecoder().decode(SetResponse.self, from: data)
        else { throw ConfigError.badOutput(r.err.isEmpty ? r.out : r.err) }
        if !resp.ok {
            throw ConfigError.rejected((resp.errors ?? []).map { $0.message })
        }
    }

    private static func lastJSONLine(_ s: String) -> String? {
        s.split(separator: "\n").last(where: { $0.hasPrefix("{") }).map(String.init)
    }
}

// 配置值类型不固定，用一个最小的 any 包装承接
struct JSONAny: Decodable {
    let string: String?
    let bool: Bool?
    let int: Int?
    let array: [JSONAny]?
    let object: [String: JSONAny]?

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        bool = try? c.decode(Bool.self)
        int = try? c.decode(Int.self)
        string = try? c.decode(String.self)
        array = try? c.decode([JSONAny].self)
        object = try? c.decode([String: JSONAny].self)
    }
}
