import Foundation

// 机器人在线时落盘的服务器/频道/表情/贴纸清单，控制台只读它，不写它
struct DirChannel: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
}

struct DirEmoji: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let animated: Bool
    let token: String
    let image: String
}

struct DirSticker: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let format: Int
    let image: String
}

struct DirGuild: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let channels: [DirChannel]
    let emojis: [DirEmoji]
    let stickers: [DirSticker]
}

struct DiscordDirectory: Decodable {
    var updatedAt = ""
    var guilds: [DirGuild] = []

    static let empty = DiscordDirectory()

    var isEmpty: Bool { guilds.isEmpty }

    func guild(id: String) -> DirGuild? { guilds.first { $0.id == id } }

    // 配置里只存频道，服务器是反查出来的
    func guildOf(channelId: String) -> DirGuild? {
        guard !channelId.isEmpty else { return nil }
        return guilds.first { $0.channels.contains { $0.id == channelId } }
    }

    func channel(id: String) -> DirChannel? {
        guard !id.isEmpty else { return nil }
        for g in guilds { if let c = g.channels.first(where: { $0.id == id }) { return c } }
        return nil
    }
}

enum DirectoryStore {
    static func fileURL(dataDir: URL) -> URL {
        dataDir.appendingPathComponent("discord-directory.json")
    }

    // 3 秒一轮的刷新只比对时间戳，没变就不重新解码
    static func modified(dataDir: URL) -> Date? {
        let attrs = try? FileManager.default.attributesOfItem(atPath: fileURL(dataDir: dataDir).path)
        return attrs?[.modificationDate] as? Date
    }

    static func load(dataDir: URL) -> DiscordDirectory? {
        guard let data = try? Data(contentsOf: fileURL(dataDir: dataDir)) else { return nil }
        return try? JSONDecoder().decode(DiscordDirectory.self, from: data)
    }
}
