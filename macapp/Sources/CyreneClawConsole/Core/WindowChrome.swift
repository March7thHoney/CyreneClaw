import AppKit
import SwiftUI

// 只截关窗，其余消息原样转发给 SwiftUI 自己的 delegate
final class CloseInterceptor: NSObject, NSWindowDelegate {
    weak var forward: NSWindowDelegate?

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        NSApp.hide(nil)
        return false
    }

    override func responds(to sel: Selector!) -> Bool {
        super.responds(to: sel) || (forward?.responds(to: sel) ?? false)
    }

    override func forwardingTarget(for sel: Selector!) -> Any? {
        (forward?.responds(to: sel) ?? false) ? forward : nil
    }
}

// 窗口就绪后把 interceptor 幂等挂上去，强引用它免得当场被释放
private struct HideOnClose: NSViewRepresentable {
    final class Coordinator {
        var interceptor: CloseInterceptor?
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> NSView {
        let view = NSView(frame: .zero)
        DispatchQueue.main.async { install(on: view.window, context: context) }
        return view
    }

    func updateNSView(_ view: NSView, context: Context) {
        DispatchQueue.main.async { install(on: view.window, context: context) }
    }

    private func install(on window: NSWindow?, context: Context) {
        guard let window, !(window.delegate is CloseInterceptor) else { return }
        let interceptor = CloseInterceptor()
        interceptor.forward = window.delegate
        context.coordinator.interceptor = interceptor
        window.delegate = interceptor
    }
}

extension View {
    func hideOnClose() -> some View { background(HideOnClose()) }
}
