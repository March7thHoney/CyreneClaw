import SwiftUI

struct UserRuleRow: View {
    @Binding var user: UserRule
    let remove: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("用户 ID").foregroundStyle(Theme.inkDesc)
                    TextField("17–20 位数字", text: $user.userId)
                        .textFieldStyle(.plain).modifier(InputBox())
                        .accessibilityLabel("Discord 用户 ID")
                }
                VStack(alignment: .leading, spacing: 5) {
                    Text("称呼").foregroundStyle(Theme.inkDesc)
                    TextField("留空使用 Discord 昵称", text: $user.displayName)
                        .textFieldStyle(.plain).modifier(InputBox())
                        .accessibilityLabel("用户称呼")
                }
                Button(action: remove) { Image(systemName: "trash") }
                    .buttonStyle(GhostButtonStyle(compact: true))
                    .accessibilityLabel("删除用户规则")
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 20) { conversationToggles; cadenceControls; commandToggle }
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 20) { conversationToggles; commandToggle }
                    cadenceControls
                }
            }
        }
        .font(.system(size: 12))
        .foregroundStyle(Theme.ink)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.45), in: RoundedRectangle(cornerRadius: 10))
    }

    private var conversationToggles: some View {
        Group {
            Toggle("私聊", isOn: $user.dmEnabled)
            Toggle("群聊 @ / 回复", isOn: $user.mentionEnabled)
        }
        .toggleStyle(.checkbox)
        .fixedSize()
    }

    private var cadenceControls: some View {
        HStack(spacing: 8) {
            Toggle("每 N 条", isOn: $user.cadenceEnabled).toggleStyle(.checkbox).fixedSize()
            Stepper(value: $user.replyEveryN, in: 1...1000) {
                Text("\(user.replyEveryN)").frame(minWidth: 32).monospacedDigit()
            }
                .disabled(!user.cadenceEnabled)
                .accessibilityLabel("自动回复消息条数，1 到 1000")
        }
        .fixedSize()
    }

    private var commandToggle: some View {
        Toggle("Discord 指令", isOn: $user.commandsEnabled).toggleStyle(.checkbox).fixedSize()
    }
}
