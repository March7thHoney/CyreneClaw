// 斜杠命令：/clear 清空当前频道上下文，/model 查看当前接口与模型（结果公开），都按用户的指令权限执行。
import { userRule } from './users.js';

export const MODEL_COMMAND_NAME = 'model';
const NO_MENTIONS = { parse: [] };

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

export function buildModelCommandData(djs) {
    const { SlashCommandBuilder, InteractionContextType } = djs;
    return new SlashCommandBuilder()
        .setName(MODEL_COMMAND_NAME)
        .setDescription('查看当前使用的接口与模型')
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM,
            InteractionContextType.PrivateChannel,
        )
        .toJSON();
}

// cfg.llm 由热更新就地覆盖，交互时读到的就是控制台切换后的当前值
export async function handleModel(interaction, { cfg, djs }) {
    const { MessageFlags } = djs;
    if (!userRule(cfg, interaction.user.id)?.commandsEnabled) {
        await interaction.reply({ content: cfg.discord.replies.notOwner, flags: MessageFlags.Ephemeral, allowedMentions: NO_MENTIONS });
        return;
    }
    const content = `接口：${cfg.llm.active ?? '默认'}\n模型：${cfg.llm.model}`;
    await interaction.reply({ content, allowedMentions: NO_MENTIONS });
    return { active: cfg.llm.active, model: cfg.llm.model };
}
