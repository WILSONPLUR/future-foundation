require("dotenv").config();

const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const ws = require("ws");
const { neonConfig } = require("@neondatabase/serverless");
const { PrismaNeon } = require("@prisma/adapter-neon");

neonConfig.webSocketConstructor = ws;
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const keywords = ["збір", "зсу", "дрон", "fpv", "допомога", "підтримка"];

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9а-яіїєґ]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeJarId(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/send\.monobank\.ua\/jar\//i, "")
    .replace(/^jar\//i, "");
}

function toCampaignFromJar(jar, index) {
  const title = String(jar?.title || `Збір ${index + 1}`).trim();
  const safeSlugBase = slugify(title) || `campaign-${index + 1}`;
  const jarId = normalizeJarId(jar?.sendId);
  const balance = Number(jar?.balance || 0) / 100;
  const goal = Number(jar?.goal || 0) / 100;
  const url = jarId ? `https://send.monobank.ua/jar/${jarId}` : "";

  return {
    slug: jarId ? `${safeSlugBase}-${jarId.slice(0, 8)}` : `${safeSlugBase}-${index + 1}`,
    title,
    shortDesc: `Підтримайте збір “${title}”.`,
    content: `Актуальний збір Monobank: ${title}. Кожен внесок важливий.`,
    monoJarId: jarId || null,
    monoJarUrl: url || "https://send.monobank.ua/",
    goalAmount: goal > 0 ? goal : Math.max(balance, 1000),
    raisedAmount: Math.max(balance, 0),
    currency: "UAH",
    status: "active",
    isFeatured: index === 0,
    publishedAt: new Date(),
  };
}

async function getCampaigns() {
  try {
    const response = await fetch("https://api.monobank.ua/personal/client-info", {
      headers: {
        "X-Token": process.env.MONO_TOKEN,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Monobank API failed: ${response.status}`);
    }

    const data = await response.json();
    const jars = Array.isArray(data?.jars) ? data.jars : [];
    const campaignsJars = jars.filter((jar) => {
      const title = String(jar?.title || "").toLowerCase();
      return keywords.some((keyword) => title.includes(keyword));
    });

    return { jars: campaignsJars };
  } catch (error) {
    console.warn("Monobank fetch failed, using fallback campaigns:", error.message);
    return { jars: [] };
  }
}

async function main() {
  const adminPasswordHash = await bcrypt.hash("Admin123!", 10);
  const editorPasswordHash = await bcrypt.hash("Editor123!", 10);

  const adminUser = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {
      passwordHash: adminPasswordHash,
      role: "admin",
      name: "Admin",
      isActive: true,
    },
    create: {
      email: "admin@example.com",
      passwordHash: adminPasswordHash,
      role: "admin",
      name: "Admin",
      isActive: true,
    },
  });

  const editorUser = await prisma.user.upsert({
    where: { email: "editor@example.com" },
    update: {
      passwordHash: editorPasswordHash,
      role: "editor",
      name: "Editor",
      isActive: true,
    },
    create: {
      email: "editor@example.com",
      passwordHash: editorPasswordHash,
      role: "editor",
      name: "Editor",
      isActive: true,
    },
  });

  const data = await getCampaigns();
  const fallbackCampaigns = [
    {
      slug: "united-campaign",
      title: "Єдинозбір",
      shortDesc:
        "Купуємо дрони-перехоплювачі Шахедів та комплектуємо екіпажі операторів необхідним обладнанням",
      content:
        "Купуємо дрони-перехоплювачі Шахедів та комплектуємо екіпажі операторів необхідним обладнанням",
      monoJarId: "jar_united_campaign_001",
      monoJarUrl: "https://send.monobank.ua/jar/3w8JTb7xhE",
      goalAmount: 1000000000,
      raisedAmount: 507808531,
      currency: "UAH",
      status: "active",
      isFeatured: true,
      publishedAt: new Date(),
    },
    {
      slug: "sky-rusoriz",
      title: "Небесний Русоріз",
      shortDesc:
        "Допомагаємо захистити наше небо від російських розвідувальних і ударних БПЛА.",
      content:
        "«Небесний Русоріз» — це проєкт зі знищення російських розвідувальних і ударних БПЛА та посилення контролю над українським небом.",
      monoJarId: "jar_sky_rusoriz_002",
      monoJarUrl: "https://send.monobank.ua/jar/8tHJx8TrSs",
      goalAmount: 10000000,
      raisedAmount: 6988764,
      currency: "UAH",
      status: "active",
      isFeatured: false,
      publishedAt: new Date(),
    },
  ];

  const liveCampaigns = data.jars.map(toCampaignFromJar);
  const campaignsToSeed = liveCampaigns.length ? liveCampaigns : fallbackCampaigns;

  for (const campaign of campaignsToSeed) {
    await prisma.campaign.upsert({
      where: { slug: campaign.slug },
      update: {
        title: campaign.title,
        shortDesc: campaign.shortDesc,
        content: campaign.content,
        monoJarId: campaign.monoJarId,
        monoJarUrl: campaign.monoJarUrl,
        goalAmount: campaign.goalAmount,
        raisedAmount: campaign.raisedAmount,
        currency: campaign.currency,
        status: campaign.status,
        isFeatured: campaign.isFeatured,
        publishedAt: campaign.publishedAt,
      },
      create: campaign,
    });
  }

  await prisma.post.upsert({
    where: { slug: "spring-report-brief" },
    update: {
      title: "Весняний дайджест фонду",
      excerpt: "Ключові результати програм за весну.",
      content: "Огляд гуманітарних та освітніх ініціатив.",
      status: "published",
      publishedAt: new Date(),
      authorId: adminUser.id,
      updatedById: adminUser.id,
      deletedAt: null,
    },
    create: {
      slug: "spring-report-brief",
      title: "Весняний дайджест фонду",
      excerpt: "Ключові результати програм за весну.",
      content: "Огляд гуманітарних та освітніх ініціатив.",
      status: "published",
      publishedAt: new Date(),
      authorId: adminUser.id,
      updatedById: adminUser.id,
    },
  });

  await prisma.post.upsert({
    where: { slug: "editor-draft-initiative" },
    update: {
      title: "План волонтерської ініціативи",
      excerpt: "Чернетка матеріалу від редактора.",
      content: "Поточна чернетка: опис майбутньої ініціативи.",
      status: "draft",
      publishedAt: null,
      authorId: editorUser.id,
      updatedById: editorUser.id,
      deletedAt: null,
    },
    create: {
      slug: "editor-draft-initiative",
      title: "План волонтерської ініціативи",
      excerpt: "Чернетка матеріалу від редактора.",
      content: "Поточна чернетка: опис майбутньої ініціативи.",
      status: "draft",
      publishedAt: null,
      authorId: editorUser.id,
      updatedById: editorUser.id,
    },
  });

  await prisma.post.upsert({
    where: { slug: "editor-review-story" },
    update: {
      title: "Історія волонтера",
      excerpt: "Матеріал очікує перевірки адміністратором.",
      content: "Текст допису про шлях волонтера та результати допомоги.",
      status: "review",
      publishedAt: null,
      authorId: editorUser.id,
      updatedById: editorUser.id,
      deletedAt: null,
    },
    create: {
      slug: "editor-review-story",
      title: "Історія волонтера",
      excerpt: "Матеріал очікує перевірки адміністратором.",
      content: "Текст допису про шлях волонтера та результати допомоги.",
      status: "review",
      publishedAt: null,
      authorId: editorUser.id,
      updatedById: editorUser.id,
    },
  });

  await prisma.partner.createMany({
    data: [
      { name: "Kyiv Aid Hub", type: "ngo", isActive: true, sortOrder: 1 },
      { name: "Nova Logistics", type: "corporate", isActive: true, sortOrder: 2 },
    ],
    skipDuplicates: true,
  });

  await prisma.faq.createMany({
    data: [
      {
        question: "Як зробити внесок?",
        answer: "Натисніть кнопку Підтримати і перейдіть у Monobank jar.",
        sortOrder: 1,
      },
      {
        question: "Чи публікуєте ви звіти?",
        answer: "Так, регулярні звіти публікуємо у розділі Звіти.",
        sortOrder: 2,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.case.createMany({
    data: [
      {
        slug: "generator-help-irpin",
        title: "Допомога родинам в Ірпені",
        summary: "Передали 40 генераторів у громаду.",
        content: "Протягом двох тижнів команда передала генератори та провела інструктаж.",
        beneficiaryName: "Громада Ірпеня",
        location: "Ірпінь",
        resultText: "40 родин отримали стабільне живлення.",
        status: "published",
        publishedAt: new Date(),
      },
    ],
    skipDuplicates: true,
  });

  await prisma.report.createMany({
    data: [
      {
        slug: "report-q1-2026",
        title: "Звіт за I квартал 2026",
        summary: "Надходження, витрати, реалізовані ініціативи.",
        periodStart: new Date("2026-01-01T00:00:00.000Z"),
        periodEnd: new Date("2026-03-31T23:59:59.000Z"),
        totalIn: 1200000,
        totalOut: 1090000,
        pdfUrl: "https://example.org/reports/q1-2026.pdf",
        status: "published",
        publishedAt: new Date(),
      },
    ],
    skipDuplicates: true,
  });

  await prisma.activity.createMany({
    data: [
      { value: "34 800+", label: "Людей отримали допомогу", sortOrder: 1, isActive: true },
      { value: "1 250", label: "Активних волонтерів", sortOrder: 2, isActive: true },
      { value: "76", label: "Реалізованих ініціатив", sortOrder: 3, isActive: true },
      { value: "24", label: "Партнерські організації", sortOrder: 4, isActive: true },
    ],
    skipDuplicates: true,
  });

  await prisma.helpOption.createMany({
    data: [
      {
        title: "Волонтерство",
        description: "Приєднуйтесь до команди на подіях, фасуванні допомоги або в координації виїздів.",
        ctaText: "Записатися",
        requestType: "volunteer",
        sortOrder: 1,
        isActive: true,
      },
      {
        title: "Фінансова підтримка",
        description: "Разовий або щомісячний донат допомагає нам планувати програми на місяці вперед.",
        ctaText: "Підтримати",
        requestType: "financial_support",
        sortOrder: 2,
        isActive: true,
      },
      {
        title: "Партнерство",
        description: "Ми відкриті до співпраці з бізнесом, освітніми закладами та громадами.",
        ctaText: "Обговорити",
        requestType: "partnership",
        sortOrder: 3,
        isActive: true,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.review.createMany({
    data: [
      {
        name: "Наталія",
        role: "volunteer",
        text: "Вперше відчула, що можу реально впливати. Команда дуже підтримує, все чітко організовано.",
      },
      {
        name: "Олена",
        role: "participant",
        text: "Завдяки програмі для підлітків наш син визначився з напрямом навчання й отримав ментора.",
      },
      {
        name: "Андрій",
        role: "partner",
        text: "Співпраця прозора: бачимо звітність, результати і реальний вплив у громадах.",
      },
    ],
    skipDuplicates: true,
  });

  const actorAdmin = await prisma.commentActorSession.upsert({
    where: { actorId: "actor_seed_admin" },
    update: {
      displayName: "Dmytro",
      email: "dmytro@example.com",
      verifiedAt: new Date(),
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    },
    create: {
      actorId: "actor_seed_admin",
      displayName: "Dmytro",
      email: "dmytro@example.com",
      verifiedAt: new Date(),
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    },
  });

  const actorGuest = await prisma.commentActorSession.upsert({
    where: { actorId: "actor_seed_guest" },
    update: {
      displayName: "Катерина",
      email: "kateryna@example.com",
      verifiedAt: new Date(),
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    },
    create: {
      actorId: "actor_seed_guest",
      displayName: "Катерина",
      email: "kateryna@example.com",
      verifiedAt: new Date(),
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    },
  });

  const topComment = await prisma.comment.upsert({
    where: { id: 1 },
    update: {
      authorName: actorAdmin.displayName,
      authorEmail: actorAdmin.email,
      actorId: actorAdmin.actorId,
      content: "Дякую команді за прозорі звіти та регулярні оновлення.",
      mediaUrl: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExN2xla2x0a2xkM2dud2NjYnlpd2I4a2M5aDJkd2U5NWxqNm1tdzV2eCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3o7aD2saalBwwftBIY/giphy.gif",
      mediaType: "gif",
      parentId: null,
      depth: 0,
      isDeleted: false,
    },
    create: {
      id: 1,
      authorName: actorAdmin.displayName,
      authorEmail: actorAdmin.email,
      actorId: actorAdmin.actorId,
      content: "Дякую команді за прозорі звіти та регулярні оновлення.",
      mediaUrl: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExN2xla2x0a2xkM2dud2NjYnlpd2I4a2M5aDJkd2U5NWxqNm1tdzV2eCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3o7aD2saalBwwftBIY/giphy.gif",
      mediaType: "gif",
      parentId: null,
      depth: 0,
    },
  });

  const replyComment = await prisma.comment.upsert({
    where: { id: 2 },
    update: {
      authorName: actorGuest.displayName,
      authorEmail: actorGuest.email,
      actorId: actorGuest.actorId,
      content: "Погоджуюсь. Особливо сподобалась програма підтримки родин.",
      mediaUrl: "https://images.unsplash.com/photo-1469571486292-b53601020f56?auto=format&fit=crop&w=1200&q=80",
      mediaType: "image",
      parentId: topComment.id,
      depth: 1,
      isDeleted: false,
    },
    create: {
      id: 2,
      authorName: actorGuest.displayName,
      authorEmail: actorGuest.email,
      actorId: actorGuest.actorId,
      content: "Погоджуюсь. Особливо сподобалась програма підтримки родин.",
      mediaUrl: "https://images.unsplash.com/photo-1469571486292-b53601020f56?auto=format&fit=crop&w=1200&q=80",
      mediaType: "image",
      parentId: topComment.id,
      depth: 1,
    },
  });

  await prisma.commentReaction.upsert({
    where: {
      commentId_actorId: { commentId: topComment.id, actorId: actorGuest.actorId },
    },
    update: { reaction: "heart" },
    create: {
      commentId: topComment.id,
      actorId: actorGuest.actorId,
      reaction: "heart",
    },
  });

  await prisma.commentReaction.upsert({
    where: {
      commentId_actorId: { commentId: replyComment.id, actorId: actorAdmin.actorId },
    },
    update: { reaction: "question" },
    create: {
      commentId: replyComment.id,
      actorId: actorAdmin.actorId,
      reaction: "question",
    },
  });

  await prisma.siteSetting.upsert({
    where: { key: "contacts" },
    update: {
      valueJson: {
        email: "hello@futurefoundation.org",
        phone: "+380670000000",
        address: "Lutsk, Lvivska 75",
      },
    },
    create: {
      key: "contacts",
      valueJson: {
        email: "hello@futurefoundation.org",
        phone: "+380670000000",
        address: "Lutsk, Lvivska 75",
      },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed finished");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
