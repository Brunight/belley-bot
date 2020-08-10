/* eslint-disable no-unused-expressions */
import Discord, {
  Message,
  User,
  Channel,
  VoiceConnection,
  Guild,
} from 'discord.js';
import ytdl from 'ytdl-core';
import Youtube from 'discord-youtube-api';

import { prefix, token } from './config/discord';
import googleApi from './config/googleapi';

interface Song {
  title: string;
  url: string;
}

interface Queue {
  textChannel: Channel;
  voiceChannel: Channel;
  connection: VoiceConnection | null;
  songs: Song[];
  volume: number;
  playing: boolean;
}

const queue = new Map();

function skip(message: Message, serverQueue: Queue | null): void {
  if (!message.member?.voice.channel) {
    message.channel.send(
      'Você precisa estar em um canal de voz para pular a música!',
    );
    return;
  }
  if (!serverQueue) {
    message.channel.send('Não existem músicas para pular!');
    return;
  }
  serverQueue.connection?.disconnect();
}

function stop(message: Message, serverQueue: Queue): void {
  if (!message.member?.voice.channel) {
    message.channel.send(
      'Você precisa estar em um canal de voz para parar a fila!',
    );
    return;
  }

  // serverQueue.songs = [];
  serverQueue.songs.splice(0, serverQueue.songs.length);

  serverQueue.connection?.disconnect();
}

function play(guild: Guild, song: Song): void {
  const serverQueue = queue.get(guild.id);
  if (!song) {
    serverQueue.voiceChannel.leave();
    queue.delete(guild.id);
    return;
  }

  const dispatcher = serverQueue.connection
    .play(ytdl(song.url))
    .on('finish', () => {
      serverQueue.songs.shift();
      play(guild, serverQueue.songs[0]);
    })
    .on('error', (error: string) => console.error(error));
  dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
  serverQueue.textChannel.send(`Tocando agora: **${song.title}**`);
}

async function searchYouTubeAsync(videoName: string): Promise<string> {
  const youtube = new Youtube(googleApi);

  const video = await youtube.searchVideos(
    videoName.toString().replace(/,/g, ' '),
  );
  console.log(video.url);
  console.log(typeof String(video.url));
  return String(video.url);
}

async function execute(message: Message, serverQueue: Queue): Promise<void> {
  const args = message.content.split(' ');

  const voiceChannel = message.member?.voice.channel;
  if (!voiceChannel) {
    message.channel.send('Você precisa estar conectado em um canal de voz!');
    return;
  }
  const permissions = voiceChannel.permissionsFor(message.client.user as User);
  if (!permissions?.has('CONNECT') || !permissions?.has('SPEAK')) {
    message.channel.send(
      'Não tenho permissão para entrar no seu canal de voz!',
    );
    return;
  }

  // const sognName = args.split(`${prefix}play `)[1];
  args.shift();
  const songInfo = await ytdl.getInfo(
    await searchYouTubeAsync(args.toString()),
  );
  const song = {
    title: songInfo.title,
    url: songInfo.video_url,
  } as Song;

  if (!serverQueue) {
    const queueContruct = {
      textChannel: message.channel,
      voiceChannel,
      connection: null,
      songs: [],
      volume: 6,
      playing: true,
    } as Queue;

    queue.set(message.guild?.id, queueContruct);

    queueContruct.songs.push(song);

    try {
      const connection = await voiceChannel.join();
      queueContruct.connection = connection;
      if (message.guild) play(message.guild, queueContruct.songs[0]);
    } catch (err) {
      console.log(err);
      queue.delete(message.guild?.id);
      message.channel.send(err);
    }
  } else {
    serverQueue.songs.push(song);
    message.channel.send(`${song.title} foi adicionada à fila!`);
  }
}

const client = new Discord.Client();

client.once('ready', () => {
  console.log('Ready!');
});

client.once('disconnect', () => {
  console.log('Disconnect!');
});

client.on('message', async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith(prefix)) return;

  const serverQueue = queue.get(message.guild?.id);

  if (message.content.startsWith(`${prefix}play`)) {
    execute(message, serverQueue);
  } else if (message.content.startsWith(`${prefix}skip`)) {
    skip(message, serverQueue);
  } else if (message.content.startsWith(`${prefix}stop`)) {
    stop(message, serverQueue);
  } else {
    message.channel.send('Comando inválido!');
  }
});

client.login(token);
