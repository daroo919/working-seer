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
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;

// 허용 역할
const ALLOWED_ROLES = ["1484178229886713856"];

// ======================
// WARN DB
// ======================
const WARN_FILE = "./warnings.json";

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
    GatewayIntentBits.GuildMessages
  ]
});

// ======================
// 명령어
// ======================
const commands = [

new SlashCommandBuilder().setName("help").setDescription("명령어"),

new SlashCommandBuilder()
.setName("clear")
.setDescription("채팅 삭제")
.addIntegerOption(o=>o.setName("amount").setRequired(true)),

new SlashCommandBuilder()
.setName("kick")
.setDescription("킥")
.addUserOption(o=>o.setName("user").setRequired(true)),

new SlashCommandBuilder()
.setName("ban")
.setDescription("밴")
.addUserOption(o=>o.setName("user").setRequired(true)),

new SlashCommandBuilder()
.setName("unban")
.setDescription("밴 해제")
.addStringOption(o=>o.setName("userid").setRequired(true)),

new SlashCommandBuilder()
.setName("timeout")
.setDescription("타임아웃")
.addUserOption(o=>o.setName("user").setRequired(true))
.addIntegerOption(o=>o.setName("minutes").setRequired(true)),

new SlashCommandBuilder()
.setName("warn")
.setDescription("경고")
.addUserOption(o=>o.setName("user").setRequired(true))
.addStringOption(o=>o.setName("reason")),

new SlashCommandBuilder()
.setName("warnings")
.setDescription("경고 조회")
.addUserOption(o=>o.setName("user").setRequired(true)),

new SlashCommandBuilder()
.setName("ai")
.setDescription("AI 질문")
.addStringOption(o=>o.setName("prompt").setRequired(true))

].map(c=>c.toJSON());

// ======================
client.once("clientReady", async () => {
  console.log(`✅ ${client.user.tag}`);

  const rest = new REST({ version:"10"}).setToken(TOKEN);
  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("✅ 명령어 등록 완료");
});

// ======================
function hasRole(member){
  return member.roles.cache.some(r=>ALLOWED_ROLES.includes(r.id));
}

async function log(guild, message){
  const ch = guild.channels.cache.get(LOG_CHANNEL_ID);
  if(ch) ch.send(message);
}

// ======================
// 환영 메시지
// ======================
client.on("guildMemberAdd", member=>{
  const ch = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if(!ch) return;

  ch.send(`🎉 ${member} 님 환영합니다!`);
});

// ======================
client.on("interactionCreate", async interaction => {
if(!interaction.isChatInputCommand()) return;

if(!hasRole(interaction.member)){
  return interaction.reply({
    content:"❌ 권한 없음",
    ephemeral:true
  });
}

const cmd = interaction.commandName;

// HELP
if(cmd==="help"){
  const embed=new EmbedBuilder()
  .setTitle("관리 명령어")
  .setDescription(`
/clear
/kick
/ban
/unban
/timeout
/warn
/warnings
/ai
`);
  return interaction.reply({embeds:[embed],ephemeral:true});
}

// CLEAR
if(cmd==="clear"){
  const amount=interaction.options.getInteger("amount");
  const del=await interaction.channel.bulkDelete(amount,true);

  log(interaction.guild,`🧹 ${interaction.user.tag} ${del.size}개 삭제`);
  return interaction.reply({content:`삭제 ${del.size}`,ephemeral:true});
}

// KICK
if(cmd==="kick"){
  const user=interaction.options.getUser("user");
  const m=await interaction.guild.members.fetch(user.id);
  await m.kick();

  log(interaction.guild,`👢 ${user.tag} 킥`);
  return interaction.reply(`킥 완료`);
}

// BAN
if(cmd==="ban"){
  const user=interaction.options.getUser("user");
  await interaction.guild.members.ban(user.id);

  log(interaction.guild,`🔨 ${user.tag} 밴`);
  return interaction.reply("밴 완료");
}

// UNBAN
if(cmd==="unban"){
  const id=interaction.options.getString("userid");
  await interaction.guild.members.unban(id);

  log(interaction.guild,`✅ ${id} 밴 해제`);
  return interaction.reply("언밴 완료");
}

// TIMEOUT
if(cmd==="timeout"){
  const user=interaction.options.getUser("user");
  const min=interaction.options.getInteger("minutes");

  const m=await interaction.guild.members.fetch(user.id);
  await m.timeout(min*60000);

  log(interaction.guild,`⏱ ${user.tag} ${min}분 타임아웃`);
  return interaction.reply("타임아웃 완료");
}

// WARN
if(cmd==="warn"){
  const user=interaction.options.getUser("user");
  const reason=interaction.options.getString("reason")||"없음";

  const data=loadWarns();
  if(!data[user.id]) data[user.id]=[];

  data[user.id].push(reason);
  saveWarns(data);

  const count=data[user.id].length;

  await log(interaction.guild,
    `⚠️ ${user.tag} 경고 (${count}/3)\n사유: ${reason}`
  );

  // 자동 처벌
  if(count>=3){
    const m=await interaction.guild.members.fetch(user.id);
    await m.timeout(10*60000);

    log(interaction.guild,"🚨 자동 타임아웃 실행");
  }

  return interaction.reply(`경고 추가 (${count}/3)`);
}

// WARNINGS
if(cmd==="warnings"){
  const user=interaction.options.getUser("user");
  const data=loadWarns();

  const list=data[user.id]||[];

  return interaction.reply(
    `${user.tag} 경고 ${list.length}회\n${list.join("\n")||"없음"}`
  );
}

// AI
if(cmd==="ai"){
  const prompt=interaction.options.getString("prompt");

  await interaction.deferReply();

  const res=await fetch("https://openrouter.ai/api/v1/chat/completions",{
    method:"POST",
    headers:{
      Authorization:`Bearer ${AI_KEY}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      model:"openai/gpt-4o-mini",
      messages:[{role:"user",content:prompt}]
    })
  });

  const json=await res.json();
  const reply=json.choices?.[0]?.message?.content||"응답 실패";

  interaction.editReply(reply.slice(0,2000));
}

});

client.login(TOKEN);
