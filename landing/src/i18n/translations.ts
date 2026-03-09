export interface Translation {
  common: {
    docs: string;
    github: string;
    releases: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    downloadButton: string;
    selectBinary: string;
  };
  signals: string[];
  proof: {
    providerAgnostic: string;
    fullyExtensible: string;
    openSource: string;
  };
  features: {
    useAnyModel: {
      title: string;
      body: string;
    };
    buildExtensions: {
      title: string;
      body: string;
    };
    ownSetup: {
      title: string;
      body: string;
    };
  };
  downloadOptions: {
    macAppleSilicon: {
      label: string;
      detail: string;
    };
    macIntel: {
      label: string;
      detail: string;
    };
    windows: {
      label: string;
      detail: string;
    };
    linux: {
      label: string;
      detail: string;
    };
  };
  sections: {
    providers: {
      eyebrow: string;
      title: string;
      description: string;
    };
    extensions: {
      eyebrow: string;
      title: string;
      description: string;
      customTools: {
        title: string;
        description: string;
      };
      teamAutomation: {
        title: string;
        description: string;
      };
      developerExperience: {
        title: string;
        description: string;
      };
      exploreSDK: string;
    };
    bottomCTA: {
      eyebrow: string;
      title: string;
      description: string;
      downloadButton: string;
      exploreGitHub: string;
    };
  };
}

const translations: Record<string, Translation> = {
  en: {
    common: {
      docs: "Docs",
      github: "GitHub",
      releases: "Releases",
    },
    hero: {
      eyebrow: "The desktop AI workspace built for teams that value freedom",
      title: "Ship faster with AI. On your own terms.",
      subtitle:
        "Chatons is the professional desktop workspace where you choose your AI provider, build custom extensions, and maintain complete control. Stop being locked into proprietary platforms. Start building the workspace your team actually needs.",
      downloadButton: "Download for",
      selectBinary: "Select another binary",
    },
    signals: [
      "Work with every major AI provider—no vendor lock-in, unlimited flexibility",
      "Automate your workflow with built-in tools, projects, and custom extensions",
      "Desktop-first design that respects your privacy, data, and independence",
    ],
    proof: {
      providerAgnostic: "Provider Agnostic",
      fullyExtensible: "Fully Extensible",
      openSource: "Open Source",
    },
    features: {
      useAnyModel: {
        title: "Use Any AI Model",
        body: "ChatGPT, Claude, GitHub Copilot, Llama, or your own API. Switch providers instantly without losing context or workspace continuity. Never be trapped by a single vendor.",
      },
      buildExtensions: {
        title: "Build Custom Extensions",
        body: "Create powerful integrations, custom tools, and team automations. Extend Chatons into a workspace uniquely suited to how your team actually works.",
      },
      ownSetup: {
        title: "Own Your Setup",
        body: "100% open source, inspect every line, run locally or in the cloud. Keep your API keys private, your data secure, and complete control over your AI infrastructure.",
      },
    },
    downloadOptions: {
      macAppleSilicon: {
        label: "macOS (Apple Silicon)",
        detail: "Best for M1, M2, M3 and newer Macs",
      },
      macIntel: {
        label: "macOS (Intel)",
        detail: "Best for Intel-based Macs",
      },
      windows: {
        label: "Windows",
        detail: "Installer for Windows 10 and 11",
      },
      linux: {
        label: "Linux",
        detail: "Portable desktop build for Linux",
      },
    },
    sections: {
      providers: {
        eyebrow: "No Vendor Lock-In",
        title: "Use Every AI Provider",
        description:
          "ChatGPT one day, Claude the next. GitHub Copilot at work, local models at home. Your workspace adapts to your choices, not the other way around. Complete freedom. Zero lock-in.",
      },
      extensions: {
        eyebrow: "Limitless Extensibility",
        title: "Tailor It to Your Team",
        description:
          "Generic tools don't cut it. Build custom extensions and automations that match your exact workflow. Chatons is a foundation for the workspace only your team could dream up.",
        customTools: {
          title: "Custom Tools & Scripts",
          description:
            "Write tools once, use them everywhere. Integrate with your APIs, databases, or internal systems. Your team's superpowers in one workspace.",
        },
        teamAutomation: {
          title: "Team Automation",
          description:
            "Build workflows that let your team focus on what matters. Reduce repetitive tasks, enforce standards, and ship consistent quality.",
        },
        developerExperience: {
          title: "Developer Experience",
          description:
            "Full SDK and comprehensive docs. Build complex extensions or simple scripts. Chatons scales from quick wins to enterprise solutions.",
        },
        exploreSDK: "Explore the extension SDK",
      },
      bottomCTA: {
        eyebrow: "Get Started",
        title: "The workspace your team deserves",
        description:
          "Choose your AI. Build your tools. Own your setup. Chatons gives you the freedom to work your way, without compromise.",
        downloadButton: "Download for",
        exploreGitHub: "Explore on GitHub",
      },
    },
  },

  es: {
    common: {
      docs: "Documentos",
      github: "GitHub",
      releases: "Lanzamientos",
    },
    hero: {
      eyebrow: "El espacio de trabajo de IA de escritorio construido para equipos que valoran la libertad",
      title: "Envía más rápido con IA. En tus propios términos.",
      subtitle:
        "Chatons es el espacio de trabajo profesional de escritorio donde eliges tu proveedor de IA, construyes extensiones personalizadas y mantienes control total. Deja de estar atrapado en plataformas propietarias. Comienza a construir el espacio de trabajo que tu equipo realmente necesita.",
      downloadButton: "Descargar para",
      selectBinary: "Seleccionar otro binario",
    },
    signals: [
      "Trabaja con todos los principales proveedores de IA—sin bloqueo de proveedor, flexibilidad ilimitada",
      "Automatiza tu flujo de trabajo con herramientas integradas, proyectos y extensiones personalizadas",
      "Diseño de escritorio que respeta tu privacidad, datos e independencia",
    ],
    proof: {
      providerAgnostic: "Agnóstico de Proveedor",
      fullyExtensible: "Totalmente Extensible",
      openSource: "Código Abierto",
    },
    features: {
      useAnyModel: {
        title: "Usa Cualquier Modelo de IA",
        body: "ChatGPT, Claude, GitHub Copilot, Llama, o tu propia API. Cambia de proveedor instantáneamente sin perder contexto ni continuidad del espacio de trabajo. Nunca quedes atrapado por un solo proveedor.",
      },
      buildExtensions: {
        title: "Construye Extensiones Personalizadas",
        body: "Crea integraciones poderosas, herramientas personalizadas y automatizaciones de equipo. Extiende Chatons a un espacio de trabajo adaptado únicamente a cómo trabaja realmente tu equipo.",
      },
      ownSetup: {
        title: "Posee Tu Configuración",
        body: "100% código abierto, inspecciona cada línea, ejecuta localmente o en la nube. Mantén tus claves de API privadas, tus datos seguros, y control total sobre tu infraestructura de IA.",
      },
    },
    downloadOptions: {
      macAppleSilicon: {
        label: "macOS (Apple Silicon)",
        detail: "Mejor para M1, M2, M3 y Macs más nuevos",
      },
      macIntel: {
        label: "macOS (Intel)",
        detail: "Mejor para Macs basados en Intel",
      },
      windows: {
        label: "Windows",
        detail: "Instalador para Windows 10 y 11",
      },
      linux: {
        label: "Linux",
        detail: "Compilación portátil de escritorio para Linux",
      },
    },
    sections: {
      providers: {
        eyebrow: "Sin Bloqueo de Proveedor",
        title: "Usa Todos los Proveedores de IA",
        description:
          "ChatGPT un día, Claude el siguiente. GitHub Copilot en el trabajo, modelos locales en casa. Tu espacio de trabajo se adapta a tus elecciones, no al revés. Total libertad. Cero bloqueo.",
      },
      extensions: {
        eyebrow: "Extensibilidad Ilimitada",
        title: "Personalízalo para Tu Equipo",
        description:
          "Las herramientas genéricas no funcionan. Construye extensiones personalizadas y automatizaciones que coincidan con tu flujo de trabajo exacto. Chatons es una base para el espacio de trabajo que solo tu equipo podría soñar.",
        customTools: {
          title: "Herramientas y Scripts Personalizados",
          description:
            "Escribe herramientas una vez, úsalas en todas partes. Integra con tus APIs, bases de datos o sistemas internos. Los superpoderes de tu equipo en un espacio de trabajo.",
        },
        teamAutomation: {
          title: "Automatización de Equipo",
          description:
            "Construye flujos de trabajo que permitan a tu equipo enfocarse en lo que importa. Reduce tareas repetitivas, cumple estándares y envía calidad consistente.",
        },
        developerExperience: {
          title: "Experiencia del Desarrollador",
          description:
            "SDK completo y documentación exhaustiva. Construye extensiones complejas o scripts simples. Chatons escala desde victorias rápidas hasta soluciones empresariales.",
        },
        exploreSDK: "Explora el SDK de extensiones",
      },
      bottomCTA: {
        eyebrow: "Empezar",
        title: "El espacio de trabajo que tu equipo merece",
        description:
          "Elige tu IA. Construye tus herramientas. Posee tu configuración. Chatons te da la libertad de trabajar a tu manera, sin compromisos.",
        downloadButton: "Descargar para",
        exploreGitHub: "Explora en GitHub",
      },
    },
  },

  fr: {
    common: {
      docs: "Documentation",
      github: "GitHub",
      releases: "Versions",
    },
    hero: {
      eyebrow: "L'espace de travail IA de bureau conçu pour les équipes qui valorisent la liberté",
      title: "Livrez plus vite avec l'IA. À vos conditions.",
      subtitle:
        "Chatons est l'espace de travail professionnel de bureau où vous choisissez votre fournisseur d'IA, créez des extensions personnalisées et maintenez un contrôle total. Arrêtez d'être piégé par des plateformes propriétaires. Commencez à construire l'espace de travail que votre équipe a vraiment besoin.",
      downloadButton: "Télécharger pour",
      selectBinary: "Sélectionner un autre binaire",
    },
    signals: [
      "Travaillez avec tous les grands fournisseurs d'IA—sans verrouillage fournisseur, flexibilité illimitée",
      "Automatisez votre flux de travail avec des outils intégrés, des projets et des extensions personnalisées",
      "Conception de bureau qui respecte votre confidentialité, vos données et votre indépendance",
    ],
    proof: {
      providerAgnostic: "Indépendant du Fournisseur",
      fullyExtensible: "Entièrement Extensible",
      openSource: "Code Ouvert",
    },
    features: {
      useAnyModel: {
        title: "Utilisez N'importe Quel Modèle d'IA",
        body: "ChatGPT, Claude, GitHub Copilot, Llama, ou votre propre API. Changez de fournisseur instantanément sans perdre le contexte ou la continuité de l'espace de travail. Ne soyez jamais piégé par un seul fournisseur.",
      },
      buildExtensions: {
        title: "Construisez des Extensions Personnalisées",
        body: "Créez des intégrations puissantes, des outils personnalisés et des automations d'équipe. Étendez Chatons à un espace de travail uniquement adapté à votre façon de travailler.",
      },
      ownSetup: {
        title: "Possédez Votre Configuration",
        body: "100% code ouvert, inspectez chaque ligne, exécutez localement ou dans le cloud. Gardez vos clés API privées, vos données sécurisées et le contrôle total de votre infrastructure IA.",
      },
    },
    downloadOptions: {
      macAppleSilicon: {
        label: "macOS (Apple Silicon)",
        detail: "Meilleur pour M1, M2, M3 et Macs plus récents",
      },
      macIntel: {
        label: "macOS (Intel)",
        detail: "Meilleur pour Macs basés sur Intel",
      },
      windows: {
        label: "Windows",
        detail: "Installateur pour Windows 10 et 11",
      },
      linux: {
        label: "Linux",
        detail: "Compilation de bureau portable pour Linux",
      },
    },
    sections: {
      providers: {
        eyebrow: "Pas de Verrouillage Fournisseur",
        title: "Utilisez Tous les Fournisseurs d'IA",
        description:
          "ChatGPT un jour, Claude le suivant. GitHub Copilot au travail, modèles locaux à la maison. Votre espace de travail s'adapte à vos choix, pas l'inverse. Liberté totale. Zéro verrouillage.",
      },
      extensions: {
        eyebrow: "Extensibilité Illimitée",
        title: "Personnalisez-le pour Votre Équipe",
        description:
          "Les outils génériques ne suffisent pas. Construisez des extensions personnalisées et des automations qui correspondent à votre flux de travail exact. Chatons est une base pour l'espace de travail que seule votre équipe pourrait imaginer.",
        customTools: {
          title: "Outils et Scripts Personnalisés",
          description:
            "Écrivez des outils une fois, utilisez-les partout. Intégrez vos API, bases de données ou systèmes internes. Les superpouvoirs de votre équipe en un espace de travail.",
        },
        teamAutomation: {
          title: "Automatisation d'Équipe",
          description:
            "Construisez des flux de travail qui permettent à votre équipe de se concentrer sur ce qui compte. Réduisez les tâches répétitives, respectez les normes et livrez une qualité cohérente.",
        },
        developerExperience: {
          title: "Expérience Développeur",
          description:
            "SDK complet et documentation complète. Construisez des extensions complexes ou des scripts simples. Chatons s'adapte des victoires rapides aux solutions d'entreprise.",
        },
        exploreSDK: "Explorez le SDK des extensions",
      },
      bottomCTA: {
        eyebrow: "Commencez",
        title: "L'espace de travail que votre équipe mérite",
        description:
          "Choisissez votre IA. Construisez vos outils. Possédez votre configuration. Chatons vous donne la liberté de travailler à votre manière, sans compromis.",
        downloadButton: "Télécharger pour",
        exploreGitHub: "Explorez sur GitHub",
      },
    },
  },

  de: {
    common: {
      docs: "Dokumentation",
      github: "GitHub",
      releases: "Versionen",
    },
    hero: {
      eyebrow: "Der Desktop-KI-Arbeitsbereich für Teams, die Freiheit schätzen",
      title: "Schneller versenden mit KI. Zu deinen Bedingungen.",
      subtitle:
        "Chatons ist der professionelle Desktop-Arbeitsbereich, in dem du deinen KI-Anbieter wählst, benutzerdefinierte Erweiterungen erstellst und die vollständige Kontrolle behältst. Höre auf, in proprietäre Plattformen eingezwängt zu sein. Beginne, den Arbeitsbereich zu bauen, den dein Team wirklich braucht.",
      downloadButton: "Herunterladen für",
      selectBinary: "Andere Binärdatei wählen",
    },
    signals: [
      "Arbeite mit jedem großen KI-Anbieter—ohne Anbieter-Lock-in, unbegrenzte Flexibilität",
      "Automatisiere deinen Workflow mit integrierten Tools, Projekten und benutzerdefinierten Erweiterungen",
      "Desktop-Design, das deine Datenschutz, Daten und Unabhängigkeit respektiert",
    ],
    proof: {
      providerAgnostic: "Anbieter-Unabhängig",
      fullyExtensible: "Vollständig Erweiterbar",
      openSource: "Open Source",
    },
    features: {
      useAnyModel: {
        title: "Verwende jedes KI-Modell",
        body: "ChatGPT, Claude, GitHub Copilot, Llama oder deine eigene API. Wechsle sofort zwischen Anbietern, ohne den Kontext oder die Arbeitsbereich-Kontinuität zu verlieren. Werde niemals von einem einzigen Anbieter gefangen.",
      },
      buildExtensions: {
        title: "Erstelle benutzerdefinierte Erweiterungen",
        body: "Erstelle leistungsstarke Integrationen, benutzerdefinierte Tools und Team-Automatisierungen. Erweitere Chatons zu einem einzigartig angepassten Arbeitsbereich für dein Team.",
      },
      ownSetup: {
        title: "Besitze dein Setup",
        body: "100% Open Source, inspiziere jede Zeile, führe lokal aus oder in der Cloud. Halte deine API-Schlüssel privat, deine Daten sicher und habe volle Kontrolle über deine KI-Infrastruktur.",
      },
    },
    downloadOptions: {
      macAppleSilicon: {
        label: "macOS (Apple Silicon)",
        detail: "Beste für M1, M2, M3 und neuere Macs",
      },
      macIntel: {
        label: "macOS (Intel)",
        detail: "Beste für Intel-basierte Macs",
      },
      windows: {
        label: "Windows",
        detail: "Installer für Windows 10 und 11",
      },
      linux: {
        label: "Linux",
        detail: "Tragbarer Desktop-Build für Linux",
      },
    },
    sections: {
      providers: {
        eyebrow: "Kein Anbieter-Lock-in",
        title: "Verwende jeden KI-Anbieter",
        description:
          "ChatGPT an einem Tag, Claude am nächsten. GitHub Copilot bei der Arbeit, lokale Modelle zu Hause. Dein Arbeitsbereich passt sich deinen Entscheidungen an, nicht umgekehrt. Vollständige Freiheit. Null Lock-in.",
      },
      extensions: {
        eyebrow: "Unbegrenzte Erweiterbarkeit",
        title: "Passe es deinem Team an",
        description:
          "Generische Tools reichen nicht aus. Baue benutzerdefinierte Erweiterungen und Automatisierungen, die zu deinem genauen Workflow passen. Chatons ist eine Grundlage für den Arbeitsbereich, den sich nur dein Team vorstellen kann.",
        customTools: {
          title: "Benutzerdefinierte Tools & Skripte",
          description:
            "Schreibe Tools einmal, verwende sie überall. Integriere deine APIs, Datenbanken oder interne Systeme. Die Superkräfte deines Teams in einem Arbeitsbereich.",
        },
        teamAutomation: {
          title: "Team-Automatisierung",
          description:
            "Erstelle Workflows, die dein Team auf das konzentrieren lassen, was zählt. Reduziere wiederholte Aufgaben, setze Standards durch und liefere konsistente Qualität.",
        },
        developerExperience: {
          title: "Entwicklererfahrung",
          description:
            "Vollständiges SDK und umfassende Dokumentation. Erstelle komplexe Erweiterungen oder einfache Skripte. Chatons skaliert von schnellen Erfolgen zu Enterprise-Lösungen.",
        },
        exploreSDK: "Erkunde das Erweiterungs-SDK",
      },
      bottomCTA: {
        eyebrow: "Erste Schritte",
        title: "Der Arbeitsbereich, den dein Team verdient",
        description:
          "Wähle deine KI. Baue deine Tools. Besitze dein Setup. Chatons gibt dir die Freiheit, so zu arbeiten, wie es dir passt, ohne Kompromisse.",
        downloadButton: "Herunterladen für",
        exploreGitHub: "Auf GitHub erkunden",
      },
    },
  },

  ja: {
    common: {
      docs: "ドキュメント",
      github: "GitHub",
      releases: "リリース",
    },
    hero: {
      eyebrow: "自由を大切にするチーム向けに構築されたデスクトップAIワークスペース",
      title: "AIでより速く配信。自分たちのやり方で。",
      subtitle:
        "Chatonsは、AIプロバイダーを選択し、カスタム拡張機能を構築し、完全なコントロールを維持できるプロフェッショナルなデスクトップワークスペースです。プロプライエタリなプラットフォームに固定されるのをやめてください。チームが本当に必要なワークスペースを構築し始めてください。",
      downloadButton: "ダウンロード",
      selectBinary: "別のバイナリを選択",
    },
    signals: [
      "すべての主要なAIプロバイダーで作業—ベンダーロックインなし、無制限の柔軟性",
      "組み込みツール、プロジェクト、カスタム拡張機能でワークフローを自動化",
      "プライバシー、データ、独立性を尊重するデスクトップファースト設計",
    ],
    proof: {
      providerAgnostic: "プロバイダー非依存",
      fullyExtensible: "完全に拡張可能",
      openSource: "オープンソース",
    },
    features: {
      useAnyModel: {
        title: "任意のAIモデルを使用",
        body: "ChatGPT、Claude、GitHub Copilot、Llama、または独自のAPI。コンテキストやワークスペースの継続性を失うことなく、即座にプロバイダーを切り替えます。単一のプロバイダーに閉じ込められることはありません。",
      },
      buildExtensions: {
        title: "カスタム拡張機能を構築",
        body: "強力な統合、カスタムツール、チーム自動化を作成します。Chatonsをチームの実際の作業方法に合わせたワークスペースに拡張します。",
      },
      ownSetup: {
        title: "セットアップを所有",
        body: "100%オープンソース、すべてのコードを検査、ローカルまたはクラウドで実行。APIキーをプライベート、データを安全に、AI インフラストラクチャを完全にコントロールします。",
      },
    },
    downloadOptions: {
      macAppleSilicon: {
        label: "macOS (Apple Silicon)",
        detail: "M1、M2、M3以降のMacに最適",
      },
      macIntel: {
        label: "macOS (Intel)",
        detail: "Intelベースのマックに最適",
      },
      windows: {
        label: "Windows",
        detail: "Windows 10および11用インストーラー",
      },
      linux: {
        label: "Linux",
        detail: "Linux用ポータブルデスクトップビルド",
      },
    },
    sections: {
      providers: {
        eyebrow: "ベンダーロックインなし",
        title: "すべてのAIプロバイダーを使用",
        description:
          "ある日はChatGPT、次の日はClaude。仕事ではGitHub Copilot、家ではローカルモデル。ワークスペースは逆ではなく、あなたの選択に適応します。完全な自由。ロックインなし。",
      },
      extensions: {
        eyebrow: "無限の拡張性",
        title: "チーム向けにカスタマイズ",
        description:
          "汎用ツールでは不十分です。正確なワークフローに合わせたカスタム拡張機能と自動化を構築します。Chatonsはチームだけが想像できるワークスペースの基盤です。",
        customTools: {
          title: "カスタムツール&スクリプト",
          description:
            "ツールを一度書いて、どこでも使用します。API、データベース、または内部システムと統合します。チームのスーパーパワーが1つのワークスペースにあります。",
        },
        teamAutomation: {
          title: "チーム自動化",
          description:
            "チームが重要なことに焦点を合わせることができるワークフローを構築します。反復的なタスクを減らし、標準を適用し、一貫した品質を提供します。",
        },
        developerExperience: {
          title: "開発者体験",
          description:
            "完全なSDKと包括的なドキュメント。複雑な拡張機能またはシンプルなスクリプトを構築します。Chatonsは小さな勝利からエンタープライズソリューションまでスケール可能です。",
        },
        exploreSDK: "拡張SDKを探索",
      },
      bottomCTA: {
        eyebrow: "開始する",
        title: "チームが値するワークスペース",
        description:
          "AIを選択します。ツールを構築します。セットアップを所有します。Chatonsは妥協なく、自分たちのやり方で作業する自由をもたらします。",
        downloadButton: "ダウンロード",
        exploreGitHub: "GitHubで探索",
      },
    },
  },

  zh: {
    common: {
      docs: "文档",
      github: "GitHub",
      releases: "版本",
    },
    hero: {
      eyebrow: "为重视自由的团队打造的桌面AI工作空间",
      title: "用AI更快地交付。按照你的方式。",
      subtitle:
        "Chatons是一个专业的桌面工作空间，在这里你可以选择你的AI提供商、构建自定义扩展并保持完全控制。停止被专有平台束缚。开始构建你的团队真正需要的工作空间。",
      downloadButton: "下载适用于",
      selectBinary: "选择另一个二进制文件",
    },
    signals: [
      "与所有主要AI提供商合作—无供应商锁定，无限灵活性",
      "使用内置工具、项目和自定义扩展自动化你的工作流",
      "尊重你的隐私、数据和独立性的桌面优先设计",
    ],
    proof: {
      providerAgnostic: "供应商无关",
      fullyExtensible: "完全可扩展",
      openSource: "开源",
    },
    features: {
      useAnyModel: {
        title: "使用任何AI模型",
        body: "ChatGPT、Claude、GitHub Copilot、Llama或你自己的API。立即切换提供商，不会丢失上下文或工作空间连续性。永远不会被单个供应商困住。",
      },
      buildExtensions: {
        title: "构建自定义扩展",
        body: "创建强大的集成、自定义工具和团队自动化。将Chatons扩展为适合你的团队实际工作方式的工作空间。",
      },
      ownSetup: {
        title: "拥有你的设置",
        body: "100%开源，检查每一行，在本地或云中运行。保持你的API密钥私密、数据安全，对你的AI基础设施完全控制。",
      },
    },
    downloadOptions: {
      macAppleSilicon: {
        label: "macOS (Apple Silicon)",
        detail: "最适合M1、M2、M3和更新的Mac",
      },
      macIntel: {
        label: "macOS (Intel)",
        detail: "最适合基于Intel的Mac",
      },
      windows: {
        label: "Windows",
        detail: "Windows 10和11安装程序",
      },
      linux: {
        label: "Linux",
        detail: "Linux便携式桌面版本",
      },
    },
    sections: {
      providers: {
        eyebrow: "无供应商锁定",
        title: "使用每个AI提供商",
        description:
          "一天ChatGPT，下一天Claude。工作中GitHub Copilot，家里本地模型。你的工作空间适应你的选择，而不是相反。完全自由。零锁定。",
      },
      extensions: {
        eyebrow: "无限可扩展性",
        title: "为你的团队定制",
        description:
          "通用工具是不够的。构建自定义扩展和自动化，以匹配你的确切工作流。Chatons是只有你的团队才能梦想的工作空间的基础。",
        customTools: {
          title: "自定义工具和脚本",
          description:
            "编写一次工具，随处使用。与你的API、数据库或内部系统集成。你的团队超能力在一个工作空间中。",
        },
        teamAutomation: {
          title: "团队自动化",
          description:
            "构建让你的团队专注于重要事项的工作流。减少重复任务、执行标准并提供一致质量。",
        },
        developerExperience: {
          title: "开发者体验",
          description:
            "完整的SDK和全面的文档。构建复杂的扩展或简单的脚本。Chatons从快速胜利到企业解决方案。",
        },
        exploreSDK: "探索扩展SDK",
      },
      bottomCTA: {
        eyebrow: "开始使用",
        title: "你的团队应得的工作空间",
        description:
          "选择你的AI。构建你的工具。拥有你的设置。Chatons给你按照自己的方式工作的自由，无需妥协。",
        downloadButton: "下载适用于",
        exploreGitHub: "在GitHub上探索",
      },
    },
  },

  it: {
    common: {
      docs: "Documentazione",
      github: "GitHub",
      releases: "Versioni",
    },
    hero: {
      eyebrow: "Lo spazio di lavoro AI desktop costruito per i team che valorizzano la libertà",
      title: "Spedisci più veloce con l'IA. Alle tue condizioni.",
      subtitle:
        "Chatons è lo spazio di lavoro desktop professionale dove scegli il tuo provider AI, costruisci estensioni personalizzate e mantieni il controllo completo. Smetti di essere intrappolato in piattaforme proprietarie. Inizia a costruire lo spazio di lavoro che il tuo team ha davvero bisogno.",
      downloadButton: "Scarica per",
      selectBinary: "Seleziona un altro binario",
    },
    signals: [
      "Lavora con ogni major provider di IA—nessun vendor lock-in, flessibilità illimitata",
      "Automatizza il tuo flusso di lavoro con strumenti integrati, progetti e estensioni personalizzate",
      "Design desktop-first che rispetta la tua privacy, i dati e l'indipendenza",
    ],
    proof: {
      providerAgnostic: "Provider Agnostico",
      fullyExtensible: "Completamente Estensibile",
      openSource: "Open Source",
    },
    features: {
      useAnyModel: {
        title: "Usa Qualsiasi Modello AI",
        body: "ChatGPT, Claude, GitHub Copilot, Llama, o il tuo API. Cambia provider istantaneamente senza perdere il contesto o la continuità dello spazio di lavoro. Non resta mai intrappolato da un unico provider.",
      },
      buildExtensions: {
        title: "Costruisci Estensioni Personalizzate",
        body: "Crea integrazioni potenti, strumenti personalizzati e automazioni di team. Estendi Chatons a uno spazio di lavoro adatto esattamente a come lavora il tuo team.",
      },
      ownSetup: {
        title: "Possiedi il Tuo Setup",
        body: "100% open source, ispeziona ogni riga, esegui localmente o nel cloud. Mantieni le tue chiavi API private, i tuoi dati sicuri e il controllo completo sulla tua infrastruttura AI.",
      },
    },
    downloadOptions: {
      macAppleSilicon: {
        label: "macOS (Apple Silicon)",
        detail: "Migliore per M1, M2, M3 e Mac più recenti",
      },
      macIntel: {
        label: "macOS (Intel)",
        detail: "Migliore per Mac basati su Intel",
      },
      windows: {
        label: "Windows",
        detail: "Programma di installazione per Windows 10 e 11",
      },
      linux: {
        label: "Linux",
        detail: "Build desktop portatile per Linux",
      },
    },
    sections: {
      providers: {
        eyebrow: "Nessun Vendor Lock-In",
        title: "Usa Ogni Provider AI",
        description:
          "ChatGPT un giorno, Claude il prossimo. GitHub Copilot al lavoro, modelli locali a casa. Il tuo spazio di lavoro si adatta alle tue scelte, non il contrario. Libertà totale. Zero lock-in.",
      },
      extensions: {
        eyebrow: "Estensibilità Illimitata",
        title: "Personalizzalo per il Tuo Team",
        description:
          "Gli strumenti generici non bastano. Costruisci estensioni personalizzate e automazioni che corrispondono al tuo esatto flusso di lavoro. Chatons è una base per lo spazio di lavoro che solo il tuo team potrebbe sognare.",
        customTools: {
          title: "Strumenti e Script Personalizzati",
          description:
            "Scrivi strumenti una volta, usali ovunque. Integra con le tue API, database o sistemi interni. I superpoteri del tuo team in uno spazio di lavoro.",
        },
        teamAutomation: {
          title: "Automazione del Team",
          description:
            "Costruisci flussi di lavoro che consentono al tuo team di concentrarsi su ciò che importa. Riduci i compiti ripetitivi, applica standard e fornisci qualità coerente.",
        },
        developerExperience: {
          title: "Esperienza dello Sviluppatore",
          description:
            "SDK completo e documentazione completa. Costruisci estensioni complesse o script semplici. Chatons si adatta da successi rapidi a soluzioni enterprise.",
        },
        exploreSDK: "Esplora l'SDK delle estensioni",
      },
      bottomCTA: {
        eyebrow: "Inizia",
        title: "Lo spazio di lavoro che il tuo team merita",
        description:
          "Scegli la tua IA. Costruisci i tuoi strumenti. Possiedi il tuo setup. Chatons ti dà la libertà di lavorare a modo tuo, senza compromessi.",
        downloadButton: "Scarica per",
        exploreGitHub: "Esplora su GitHub",
      },
    },
  },

  pt: {
    common: {
      docs: "Documentação",
      github: "GitHub",
      releases: "Versões",
    },
    hero: {
      eyebrow: "O espaço de trabalho AI de desktop construído para equipes que valorizam a liberdade",
      title: "Entregue mais rápido com IA. Nos seus termos.",
      subtitle:
        "Chatons é o espaço de trabalho desktop profissional onde você escolhe seu provedor de IA, constrói extensões personalizadas e mantém controle total. Pare de ser preso em plataformas proprietárias. Comece a construir o espaço de trabalho que sua equipe realmente precisa.",
      downloadButton: "Baixar para",
      selectBinary: "Selecionar outro binário",
    },
    signals: [
      "Trabalhe com todos os principais provedores de IA—sem lock-in de fornecedor, flexibilidade ilimitada",
      "Automatize seu fluxo de trabalho com ferramentas integradas, projetos e extensões personalizadas",
      "Design desktop-first que respeita sua privacidade, dados e independência",
    ],
    proof: {
      providerAgnostic: "Agnóstico do Provedor",
      fullyExtensible: "Totalmente Extensível",
      openSource: "Código Aberto",
    },
    features: {
      useAnyModel: {
        title: "Use Qualquer Modelo de IA",
        body: "ChatGPT, Claude, GitHub Copilot, Llama, ou sua própria API. Mude de provedor instantaneamente sem perder o contexto ou a continuidade do espaço de trabalho. Nunca fique preso por um único provedor.",
      },
      buildExtensions: {
        title: "Construa Extensões Personalizadas",
        body: "Crie integrações poderosas, ferramentas personalizadas e automações de equipe. Estenda Chatons para um espaço de trabalho adaptado apenas a como sua equipe trabalha.",
      },
      ownSetup: {
        title: "Possua Sua Configuração",
        body: "100% código aberto, inspecione cada linha, execute localmente ou na nuvem. Mantenha suas chaves de API privadas, seus dados seguros e controle total sobre sua infraestrutura de IA.",
      },
    },
    downloadOptions: {
      macAppleSilicon: {
        label: "macOS (Apple Silicon)",
        detail: "Melhor para M1, M2, M3 e Macs mais novos",
      },
      macIntel: {
        label: "macOS (Intel)",
        detail: "Melhor para Macs baseados em Intel",
      },
      windows: {
        label: "Windows",
        detail: "Instalador para Windows 10 e 11",
      },
      linux: {
        label: "Linux",
        detail: "Compilação de desktop portátil para Linux",
      },
    },
    sections: {
      providers: {
        eyebrow: "Sem Lock-in de Fornecedor",
        title: "Use Todos os Provedores de IA",
        description:
          "ChatGPT um dia, Claude o próximo. GitHub Copilot no trabalho, modelos locais em casa. Seu espaço de trabalho se adapta às suas escolhas, não o contrário. Liberdade total. Zero lock-in.",
      },
      extensions: {
        eyebrow: "Extensibilidade Ilimitada",
        title: "Personalize para Sua Equipe",
        description:
          "Ferramentas genéricas não funcionam. Construa extensões personalizadas e automações que correspondam ao seu fluxo de trabalho exato. Chatons é uma base para o espaço de trabalho que apenas sua equipe poderia imaginar.",
        customTools: {
          title: "Ferramentas e Scripts Personalizados",
          description:
            "Escreva ferramentas uma vez, use-as em qualquer lugar. Integre com suas APIs, bancos de dados ou sistemas internos. Os superpoderes da sua equipe em um espaço de trabalho.",
        },
        teamAutomation: {
          title: "Automação de Equipe",
          description:
            "Construa fluxos de trabalho que permitem que sua equipe se concentre no que importa. Reduza tarefas repetitivas, aplique padrões e entregue qualidade consistente.",
        },
        developerExperience: {
          title: "Experiência do Desenvolvedor",
          description:
            "SDK completo e documentação abrangente. Construa extensões complexas ou scripts simples. Chatons escala de vitórias rápidas para soluções corporativas.",
        },
        exploreSDK: "Explore o SDK de Extensões",
      },
      bottomCTA: {
        eyebrow: "Comece",
        title: "O espaço de trabalho que sua equipe merece",
        description:
          "Escolha sua IA. Construa suas ferramentas. Possua sua configuração. Chatons lhe dá a liberdade de trabalhar do seu jeito, sem compromissos.",
        downloadButton: "Baixar para",
        exploreGitHub: "Explore no GitHub",
      },
    },
  },

  ru: {
    common: {
      docs: "Документация",
      github: "GitHub",
      releases: "Релизы",
    },
    hero: {
      eyebrow: "Рабочее пространство AI для рабочего стола, созданное для команд, ценящих свободу",
      title: "Поставляйте быстрее с помощью ИИ. На своих условиях.",
      subtitle:
        "Chatons — это профессиональное рабочее пространство рабочего стола, где вы выбираете своего поставщика ИИ, создаёте пользовательские расширения и сохраняете полный контроль. Перестаньте быть заблокированными на собственных платформах. Начните строить рабочее пространство, которое действительно нужна вашей команде.",
      downloadButton: "Скачать для",
      selectBinary: "Выбрать другой бинарный файл",
    },
    signals: [
      "Работайте со всеми крупными поставщиками ИИ—без привязки к поставщику, неограниченная гибкость",
      "Автоматизируйте свой рабочий процесс с помощью встроенных инструментов, проектов и пользовательских расширений",
      "Дизайн, ориентированный на рабочий стол, который уважает вашу конфиденциальность, данные и независимость",
    ],
    proof: {
      providerAgnostic: "Независимый от поставщика",
      fullyExtensible: "Полностью расширяемый",
      openSource: "Открытый исходный код",
    },
    features: {
      useAnyModel: {
        title: "Используйте любую модель ИИ",
        body: "ChatGPT, Claude, GitHub Copilot, Llama или ваш собственный API. Мгновенно переключайтесь между поставщиками, не теряя контекста или непрерывности рабочего пространства. Никогда не будьте заперты одним поставщиком.",
      },
      buildExtensions: {
        title: "Создавайте пользовательские расширения",
        body: "Создавайте мощные интеграции, пользовательские инструменты и автоматизацию команды. Расширьте Chatons в рабочее пространство, адаптированное к тому, как работает ваша команда.",
      },
      ownSetup: {
        title: "Владейте своей установкой",
        body: "100% открытый исходный код, проверьте каждую строку, запустите локально или в облаке. Держите свои ключи API в приватности, ваши данные в безопасности и полный контроль над вашей ИИ-инфраструктурой.",
      },
    },
    downloadOptions: {
      macAppleSilicon: {
        label: "macOS (Apple Silicon)",
        detail: "Лучше всего для M1, M2, M3 и новых Mac",
      },
      macIntel: {
        label: "macOS (Intel)",
        detail: "Лучше всего для Mac на основе Intel",
      },
      windows: {
        label: "Windows",
        detail: "Установщик для Windows 10 и 11",
      },
      linux: {
        label: "Linux",
        detail: "Портативная сборка рабочего стола для Linux",
      },
    },
    sections: {
      providers: {
        eyebrow: "Без привязки к поставщику",
        title: "Используйте всех поставщиков ИИ",
        description:
          "ChatGPT в один день, Claude в следующий. GitHub Copilot на работе, локальные модели дома. Ваше рабочее пространство адаптируется к вашему выбору, а не наоборот. Полная свобода. Нулевая привязка.",
      },
      extensions: {
        eyebrow: "Безограниченная расширяемость",
        title: "Настройте для вашей команды",
        description:
          "Универсальные инструменты недостаточны. Создавайте пользовательские расширения и автоматизацию, соответствующие вашему точному рабочему процессу. Chatons — это основа для рабочего пространства, которое может создать только ваша команда.",
        customTools: {
          title: "Пользовательские инструменты и сценарии",
          description:
            "Напишите инструменты один раз, используйте везде. Интегрируйтесь с вашими API, базами данных или внутренними системами. Суперсилы вашей команды в одном рабочем пространстве.",
        },
        teamAutomation: {
          title: "Автоматизация команды",
          description:
            "Создавайте рабочие процессы, которые позволяют вашей команде сосредоточиться на том, что важно. Сократите повторяющиеся задачи, применяйте стандарты и доставляйте согласованное качество.",
        },
        developerExperience: {
          title: "Опыт разработчика",
          description:
            "Полный SDK и полная документация. Создавайте сложные расширения или простые сценарии. Chatons масштабируется от быстрых побед до корпоративных решений.",
        },
        exploreSDK: "Изучите SDK расширений",
      },
      bottomCTA: {
        eyebrow: "Начните",
        title: "Рабочее пространство, которого заслуживает ваша команда",
        description:
          "Выберите свой ИИ. Создавайте свои инструменты. Владейте своей установкой. Chatons дает вам свободу работать по-своему, без компромиссов.",
        downloadButton: "Скачать для",
        exploreGitHub: "Изучите на GitHub",
      },
    },
  },

  ko: {
    common: {
      docs: "문서",
      github: "GitHub",
      releases: "릴리스",
    },
    hero: {
      eyebrow: "자유를 소중히 여기는 팀을 위해 만든 데스크톱 AI 작업 공간",
      title: "AI로 더 빠르게 배포하세요. 당신의 방식대로.",
      subtitle:
        "Chatons은 AI 제공자를 선택하고, 사용자 정의 확장을 구축하고, 완전한 제어를 유지할 수 있는 전문적인 데스크톱 작업 공간입니다. 독점 플랫폼에 갇히는 것을 멈추세요. 팀이 정말 필요한 작업 공간을 구축하기 시작하세요.",
      downloadButton: "다운로드",
      selectBinary: "다른 바이너리 선택",
    },
    signals: [
      "모든 주요 AI 제공자와 작업—공급업체 잠금 없음, 무제한 유연성",
      "기본 제공 도구, 프로젝트 및 사용자 정의 확장으로 워크플로우 자동화",
      "개인 정보, 데이터 및 독립성을 존중하는 데스크톱 우선 설계",
    ],
    proof: {
      providerAgnostic: "공급자 독립적",
      fullyExtensible: "완전히 확장 가능",
      openSource: "오픈 소스",
    },
    features: {
      useAnyModel: {
        title: "모든 AI 모델 사용",
        body: "ChatGPT, Claude, GitHub Copilot, Llama 또는 자신의 API. 컨텍스트나 작업 공간 연속성을 잃지 않고 즉시 제공자를 전환하세요. 단일 공급자에게 갇히지 마세요.",
      },
      buildExtensions: {
        title: "사용자 정의 확장 구축",
        body: "강력한 통합, 사용자 정의 도구 및 팀 자동화를 만드세요. Chatons을 팀의 실제 작업 방식에 맞춘 작업 공간으로 확장하세요.",
      },
      ownSetup: {
        title: "설정 소유",
        body: "100% 오픈 소스, 모든 라인 검사, 로컬 또는 클라우드에서 실행. API 키를 비공개로, 데이터를 안전하게, AI 인프라를 완전히 제어하세요.",
      },
    },
    downloadOptions: {
      macAppleSilicon: {
        label: "macOS (Apple Silicon)",
        detail: "M1, M2, M3 및 최신 Mac에 최고",
      },
      macIntel: {
        label: "macOS (Intel)",
        detail: "Intel 기반 Mac에 최고",
      },
      windows: {
        label: "Windows",
        detail: "Windows 10 및 11용 설치 프로그램",
      },
      linux: {
        label: "Linux",
        detail: "Linux용 휴대용 데스크톱 빌드",
      },
    },
    sections: {
      providers: {
        eyebrow: "공급자 잠금 없음",
        title: "모든 AI 제공자 사용",
        description:
          "한 날은 ChatGPT, 다음 날은 Claude. 직장에서는 GitHub Copilot, 집에서는 로컬 모델. 작업 공간이 반대 방향이 아닌 선택에 맞게 조정됩니다. 완전한 자유. 0 잠금.",
      },
      extensions: {
        eyebrow: "무한 확장성",
        title: "팀에 맞게 맞춤화",
        description:
          "일반 도구는 충분하지 않습니다. 정확한 워크플로우와 일치하는 사용자 정의 확장 및 자동화를 구축하세요. Chatons은 팀만이 꿈꿀 수 있는 작업 공간의 기초입니다.",
        customTools: {
          title: "사용자 정의 도구 및 스크립트",
          description:
            "도구를 한 번 작성하고 어디서나 사용하세요. API, 데이터베이스 또는 내부 시스템과 통합하세요. 팀의 슈퍼파워가 한 작업 공간에 있습니다.",
        },
        teamAutomation: {
          title: "팀 자동화",
          description:
            "팀이 중요한 것에 집중할 수 있는 워크플로우를 구축하세요. 반복적인 작업을 줄이고, 표준을 적용하고, 일관된 품질을 제공하세요.",
        },
        developerExperience: {
          title: "개발자 경험",
          description:
            "완전한 SDK 및 포괄적인 문서. 복잡한 확장 또는 간단한 스크립트를 구축하세요. Chatons은 빠른 승리부터 엔터프라이즈 솔루션까지 확장됩니다.",
        },
        exploreSDK: "확장 SDK 탐색",
      },
      bottomCTA: {
        eyebrow: "시작하기",
        title: "팀이 마땅히 받을 작업 공간",
        description:
          "AI를 선택하세요. 도구를 구축하세요. 설정을 소유하세요. Chatons은 타협 없이 당신의 방식대로 일할 자유를 제공합니다.",
        downloadButton: "다운로드",
        exploreGitHub: "GitHub에서 탐색",
      },
    },
  },

  pl: {
    common: {
      docs: "Dokumentacja",
      github: "GitHub",
      releases: "Wydania",
    },
    hero: {
      eyebrow: "Pulpit do pracy z AI zbudowany dla zespołów ceniących wolność",
      title: "Dostarczaj szybciej dzięki AI. Na swoich warunkach.",
      subtitle:
        "Chatons to profesjonalny pulpit pracy, w którym wybierasz dostawcę AI, budujesz niestandardowe rozszerzenia i zachowujesz pełną kontrolę. Przestań być uwięziony na zastrzeżonych platformach. Zacznij budować pulpit, którego naprawdę potrzebuje Twój zespół.",
      downloadButton: "Pobierz dla",
      selectBinary: "Wybierz inny plik binarny",
    },
    signals: [
      "Pracuj ze wszystkimi głównymi dostawcami AI—bez blokady dostawcy, nieograniczona elastyczność",
      "Zautomatyzuj swój przepływ pracy za pomocą wbudowanych narzędzi, projektów i niestandardowych rozszerzeń",
      "Projekt skoncentrowany na pulpicie, który szanuje Twoją prywatność, dane i niezależność",
    ],
    proof: {
      providerAgnostic: "Agnostyk dostawcy",
      fullyExtensible: "W pełni rozszerzalny",
      openSource: "Otwarte źródło",
    },
    features: {
      useAnyModel: {
        title: "Używaj dowolnego modelu AI",
        body: "ChatGPT, Claude, GitHub Copilot, Llama lub Twoje własne API. Natychmiast przełączaj dostawców bez utraty kontekstu lub ciągłości pulpitu. Nigdy nie utkniesz u jednego dostawcy.",
      },
      buildExtensions: {
        title: "Buduj niestandardowe rozszerzenia",
        body: "Twórz potężne integracje, niestandardowe narzędzia i automatyzację zespołu. Rozszerz Chatons na pulpit dostosowany dokładnie do sposobu pracy Twojego zespołu.",
      },
      ownSetup: {
        title: "Posiadaj swoją konfigurację",
        body: "100% otwarte źródło, sprawdzaj każdą linię, uruchamiaj lokalnie lub w chmurze. Zachowaj swoje klucze API w prywatności, dane w bezpieczeństwie i pełną kontrolę nad infrastrukturą AI.",
      },
    },
    downloadOptions: {
      macAppleSilicon: {
        label: "macOS (Apple Silicon)",
        detail: "Najlepsze dla M1, M2, M3 i nowszych Maców",
      },
      macIntel: {
        label: "macOS (Intel)",
        detail: "Najlepsze dla Maców opartych na Intel",
      },
      windows: {
        label: "Windows",
        detail: "Instalator dla Windows 10 i 11",
      },
      linux: {
        label: "Linux",
        detail: "Przenośna kompilacja pulpitu dla Linuksa",
      },
    },
    sections: {
      providers: {
        eyebrow: "Brak blokady dostawcy",
        title: "Używaj każdego dostawcę AI",
        description:
          "ChatGPT pewnego dnia, Claude następnego dnia. GitHub Copilot w pracy, modele lokalne w domu. Twój pulpit dostosowuje się do Twoich wyborów, a nie odwrotnie. Pełna wolność. Brak blokady.",
      },
      extensions: {
        eyebrow: "Nieograniczona rozszerzalność",
        title: "Dostosuj do swojego zespołu",
        description:
          "Ogólne narzędzia to za mało. Buduj niestandardowe rozszerzenia i automatyzację dopasowane do Twojego dokładnego przepływu pracy. Chatons to podstawa pulpitu, który może wymyślić tylko Twój zespół.",
        customTools: {
          title: "Niestandardowe narzędzia i skrypty",
          description:
            "Napisz narzędzia raz, używaj ich wszędzie. Integruj się ze swoimi interfejsami API, bazami danych lub systemami wewnętrznymi. Supermocce Twojego zespołu w jednym pulpicie.",
        },
        teamAutomation: {
          title: "Automatyzacja zespołu",
          description:
            "Buduj przepływy pracy, które pozwalają Twojemu zespołowi skupić się na tym, co ważne. Zmniejsz powtarzające się zadania, egzekwuj standardy i dostarczaj konsekwentną jakość.",
        },
        developerExperience: {
          title: "Doświadczenie programisty",
          description:
            "Pełny SDK i kompleksowa dokumentacja. Buduj złożone rozszerzenia lub proste skrypty. Chatons skaluje się od szybkich zwycięstw do rozwiązań dla przedsiębiorstw.",
        },
        exploreSDK: "Przeglądaj SDK rozszerzeń",
      },
      bottomCTA: {
        eyebrow: "Zacznij",
        title: "Pulpit, który zasługuje twój zespół",
        description:
          "Wybierz swoją AI. Buduj swoje narzędzia. Posiadaj swoją konfigurację. Chatons daje Ci wolność pracy na swoich warunkach, bez kompromisów.",
        downloadButton: "Pobierz dla",
        exploreGitHub: "Przeglądaj na GitHub",
      },
    },
  },

  nl: {
    common: {
      docs: "Documentatie",
      github: "GitHub",
      releases: "Releases",
    },
    hero: {
      eyebrow: "De desktop AI-werkruimte gebouwd voor teams die vrijheid waarderen",
      title: "Lever sneller op met AI. Op jouw voorwaarden.",
      subtitle:
        "Chatons is de professionele desktop-werkruimte waar je je AI-provider kiest, aangepaste extensies bouwt en volledige controle behoudt. Stop met vastzitten in propriëtaire platforms. Begin de werkruimte te bouwen die je team echt nodig heeft.",
      downloadButton: "Download voor",
      selectBinary: "Ander binair bestand selecteren",
    },
    signals: [
      "Werk met alle grote AI-providers—geen vendor lock-in, onbeperkte flexibiliteit",
      "Automatiseer je workflow met ingebouwde tools, projecten en aangepaste extensies",
      "Desktop-first ontwerp dat je privacy, gegevens en onafhankelijkheid respecteert",
    ],
    proof: {
      providerAgnostic: "Provider Agnostisch",
      fullyExtensible: "Volledig Uitbreidbaar",
      openSource: "Open Source",
    },
    features: {
      useAnyModel: {
        title: "Gebruik elk AI-model",
        body: "ChatGPT, Claude, GitHub Copilot, Llama, of je eigen API. Wissel instant van provider zonder context of werkruimte continuïteit te verliezen. Zit nooit vast aan één provider.",
      },
      buildExtensions: {
        title: "Bouw aangepaste extensies",
        body: "Maak krachtige integraties, aangepaste tools en team-automatiseringen. Breid Chatons uit naar een werkruimte die perfect past bij hoe je team echt werkt.",
      },
      ownSetup: {
        title: "Bezit je setup",
        body: "100% open source, inspecteer elke regel, voer lokaal of in de cloud uit. Houd je API-sleutels privé, je gegevens veilig en heb volledige controle over je AI-infrastructuur.",
      },
    },
    downloadOptions: {
      macAppleSilicon: {
        label: "macOS (Apple Silicon)",
        detail: "Beste voor M1, M2, M3 en nieuwere Macs",
      },
      macIntel: {
        label: "macOS (Intel)",
        detail: "Beste voor Intel-gebaseerde Macs",
      },
      windows: {
        label: "Windows",
        detail: "Installatieprogramma voor Windows 10 en 11",
      },
      linux: {
        label: "Linux",
        detail: "Draagbare desktop-build voor Linux",
      },
    },
    sections: {
      providers: {
        eyebrow: "Geen Vendor Lock-in",
        title: "Gebruik elke AI-provider",
        description:
          "ChatGPT de ene dag, Claude de volgende. GitHub Copilot op het werk, lokale modellen thuis. Je werkruimte past zich aan je keuzes aan, niet andersom. Volledige vrijheid. Nul lock-in.",
      },
      extensions: {
        eyebrow: "Onbeperkte Uitbreidbaarheid",
        title: "Pas het aan voor je team",
        description:
          "Generieke tools zijn niet voldoende. Bouw aangepaste extensies en automatisering die passen bij je exacte workflow. Chatons is een basis voor de werkruimte die alleen je team kan dromen.",
        customTools: {
          title: "Aangepaste tools en scripts",
          description:
            "Schrijf tools eenmaal, gebruik ze overal. Integreer met je API's, databases of interne systemen. De superkrachten van je team in één werkruimte.",
        },
        teamAutomation: {
          title: "Team-automatisering",
          description:
            "Bouw workflows die je team zich kunnen concentreren op wat telt. Reduceer repetitieve taken, handhaf normen en lever consistente kwaliteit.",
        },
        developerExperience: {
          title: "Ontwikkelaarvaring",
          description:
            "Volledige SDK en uitgebreide documentatie. Bouw complexe extensies of eenvoudige scripts. Chatons schaalt van snelle wins tot enterprise-oplossingen.",
        },
        exploreSDK: "Verken Extension SDK",
      },
      bottomCTA: {
        eyebrow: "Aan de slag",
        title: "De werkruimte die je team verdient",
        description:
          "Kies je AI. Bouw je tools. Bezit je setup. Chatons geeft je de vrijheid om op jouw manier te werken, zonder compromissen.",
        downloadButton: "Download voor",
        exploreGitHub: "Verken op GitHub",
      },
    },
  },

  sv: {
    common: {
      docs: "Dokumentation",
      github: "GitHub",
      releases: "Versioner",
    },
    hero: {
      eyebrow: "Skrivbordets AI-arbetsyta byggd för team som värderar frihet",
      title: "Leverera snabbare med AI. På dina villkor.",
      subtitle:
        "Chatons är den professionella skrivbordsarbetsytan där du väljer din AI-leverantör, bygger anpassade tillägg och behåller full kontroll. Sluta vara instängd i proprietära plattformar. Börja bygga arbetsytan som ditt team verkligen behöver.",
      downloadButton: "Ladda ner för",
      selectBinary: "Välj annan binär",
    },
    signals: [
      "Arbeta med alla stora AI-leverantörer—ingen leverantörbindning, obegränsad flexibilitet",
      "Automatisera ditt arbetsflöde med inbyggda verktyg, projekt och anpassade tillägg",
      "Skrivbordsdesign som respekterar din integritet, data och oberoende",
    ],
    proof: {
      providerAgnostic: "Leverantöroberoende",
      fullyExtensible: "Helt utökbar",
      openSource: "Öppen källkod",
    },
    features: {
      useAnyModel: {
        title: "Använd vilken AI-modell som helst",
        body: "ChatGPT, Claude, GitHub Copilot, Llama eller ditt eget API. Byt leverantör omedelbar utan att förlora kontexten eller arbetsytans kontinuitet. Bli aldrig fastlåst av en enda leverantör.",
      },
      buildExtensions: {
        title: "Bygg anpassade tillägg",
        body: "Skapa kraftfulla integrationer, anpassade verktyg och teamautomation. Utöka Chatons till en arbetsyta perfekt anpassad för hur ditt team faktiskt arbetar.",
      },
      ownSetup: {
        title: "Äga din konfiguration",
        body: "100% öppen källkod, inspektera varje rad, kör lokalt eller i molnet. Håll dina API-nycklar privata, dina data säkra och fullständig kontroll över din AI-infrastruktur.",
      },
    },
    downloadOptions: {
      macAppleSilicon: {
        label: "macOS (Apple Silicon)",
        detail: "Bäst för M1, M2, M3 och nyare Macs",
      },
      macIntel: {
        label: "macOS (Intel)",
        detail: "Bäst för Intel-baserade Macs",
      },
      windows: {
        label: "Windows",
        detail: "Installationsprogram för Windows 10 och 11",
      },
      linux: {
        label: "Linux",
        detail: "Portabel skrivbordsbygge för Linux",
      },
    },
    sections: {
      providers: {
        eyebrow: "Ingen leverantörbindning",
        title: "Använd varje AI-leverantör",
        description:
          "ChatGPT en dag, Claude nästa dag. GitHub Copilot på jobbet, lokala modeller hemma. Din arbetsyta anpassas till dina val, inte tvärtom. Fullständig frihet. Noll bindning.",
      },
      extensions: {
        eyebrow: "Obegränsad utökbarhet",
        title: "Anpassa för ditt team",
        description:
          "Generiska verktyg räcker inte. Bygg anpassade tillägg och automationer som matchar ditt exakta arbetsflöde. Chatons är grunden för arbetsytan som bara ditt team kan drömma om.",
        customTools: {
          title: "Anpassade verktyg och skript",
          description:
            "Skriv verktyg en gång, använd dem överallt. Integrera med dina API:er, databaser eller interna system. Ditt teams superkrafter i en arbetsyta.",
        },
        teamAutomation: {
          title: "Teamautomation",
          description:
            "Bygg arbetsflöden som låter ditt team fokusera på vad som spelar roll. Minska repetitiva uppgifter, tillämpa standarder och leverera konsekvent kvalitet.",
        },
        developerExperience: {
          title: "Utvecklarupplevelse",
          description:
            "Fullständig SDK och omfattande dokumentation. Bygg komplexa tillägg eller enkla skript. Chatons skaleras från snabba segrar till enterprise-lösningar.",
        },
        exploreSDK: "Utforska Extensions SDK",
      },
      bottomCTA: {
        eyebrow: "Kom igång",
        title: "Arbetsytan som ditt team förtjänar",
        description:
          "Välj din AI. Bygg dina verktyg. Äga din konfiguration. Chatons ger dig friheten att arbeta på ditt sätt, utan kompromisser.",
        downloadButton: "Ladda ner för",
        exploreGitHub: "Utforska på GitHub",
      },
    },
  },

  tr: {
    common: {
      docs: "Belgeler",
      github: "GitHub",
      releases: "Sürümler",
    },
    hero: {
      eyebrow: "Özgürlüğü değer veren takımlar için inşa edilen masaüstü AI çalışma alanı",
      title: "AI ile daha hızlı teslimat edin. Kendi şartlarınızda.",
      subtitle:
        "Chatons, AI sağlayıcınızı seçtiğiniz, özel uzantılar oluşturduğunuz ve tam kontrol sağladığınız profesyonel masaüstü çalışma alanıdır. Tescilli platformlarda sıkışıp kalmayı bırakın. Ekibinizin gerçekten ihtiyaç duyduğu çalışma alanını inşa etmeye başlayın.",
      downloadButton: "İndir",
      selectBinary: "Başka bir ikili dosya seç",
    },
    signals: [
      "Tüm büyük AI sağlayıcılarıyla çalışın—satıcı kilitlenmesi yok, sınırsız esneklik",
      "Yerleşik araçlar, projeler ve özel uzantılarla iş akışınızı otomatikleştirin",
      "Gizliliğinize, verilerinize ve bağımsızlığınıza saygı duyan masaüstü öncelikli tasarım",
    ],
    proof: {
      providerAgnostic: "Sağlayıcı Agnostik",
      fullyExtensible: "Tamamen Genişletilebilir",
      openSource: "Açık Kaynak",
    },
    features: {
      useAnyModel: {
        title: "Herhangi bir AI modeli kullanın",
        body: "ChatGPT, Claude, GitHub Copilot, Llama veya kendi API'niz. Bağlam veya çalışma alanı sürekliliğini kaybetmeden anında sağlayıcıları değiştirin. Asla tek bir sağlayıcı tarafından sıkışıp kalmayın.",
      },
      buildExtensions: {
        title: "Özel uzantılar oluşturun",
        body: "Güçlü entegrasyonlar, özel araçlar ve takım otomasyonları oluşturun. Chatons'u takımınızın gerçekten nasıl çalıştığına uyarlanmış bir çalışma alanına genişletin.",
      },
      ownSetup: {
        title: "Kurulumunuzu sahiplenin",
        body: "% 100 açık kaynak, her satırı inceleyin, yerel olarak veya bulutta çalıştırın. API anahtarlarınızı gizli tutun, verilerinizi güvende tutun ve AI altyapınız üzerinde tam kontrol sahibi olun.",
      },
    },
    downloadOptions: {
      macAppleSilicon: {
        label: "macOS (Apple Silicon)",
        detail: "M1, M2, M3 ve daha yeni Maclar için en iyi",
      },
      macIntel: {
        label: "macOS (Intel)",
        detail: "Intel tabanlı Maclar için en iyi",
      },
      windows: {
        label: "Windows",
        detail: "Windows 10 ve 11 için yükleyici",
      },
      linux: {
        label: "Linux",
        detail: "Linux için taşınabilir masaüstü yapısı",
      },
    },
    sections: {
      providers: {
        eyebrow: "Satıcı Kilitlenmesi Yok",
        title: "Her AI sağlayıcısını kullanın",
        description:
          "Bir gün ChatGPT, ertesi gün Claude. İşte GitHub Copilot, evde yerel modeller. Çalışma alanınız ters değil, seçimlerinize uyum sağlar. Tam özgürlük. Sıfır kilit.",
      },
      extensions: {
        eyebrow: "Sınırsız Genişletilebilirlik",
        title: "Takımınız için özelleştirin",
        description:
          "Genel araçlar yeterli değildir. Tam iş akışınıza uyan özel uzantılar ve otomasyonlar oluşturun. Chatons, sadece takımınızın hayal edebileceği çalışma alanı için temeldir.",
        customTools: {
          title: "Özel araçlar ve komut dosyaları",
          description:
            "Araçları bir kez yazın, her yerde kullanın. API'leriniz, veritabanlarınız veya dahili sistemlerinizle entegre edin. Takımınızın süper güçleri tek bir çalışma alanında.",
        },
        teamAutomation: {
          title: "Takım otomasyonu",
          description:
            "Takımınızın önemli olana odaklanmasını sağlayan iş akışları oluşturun. Tekrarlayan görevleri azaltın, standartları uygulayın ve tutarlı kaliteyi sunun.",
        },
        developerExperience: {
          title: "Geliştirici deneyimi",
          description:
            "Tam SDK ve kapsamlı belgeler. Karmaşık uzantılar veya basit komut dosyaları oluşturun. Chatons, hızlı başarılardan kurumsal çözümlere kadar ölçeklenir.",
        },
        exploreSDK: "Uzantı SDK'sını keşfedin",
      },
      bottomCTA: {
        eyebrow: "Başla",
        title: "Ekibinizin hak ettiği çalışma alanı",
        description:
          "AI'nizi seçin. Araçlarınızı oluşturun. Kurulumunuzu sahiplenin. Chatons, hiçbir uzlaşma olmaksızın kendi yolunuzla çalışma özgürlüğü verir.",
        downloadButton: "İndir",
        exploreGitHub: "GitHub'da keşfet",
      },
    },
  },

  ar: {
    common: {
      docs: "الوثائق",
      github: "GitHub",
      releases: "الإصدارات",
    },
    hero: {
      eyebrow: "مساحة عمل الذكاء الاصطناعي سطح المكتب المصممة للفرق التي تقدر الحرية",
      title: "توصيل أسرع باستخدام الذكاء الاصطناعي. بشروطك الخاصة.",
      subtitle:
        "Chatons هي مساحة عمل سطح مكتب احترافية حيث تختار مزود الذكاء الاصطناعي الخاص بك وتبني ملحقات مخصصة والحفاظ على التحكم الكامل. توقف عن أن تكون محاصراً في المنصات الملكية. ابدأ بناء مساحة العمل التي يحتاجها فريقك حقاً.",
      downloadButton: "تحميل ل",
      selectBinary: "اختر ملف ثنائي آخر",
    },
    signals: [
      "العمل مع جميع موفري الذكاء الاصطناعي الرئيسيين—لا توجد قفل الموردين والمرونة غير المحدودة",
      "أتمتة سير عملك باستخدام الأدوات المدمجة والمشاريع والملحقات المخصصة",
      "تصميم أول سطح المكتب يحترم خصوصيتك وبياناتك واستقلاليتك",
    ],
    proof: {
      providerAgnostic: "وكيل المورد",
      fullyExtensible: "قابل للتمديد بالكامل",
      openSource: "مفتوح المصدر",
    },
    features: {
      useAnyModel: {
        title: "استخدم أي نموذج ذكاء اصطناعي",
        body: "ChatGPT أو Claude أو GitHub Copilot أو Llama أو API الخاص بك. قم بتبديل الموردين فوراً دون فقدان السياق أو الاستمرارية. لا تعلق أبداً بموردين واحد.",
      },
      buildExtensions: {
        title: "بناء ملحقات مخصصة",
        body: "إنشاء تكاملات قوية وأدوات مخصصة وأتمتة الفريق. توسيع Chatons إلى مساحة عمل تتناسب تماماً مع طريقة عمل فريقك.",
      },
      ownSetup: {
        title: "امتلك إعدادك",
        body: "100٪ مفتوح المصدر ، افحص كل سطر ، قم بتشغيل محلياً أو في السحابة. احتفظ بمفاتيح API الخاصة بك بشكل خاص وبيانات آمنة والتحكم الكامل بالبنية التحتية للذكاء الاصطناعي.",
      },
    },
    downloadOptions: {
      macAppleSilicon: {
        label: "macOS (Apple Silicon)",
        detail: "الأفضل ل M1 و M2 و M3 و Macs الأحدث",
      },
      macIntel: {
        label: "macOS (Intel)",
        detail: "الأفضل ل Macs القائمة على Intel",
      },
      windows: {
        label: "Windows",
        detail: "المثبت ل Windows 10 و 11",
      },
      linux: {
        label: "Linux",
        detail: "إنشاء سطح مكتب محمول ل Linux",
      },
    },
    sections: {
      providers: {
        eyebrow: "لا توجد قفل الموردين",
        title: "استخدم كل موفر ذكاء اصطناعي",
        description:
          "ChatGPT يوماً ، Claude في اليوم التالي. GitHub Copilot في العمل والنماذج المحلية في المنزل. تتكيف مساحة العمل الخاصة بك مع اختيارك وليس العكس. حرية كاملة. لا توجد أقفال.",
      },
      extensions: {
        eyebrow: "قابلية التوسع غير المحدودة",
        title: "خصص لفريقك",
        description:
          "الأدوات العامة غير كافية. قم ببناء ملحقات مخصصة وأتمتة تطابق سير عملك بالضبط. Chatons هو أساس مساحة العمل التي يمكن فقط لفريقك أن يحلم بها.",
        customTools: {
          title: "أدوات ونصوص مخصصة",
          description:
            "اكتب الأدوات مرة واحدة ، استخدمها في كل مكان. دمج مع واجهات API والبيانات أو الأنظمة الداخلية. قوى فريقك الخارقة في مساحة عمل واحدة.",
        },
        teamAutomation: {
          title: "أتمتة الفريق",
          description:
            "بناء سير العمل الذي يسمح لفريقك بالتركيز على ما يهم. تقليل المهام المتكررة وتطبيق المعايير وتقديم جودة ثابتة.",
        },
        developerExperience: {
          title: "تجربة المطور",
          description:
            "SDK كامل والوثائق الشاملة. بناء ملحقات معقدة أو نصوص بسيطة. Chatons المقاييس من الانتصارات السريعة إلى حلول المؤسسة.",
        },
        exploreSDK: "استكشف SDK الملحقات",
      },
      bottomCTA: {
        eyebrow: "ابدأ",
        title: "مساحة العمل التي يستحقها فريقك",
        description:
          "اختر ذكاء اصطناعك. بناء أدواتك. امتلك إعدادك. Chatons يمنحك حرية العمل بطريقتك دون المساس.",
        downloadButton: "تحميل ل",
        exploreGitHub: "استكشف على GitHub",
      },
    },
  },

  hi: {
    common: {
      docs: "दस्तावेज़",
      github: "GitHub",
      releases: "रिलीज़",
    },
    hero: {
      eyebrow: "डेस्कटॉप AI कार्यक्षेत्र स्वतंत्रता को महत्व देने वाली टीमों के लिए बनाया गया",
      title: "एआई के साथ तेजी से डिलीवर करें। आपकी शर्तों पर।",
      subtitle:
        "Chatons एक पेशेवर डेस्कटॉप कार्यक्षेत्र है जहां आप अपना एआई प्रदाता चुनते हैं, कस्टम एक्सटेंशन बनाते हैं और पूर्ण नियंत्रण बनाए रखते हैं। मालिकाना प्लेटफार्मों में फंसना बंद करें। अपनी टीम को वास्तव में आवश्यक कार्यक्षेत्र बनाना शुरू करें।",
      downloadButton: "के लिए डाउनलोड करें",
      selectBinary: "दूसरी बाइनरी का चयन करें",
    },
    signals: [
      "सभी प्रमुख एआई प्रदाताओं के साथ काम करें—कोई विक्रेता लॉक-इन नहीं, असीम लचीलापन",
      "बिल्ट-इन उपकरण, परियोजनाएं और कस्टम एक्सटेंशन के साथ अपने वर्कफ़्लो को स्वचालित करें",
      "डेस्कटॉप-प्रथम डिज़ाइन जो आपकी गोपनीयता, डेटा और स्वतंत्रता का सम्मान करता है",
    ],
    proof: {
      providerAgnostic: "प्रदाता अज्ञेयवादी",
      fullyExtensible: "पूरी तरह विस्तारित",
      openSource: "खुला स्रोत",
    },
    features: {
      useAnyModel: {
        title: "कोई भी एआई मॉडल का उपयोग करें",
        body: "ChatGPT, Claude, GitHub Copilot, Llama, या अपना एपीआई। संदर्भ या कार्यक्षेत्र निरंतरता खोए बिना तुरंत प्रदाताओं को स्विच करें। कभी एकल प्रदाता द्वारा फंसे रहें।",
      },
      buildExtensions: {
        title: "कस्टम एक्सटेंशन बनाएँ",
        body: "शक्तिशाली एकीकरण, कस्टम उपकरण और टीम ऑटोमेशन बनाएँ। Chatons को एक कार्यक्षेत्र में विस्तारित करें जो आपकी टीम के काम करने के तरीके के लिए सही है।",
      },
      ownSetup: {
        title: "अपना सेटअप स्वामित्व करें",
        body: "100% खुला स्रोत, प्रत्येक पंक्ति का निरीक्षण करें, स्थानीय रूप से या क्लाउड में चलाएं। अपनी एपीआई कुंजी को निजी रखें, अपना डेटा सुरक्षित रखें और अपने एआई बुनियादी ढांचे पर पूर्ण नियंत्रण रखें।",
      },
    },
    downloadOptions: {
      macAppleSilicon: {
        label: "macOS (Apple Silicon)",
        detail: "M1, M2, M3 और नए Macs के लिए सर्वश्रेष्ठ",
      },
      macIntel: {
        label: "macOS (Intel)",
        detail: "Intel-आधारित Macs के लिए सर्वश्रेष्ठ",
      },
      windows: {
        label: "Windows",
        detail: "Windows 10 और 11 के लिए इंस्टॉलर",
      },
      linux: {
        label: "Linux",
        detail: "Linux के लिए पोर्टेबल डेस्कटॉप बिल्ड",
      },
    },
    sections: {
      providers: {
        eyebrow: "कोई विक्रेता लॉक-इन नहीं",
        title: "प्रत्येक एआई प्रदाता का उपयोग करें",
        description:
          "एक दिन ChatGPT, अगला दिन Claude। काम पर GitHub Copilot, घर पर स्थानीय मॉडल। आपका कार्यक्षेत्र आपकी पसंद के अनुकूल है, विपरीत नहीं। पूर्ण स्वतंत्रता। शून्य लॉक-इन।",
      },
      extensions: {
        eyebrow: "असीम विस्तारशीलता",
        title: "अपनी टीम के लिए अनुकूलित करें",
        description:
          "सामान्य उपकरण पर्याप्त नहीं हैं। कस्टम एक्सटेंशन और स्वचालन बनाएं जो आपके सटीक वर्कफ़्लो से मेल खाते हैं। Chatons एक कार्यक्षेत्र के लिए आधार है जिसके बारे में केवल आपकी टीम ही सपना देख सकती है।",
        customTools: {
          title: "कस्टम उपकरण और स्क्रिप्ट्स",
          description:
            "एक बार उपकरण लिखें, हर जगह उपयोग करें। अपने एपीआई, डेटाबेस या आंतरिक सिस्टम के साथ एकीकृत करें। आपकी टीम की शक्तियां एक कार्यक्षेत्र में।",
        },
        teamAutomation: {
          title: "टीम स्वचालन",
          description:
            "ऐसी कार्यप्रवाह बनाएँ जो आपकी टीम को महत्वपूर्ण चीजों पर ध्यान केंद्रित करने दें। दोहराए जाने वाले कार्यों को कम करें, मानकों को लागू करें और सुसंगत गुणवत्ता प्रदान करें।",
        },
        developerExperience: {
          title: "डेवलपर अनुभव",
          description:
            "संपूर्ण SDK और व्यापक दस्तावेज़। जटिल एक्सटेंशन या साधारण स्क्रिप्ट बनाएँ। Chatons त्वरित जीत से लेकर एंटरप्राइज समाधान तक स्केल करता है।",
        },
        exploreSDK: "एक्सटेंशन SDK का अन्वेषण करें",
      },
      bottomCTA: {
        eyebrow: "शुरू करें",
        title: "कार्यक्षेत्र जो आपकी टीम के लायक है",
        description:
          "अपना एआई चुनें। अपने उपकरण बनाएं। अपके सेटअप का स्वामित्व लें। Chatons आपको बिना समझौते के अपने तरीके से काम करने की स्वतंत्रता देता है।",
        downloadButton: "के लिए डाउनलोड करें",
        exploreGitHub: "GitHub पर अन्वेषण करें",
      },
    },
  },
};

export function getTranslation(languageCode: string): Translation {
  return translations[languageCode] || translations.en;
}

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "ja", name: "日本語" },
  { code: "zh", name: "中文" },
  { code: "it", name: "Italiano" },
  { code: "pt", name: "Português" },
  { code: "ru", name: "Русский" },
  { code: "ko", name: "한국어" },
  { code: "pl", name: "Polski" },
  { code: "nl", name: "Nederlands" },
  { code: "sv", name: "Svenska" },
  { code: "tr", name: "Türkçe" },
  { code: "ar", name: "العربية" },
  { code: "hi", name: "हिंदी" },
] as const;

export type LanguageCode = typeof SUPPORTED_LANGUAGES[number]["code"];
