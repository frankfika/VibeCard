import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var store: VibeStore
    @State private var input = ""
    @State private var proposal: DesktopMemory?
    @State private var busy = false
    private let service: VibeService = LocalVibeService()

    var body: some View {
        NavigationSplitView {
            List {
                Section("VibeCard") {
                    Label(store.cardName, systemImage: "person.crop.circle")
                    Label("我的 Vibe", systemImage: "sparkles")
                    Label("连接请求", systemImage: "person.2")
                }
                Section("已确认记忆") {
                    if store.memories.filter(\.confirmed).isEmpty { Text("还没有确认的记忆").foregroundStyle(.secondary) }
                    ForEach(store.memories.filter(\.confirmed)) { memory in Text(memory.content).lineLimit(2) }
                }
            }
            .listStyle(.sidebar)
        } detail: {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    VStack(alignment: .leading) { Text("我的 Vibe").font(.title2.bold()); Text("本地模式 · 数据保存在这台 Mac").font(.caption).foregroundStyle(.secondary) }
                    Spacer()
                    Button("保存 Now") { store.nowText = input; store.persist() }.keyboardShortcut("s", modifiers: [.command])
                }
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 10) {
                        ForEach(store.messages) { message in
                            Text(message.text).padding(10).background(message.role == "owner" ? Color.accentColor.opacity(0.15) : Color.secondary.opacity(0.12)).clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        if let proposal {
                            VStack(alignment: .leading, spacing: 8) { Text("Vibe 提议记住").font(.caption.bold()); Text(proposal.content); HStack { Button("记住") { store.confirm(proposal); self.proposal = nil }; Button("忽略") { self.proposal = nil } } }.padding().background(.yellow.opacity(0.15)).clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                    }
                }
                HStack { TextField("和你的 Vibe 说点什么…", text: $input).textFieldStyle(.roundedBorder).onSubmit(send); Button("发送", action: send).keyboardShortcut(.return) }
            }.padding(24)
        }
        .frame(minWidth: 720, minHeight: 480)
    }

    private func send() {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines); guard !text.isEmpty, !busy else { return }
        busy = true; input = ""; store.messages.append(DesktopMessage(id: UUID(), role: "owner", text: text))
        Task {
            let result = try? await service.reply(to: text, memories: store.memories)
            await MainActor.run { if let result { store.messages.append(DesktopMessage(id: UUID(), role: "vibe", text: result.reply)); proposal = result.proposal }; store.persist(); busy = false }
        }
    }
}
