import Foundation

// 台词与场景描写两种片段，颜色由渲染层决定
struct ChatSegment: Decodable, Hashable {
    enum Kind: String, Decodable {
        case dialogue
        case narration
    }

    let kind: Kind
    let text: String
}

// 回复后附带的那张表情或贴纸，image 是相对 dataDir 的缓存路径
struct ChatExpression: Decodable, Hashable {
    let kind: String
    let id: String
    let name: String
    let image: String

    var isSticker: Bool { kind == "sticker" }
}

struct ChatMessage: Decodable, Identifiable, Hashable {
    let id: String
    let role: String
    let name: String
    let ts: Double
    let text: String
    var segments: [ChatSegment]?
    var hasVoice: Bool?
    var expression: ChatExpression?

    var isUser: Bool { role == "user" }

    var time: String {
        let d = Date(timeIntervalSince1970: ts / 1000)
        let f = DateFormatter()
        f.dateFormat = Calendar.current.isDateInToday(d) ? "HH:mm" : "M月d日 HH:mm"
        return f.string(from: d)
    }
}

struct LocalChatHealth: Decodable {
    let ok: Bool
    let char: String
    let voiceEnabled: Bool
}

enum LocalChatError: LocalizedError {
    case noService
    case server(String)

    var errorDescription: String? {
        switch self {
        case .noService: return "本机聊天服务没有响应，请先在控制台里启动机器人"
        case .server(let m): return m
        }
    }
}

// 本机回环的收发。一轮生成可能要几十秒，语音冷启动要一两分钟，超时给得很松
enum LocalChatClient {
    private static let session: URLSession = {
        let cfg = URLSessionConfiguration.ephemeral
        // 本机回环必须直连，走代理会被拦下
        cfg.connectionProxyDictionary = [:]
        cfg.requestCachePolicy = .reloadIgnoringLocalCacheData
        cfg.timeoutIntervalForRequest = 600
        cfg.timeoutIntervalForResource = 600
        return URLSession(configuration: cfg)
    }()

    // 探活用短超时，不能让掉线的服务把界面卡住
    private static let probe: URLSession = {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.connectionProxyDictionary = [:]
        cfg.requestCachePolicy = .reloadIgnoringLocalCacheData
        cfg.timeoutIntervalForRequest = 3
        return URLSession(configuration: cfg)
    }()

    private struct ServerError: Decodable { let error: String }
    private struct HistoryResponse: Decodable { let messages: [ChatMessage] }
    private struct ChatResponse: Decodable { let message: ChatMessage; let voicePending: Bool? }
    private struct DeltaFrame: Decodable { let text: String; let segments: [ChatSegment] }
    private struct VoiceFrame: Decodable { let id: String; let error: String? }
    private struct ClearResponse: Decodable { let archived: Bool }

    private static func request(_ origin: String, _ path: String, body: [String: Any]?) -> URLRequest? {
        guard let url = URL(string: origin + path) else { return nil }
        var req = URLRequest(url: url)
        if let body {
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }
        return req
    }

    private static func send<T: Decodable>(_ req: URLRequest, _ type: T.Type,
                                           using s: URLSession) async throws -> T {
        let (data, resp): (Data, URLResponse)
        do { (data, resp) = try await s.data(for: req) } catch { throw LocalChatError.noService }
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard code == 200 else {
            let msg = (try? JSONDecoder().decode(ServerError.self, from: data))?.error
            throw LocalChatError.server(msg ?? "服务返回 \(code)")
        }
        guard let out = try? JSONDecoder().decode(type, from: data) else {
            throw LocalChatError.server("服务返回的内容看不懂")
        }
        return out
    }

    static func health(_ origin: String) async -> LocalChatHealth? {
        guard let req = request(origin, "/local/health", body: nil) else { return nil }
        return try? await send(req, LocalChatHealth.self, using: probe)
    }

    static func history(_ origin: String) async throws -> [ChatMessage] {
        guard let req = request(origin, "/local/history", body: nil) else { throw LocalChatError.noService }
        return try await send(req, HistoryResponse.self, using: session).messages
    }

    // 流式：文字逐帧到 onDelta，落库时 onReply，语音合成完再 onVoice
    static func chat(_ origin: String, text: String,
                     onDelta: @escaping (String, [ChatSegment]) -> Void,
                     onReply: @escaping (ChatMessage, Bool) -> Void,
                     onVoice: @escaping (String, String?) -> Void) async throws {
        guard let req = request(origin, "/local/chat", body: ["text": text]) else { throw LocalChatError.noService }

        let bytes: URLSession.AsyncBytes
        let resp: URLResponse
        do { (bytes, resp) = try await session.bytes(for: req) } catch { throw LocalChatError.noService }
        guard (resp as? HTTPURLResponse)?.statusCode == 200 else {
            throw LocalChatError.server("服务返回 \((resp as? HTTPURLResponse)?.statusCode ?? 0)")
        }

        let dec = JSONDecoder()
        var event = ""
        for try await line in bytes.lines {
            if line.hasPrefix("event: ") { event = String(line.dropFirst(7)); continue }
            guard line.hasPrefix("data: "), let d = line.dropFirst(6).data(using: .utf8) else { continue }
            switch event {
            case "delta":
                if let f = try? dec.decode(DeltaFrame.self, from: d) { onDelta(f.text, f.segments) }
            case "done":
                guard let f = try? dec.decode(ChatResponse.self, from: d) else {
                    throw LocalChatError.server("服务返回的内容看不懂")
                }
                onReply(f.message, f.voicePending ?? false)
                // 语音还在合成，连接留着等那一帧
                if f.voicePending != true { return }
            case "voice":
                if let f = try? dec.decode(VoiceFrame.self, from: d) { onVoice(f.id, f.error) }
                return
            case "error":
                throw LocalChatError.server((try? dec.decode(ServerError.self, from: d))?.error ?? "生成失败")
            default:
                continue
            }
        }
    }

    // 取那一条已经合成好的语音
    static func voice(_ origin: String, id: String) async throws -> Data {
        guard let url = URL(string: origin + "/local/voice?id=" + id) else { throw LocalChatError.noService }
        let (data, resp): (Data, URLResponse)
        do { (data, resp) = try await session.data(from: url) } catch { throw LocalChatError.noService }
        guard (resp as? HTTPURLResponse)?.statusCode == 200 else {
            throw LocalChatError.server((try? JSONDecoder().decode(ServerError.self, from: data))?.error ?? "取语音失败")
        }
        return data
    }

    @discardableResult
    static func clear(_ origin: String) async throws -> Bool {
        guard let req = request(origin, "/local/clear", body: [:]) else { throw LocalChatError.noService }
        return try await send(req, ClearResponse.self, using: session).archived
    }

}
