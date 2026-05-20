#!/usr/bin/env node
// 単一ナレッジエントリをNotionからUPDATEするSQL生成
// Usage: node scripts/update-one-knowledge.js

const fs = require('fs');
const path = require('path');

const MAX_BODY = 20000;
const TRUNCATION_NOTICE = '\n\n...(文字数制限のため省略)';
const OUT_FILE = path.join(__dirname, 'update-one-knowledge.sql');

function convertNotionMarkdown(raw) {
  if (!raw) return '';
  let text = raw;
  text = text.replace(/<ancestor-path>[\s\S]*?<\/ancestor-path>/g, '');
  text = text.replace(/<properties>[\s\S]*?<\/properties>/g, '');
  text = text.replace(/<empty-block\/>/g, '');
  text = text.replace(/<colgroup>[\s\S]*?<\/colgroup>/g, '');
  text = text.replace(/<br\s*\/?>/g, '\n');
  text = text.replace(/<page url="[^"]*">([^<]*)<\/page>/g, '[$1]');
  text = text.replace(/<mention-page url="[^"]*"\/>/g, '');
  text = text.replace(/!\[\]\(https:\/\/prod-files-secure\.s3[^)]+\)/g, '');
  text = convertTables(text);
  text = text.replace(/\\<column-list\\>/g, '\n---\n');
  text = text.replace(/\\<\/column-list\\>/g, '');
  text = text.replace(/<column>/g, '').replace(/<\/column>/g, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function convertTables(text) {
  return text.replace(/<table([^>]*)>([\s\S]*?)<\/table>/g, (match, attrs, inner) => {
    const hasHeader = /header-row="true"/.test(attrs);
    const rows = [];
    const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(inner)) !== null) {
      const cells = [];
      const cellRegex = /<td>([\s\S]*?)<\/td>/g;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        const cell = cellMatch[1]
          .replace(/<br\s*\/?>/g, ' ')
          .replace(/<[^>]+>/g, '')
          .replace(/\|/g, '\\|')
          .replace(/\n/g, ' ')
          .trim();
        cells.push(cell || ' ');
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length === 0) return '';
    const maxCols = Math.max(...rows.map(r => r.length));
    const padded = rows.map(r => {
      const p = [...r];
      while (p.length < maxCols) p.push(' ');
      return p;
    });
    let md = '\n';
    padded.forEach((row, i) => {
      md += '| ' + row.join(' | ') + ' |\n';
      if (i === 0 && hasHeader) {
        md += '| ' + row.map(() => '---').join(' | ') + ' |\n';
      }
    });
    return md;
  });
}

function truncateBody(body) {
  if (body.length <= MAX_BODY) return body;
  return body.slice(0, MAX_BODY) + TRUNCATION_NOTICE;
}

function sqlStr(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

// ===== ここに対象ページのデータを設定 =====
const id = 'notion_346b1157-d529-80c6-b971-c5562c1da195';
const title = 'ツクツク層 プロファイリング（統合版）';
const tags = JSON.stringify(['ツクツク', 'ターゲット', 'プロファイリング', '設計書']);
// manual エントリの body は HTML で格納する（Markdown不可）
const body_html = `<p>最終更新：2026年4月18日（プロファイル①2026/3/28 ＋ プロファイル②2026/4/2を統合）<br>作成：壁打ちセッション（masami × Claude）</p><hr><h1>パート0：ツクツクプラットフォーム基本情報</h1><h2>プラットフォーム概要</h2><ul><li>サイト：https://home.tsuku2.jp/</li><li>「おすそわけマーケットプレイス」として食品・体験・美容・産地直送が中心</li><li>温かみ・手作り感・地域密着の雰囲気が強い</li><li>ポイントのおすそわけ機能あり・コミュニティ性が高い</li></ul><h2>運営会社</h2><ul><li>会社名：クムクム株式会社</li><li>本社：〒105-0011 東京都港区芝公園2丁目11-1 住友不動産芝公園タワー1F</li><li>コーポレートサイト：https://kumu2.co.jp/</li><li>設立：2007年（2024年で設立17周年）</li><li>理念：「五方よし」（売り手よし・買い手よし・世間よし・繋ぎ手よし・未来よし）</li><li>コンセプト：人を軸とした「真のシェアリングエコノミー」の実現</li><li>独立・起業支援も事業内容に含まれている</li></ul><h2>クムクム社長（阿比留さん）との関係性</h2><ul><li>阿比留社長自身も「まず自社事業をちゃんとやりましょう」と同じメッセージを発信している</li><li>しかし末端のメンバーまで届いていないのが現実</li><li><strong>院長のサービスは阿比留社長が伝えたいことを具体的に実現できる存在</strong></li><li>ツクツクコミュニティとの相互補完関係が成り立つ可能性がある</li></ul><hr><h1>パート1：基本属性と表面的行動</h1><h2>基本属性</h2><ul><li>お母さん層・個人経営の職人（大工・農家・整体師など）</li><li>月商30万円未満が中心</li><li>手作りアクセサリー・砂糖不使用スイーツ・農産物加工品など小規模商品販売</li><li>小規模一人事業主・マイクロビジネスオーナー</li></ul><h2>やること（表面的な行動）</h2><ul><li>HPに想いを長文で語る・SNSに感情投稿する</li><li>高い勉強会・セミナーに参加する</li><li>MLM（マルチ商法）に参加する</li><li>月1回東京の集まりに飛行機代かけて参加</li><li>仲間同士で傷のなめあいコミュニティを作る</li></ul><h2>やらないこと（本当の問題）</h2><ul><li>帳簿をつけない</li><li>会計ソフトを使わない</li><li>数字を見ない・向き合わない</li><li>損益分岐点の理解</li><li>数字で現状を見ること</li><li>AIを活用した業務効率化</li></ul><h2>本質的な特徴</h2><ul><li><strong>本当の問題を問題だと思っていない</strong></li><li>「数字より想い・集客が先」と思っている</li><li>一番化ける可能性がある層</li></ul><h2>ツクツク層のリアルな実態</h2><ul><li>月1回東京でシンポジウムを開催しているが、経営の実務に役立たない</li><li>「人を増やしてマージンをもらいましょう！」がメインメッセージになっている</li><li>紹介者・繋ぎ手にマージンが入ることを強調しているが、<strong>自社事業の経営が全然できていない人が多い</strong></li><li>典型的なパターン：「ツクツクで人を増やすことに集中して、本業の経営ができていない」</li><li><strong>これがまさに院長が支援すべき層</strong>：経営がうまくいってからツクツクを活用する、という順番が大事</li></ul><hr><h1>パート2：心理・行動パターン深掘り</h1><h2>2-1. 意思決定の癖</h2><table><tr><th>パターン</th><th>具体的な行動</th><th>心理の裏側</th></tr><tr><td><strong>感情先行型</strong></td><td>「いいな」と思ったら即申込。勉強会・教材・コミュニティ参加</td><td>不安の解消を「行動した感」で代替。ROIの概念がない</td></tr><tr><td><strong>横並び型</strong></td><td>周りがやっているから自分も。仲間がいると安心</td><td>「正解が分からない→みんなと同じなら間違いない」という生存戦略</td></tr><tr><td><strong>先送り型</strong></td><td>「売れるようになったら帳簿をつける」「余裕ができたら考える」</td><td>痛みのある課題（数字・現実直視）を無意識に回避。快楽原則に従っている</td></tr><tr><td><strong>一発逆転型</strong></td><td>新商品・新サービス・新チャネルに飛びつく</td><td>地道な改善より「何か一つで劇的に変わるはず」という幻想</td></tr></table><h2>2-2. お金に対する態度</h2><ul><li><strong>「売上＝成功」という誤解</strong>：利益率・手残りの概念がない。月商30万でも経費を引いたら赤字、という状態に気づいていない</li><li><strong>「お金の話＝汚い・怖い」という刷り込み</strong>：特にお母さん層に顕著。お金を語ること自体に罪悪感がある</li><li><strong>「安くしないと売れない」という思い込み</strong>：自分の価値を低く見積もる。値下げが唯一の集客手段だと思っている</li><li><strong>どんぶり勘定の常態化</strong>：事業と家計が混在。「なんとなく回っている」が判断基準</li></ul><h2>2-3. 学びに対する態度</h2><ul><li><strong>「学ぶ＝行動した」と錯覚</strong>：勉強会に参加した時点で達成感を得てしまい、実行に移らない</li><li><strong>インプット過多・アウトプット不足</strong>：情報収集は好きだが、自分のビジネスに落とし込む力がない</li><li><strong>「誰から学ぶか」に過度に依存</strong>：内容より「この人が言うなら正しい」で判断。権威性に弱い</li><li><strong>学びの順番が逆</strong>：集客テクニック→SNS運用→広告…と戦術から入り、戦略（誰に何を届けるか）が後回し</li></ul><h2>2-4. 人間関係における態度</h2><ul><li><strong>共感コミュニティへの依存</strong>：「大変だよね」「分かるよ」が心地よく、現実を指摘してくれる人を避ける</li><li><strong>「仲間＝安心」だが「仲間＝成長」ではない</strong>：傷のなめあいが目的化。建設的なフィードバックがない環境に安住</li><li><strong>孤立への恐怖</strong>：一人で経営している不安から、繋がりを求めてコミュニティ・MLMに参加。本業の強化より「人脈拡大」を優先</li><li><strong>専門家への距離感</strong>：「会計士・税理士＝大企業の人」「自分には敷居が高い」という先入観。相談すること自体がハードル</li></ul><h2>2-5. 「動けない」の構造分解</h2><p><strong>【表面】</strong> 「忙しくて時間がない」「お金がない」「やり方が分からない」<br>↓<br><strong>【中間】</strong> 痛みのある現実（数字・赤字・方向性のなさ）を直視することへの恐怖<br>↓<br><strong>【深層】</strong> 「自分のビジネスには価値がないのでは」という自己否定の回避<br>↓<br><strong>【防衛行動】</strong> 勉強会参加・SNS発信・仲間作り＝「頑張っている自分」の維持</p><hr><h1>パート3：セグメント分け（温度差による4層分類）</h1><h2>層の全体像</h2><table><tr><th>層</th><th>名称</th><th>割合（推定）</th><th>特徴</th><th>院長との相性</th></tr><tr><td>A</td><td><strong>火種あり層</strong></td><td>約10-15%</td><td>何かのきっかけで変われる準備がある</td><td>★★★★★（最優先ターゲット）</td></tr><tr><td>B</td><td><strong>くすぶり層</strong></td><td>約25-30%</td><td>問題意識はうっすらあるが、行動に移せない</td><td>★★★★☆（講習会で着火の可能性）</td></tr><tr><td>C</td><td><strong>ぬるま湯層</strong></td><td>約35-40%</td><td>現状に不満はあるが、変わる気はない</td><td>★★☆☆☆（ふるいで自然に離脱）</td></tr><tr><td>D</td><td><strong>依存層</strong></td><td>約15-20%</td><td>コミュニティ・MLM・勉強会に依存</td><td>★☆☆☆☆（支援対象外）</td></tr></table><h2>A層：火種あり層（10-15%）</h2><p><strong>特徴</strong></p><ul><li>「このままじゃダメだ」と薄々気づいている</li><li>過去に何かしら失敗経験がある（在庫を抱えた、赤字が続いた等）</li><li>痛みを経験しているから、数字の話に耳を傾ける素地がある</li><li>「変わりたいけど、何をすればいいか分からない」状態</li></ul><p><strong>行動サイン</strong></p><ul><li>講習会で質問をする</li><li>事前ヒアリングシートを丁寧に書いてくる</li><li>「今日の話、メモしていいですか？」と聞く</li><li>個別相談に自分から申し込む</li></ul><p><strong>対応方針</strong></p><ul><li>講習会後に即座に個別相談へ誘導</li><li>顧問契約への最短ルートを提示</li><li>「あなたは変われる」と明確に伝える（この層は肯定が推進力になる）</li></ul><h2>B層：くすぶり層（25-30%）</h2><p><strong>特徴</strong></p><ul><li>「なんかうまくいかない」と感じているが、原因が特定できていない</li><li>勉強会には参加するが、行動に移す率が低い</li><li>「いい話だった」で終わりがち</li><li>他責傾向が中程度（「景気が悪い」「お客さんが来ない」）</li></ul><p><strong>行動サイン</strong></p><ul><li>講習会には来るが、質問はしない</li><li>事前ヒアリングシートの回答が薄い</li><li>「参考になりました」で帰る</li><li>SNSで「今日はこんな勉強会に行きました」と投稿する</li></ul><p><strong>対応方針</strong></p><ul><li>講習会の「4つの質問」（利益率・損益分岐点・顧客像・3年後）で揺さぶる</li><li>第2回の「家計簿に置き換え」で数字への心理的ハードルを下げる</li><li>A層に変化するまで講習会リピートを促す（すぐに顧問には誘導しない）</li><li>口コミでA層を連れてくる「紹介者」としての価値もある</li></ul><h2>C層：ぬるま湯層（35-40%）</h2><p><strong>特徴</strong></p><ul><li>現状維持バイアスが極めて強い</li><li>「今のままでもなんとかなっている」（実際はなんとかなっていない）</li><li>変化のコスト＞現状の痛みと認識している</li><li>趣味の延長で事業をやっている感覚</li></ul><p><strong>行動サイン</strong></p><ul><li>講習会に「友達に誘われたから」で来る</li><li>内容よりも「楽しかったかどうか」で評価する</li><li>数字の話になると目が泳ぐ</li><li>「私にはまだ早い」が口癖</li></ul><p><strong>対応方針</strong></p><ul><li>無理に引き上げない。講習会のふるい機能に任せる</li><li>一度離脱しても、状況が変わったときに戻ってこられる導線だけ残す</li><li>この層に時間をかけることは院長のリソースの無駄遣い</li></ul><h2>D層：依存層（15-20%）</h2><p><strong>特徴</strong></p><ul><li>コミュニティ参加・人脈拡大・MLM活動が「経営している感」の源泉</li><li>本業の数字は壊滅的だが、本人はそれを問題と思っていない</li><li>「仲間を増やせば売上が上がる」という信念が強固</li><li>他者（コミュニティリーダー・MLM上位者）への精神的依存が強い</li></ul><p><strong>行動サイン</strong></p><ul><li>講習会中に自分のビジネスの宣伝を始める</li><li>「〇〇さんの教えでは…」と権威を引用する</li><li>数字の話を「それより大事なことがある」とスルーする</li><li>個別相談で「一緒にやりましょう！」と協業を持ちかける</li></ul><p><strong>対応方針</strong></p><ul><li>支援対象外と明確に線引き</li><li>講習会の事前ヒアリングシートが天然のフィルターになる</li><li>万が一顧問契約に来ても、初回診断で「まず本業を」と突き返す</li><li>この層を排除することがコミュニティの質を守る</li></ul><hr><h1>パート4：講習会→顧問 転換ポイント設計</h1><h2>各回の「刺さるトリガー」と「離脱ポイント」</h2><table><tr><th>回</th><th>刺さるトリガー</th><th>離脱ポイント</th><th>対策</th></tr><tr><td><strong>第1回</strong></td><td>「4つの質問」に答えられない衝撃。自分のバグを初めて自覚する瞬間</td><td>「キツいことを言われた」と感じて離脱（C・D層）</td><td>台本のトーンで緩和済み。「あなたが悪いんじゃない」のフォローが効く</td></tr><tr><td><strong>第2回</strong></td><td>家計に置き換えた瞬間の「あ、知ってるやつだ」体験</td><td>「やっぱり数字は苦手」と再確認して離脱</td><td>家計の例えを徹底。専門用語を一切使わない設計が重要</td></tr><tr><td><strong>第3回</strong></td><td>「戦術から入っていた」という気づき。自分の理念を一文で書くワーク</td><td>「理念なんて大げさ」「自分には関係ない」と感じる層</td><td>ワークの難易度を下げる。「完璧じゃなくていい」の声かけ</td></tr><tr><td><strong>第4回</strong></td><td>3C分析で「自分の強みが言えない」と気づく。ライバルの再定義</td><td>ワークが難しすぎて置いていかれる感覚</td><td>ペアワーク・グループ共有で「一人じゃない」感を演出</td></tr><tr><td><strong>第5回</strong></td><td>第1回の質問に「少し答えられる」成長実感。宣言の高揚感</td><td>「宣言したけど、結局一人じゃ続かない」という不安</td><td>★ここが最大の転換ポイント。「ジムのトレーナー」の比喩が効く</td></tr></table><h2>転換の「黄金ルート」</h2><p><strong>第1回：衝撃（自覚）</strong><br>→ 「もう少し聞いてみたい」<br><strong>第2回：安心（数字は怖くない）</strong><br>→ 「自分にもできるかも」<br><strong>第3回：内省（自分ごと化）</strong><br>→ 「誰に届けたいか、考えたことなかった」<br><strong>第4回：発見（強みの言語化）</strong><br>→ 「自分にも武器があった」<br><strong>第5回：決意（覚悟の宣言）</strong><br>→ 「でも一人じゃ続かない…」<br>→ 【個別相談→顧問契約】</p><h2>クロージングの設計ポイント</h2><p><strong>第5回のスライド13（最終スライド）が最大の転換装置</strong></p><ul><li>「ジムのトレーナー」の比喩で顧問契約の本質を伝える</li><li>「来てもいいし、来なくてもいい」のトーンが逆に効く（押し売りしない＝信頼）</li><li>宣言を書いた直後の高揚感がある状態で案内する</li><li>「今日の宣言を、次の面談で一緒に確認しましょう」が具体的なアクション提示</li></ul><p><strong>転換率を上げる補助施策</strong></p><ul><li>講習会後の「個別相談」枠をその場で予約できるようにする（温度が高いうちに）</li><li>第5回終了後にLINEやメールで「宣言の振り返りシート」を送付（フォロー接点）</li><li>過去の顧問クライアントの変化事例（匿名・数字ベース）を第5回で紹介</li></ul><hr><h1>パート5：ペルソナ（4人の架空人物像）</h1><h2>ペルソナ1：佐藤 美咲（さとう みさき）｜A層</h2><table><tr><th>項目</th><th>内容</th></tr><tr><td><strong>年齢・性別</strong></td><td>38歳・女性</td></tr><tr><td><strong>家族構成</strong></td><td>夫（会社員）、子供2人（小3・年長）</td></tr><tr><td><strong>事業内容</strong></td><td>手作りアクセサリー販売（ツクツク＋Creema）</td></tr><tr><td><strong>月商</strong></td><td>約15万円</td></tr><tr><td><strong>経営歴</strong></td><td>3年</td></tr><tr><td><strong>居住地</strong></td><td>札幌市西区</td></tr></table><p><strong>日常の行動パターン</strong></p><ul><li>朝は子供を送り出してから10時〜14時が作業時間</li><li>インスタで作品を投稿（フォロワー800人）</li><li>ツクツクのイベントには月1回参加</li><li>材料費・送料・梱包費を「なんとなく」で管理</li></ul><p><strong>抱えている問題（本人の自覚）</strong></p><ul><li>「売上は少しずつ増えてるのに、手元にお金が残らない」</li><li>「値段のつけ方が分からない。安くしないと売れない気がする」</li></ul><p><strong>本当の問題（本人は未自覚）</strong></p><ul><li>材料費率が60%超で、売れば売るほど手残りが減る構造</li><li>送料を自己負担しており、利益を圧迫</li><li>「作る時間＝タダ」と考えていて、自分の工賃を原価に入れていない</li></ul><p><strong>講習会での反応予測</strong></p><ul><li>第1回：「利益率」の質問で固まる。終了後「もう少し話したい」と声をかける</li><li>第2回：家計簿の例えで「あ、そういうことか！」となる</li><li>第5回：泣きながら宣言を書く（感情が動きやすいタイプ）</li></ul><p><strong>顧問契約への転換確率：80%</strong><br>トリガー：「一人じゃ値段を上げる勇気が出ない」→伴走の必要性を実感</p><hr><h2>ペルソナ2：田中 健太（たなか けんた）｜B層</h2><table><tr><th>項目</th><th>内容</th></tr><tr><td><strong>年齢・性別</strong></td><td>45歳・男性</td></tr><tr><td><strong>家族構成</strong></td><td>妻（パート）、子供1人（中2）</td></tr><tr><td><strong>事業内容</strong></td><td>整体院（自宅の一室を改装）</td></tr><tr><td><strong>月商</strong></td><td>約25万円</td></tr><tr><td><strong>経営歴</strong></td><td>5年</td></tr><tr><td><strong>居住地</strong></td><td>札幌市豊平区</td></tr></table><p><strong>日常の行動パターン</strong></p><ul><li>予約が入った時だけ施術。空き時間はYouTubeで経営動画を見る</li><li>ホットペッパーに月1万円課金しているが、新規は月2〜3人</li><li>妻に「いつまでこの状態が続くの？」と言われている</li><li>ツクツクには知人の紹介で登録。使いこなせていない</li></ul><p><strong>抱えている問題（本人の自覚）</strong></p><ul><li>「集客が足りない。もっとお客さんが来れば…」</li><li>「リピート率が低い。一回来て終わりの人が多い」</li></ul><p><strong>本当の問題（本人は未自覚）</strong></p><ul><li>1回5,000円の施術で1日3人が上限。月商の天井が構造的に決まっている</li><li>回数券・コース設計がなく、単発商売から抜けられていない</li><li>「整体の腕がよければ客は来る」という思い込みが強い</li><li>損益分岐点を知らないまま、ホットペッパー課金を続けている</li></ul><p><strong>講習会での反応予測</strong></p><ul><li>第1回：「自分は違う」と思って聞いている。が、4つの質問で黙る</li><li>第3回：「戦術から入っていた」で刺さる（ホットペッパー依存の自覚）</li><li>第4回：ライバルの再定義（YouTube・我慢・お金がない）で目が覚める</li><li>第5回：宣言はするが、実行に移すかは五分五分</li></ul><p><strong>顧問契約への転換確率：40%</strong><br>ハードル：「男が人に相談するのは恥ずかしい」というプライド<br>トリガー：妻から「あの先生に相談してみたら？」と背中を押される</p><hr><h2>ペルソナ3：鈴木 由紀子（すずき ゆきこ）｜C層</h2><table><tr><th>項目</th><th>内容</th></tr><tr><td><strong>年齢・性別</strong></td><td>52歳・女性</td></tr><tr><td><strong>家族構成</strong></td><td>夫（自営業・建設）、子供2人（社会人・大学生）</td></tr><tr><td><strong>事業内容</strong></td><td>砂糖不使用スイーツ販売（ツクツク中心）</td></tr><tr><td><strong>月商</strong></td><td>約8万円</td></tr><tr><td><strong>経営歴</strong></td><td>2年</td></tr><tr><td><strong>居住地</strong></td><td>札幌市中央区</td></tr></table><p><strong>日常の行動パターン</strong></p><ul><li>週3回、自宅キッチンで製造。マルシェに月2回出店</li><li>ツクツクのコミュニティイベントに毎回参加（顔が広い）</li><li>インスタに「今日も心を込めて作りました」と毎日投稿</li><li>HPに「私の想い」を3,000文字書いている</li></ul><p><strong>抱えている問題（本人の自覚）</strong></p><ul><li>「もっと多くの人に知ってもらいたい」</li><li>「マルシェの売上が伸びない」</li></ul><p><strong>本当の問題（本人は未自覚）</strong></p><ul><li>月商8万円から材料費・出店料を引くと手残りは2万円以下</li><li>趣味の延長であり、事業として成立していない</li><li>「想い」の発信に注力するが、顧客の課題解決視点がゼロ</li><li>夫の収入で生活が成り立っているので、危機感がない</li></ul><p><strong>講習会での反応予測</strong></p><ul><li>第1回：「いい話だった」で終わる。メモは取るが行動しない</li><li>第2回：家計簿の話を「うちは夫がいるから大丈夫」と自分事化しない</li><li>第3回以降：友達を誘って来るが、本人の変化は小さい</li></ul><p><strong>顧問契約への転換確率：5%</strong><br>この層は無理に引き上げない。口コミの発信源としての間接的価値はある<br>状況が変わるとき（夫の事業が傾く、子供の学費等）にA層にシフトする可能性あり</p><hr><h2>ペルソナ4：山本 拓也（やまもと たくや）｜D層</h2><table><tr><th>項目</th><th>内容</th></tr><tr><td><strong>年齢・性別</strong></td><td>41歳・男性</td></tr><tr><td><strong>家族構成</strong></td><td>独身</td></tr><tr><td><strong>事業内容</strong></td><td>農産物加工品販売（ジャム・ドレッシング等）</td></tr><tr><td><strong>月商</strong></td><td>約12万円</td></tr><tr><td><strong>経営歴</strong></td><td>4年</td></tr><tr><td><strong>居住地</strong></td><td>北海道・近郊市町村</td></tr></table><p><strong>日常の行動パターン</strong></p><ul><li>ツクツクの「繋ぎ手」活動に注力。月1回東京のシンポジウムに参加（飛行機代往復3万円）</li><li>「仲間を増やせばマージンが入る」を信じてSNSで勧誘活動</li><li>本業の加工品は季節商品で売上が安定しない</li><li>「阿比留社長の理念に共感」が口癖</li></ul><p><strong>抱えている問題（本人の自覚）</strong></p><ul><li>「もっと仲間を増やしたい」</li><li>「ツクツクをもっと広めたい」</li></ul><p><strong>本当の問題（本人は未自覚）</strong></p><ul><li>本業の月商12万円では生活できない。貯金を切り崩している</li><li>繋ぎ手マージンは月1〜2万円。東京往復の交通費で消える</li><li>「仲間を増やす＝経営」と完全に誤認している</li><li>4年間で本業の売上がほぼ横ばい。PDCAが一切回っていない</li></ul><p><strong>講習会での反応予測</strong></p><ul><li>第1回：講習会中に「ツクツクいいですよ！」と周囲に勧め始める</li><li>数字の話は「それも大事だけど、まず仲間が大事」とスルー</li><li>個別相談に来ても「一緒にツクツク広めましょう！」と提案してくる</li></ul><p><strong>顧問契約への転換確率：0%</strong><br>支援対象外。事前ヒアリングシートの段階でフィルタリングされる想定<br>万が一来ても、初回診断で「まず本業の立て直しが先」と明確に伝える</p><hr><h1>パート6：キャッチコピー・発信への活用</h1><h2>ツクツクHP用キャッチコピー（確定・2026/3/28）</h2><p>ツクツク層に刺さる文言は<strong>資格名ではなく「悩み」から入る</strong>のが鉄則。</p><ol><li>「がんばってるのに、なぜかお金が残らない。その理由、一緒に整理しませんか。」</li><li>「数字が苦手でも大丈夫。経営のモヤモヤ、言語化します。」</li><li>「高い勉強会より、まず自分のお金を知ること。」</li></ol><h2>避けるべき言葉</h2><ul><li>公認会計士・税理士・財務・BS/PL（遠い・怖い）</li><li>コンサルティング（全層共通で距離を感じる）</li></ul><h2>刺さる言葉のトーン</h2><ul><li>「手元に残らない」「なんとなく不安」「誰かに聞きたかった」</li><li>責めない・怖くない・温かみがある</li></ul><h2>層別の刺さる言葉</h2><ul><li><strong>A層に刺さる言葉</strong>：「手元に残らない理由」「一人じゃ分からなかった」「初めて数字を見た」</li><li><strong>B層を動かす言葉</strong>：「知っているだけじゃ変わらない」「やり方は分かった、でも…」</li></ul><hr><h1>活用ガイド</h1><h2>集客チャネルとしての位置づけ</h2><ul><li><strong>当面のメイン集客チャネル</strong></li><li>お母さん層・経営初心者が中心</li><li>講習会で価値を知ってもらい、需要に応じて顧問へ誘導</li><li>口コミ設計も重要</li></ul><h2>講習会の設計への活用</h2><ul><li><strong>A層の転換を最大化</strong>する設計が最優先。B層のA層化が次の目標</li><li>C・D層は自然に離脱する設計でOK（ふるいが機能している証拠）</li><li>口コミの質を管理するため、初回参加者は5〜6人に絞る方針と整合</li></ul><h2>顧問契約への導線設計</h2><ul><li><strong>A層</strong>：第5回終了時点で即座に個別相談予約へ誘導</li><li><strong>B層</strong>：講習会リピート→A層化を待つ。フォロー接点（メール・LINE）を維持</li><li><strong>C層</strong>：導線は残すが追わない。状況変化時の受け皿として機能させる</li><li><strong>D層</strong>：明確に排除。事前ヒアリングシートがフィルター</li></ul><h2>支援上の注意点</h2><ul><li>全員助けようとしない。変われる人だけ残る仕組みを設計する</li><li>初回診断シートと講習会がふるいとして機能する</li><li>ただし<strong>一番化ける可能性がある層</strong>でもある（今まで誰にも数字で現実を見せてもらったことがない）</li></ul>`;

const body = truncateBody(body_html);
const truncated = body.length >= MAX_BODY ? ' [省略あり]' : '';
console.log(`[${id.slice(-8)}] ${title} (${body.length}文字${truncated})`);

const sql = `-- ${title} UPDATE\n-- 生成日時: ${new Date().toISOString()}\nUPDATE knowledge SET title=${sqlStr(title)}, body=${sqlStr(body)}, tags=${sqlStr(tags)}, updated_at=datetime('now') WHERE id=${sqlStr(id)};\n`;

fs.writeFileSync(OUT_FILE, sql, 'utf8');
console.log(`\nSQL出力完了: ${OUT_FILE}`);
