import discord
from discord.ext import commands
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

# Substitua pelo seu token
TOKEN = 'YOUR_TOKEN_HERE'

# IDs dos canais que receberão o aviso
CHANNEL_IDS = [1356675900434944191]

# Mensagem padrão para o aviso
ANNOUNCEMENT_MESSAGE = "@here Aviso! Uma invasão está para acontecer em 5 minutos!"

# Inicialização do bot
intents = discord.Intents.default()
intents.messages = True
bot = commands.Bot(command_prefix='!', intents=intents)

scheduler = AsyncIOScheduler()

# Função que envia a mensagem
async def send_announcement():
    for channel_id in CHANNEL_IDS:
        channel = bot.get_channel(channel_id)
        if channel:
            await channel.send(ANNOUNCEMENT_MESSAGE)

# Função para adicionar os agendamentos
def schedule_announcements():
    schedule = [
        ("12:10", "mon"),  # Segunda-feira
        ("17:25", "mon"),
        ("12:55", "tue"),  # Terça-feira
        ("18:55", "tue"),
        ("09:55", "wed"),  # Quarta-feira
        ("15:55", "wed"),
        ("13:55", "thu"),  # Quinta-feira
        ("20:10", "thu"),
        ("14:55", "fri"),  # Sexta-feira
        ("20:55", "fri"),
        ("10:25", "sat"),  # Sábado
        ("16:25", "sat"),
        ("16:40", "sun"),  # Domingo
        ("23:25", "sun"),
    ]

    for time_str, day in schedule:
        hour, minute = map(int, time_str.split(":"))
        scheduler.add_job(send_announcement, CronTrigger(day_of_week=day, hour=hour, minute=minute))

@bot.event
async def on_ready():
    print(f'Bot conectado como {bot.user}!')
    schedule_announcements()
    scheduler.start()

bot.run(TOKEN)
