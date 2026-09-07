import Foundation

// 本机探活必须绕开 HTTP_PROXY/ALL_PROXY，否则会被代理拦下误判成挂了
enum HealthProbe {
    private static let session: URLSession = {
        let cfg = URLSessionConfiguration.ephemeral
        cfg.connectionProxyDictionary = [:]
        cfg.requestCachePolicy = .reloadIgnoringLocalCacheData
        cfg.timeoutIntervalForRequest = 5
        return URLSession(configuration: cfg)
    }()

    // 只要拿到任何 HTTP 响应就算活着：GPT-SoVITS 的 /change_refer 无参会返回 400
    static func reachable(_ urlString: String) async -> Bool {
        guard let url = URL(string: urlString) else { return false }
        do { _ = try await session.data(from: url); return true }
        catch {
            let ns = error as NSError
            return ns.domain == NSURLErrorDomain && ns.code == NSURLErrorBadServerResponse
        }
    }

    // headers 给需要鉴权的远端接口带 Authorization
    static func json(_ urlString: String, headers: [String: String] = [:]) async -> [String: Any]? {
        guard let url = URL(string: urlString) else { return nil }
        var req = URLRequest(url: url)
        for (k, v) in headers { req.setValue(v, forHTTPHeaderField: k) }
        guard let (data, _) = try? await session.data(for: req) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }
}
