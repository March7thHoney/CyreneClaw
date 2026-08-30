import AppKit
import SwiftUI

// 单窗口工具：关窗即退出，避免 macOS 把「上次没有窗口」记进恢复状态后再也开不出来
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

    func applicationDidFinishLaunching(_ note: Notification) {
        NSApp.setActivationPolicy(.regular)
    }
}

@main
struct CyreneClawConsoleApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate

    var body: some Scene {
        WindowGroup {
            RootView()
                .frame(minWidth: 720, minHeight: 560)
        }
        .defaultSize(width: 840, height: 760)
        // 隐藏标题栏，内容顶到窗口顶部，浮岛导航才成立
        .windowStyle(.hiddenTitleBar)
        .windowResizability(.contentMinSize)
        .commands { CommandGroup(replacing: .newItem) {} }
    }
}
