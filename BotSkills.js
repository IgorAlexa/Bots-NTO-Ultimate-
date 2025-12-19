const SKILL_EMOJIS = {
  Taijutsu: '🥷',
  Glove: '🧤',
  Sword: '⚔️',
  Distance: '🏹'
};

const { Client, GatewayIntentBits, Events } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const TOKEN = 'Your_Token_Heree';
const CHANNEL_ID = '1382417528541679769';
const CHECK_INTERVAL = 30 * 1000;
const STORAGE_DIR = path.join(__dirname, 'storage');
const DATA_PATH = path.join(STORAGE_DIR, 'data.json');
const MURAL_PATH = path.join(STORAGE_DIR, 'mural.json');

if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR);

let monitoredPlayers = {};
let muralVergonha = {};
let addSkillMessages = {}; // { messageId: { userId, nicks: [] } }

// Carregar dados
if (fs.existsSync(DATA_PATH)) {
  try {
    const raw = fs.readFileSync(DATA_PATH);
    monitoredPlayers = JSON.parse(raw);
    for (const nick in monitoredPlayers) {
      monitoredPlayers[nick].lastUpdate = new Date(monitoredPlayers[nick].lastUpdate);
      monitoredPlayers[nick].startTracking = new Date(monitoredPlayers[nick].startTracking);
    }
    console.log('[LOAD] Dados restaurados de storage/data.json');
  } catch (err) {
    console.error('[ERROR] Falha ao carregar data.json:', err.message);
  }
}

// Carregar mural da vergonha
if (fs.existsSync(MURAL_PATH)) {
  try {
    muralVergonha = JSON.parse(fs.readFileSync(MURAL_PATH));
    console.log('[LOAD] Mural da vergonha carregado');
  } catch (err) {
    console.error('[ERROR] Falha ao carregar mural.json:', err.message);
  }
}

function salvarDados() {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(monitoredPlayers, null, 2));
    fs.writeFileSync(MURAL_PATH, JSON.stringify(muralVergonha, null, 2));
    console.log('[SAVE] Dados salvos em', DATA_PATH, 'e mural.json');
  } catch (err) {
    console.error('[ERROR] Falha ao salvar dados:', err.message);
  }
}

async function getSkills(nick) {
  const url = `https://ntoultimate.com.br/characterprofile.php?name=${encodeURIComponent(nick)}`;
  const { data } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  const $ = cheerio.load(data);
  const rows = $('tr[align="center"][bgcolor="#231B14"]');
  const skillValues = $(rows[1]).find('td').map((i, el) => $(el).text().trim()).get();

  if (skillValues.length < 5) {
    throw new Error('Dados de skills insuficientes');
  }

  return {
    Ninjutsu: parseInt(skillValues[0]) || 0,
    Taijutsu: parseInt(skillValues[1]) || 0,
    Glove: parseInt(skillValues[2]) || 0,
    Sword: parseInt(skillValues[3]) || 0,
    Distance: parseInt(skillValues[4]) || 0
  };
}

function tempoParaUpar(segundos) {
  const dias = Math.floor(segundos / 86400);
  const horas = Math.floor((segundos % 86400) / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  return `${dias} dias, ${horas} horas e ${minutos} minutos`;
}

async function monitorarSkills() {
  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel || !channel.isTextBased()) {
    console.error('[ERROR] Canal inválido ou inacessível:', CHANNEL_ID);
    return;
  }

  for (const nick in monitoredPlayers) {
    try {
      const skillsAtual = await getSkills(nick);
      const anterior = monitoredPlayers[nick];
      const now = new Date();

      if (!anterior.skillTimers) anterior.skillTimers = {};

      const messages = [];

      for (const skill in skillsAtual) {
        if (skill === 'Ninjutsu') continue;

        const novo = skillsAtual[skill];
        const antigo = anterior.skills[skill] || 0;

        if (novo > antigo) {
          const ultimaData = anterior.skillTimers[skill] || anterior.startTracking || now;
          const delta = Math.floor((now - new Date(ultimaData)) / 1000);
          const tempo = tempoParaUpar(delta);
          const skillName = skill.charAt(0).toUpperCase() + skill.slice(1).toLowerCase();
          const emoji = SKILL_EMOJIS[skillName] || '';

          messages.push(
            `📈 **${nick}** subiu **${skillName}** ${emoji} de **${antigo}** para **${novo}**\n⏱️ Tempo para upar: \`${tempo}\``
          );

          anterior.skillTimers[skill] = now;
        }
      }

      if (messages.length) {
        for (const msg of messages) {
          await channel.send(msg);
        }
        anterior.skills = skillsAtual;
        anterior.lastUpdate = now;
        salvarDados();
      }
    } catch (err) {
      console.error(`[ERROR] Falha ao monitorar ${nick}:`, err.message);
    }
  }
}

setInterval(monitorarSkills, CHECK_INTERVAL);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});


client.once(Events.ClientReady, () => {
  console.log(`[BOT] Logado como ${client.user.tag}`);
});

// Quando cria mensagem
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  const [cmd, ...args] = message.content.trim().split(' ');
  const rawNick = args.join(' ');
  const nickKey = rawNick.toLowerCase();

  if (cmd === '!addSkill') {
    if (!rawNick) return message.reply('Uso correto: !addskill <nick1>, <nick2>, ...');

    const names = rawNick.split(',').map(n => n.trim()).filter(Boolean);

    for (const name of names) {
      const key = name.toLowerCase();
      try {
        const skills = await getSkills(name);
        monitoredPlayers[key] = {
          skills,
          skillTimers: Object.fromEntries(
            Object.entries(skills).map(([k, _]) => [k, new Date()])
          ),
          lastUpdate: new Date(),
          startTracking: new Date(),
          displayName: name.toLowerCase()
        };
        await message.channel.send(
          `🟢 Agora monitorando: **${name.toLowerCase()}**\n` +
          `📊 Skills atuais: ` +
          Object.entries(skills)
            .filter(([k]) => k !== 'Ninjutsu')
            .map(([k, v]) => `${SKILL_EMOJIS[k] || k}: ${v}`)
            .join(' | ')
        );
      } catch {
        await message.channel.send(`❌ Não foi possível monitorar **${name}**.`);
      }
    }

    // Salvar associação mensagem → autor + nicks
    addSkillMessages[message.id] = {
      userId: message.author.id,
      nicks: names
    };

    salvarDados();
    return;
  }

  if (cmd === '!removeSkill') {
    if (!rawNick) return message.reply('Uso correto: !removeskill <nick1>, <nick2>, ...');

    const names = rawNick.split(',').map(n => n.trim().toLowerCase()).filter(Boolean);
    const removidos = [];

    for (const name of names) {
      if (monitoredPlayers[name]) {
        removidos.push(monitoredPlayers[name].displayName);
        delete monitoredPlayers[name];
      }
    }

    if (removidos.length) {
      salvarDados();
      return message.reply(
        `🗑️ Removido da monitoração: ${removidos.map(n => `**${n}**`).join(', ')}`
      );
    } else {
      return message.reply('⚠️ Nenhum dos jogadores informados está sendo monitorado no momento.');
    }
  }

  if (cmd === '!listarSkill') {
    const entries = Object.entries(monitoredPlayers);
    if (entries.length === 0) {
      return message.reply('Nenhum jogador está sendo monitorado no momento.');
    }

    const lines = entries.map(([_, data]) => {
      const { displayName, skills } = data;
      const skillList = Object.entries(skills)
        .filter(([k]) => k !== 'Ninjutsu')
        .map(([k, v]) => `${SKILL_EMOJIS[k] || k}: ${v}`)
        .join(' | ');
      return `• ${displayName} → ${skillList}`;
    });

    const finalText = `📋 Jogadores monitorados:\n\n${lines.join('\n')}`;

    if (finalText.length > 1900) {
      const filePath = path.join(STORAGE_DIR, 'listagem_skills.txt');
      fs.writeFileSync(filePath, finalText);

      await message.reply({
        content: '📄 Lista de jogadores monitorados:',
        files: [filePath]
      });

      fs.unlinkSync(filePath);
    } else {
      return message.reply(finalText);
    }
  }

  if (cmd === '!comandos') {
    const comandos = [
      '`!addSkill <nick1>, <nick2>, ...` — Adiciona jogadores à monitoração de skills.',
      '`!removeSkill <nick1>, <nick2>, ...` — Remove jogadores da monitoração.',
      '`!listarSkill` — Lista todos os jogadores monitorados e suas skills atuais.',
      '`!comandos` — Exibe esta lista de comandos disponíveis.',
      '`!muralvergonha` — Mostra o ranking de quem mais apagou mensagens de addSkill.'
    ];

    return message.reply({
      content:
        '📚 **Comandos disponíveis:**\n\n' +
        comandos.join('\n')
    });
  }

  if (cmd === '!muralvergonha') {
    if (Object.keys(muralVergonha).length === 0) {
      return message.reply('📌 Ninguém apagou mensagens do addSkill ainda. 😇');
    }

    const sorted = Object.entries(muralVergonha)
      .sort((a, b) => b[1] - a[1])
      .map(([userId, count], i) => `${i + 1}. <@${userId}> — ${count} mensagens apagadas`);

    return message.reply('📜 **Mural da Vergonha**:\n' + sorted.join('\n'));
  }
});

// Detectar deleção de mensagens
client.on(Events.MessageDelete, async message => {
  if (!message.id || !addSkillMessages[message.id]) return;

  const { userId, nicks } = addSkillMessages[message.id];
  const channel = message.channel;

  await channel.send(
    `⚠️ O jogador <@${userId}> apagou a mensagem que adicionou os seguintes nicks: ${nicks.join(', ')}`
  );

  // Atualizar mural da vergonha
  muralVergonha[userId] = (muralVergonha[userId] || 0) + 1;
  salvarDados();

  delete addSkillMessages[message.id];
});

client.login(TOKEN);
