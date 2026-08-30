import SwiftUI

enum ServiceState: Equatable {
    case unknown
    case notInstalled
    case stopped
    case starting
    case running
    case stopping
    case disabled

    var title: String {
        switch self {
        case .unknown: return "状态未知"
        case .notInstalled: return "未安装"
        case .stopped: return "已停止"
        case .starting: return "启动中"
        case .running: return "运行中"
        case .stopping: return "停止中"
        case .disabled: return "已关闭"
        }
    }

    var tint: Color {
        switch self {
        case .running: return Theme.ok
        case .starting, .stopping: return Theme.warn
        case .notInstalled: return Theme.warn
        case .stopped, .disabled: return Theme.idle
        case .unknown: return Theme.bad
        }
    }

    var isTransient: Bool { self == .starting || self == .stopping }
}
