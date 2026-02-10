// main.mjs - Discord Botのメインプログラム

// 必要なライブラリを読み込み
import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import express from 'express';
import fetch from 'node-fetch';

// .envファイルから環境変数を読み込み
dotenv.config();

// Discord Botクライアントを作成
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
    ],
});

// Botが起動完了したときの処理
const onReady = () => {
    console.log(`🎉 ${client.user?.tag ?? 'Bot'} が正常に起動しました！`);
    try { client.user?.setActivity('@mention で会話できます！', { type: 'PLAYING' }); } catch (e) {}
};
// v15+: clientReady, 以前のバージョン互換で ready も登録
client.once('clientReady', onReady);
client.once('ready', onReady);

// タイムアウト付き fetch ユーティリティ
async function fetchWithTimeout(url, options = {}, ms = 8000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return res;
    } catch (err) {
        clearTimeout(id);
        throw err;
    }
}

// Hugging Face API のみで応答を生成
async function generateResponse(userMessage) {
    const hf = await tryHuggingFace(userMessage);
    if (hf) return hf;

    // Hugging Face が利用できない場合
    return '申し訳ございません。現在返答できません。しばらく経ってからお試しください。';
}

// Hugging Face API を呼ぶ（HUGGINGFACE_TOKEN 必須）
async function tryHuggingFace(userMessage) {
    const token = process.env.HUGGINGFACE_TOKEN;
    if (!token) {
        console.warn('Hugging Face token が設定されていません。フォールバック応答を返します。');
        return null;
    }

    const model = process.env.HUGGINGFACE_MODEL || 'openai/gpt-oss-20b:groq';
    const url = process.env.HUGGINGFACE_CHAT_URL || 'https://router.huggingface.co/v1/chat/completions';
    const systemPrompt = process.env.HF_SYSTEM_PROMPT || `あなたは親切で礼儀正しい日本語アシスタントです。
ユーザーの質問に対して、簡潔で分かりやすく、親切に答えてください。
可能な限り日本語で返答してください。`;

    try {
        const body = {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
            ],
            stream: false,
            max_tokens: 200,
            temperature: 0.7
        };

        const res = await fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }, 12000);

        if (!res.ok) {
            console.error('tryHuggingFace status:', res.status);
            const txt = await res.text().catch(() => '');
            if (txt) console.error('tryHuggingFace body:', txt);
            return null;
        }

        const data = await res.json();

        // 代表的なレスポンス位置を順に確認
        const content =
            data?.choices?.[0]?.message?.content ||
            data?.choices?.[0]?.text ||
            data?.output?.[0]?.content?.[0]?.text ||
            data?.generated_text ||
            null;

        if (content) return String(content).trim();

        // 不明フォーマットはログに出す
        console.debug('tryHuggingFace unknown response format:', data);
        return null;
    } catch (err) {
        console.error('tryHuggingFace exception:', err?.message || err);
        return null;
    }
}

// ⚠️ One API は使用しません（非推奨）

// シンプルなキーワード応答を大幅に拡張
function getSimpleResponse(message) {
    const responses = {
        'こんにちは': 'こんにちは！👋 今日はいい天気ですね。',
        'おはよう': 'おはようございます！☀️ 良い1日を過ごしてね。',
        'こんばんは': 'こんばんは！🌙 夜遅くまで起きてますね。',
        'おやすみ': 'おやすみなさい😴 ゆっくり休んでね。',
        'ありがとう': 'どういたしまして！😊 何かお手伝いできることはありますか？',
        'ごめん': '気にしないでください！😄 誰にでも間違いはあります。',
        '天気': '申し訳ありません。私は天気情報は確認できません。🌤️',
        '時間': 'それは「!time」コマンドで確認できますよ！⏰',
        '元気': 'ありがとう！僕は元気です！💪 あなたはどう？',
        'バイ': 'また明日！👋 よろしく！',
        'ジョーク': 'Q: なぜプログラマーはお風呂が好きですか？ A: ログアウトするために！😄',
        '計算': '計算ですか？「!calc」コマンドで計算できますよ！🧮',
        'ゲーム': 'ゲームですか？「!dice」でサイコロが振れますよ！🎮',
        '好き': 'ありがとう！私も皆さんのことが好きです！❤️',
        'AI': 'AI技術は面白いですね！私も機械学習モデルの一部です。🤖',
        'プログラミング': 'プログラミングですか？素晴らしい！💻 何か手伝えることはありますか？',
        'Python': 'Pythonはいい言語ですね！🐍 シンプルで読みやすいのが特徴です。',
        'JavaScript': 'JavaScriptですね！✨ Discordボットもこの言語で書いています。',
        '映画': '映画はいいですね！🎬 何かおすすめがあったら教えてください！',
        '音楽': '音楽好きですか？🎵 私も好きです。何のジャンルがお好きですか？',
        'スポーツ': 'スポーツですか？⚽ 運動は健康にいいですね！',
        '勉強': '勉強頑張ってください！📚 応援しています！',
        '仕事': 'お疲れ様です。😊 頑張ってください！',
        '疲れ': 'お疲れ様です。💪 少し休んでみてはどうでしょう？',
        '退屈': 'つまらないですか？🤔 何かゲームでもしてみませんか？',
        '寂しい': 'そうですか。😢 誰かに相談してみるのもいいかもしれません。',
        'Discord': 'Discordは素晴らしいプラットフォームですね！💬',
        'サーバー': 'サーバーについて何かお手伝いできることはありますか？🖥️',
        'ボット': '私のことですか？嬉しいです！🤖 何かできることがあったら言ってね！',
        'help': 'ヘルプが必要ですか？「!help」と入力してみてください！📖',
        'すごい': 'ありがとうございます！嬉しいです！🎉',
        'かわいい': 'そう言ってくれてありがとう！可愛いなんて照れます😊',
        'きれい': 'ありがとうございます！光栄です！✨',
        'かっこいい': 'えへへ、ありがとうございます！😄',
        'バグ': 'バグですか？申し訳ありません。報告してくれると幸いです。🐛',
        'エラー': 'エラーが発生しましたか？お力になれたら幸いです。⚠️',
        'help me': 'もちろんです！何かお手伝いできることはありますか？🆘',
        'thanks': 'You\'re welcome! 😊',
        'hello': 'Hello! How are you? 👋',
        'hi': 'Hi there! 😄',
        'bye': 'See you! 👋',
    };

    // メッセージにキーワードが含まれているかチェック
    for (const [key, response] of Object.entries(responses)) {
        if (message.includes(key)) {
            return response;
        }
    }

    // デフォルト応答
    const defaultResponses = [
        '「' + message + '」ですね。わかりました！😊',
        'そういうことなんですね。もっと詳しく教えていただけますか？',
        'なるほど！興味深いですね。🤔',
        'そうですか。いい質問ですね！',
        'わかりました。ありがとうございます！',
        'へぇ〜。もっと教えてもらえますか？',
        'へぇ、そんなことがあるんですね。😮',
        'わかりますよ。私も同じように思います。',
        'それは大変ですね。頑張ってください！💪',
        'えっ、本当ですか？😲',
        'そんなこともあるんですね。勉強になります！',
        'なるほどなるほど。😌',
        'いいですね！素晴らしいです！✨',
    ];

    return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
}

// ユーザープロフィール取得
function getUserInfo(message) {
    return `👤 ${message.author.tag}\nID: ${message.author.id}\n作成日: ${message.author.createdAt.toLocaleDateString('ja-JP')}`;
}

// サーバー情報取得
function getServerInfo(guild) {
    return `🏰 サーバー: ${guild.name}\n👥 メンバー数: ${guild.memberCount}\n🆔 ID: ${guild.id}\n作成日: ${guild.createdAt.toLocaleDateString('ja-JP')}`;
}

// ランダム数字生成
function getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// コイントス
function coinFlip() {
    return getRandomNumber(1, 2) === 1 ? '🪙 表' : '🪙 裏';
}

// サイコロ振り
function rollDice(sides = 6) {
    return `🎲 ${getRandomNumber(1, sides)}`;
}

// メッセージが送信されたときの処理
client.on('messageCreate', async (message) => {
    // Bot自身のメッセージは無視
    if (message.author.bot) return;
    
    const prefix = '!'; // コマンドプレフィックス
    const content = message.content.toLowerCase();

    // 「ping」メッセージに反応
    if (content === 'ping') {
        message.reply('🏓 pong!');
        console.log(`📝 ${message.author.tag} が ping コマンドを使用`);
        return;
    }

    // コマンド処理（プレフィックス付き）
    if (message.content.startsWith(prefix)) {
        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const command = args[0].toLowerCase();

        // ユーザー情報コマンド
        if (command === 'user' || command === 'profile') {
            message.reply(`\`\`\`\n${getUserInfo(message)}\`\`\``);
            return;
        }

        // サーバー情報コマンド
        if (command === 'server') {
            message.reply(`\`\`\`\n${getServerInfo(message.guild)}\`\`\``);
            return;
        }

        // ヘルプコマンド
        if (command === 'help') {
            const helpText = `
📚 **利用可能なコマンド:**
\`!user\` - ユーザー情報を表示
\`!server\` - サーバー情報を表示
\`!coin\` - コイントス
\`!dice [面数]\` - サイコロ振り（デフォルト6面）
\`!random [最小] [最大]\` - ランダム数字生成
\`!echo [テキスト]\` - テキストを繰り返す
\`!time\` - 現在時刻を表示
\`!calc [式]\` - 簡単な計算
\`!joke\` - ジョークを言う
\`@Bot [メッセージ]\` - AIに質問する
            `;
            message.reply(helpText);
            return;
        }

        // コイントスコマンド
        if (command === 'coin') {
            message.reply(coinFlip());
            return;
        }

        // サイコロコマンド
        if (command === 'dice') {
            const sides = args[1] ? parseInt(args[1]) : 6;
            if (isNaN(sides) || sides < 2) {
                message.reply('❌ 有効な面数を指定してください（2以上）');
                return;
            }
            message.reply(rollDice(sides));
            return;
        }

        // ランダム数字生成コマンド
        if (command === 'random') {
            const min = args[1] ? parseInt(args[1]) : 1;
            const max = args[2] ? parseInt(args[2]) : 100;
            if (isNaN(min) || isNaN(max)) {
                message.reply('❌ 有効な数字を指定してください');
                return;
            }
            message.reply(`🎯 ランダム数字: **${getRandomNumber(min, max)}**`);
            return;
        }

        // エコーコマンド
        if (command === 'echo') {
            const text = args.slice(1).join(' ');
            if (!text) {
                message.reply('❌ テキストを指定してください');
                return;
            }
            message.reply(text);
            return;
        }

        // 時刻表示コマンド
        if (command === 'time') {
            const now = new Date().toLocaleString('ja-JP');
            message.reply(`🕐 現在時刻: **${now}**`);
            return;
        }

        // 計算コマンド
        if (command === 'calc') {
            const expression = args.slice(1).join('');
            if (!expression) {
                message.reply('❌ 計算式を指定してください（例: !calc 10+5）');
                return;
            }
            try {
                if (!/^[\d+\-*/.()]+$/.test(expression)) {
                    message.reply('❌ 無効な計算式です');
                    return;
                }
                const result = eval(expression);
                message.reply(`🧮 計算結果: **${expression} = ${result}**`);
            } catch (error) {
                message.reply('❌ 計算に失敗しました。正しい式を入力してください。');
            }
            return;
        }

        // ジョークコマンド
        if (command === 'joke') {
            const jokes = [
                '🤣 Q: なぜプログラマーは自宅から出ないのか？ A: DOMでいっぱいだから！',
                '🤣 Q: Javaプログラマーはなぜ眼鏡をかけているか？ A: Cが見えないから！',
                '🤣 Q: デバッグとは何か？ A: バグを探すこと。',
                '🤣 Q: 100人のプログラマーを集めるには？ A: 99人を雇って、1人は経営者にする！',
            ];
            message.reply(jokes[Math.floor(Math.random() * jokes.length)]);
            return;
        }
    }

    // Botがメンションされた場合のみ応答
    if (message.mentions.has(client.user)) {
        try {
            await message.channel.sendTyping();
            const userMessage = message.content.replace(/<@!?\d+>/g, '').trim();
            const response = await generateResponse(userMessage);
            await message.reply(response);
            console.log(`🤖 応答: ${response}`);
        } catch (error) {
            console.error('❌ エラー:', error);
            message.reply('エラーが発生しました。');
        }
    }
});

// エラーハンドリング
client.on('error', (error) => {
    console.error('❌ Discord クライアントエラー:', error);
});

// プロセス終了時の処理
process.on('SIGINT', () => {
    console.log('🛑 Botを終了しています...');
    client.destroy();
    process.exit(0);
});

// Discord にログイン
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN が .env ファイルに設定されていません！');
    process.exit(1);
}

console.log('🔄 Discord に接続中...');
client.login(process.env.DISCORD_TOKEN)
    .catch(error => {
        console.error('❌ ログインに失敗しました:', error);
        process.exit(1);
    });

// Express Webサーバーの設定（Render用）
const app = express();
const port = process.env.PORT || 3000;

// ヘルスチェック用エンドポイント
app.get('/', (req, res) => {
    res.json({
        status: 'Bot is running! 🤖',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// サーバー起動
app.listen(port, () => {
    console.log(`🌐 Web サーバーがポート ${port} で起動しました`);
});