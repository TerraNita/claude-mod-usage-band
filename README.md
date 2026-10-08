# usage-band

Claude Code のチャット入力欄の上に、使用中のモデル・使用量・よく使うスキルを 2 行で常時表示する mod（プラグイン）です。

```
Opus 5.5 (1M)   Context ████░░░░░░ 40% 84k/200k   5h ███░░░░░░░ 25% (15:00)   7d █████████░ 85% (10/10 09:00)   $1.23   [Hide]
Skills  1.gen-doc×3   2.plugin-authoring×2   3.simplify×1
```

| 項目 | 内容 |
| --- | --- |
| モデル | `/model` で表示されるモデル（`claude-opus-5-5[1m]` は `Opus 5.5 (1M)` と表示） |
| Context | コンテキストウィンドウの使用率と、使用トークン数／上限 |
| 5h / 7d | サブスクリプションのレート制限の使用率とリセット時刻（API キー利用時は表示なし） |
| $ | このセッションのコスト |
| Skills | 直近 100 回分のスキル使用履歴から集計した上位 5 件（セッションをまたいで保持） |

- バーの色: 通常は緑、80% 以上で黄、95% 以上で赤
- 値はターン終了ごとに自動更新

## 対応環境

| 環境 | 表示 |
| --- | --- |
| ターミナル版 Claude Code | ○ |
| Desktop アプリの Code タブ | ○ |
| VS Code 拡張 / JetBrains 等の IDE 拡張 | ×（入力欄上部の表示に IDE 拡張が対応していないため、コマンドのみ登録される） |

## インストール手順

前提: Claude Code（CLI）がインストール済みであること。

### 方法 A: GitHub リポジトリから（推奨）

リポジトリ: https://github.com/TerraNita/claude-mod-usage-band

ターミナルで Claude Code を起動し、プロンプトに次を入力します。

```
/plugin install usage-band --marketplace TerraNita/claude-mod-usage-band
```

1. `Add marketplace?` と聞かれたら `y`
2. スコープは一番上の **user** を選んで Enter
3. `Installed usage-band. Plugin is now active.` と表示されれば完了

### 方法 B: フォルダを配布する場合

1. このフォルダ（`usage-band`）を各自の PC の任意の場所にコピーします（例: `C:\Users\<ユーザー名>\.claude\mods\usage-band`）。
2. ターミナルで次を実行します（パスはコピー先に合わせて変更）。

   ```
   claude plugin marketplace add C:\Users\<ユーザー名>\.claude\mods\usage-band
   claude plugin install usage-band@usage-band-mods --scope user
   ```

3. `claude plugin list` を実行し、`usage-band@usage-band-mods` が `Status: ✔ enabled` になっていることを確認します。

どちらの方法でも、インストール後に**新しく起動したセッション**から表示されます（起動中のセッションは `/reload-plugins` で反映）。

## 使い方

| 操作 | 方法 |
| --- | --- |
| 表示 / 非表示の切り替え | `/usage-band` |
| 一時的に隠す | 表示右端の `[Hide]` を押す（`/usage-band` で再表示） |

## 更新・アンインストール

- **更新（方法 B）**: フォルダ内のファイルを差し替えてから、起動中のセッションで `/reload-plugins`
- **更新（方法 A）**: `claude plugin update usage-band@usage-band-mods` の後、`/reload-plugins`
- **アンインストール**:

  ```
  claude plugin uninstall usage-band@usage-band-mods
  claude plugin marketplace remove usage-band-mods
  ```

## 開発者向け

| ファイル | 役割 |
| --- | --- |
| `.claude-plugin/marketplace.json` | マーケットプレイス定義（GitHub リポジトリからのインストール用。`usage-band/` を参照） |
| `usage-band/hooks/register.tsx` | 本体（表示・使用量取得・スキル履歴の記録） |
| `usage-band/hooks/register.test.ts` | テスト |
| `usage-band/types/index.d.ts` | 状態（`$.state`）の型定義 |
| `usage-band/.claude-plugin/plugin.json` | プラグイン定義 |
| `usage-band/.claude-plugin/marketplace.json` | マーケットプレイス定義（方法 B でフォルダ自体をインストール元にするためのもの） |

変更後の確認（リポジトリ直下で実行）:

```
claude plugin validate .
claude plugin validate usage-band
claude plugin test usage-band
```
