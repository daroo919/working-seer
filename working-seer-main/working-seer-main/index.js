import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder
} from "discord.js";

const TOKEN = process.env.TOKEN;

// 🔥 여기 역할 ID 넣기 (허용할 계급)
const ALLOWED_ROLES = [
  "1484178229886713856" // ← 역할 ID 바꾸기
];

if (!TOKEN) {
  console.error("❌ TOKEN 없음");
  process.exit(1);
}

// ======================
// 봇 생성
// ======================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

// ======================
// 슬래시 명령어
// ======================
const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("명령어 목록"),

  new SlashCommandBuilder()
    .setName("clear")
    .setDescription("채팅 삭제")
    .addIntegerOption(opt =>
      opt.setName("amount")
        .setDescription("삭제할 메시지 수 (1~100)")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("유저 킥")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("대상 유저")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("reason")
        .setDescription("이유")
    ),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("유저 밴")
    .addUserOption(opt =>
      opt.setName("user")
        .setDescription("대상 유저")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("reason")
        .setDescription("이유")
    ),

  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("밴 해제")
    .addStringOption(opt =>
      opt.setName("userid")
        .setDescription("유저 ID")
        .setRequired(true)
    ),
].map(cmd => cmd.toJSON());


// ======================
// 명령어 등록
// ======================
client.once("clientReady", async () => {
  console.log(`✅ 로그인 성공: ${client.user.tag}`);

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("✅ 슬래시 명령어 등록 완료");
});


// ======================
// 역할 권한 체크 함수
// ======================
function hasAllowedRole(member) {
  return member.roles.cache.some(role =>
    ALLOWED_ROLES.includes(role.id)
  );
}


// ======================
// 명령어 처리
// ======================
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const member = interaction.member;

  // 🔥 역할 검사
  if (!hasAllowedRole(member)) {
    return interaction.reply({
      content: "❌ 이 명령어를 사용할 권한이 없습니다.",
      ephemeral: true
    });
  }

  const { commandName } = interaction;

  // HELP
  if (commandName === "help") {
    const embed = new EmbedBuilder()
      .setTitle("🛠 관리 명령어")
      .setDescription(`
/clear <수> — 채팅 삭제
/kick <유저> — 킥
/ban <유저> — 밴
/unban <ID> — 밴 해제
`)
      .setColor(0x5865f2);

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // CLEAR
  if (commandName === "clear") {
    const amount = interaction.options.getInteger("amount");

    if (amount < 1 || amount > 100) {
      return interaction.reply({
        content: "1~100 사이만 가능",
        ephemeral: true
      });
    }

    const deleted = await interaction.channel.bulkDelete(amount, true);

    return interaction.reply({
      content: `🧹 ${deleted.size}개 삭제 완료`,
      ephemeral: true
    });
  }

  // KICK
  if (commandName === "kick") {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "이유 없음";

    const memberTarget = await interaction.guild.members.fetch(user.id);

    await memberTarget.kick(reason);

    return interaction.reply(` ${user.tag} 킥 완료`);
  }

  // BAN
  if (commandName === "ban") {
    const user = interaction.options.getUser("user");
    const reason = interaction.options.getString("reason") || "이유 없음";

    await interaction.guild.members.ban(user.id, { reason });

    return interaction.reply(`🔨 ${user.tag} 밴 완료`);
  }

  // UNBAN
  if (commandName === "unban") {
    const userId = interaction.options.getString("userid");

    await interaction.guild.members.unban(userId);

    return interaction.reply(`✅ ${userId} 밴 해제 완료`);
  }
});

client.login(TOKEN);
