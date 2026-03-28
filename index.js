import "dotenv/config";
import fs from "fs";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";

const TOKEN = process.env.TOKEN;
const AI_KEY = process.env.AI_API_KEY;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ======================
// 재판 상태
// ======================
const trials = new Map();

// ======================
// 명령어
// ======================
const commands = [
  new SlashCommandBuilder()
    .setName("재판")
    .setDescription("AI 재판")
    .addUserOption(o =>
      o.setName("피고").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("이유").setRequired(true)
    )
].map(c => c.toJSON());

// ======================
client.once("clientReady", async () => {
  console.log(`✅ 로그인: ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("✅ 명령어 등록 완료");
});

// ======================
// AI 호출
// ======================
async function judge(defendant, reason, defense) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AI_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
너는 냉정하고 논리적인 판사다.
감정 표현은 거의 하지 않는다.
히구루마 히로미처럼 말한다.

변론을 분석하고,
핵심을 짚고,
책임을 강조한 뒤 판결을 내려라.
`
        },
        {
          role: "user",
          content: `
피고: ${defendant}
혐의: ${reason}
변론: ${defense}

형식:

[판결]:
[이유]:
[벌칙]:
`
        }
      ]
    })
  });

  const json = await res.json();
  return json.choices?.[0]?.message?.content || "판결 실패";
}

// ======================
// 명령 처리
// ======================
client.on("interactionCreate", async interaction => {

if (!interaction.isChatInputCommand()) return;

if (interaction.commandName === "재판") {

  const defendant = interaction.options.getUser("피고");
  const reason = interaction.options.getString("이유");

  const id = interaction.channel.id;

  if (trials.has(id)) {
    return interaction.reply("이미 재판 진행 중이다.");
  }

  trials.set(id, { defendant: defendant.id });

  await interaction.reply(
    `📂 재판 시작\n\n피고: ${defendant}\n혐의: ${reason}\n\n30초 안에 변론해라.`
  );

  const filter = m => m.author.id === defendant.id;

  const collector = interaction.channel.createMessageCollector({
    filter,
    time: 30000,
    max: 1
  });

  let defense = "변론 없음";

  collector.on("collect", m => {
    defense = m.content;
  });

  collector.on("end", async () => {

    try {
      const result = await judge(
        defendant.username,
        reason,
        defense
      );

      await interaction.followUp(`⚖️ 판결\n\n${result}`);

    } catch (e) {
      console.error(e);
      await interaction.followUp("판결 중 오류 발생");
    }

    trials.delete(id);
  });
}

});

client.login(TOKEN);
