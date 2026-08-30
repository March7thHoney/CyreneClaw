import AppKit
import SwiftUI

// 单窗口工具：点叉只隐藏窗口，App 常驻 Dock，退出走 ⌘Q
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { false }

    func applicationDidFinishLaunching(_ note: Notification) {
        NSApp.setActivationPolicy(.regular)
    }

    // 点 Dock 图标兜底把窗口叫回来
    func applicationShouldHandleReopen(_ app: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            NSApp.unhide(nil)
            NSApp.windows.first?.makeKeyAndOrderFront(nil)
        }
        return true
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
