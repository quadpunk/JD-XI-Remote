# Third-party licenses and notices

This Android app depends on libraries and tools maintained by third parties. The declarations below reflect the versions in `app/build.gradle.kts` and the root Gradle files in this source package.

| Library or tooling | Version in this project | License |
| --- | --- | --- |
| AndroidX Core KTX | 1.13.1 | Apache License 2.0 |
| AndroidX Activity Compose | 1.9.2 | Apache License 2.0 |
| AndroidX Compose UI / Foundation / Material3 | Controlled by Compose BOM 2024.09.03 | Apache License 2.0 |
| AndroidX Compose BOM | 2024.09.03 | Apache License 2.0 |
| AndroidX WebKit | 1.11.0 | Apache License 2.0 |
| Kotlin Android / Compose compiler tooling | Version controlled by the root Gradle build | Apache License 2.0 |
| Gradle / Android Gradle build tooling | Version controlled by Gradle wrapper and root build | Apache License 2.0 (tooling components may have additional notices) |

Apache License 2.0 full text: [`LICENSES/Apache-2.0.txt`](LICENSES/Apache-2.0.txt).

**Scope and limitations:** These are known *direct* dependencies and primary build tools, not an exhaustive generated software bill of materials. Additional transitive dependencies may apply and should be checked against the actual resolved Gradle dependency graph before release. Android OS and system WebView are system components and not shipped as source libraries by this project. The license of original app code and app-owned assets is *not* established by the licenses listed above.

For release compliance, inspect the resolved dependency tree (`./gradlew :app:dependencies` on a configured build machine), review any additional notices from resolved artifacts, and add attribution or NOTICE files where required.
