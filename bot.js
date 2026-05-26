const { 
  Client, 
  GatewayIntentBits, 
  PermissionsBitField, 
  ChannelType, 
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle
} = require('discord.js');
const fs = require('fs');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = '1508974273275105462';
const USER_ID = '769881004788940810';

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

async function deleteAllRoles(guild) {
  console.log('Deleting all existing roles...');
  const roles = guild.roles.cache.filter(role => 
      role.name !== '@everyone' && 
      !role.managed &&
      role.position < guild.members.me.roles.highest.position
  );

  for (const [id, role] of roles) {
      try {
          await role.delete();
          console.log(`Deleted role: ${role.name}`);
          await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
          if (error.code === 50013) {
              console.warn(`Cannot delete managed role ${role.name}`);
          } else {
              console.warn(`Could not delete role ${role.name}:`, error.message);
          }
      }
  }
}

function getChannelType(type) {
  switch (type) {
      case 0: return ChannelType.GuildText;
      case 2: return ChannelType.GuildVoice;
      case 4: return ChannelType.GuildCategory;
      case 5: return ChannelType.GuildAnnouncement;
      default: return ChannelType.GuildText;
  }
}

function createChannelOptions(ch, channelType, parent, roles) {
  const everyoneId = parent ? parent.guild.roles.everyone.id : null;
  const memberRole = roles['Member'];
  const leadRole = roles['Community Lead'];
  const modRole = roles['Moderator'];

  const options = {
      name: ch.name,
      type: channelType,
      parent: parent || undefined,
      topic: ch.topic || undefined,
      permissionOverwrites: []
  };

  if (channelType === ChannelType.GuildVoice) {
      options.bitrate = 64000;
      options.userLimit = 0;
      options.rtcRegion = null;
      options.permissionOverwrites = [
          {
              id: everyoneId,
              deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect]
          },
          ...(memberRole ? [{
              id: memberRole.id,
              allow: [
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.Connect,
                  PermissionsBitField.Flags.Speak
              ]
          }] : [])
      ];
  } else if (channelType === ChannelType.GuildAnnouncement) {
      options.permissionOverwrites = [
          {
              id: everyoneId,
              deny: [PermissionsBitField.Flags.SendMessages],
              allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory]
          },
          ...(leadRole ? [{
              id: leadRole.id,
              allow: [
                  PermissionsBitField.Flags.SendMessages,
                  PermissionsBitField.Flags.ManageMessages,
                  PermissionsBitField.Flags.MentionEveryone
              ]
          }] : []),
          ...(modRole ? [{
              id: modRole.id,
              allow: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages]
          }] : [])
      ];
  } else {
      options.permissionOverwrites = [
          {
              id: everyoneId,
              deny: [PermissionsBitField.Flags.ViewChannel]
          },
          ...(memberRole ? [{
              id: memberRole.id,
              allow: [
                  PermissionsBitField.Flags.ViewChannel,
                  PermissionsBitField.Flags.SendMessages,
                  PermissionsBitField.Flags.ReadMessageHistory,
                  PermissionsBitField.Flags.AddReactions,
                  PermissionsBitField.Flags.AttachFiles,
                  PermissionsBitField.Flags.EmbedLinks
              ]
          }] : [])
      ];
  }

  return options;
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
      const guild = await client.guilds.fetch(GUILD_ID);
      if (!guild) throw new Error('Could not find guild');
      
      const me = await guild.members.fetchMe();
      const missingPermissions = [PermissionsBitField.Flags.Administrator].filter(
          perm => !me.permissions.has(perm)
      );
      if (missingPermissions.length > 0) {
          console.error('Bot is missing required permissions: Administrator');
          await client.destroy();
          return;
      }

      console.log(`Connected to guild: ${guild.name}`);
      await deleteAllRoles(guild);

      console.log('Creating roles...');
      const roles = {};
      const template = JSON.parse(fs.readFileSync('template.json', 'utf8'));

      for (const roleData of template.roles) {
          try {
              const role = await guild.roles.create({
                  name: roleData.name,
                  color: roleData.color,
                  hoist: roleData.hoist,
                  mentionable: roleData.mentionable,
                  permissions: BigInt(roleData.permissions)
              });
              roles[roleData.name] = role;
              console.log(`Created role: ${role.name}`);
              await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
              console.error(`Error creating role ${roleData.name}:`, error.message);
          }
      }

      console.log('Deleting existing channels...');
      for (const channel of guild.channels.cache.values()) {
          try {
              if (channel.deletable) {
                  await channel.delete();
                  console.log(`Deleted channel: ${channel.name}`);
                  await new Promise(resolve => setTimeout(resolve, 500));
              }
          } catch (error) {
              console.warn(`Could not delete channel ${channel.name}:`, error.message);
          }
      }

      console.log('Creating categories...');
      const categories = {};
      for (const ch of template.channels.filter(c => c.type === 4)) {
          try {
              const category = await guild.channels.create({
                  name: ch.name,
                  type: ChannelType.GuildCategory
              });
              categories[ch.name] = category;
              console.log(`Created category: ${ch.name}`);
              await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
              console.error(`Error creating category ${ch.name}:`, error.message);
          }
      }

      console.log('Creating channels...');
      for (const ch of template.channels.filter(c => c.type !== 4)) {
          try {
              const channelType = getChannelType(ch.type);
              const parent = ch.parent_id ? categories[ch.parent_id] : null;
              await guild.channels.create(
                  createChannelOptions(ch, channelType, parent, roles)
              );
              console.log(`Created channel: ${ch.name}`);
              await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error) {
              console.error(`Error creating channel ${ch.name}:`, error.message);
          }
      }

      try {
          const member = await guild.members.fetch(USER_ID);
          const adminRole = roles['Community Lead'];
          if (member && adminRole) {
              await member.roles.add(adminRole);
              console.log(`Assigned Community Lead role to ${member.user.tag}`);
          }
      } catch (error) {
          console.warn('Could not assign admin role (user may not be in server):', error.message);
      }

      console.log('Server setup complete!');
  } catch (err) {
      console.error('Error during setup:', err);
  }
});

client.login(TOKEN);
