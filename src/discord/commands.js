// 斜杠命令：按用户的指令权限清空当前频道上下文。
import { userRule } from './users.js';
export function buildCommandData(djs, name) {
    const { SlashCommandBuilder, InteractionContextType } = djs;
    return new SlashCommandBuilder()
        .setName(name)
        .setDescription('清空当前频道的对话记忆（旧记录会归档保留）')
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel,
        )
        .toJSON();
}

export async function handleClear(interaction, { cfg, store, ambient, cadence, scopeOf }) {
    if (!userRule(cfg, interaction.user.id)?.commandsEnabled) {
        await interaction.reply({ content: cfg.discord.replies.notOwner, ephemeral: true });
        return;
    }
    const scope = scopeOf({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        author: interaction.user,
        channel: interaction.channel,
    });
    const archived = store.archive(scope);
    // 清空记忆等于重新开始，节奏计数也回到 0
    if (scope.channelId) { ambient.clear(scope.channelId); cadence.reset(scope.channelId); }
    await interaction.reply({
        content: archived ? cfg.discord.replies.cleared : cfg.discord.replies.nothingToClear,
        ephemeral: true,
    });
    return { scope, archived };
}
