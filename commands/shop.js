const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { handleOpen } = require('./handlers/open');
const { handleSetAccount, handleDeleteAccount, handleGrantPoints, handleGrantBalance, handleSetPointSettings, handleSetGradeSettings, handleConvertPoints } = require('./handlers/account');
const { handleSetLogChannel } = require('./handlers/logChannel');
const { handleAddProduct, handleAddAccountProduct, handleEditProduct, handleDeleteProduct } = require('./handlers/products');
const { handleRefillStock, handleListStock, handleEditStock, handleDeleteStock } = require('./handlers/stock');
const { isShopAdmin } = require('./handlers/shared');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('상점 관리 및 설정 명령어')
    .addSubcommand(subcommand =>
      subcommand
        .setName('open')
        .setDescription('상점 패널을 전송합니다.')
        .addStringOption(option => 
          option.setName('description')
            .setDescription('상점 패널 상단에 표시될 안내 문구를 입력하세요.')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-account')
        .setDescription('포인트 충전용 계좌를 등록합니다. 같은 계좌는 자동으로 중복 방지됩니다.')
        .addStringOption(option => option.setName('bank').setDescription('은행 이름을 입력하세요 (예: 신한은행)').setRequired(true))
        .addStringOption(option => option.setName('number').setDescription('계좌 번호를 입력하세요').setRequired(true))
        .addStringOption(option => option.setName('holder').setDescription('예금주명을 입력하세요').setRequired(true))
        .addStringOption(option => option.setName('extra').setDescription('추가 안내 문구를 입력하세요 (선택)').setRequired(false))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete-account')
        .setDescription('등록된 충전 계좌를 삭제합니다.')
        .addStringOption(option => option.setName('bank').setDescription('삭제할 계좌의 은행 이름').setRequired(true))
        .addStringOption(option => option.setName('number').setDescription('삭제할 계좌 번호').setRequired(true))
        .addStringOption(option => option.setName('holder').setDescription('삭제할 예금주명').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-log-channel')
        .setDescription('구매 내역 및 알림을 전송할 로그 채널을 지정합니다.')
        .addChannelOption(option => 
          option.setName('channel')
            .setDescription('로그를 보낼 텍스트 채널을 선택하세요.')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('add-product')
        .setDescription('새 채널형 전용 제품을 추가하고 전용 제품 채널을 생성합니다.')
        .addStringOption(option => option.setName('name').setDescription('제품 이름을 입력하세요.').setRequired(true))
        .addIntegerOption(option => option.setName('price').setDescription('제품 가격을 입력하세요.').setRequired(true))
        .addStringOption(option => option.setName('category').setDescription('디스코드에 생성/지정할 카테고리 이름을 적어주세요.').setRequired(true))
        .addStringOption(option =>
          option
            .setName('visibility')
            .setDescription('비공개 유형을 선택하세요.')
            .setRequired(true)
            .addChoices(
              { name: '아예 안 보임 (완전 비공개)', value: 'private' },
              { name: '채널은 보임 (메시지 읽기/전송 불가)', value: 'readonly' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('add-account-product')
        .setDescription('니트로나 계정 비번 등 DM 발송용 텍스트 상품을 추가합니다.')
        .addStringOption(option => option.setName('name').setDescription('제품 이름을 입력하세요.').setRequired(true))
        .addIntegerOption(option => option.setName('price').setDescription('제품 가격을 입력하세요.').setRequired(true))
        .addStringOption(option => option.setName('category').setDescription('지정할 카테고리 이름을 적어주세요.').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('refill-stock')
        .setDescription('계정형 상품에 재고를 충전합니다 (줄바꿈으로 여러 개 입력 가능).')
        .addStringOption(option => option.setName('name').setDescription('재고를 충전할 제품의 명칭을 입력하세요.').setRequired(true))
        .addStringOption(option => option.setName('contents').setDescription('충전할 데이터 텍스트들을 입력해주세요 (줄바꿈 등으로 구분)').setRequired(true))
        .addStringOption(option => option.setName('category').setDescription('같은 이름의 상품이 여러 개일 경우 카테고리를 함께 입력하세요.').setRequired(false))
        .addStringOption(option => option.setName('splitter').setDescription('구분 문자가 줄바꿈이 아닐 경우 기입하세요 (기본값 : 줄바꿈)').setRequired(false))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('list-stock')
        .setDescription('특정 계정형 상품의 모든 미판매 개별 재고의 고유 ID와 텍스트 내용을 확인합니다.')
        .addStringOption(option => option.setName('name').setDescription('조회할 상품 명칭').setRequired(true))
        .addStringOption(option => option.setName('category').setDescription('같은 이름의 상품이 여러 개일 경우 카테고리를 함께 입력하세요.').setRequired(false))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit-stock')
        .setDescription('잘못 입력한 특정 개별 재고의 내용을 고유 ID 기반으로 직접 수정합니다.')
        .addIntegerOption(option => option.setName('id').setDescription('수정할 재고 데이터의 고유 ID 번호').setRequired(true))
        .addStringOption(option => option.setName('content').setDescription('새로 교체해 넣을 텍스트 원문').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete-stock')
        .setDescription('잘못 입력한 특정 개별 재고를 데이터베이스에서 영구 파기하고 카운트를 리사이징합니다.')
        .addStringOption(option => option.setName('id').setDescription('삭제할 재고 데이터의 고유 ID 번호(들). 여러 개는 구분자로 구분하세요.').setRequired(true))
        .addStringOption(option => option.setName('splitter').setDescription('여러 ID를 구분할 문자를 입력하세요 (예: , 또는 |). 기본값은 쉼표/공백/줄바꿈입니다.').setRequired(false))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('grant-points')
        .setDescription('특정 사용자에게 포인트를 지급합니다.')
        .addUserOption(option => option.setName('user').setDescription('포인트를 지급할 사용자').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('지급할 포인트').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('지급 사유').setRequired(false))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('grant-balance')
        .setDescription('특정 사용자에게 보유금액을 지급합니다.')
        .addUserOption(option => option.setName('user').setDescription('보유금액을 지급할 사용자').setRequired(true))
        .addIntegerOption(option => option.setName('amount').setDescription('지급할 보유금액(원)').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('지급 사유').setRequired(false))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-point-settings')
        .setDescription('포인트 적립/전환 설정을 저장합니다.')
        .addIntegerOption(option => option.setName('reward_threshold').setDescription('이 금액 이상 결제 시 포인트를 적립합니다.').setRequired(true))
        .addIntegerOption(option => option.setName('reward_rate').setDescription('결제 금액의 몇 %를 포인트로 적립할지 입력합니다.').setRequired(true))
        .addIntegerOption(option => option.setName('convert_threshold').setDescription('몇 포인트 이상 모여야 보유금액으로 전환 가능한지 입력합니다.').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-grade-settings')
        .setDescription('등급 규칙을 설정합니다. 예: VIP=50000|VVIP=150000')
        .addStringOption(option => option.setName('rules').setDescription('등급 규칙 문자열').setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('convert-points')
        .setDescription('보유 포인트를 보유금액으로 전환합니다.')
        .addIntegerOption(option => option.setName('amount').setDescription('전환할 포인트 수량 (미입력 시 가능한 전부 전환)').setRequired(false))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit-product')
        .setDescription('기존 제품의 정보를 수정합니다.')
        .addStringOption(option => option.setName('name').setDescription('정보를 수정할 원본 제품 이름을 정확하게 입력하세요.').setRequired(true))
        .addStringOption(option => option.setName('new_name').setDescription('새 제품 이름 (선택)').setRequired(false))
        .addStringOption(option => option.setName('target_category').setDescription('같은 이름의 제품이 여러 개일 경우 대상 카테고리를 함께 입력하세요.').setRequired(false))
        .addIntegerOption(option => option.setName('price').setDescription('새 가격 (선택)').setRequired(false))
        .addStringOption(option => option.setName('category').setDescription('새 디스코드 카테고리 이름 (선택)').setRequired(false))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete-product')
        .setDescription('제품을 상점에서 삭제합니다.')
        .addStringOption(option => option.setName('name').setDescription('삭제할 제품 이름을 입력하세요.').setRequired(true))
        .addStringOption(option => option.setName('target_category').setDescription('같은 이름의 제품이 여러 개일 경우 대상 카테고리를 함께 입력하세요.').setRequired(false))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'open') {
      return await handleOpen(interaction);
    }

    if (!isShopAdmin(interaction)) {
      return await interaction.reply({ content: '관리자 권한이 필요합니다.', flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guild.id;

    if (subcommand === 'set-account') {
      return await handleSetAccount(interaction, guildId);
    }

    if (subcommand === 'delete-account') {
      return await handleDeleteAccount(interaction, guildId);
    }

    if (subcommand === 'set-log-channel') {
      return await handleSetLogChannel(interaction, guildId);
    }

    if (subcommand === 'add-product') {
      return await handleAddProduct(interaction, guildId);
    }

    if (subcommand === 'add-account-product') {
      return await handleAddAccountProduct(interaction, guildId);
    }

    if (subcommand === 'refill-stock') {
      return await handleRefillStock(interaction, guildId);
    }

    if (subcommand === 'list-stock') {
      return await handleListStock(interaction, guildId);
    }

    if (subcommand === 'edit-stock') {
      return await handleEditStock(interaction);
    }

    if (subcommand === 'delete-stock') {
      return await handleDeleteStock(interaction, guildId);
    }

    if (subcommand === 'grant-points') {
      return await handleGrantPoints(interaction, guildId);
    }

    if (subcommand === 'grant-balance') {
      return await handleGrantBalance(interaction, guildId);
    }

    if (subcommand === 'set-point-settings') {
      return await handleSetPointSettings(interaction, guildId);
    }

    if (subcommand === 'set-grade-settings') {
      return await handleSetGradeSettings(interaction, guildId);
    }

    if (subcommand === 'convert-points') {
      return await handleConvertPoints(interaction, guildId);
    }

    if (subcommand === 'edit-product') {
      return await handleEditProduct(interaction, guildId);
    }

    if (subcommand === 'delete-product') {
      return await handleDeleteProduct(interaction, guildId);
    }
  },
};