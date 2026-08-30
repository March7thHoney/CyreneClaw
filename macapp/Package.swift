// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CyreneClawConsole",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "CyreneClawConsole",
            path: "Sources/CyreneClawConsole",
            swiftSettings: [.swiftLanguageMode(.v5)]
        )
    ]
)
