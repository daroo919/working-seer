import "dotenv/config";
import fs from "fs";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder
} from "discord.js";

const TOKEN = process.env.TOKEN;
const AI_KEY = process.env.AI_API_KEY;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || null;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID || null;

// ======================
// 권한
// ======================
const ALLOWED_ROLES = [
  "1484178229886713856",
  "1424211270067949598"
  "1487783975463288994"
];

// ======================
// WARN DB
// ======================
const WARN_FILE = "./warnings.json";

if (!fs.existsSync(WARN_FILE)) {
  fs.writeFileSync(WARN_FILE, "{}");
}

function loadWarns() {
  return JSON.parse(fs.readFileSync(WARN_FILE));
}

function saveWarns(data) {
  fs.writeFileSync(WARN_FILE, JSON.stringify(data, null, 2));
}

// ======================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ======================
const trials = new Map();

// ======================
// 채팅 로그 가져오기
// ======================
async function getRecentMessages(channel) {
  const msgs = await channel.messages.fetch({ limit: 10 });

  return msgs
    .reverse()
    .map(m => `${m.author.username}: ${m.content}`)
    .join("\n");
}

// ======================
// 명령어
// ======================
const commands = [

new SlashCommandBuilder()
.setName("help")
.setDescription("명령어 목록"),

new SlashCommandBuilder()
.setName("clear")
.setDescription("채팅 삭제")
.addIntegerOption(o =>
  o.setName("amount")
   .setDescription("삭제할 메시지 수")
   .setRequired(true)
),

new SlashCommandBuilder()
.setName("kick")
.setDescription("유저 킥")
.addUserOption(o =>
  o.setName("user")
   .setDescription("킥할 유저")
   .setRequired(true)
),

new SlashCommandBuilder()
.setName("ban")
.setDescription("유저 밴")
.addUserOption(o =>
  o.setName("user")
   .setDescription("밴할 유저")
   .setRequired(true)
),

new SlashCommandBuilder()
.setName("unban")
.setDescription("밴 해제")
.addStringOption(o =>
  o.setName("userid")
   .setDescription("유저 ID")
   .setRequired(true)
),

new SlashCommandBuilder()
.setName("timeout")
.setDescription("타임아웃")
.addUserOption(o =>
  o.setName("user")
   .setDescription("대상 유저")
   .setRequired(true)
)
.addIntegerOption(o =>
  o.setName("minutes")
   .setDescription("시간(분)")
   .setRequired(true)
),

new SlashCommandBuilder()
.setName("warn")
.setDescription("경고 추가")
.addUserOption(o =>
  o.setName("user")
   .setDescription("경고 대상")
   .setRequired(true)
)
.addStringOption(o =>
  o.setName("reason")
   .setDescription("경고 사유")
),

new SlashCommandBuilder()
.setName("warnings")
.setDescription("경고 조회")
.addUserOption(o =>
  o.setName("user")
   .setDescription("조회할 유저")
   .setRequired(true)
),

new SlashCommandBuilder()
.setName("ai")
.setDescription("AI 질문")
.addStringOption(o =>
  o.setName("prompt")
   .setDescription("질문 내용")
   .setRequired(true)
),

new SlashCommandBuilder()
.setName("재판")
.setDescription("AI 재판")
.addUserOption(o =>
  o.setName("피고")
   .setDescription("재판 받을 유저")
   .setRequired(true)
)
.addStringOption(o =>
  o.setName("이유")
   .setDescription("고소 이유")
   .setRequired(true)
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
function hasRole(member) {
  return member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id));
}

async function log(guild, message) {
  if (!LOG_CHANNEL_ID) return;
  const ch = guild.channels.cache.get(LOG_CHANNEL_ID);
  if (ch) ch.send(message);
}

// ======================
client.on("guildMemberAdd", member => {
  if (!WELCOME_CHANNEL_ID) return;
  const ch = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (ch) ch.send(`🎉 ${member} 환영`);
});

// ======================
// AI 판결
// ======================
async function judge(defendant, reason, defense, context) {
  if (!AI_KEY) return "AI 키가 설정되지 않았다.";

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
너는 전지적 시점의 냉혹한 판사다.
히구루마 히로미처럼 말한다.
채팅 기록을 증거로 사용한다.
`
        },
        {
          role: "user",
          content: `
[채팅 기록]
${context}

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
client.on("interactionCreate", async interaction => {

if (!interaction.isChatInputCommand()) return;

const cmd = interaction.commandName;

// 재판만 권한 예외
if (cmd !== "재판" && !hasRole(interaction.member)) {
  return interaction.reply({
    content: "❌ 권한 없음",
    ephemeral: true
  });
}

// ======================
// HELP
// ======================
if (cmd === "help") {
  const embed = new EmbedBuilder()
    .setTitle("명령어 목록")
    .setDescription(`/clear /kick /ban /warn /warnings /ai /재판`);
  return interaction.reply({ embeds: [embed], ephemeral: true });
}

// ======================
// CLEAR
// ======================
if (cmd === "clear") {
  const amount = interaction.options.getInteger("amount");
  const del = await interaction.channel.bulkDelete(amount, true);
  log(interaction.guild, `🧹 ${interaction.user.tag} ${del.size}개 삭제`);
  return interaction.reply({ content: `삭제 ${del.size}`, ephemeral: true });
}

// ======================
// KICK
// ======================
if (cmd === "kick") {
  const user = interaction.options.getUser("user");
  const m = await interaction.guild.members.fetch(user.id);
  await m.kick();
  log(interaction.guild, `👢 ${user.tag} 킥`);
  return interaction.reply("킥 완료");
}

// ======================
// BAN
// ======================
if (cmd === "ban") {
  const user = interaction.options.getUser("user");
  await interaction.guild.members.ban(user.id);
  log(interaction.guild, `🔨 ${user.tag} 밴`);
  return interaction.reply("밴 완료");
}

// ======================
// UNBAN
// ======================
if (cmd === "unban") {
  const id = interaction.options.getString("userid");
  await interaction.guild.members.unban(id);
  log(interaction.guild, `✅ ${id} 언밴`);
  return interaction.reply("언밴 완료");
}

// ======================
// TIMEOUT
// ======================
if (cmd === "timeout") {
  const user = interaction.options.getUser("user");
  const min = interaction.options.getInteger("minutes");
  const m = await interaction.guild.members.fetch(user.id);
  await m.timeout(min * 60000);
  log(interaction.guild, `⏱ ${user.tag} ${min}분`);
  return interaction.reply("타임아웃 완료");
}

// ======================
// WARN
// ======================
if (cmd === "warn") {

  const user = interaction.options.getUser("user");
  const reason = interaction.options.getString("reason") || "없음";

  const data = loadWarns();
  if (!data[user.id]) data[user.id] = [];

  if (data[user.id].length >= 3) {
    return interaction.reply("이미 최대 경고 상태다.");
  }

  data[user.id].push(reason);
  saveWarns(data);

  const count = data[user.id].length;

  log(interaction.guild, `⚠️ ${user.tag} (${count}/3)\n${reason}`);

  if (count >= 3) {
    try {
      const m = await interaction.guild.members.fetch(user.id);
      if (!m.communicationDisabledUntilTimestamp ||
          m.communicationDisabledUntilTimestamp < Date.now()) {
        await m.timeout(10 * 60000);
        log(interaction.guild, "🚨 자동 타임아웃");
      }
    } catch {}
  }

  return interaction.reply(`경고 (${count}/3)`);
}

// ======================
// WARNINGS
// ======================
if (cmd === "warnings") {
  const user = interaction.options.getUser("user");
  const data = loadWarns();
  const list = data[user.id] || [];
  return interaction.reply(
    `${user.tag} 경고 ${list.length}\n${list.join("\n") || "없음"}`
  );
}

// ======================
// AI
// ======================
if (cmd === "ai") {

  const prompt = interaction.options.getString("prompt");
  await interaction.deferReply();

  if (!AI_KEY) return interaction.editReply("AI 키 없음");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AI_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    })
  });

  const json = await res.json();
  const reply =
    json.choices?.[0]?.message?.content || "응답 실패";

  interaction.editReply(reply.slice(0, 2000));
}

// ======================
// 재판
// ======================
if (cmd === "재판") {

  const defendant = interaction.options.getUser("피고");
  const reason = interaction.options.getString("이유");

  const id = interaction.channel.id;

  if (trials.has(id)) {
    return interaction.reply("이미 재판 진행 중이다.");
  }

  trials.set(id, true);

  await interaction.reply(
    `📂 재판 시작\n\n피고: ${defendant}\n혐의: ${reason}\n\n변론해라.`
  );

  const filter = m => m.author.id === defendant.id;

  const collector = interaction.channel.createMessageCollector({
    filter,
    time: 120000,
    max: 1
  });

  // 말하면 즉시 판결
  collector.on("collect", async m => {
    const context = await getRecentMessages(interaction.channel);

    const result = await judge(
      defendant.username,
      reason,
      m.content,
      context
    );

    await interaction.followUp(`⚖️ 판결\n\n${result}`);

    collector.stop();
    trials.delete(id);
  });

  // 안 하면 자동 판결
  collector.on("end", async c => {
    if (c.size === 0) {

      const context = await getRecentMessages(interaction.channel);

      const result = await judge(
        defendant.username,
        reason,
        "변론 없음",
        context
      );

      await interaction.followUp(`⚖️ 판결\n\n${result}`);

      trials.delete(id);
    }
  });
}

});

client.login(TOKEN);
