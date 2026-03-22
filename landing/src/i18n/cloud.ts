import type { LanguageCode } from "./translations";

type CloudCopy = {
  nav: {
    home: string;
    pricing: string;
    signUp: string;
    logIn: string;
  };
  shared: {
    authPanelEyebrow: string;
    authPanelTitle: string;
    authPanelBody: string;
    authPanelItems: [
      { title: string; body: string },
      { title: string; body: string },
      { title: string; body: string },
    ];
  };
  pricing: {
    eyebrow: string;
    title: string;
    subtitle: string;
    monthlyLabel: string;
    annualLabel: string;
    annualNote: string;
    primaryCta: string;
    secondaryCta: string;
    compareLabel: string;
    priceSuffix: string;
    includedLabel: string;
    includedItemsIntro: string;
    comparisonSubtitle: string;
    ctaTitle: string;
    ctaBody: string;
    ctaPrimary: string;
    ctaSecondary: string;
    plans: [
      {
        name: string;
        audience: string;
        monthlyPrice: string;
        annualPrice: string;
        blurb: string;
        highlight?: string;
        cta: string;
        bullets: [string, string, string, string];
      },
      {
        name: string;
        audience: string;
        monthlyPrice: string;
        annualPrice: string;
        blurb: string;
        highlight?: string;
        cta: string;
        bullets: [string, string, string, string];
      },
      {
        name: string;
        audience: string;
        monthlyPrice: string;
        annualPrice: string;
        blurb: string;
        highlight?: string;
        cta: string;
        bullets: [string, string, string, string];
      },
    ];
    includedTitle: string;
    includedItems: [string, string, string, string];
    comparisonTitle: string;
    comparisonRows: Array<{
      label: string;
      values: [string, string, string];
    }>;
  };
  portal: {
    title: string;
    subtitle: string;
    primaryCta: string;
    primaryCtaConnected: string;
    secondaryCta: string;
    quickLinks: [string, string, string];
    panelTitle: string;
    panelBody: string;
    steps: [
      { title: string; body: string },
      { title: string; body: string },
      { title: string; body: string },
    ];
    featuresHeader: string;
    featuresTitle: string;
    featuresBody: string;
    features: [
      { title: string; body: string },
      { title: string; body: string },
      { title: string; body: string },
    ];
  };
  signup: {
    eyebrow: string;
    title: string;
    subtitle: string;
    fullName: string;
    email: string;
    password: string;
    fullNamePlaceholder: string;
    emailPlaceholder: string;
    passwordPlaceholder: string;
    submit: string;
    pending: string;
  };
  login: {
    eyebrow: string;
    title: string;
    subtitle: string;
    email: string;
    password: string;
    emailPlaceholder: string;
    passwordPlaceholder: string;
    submit: string;
    pending: string;
    forgotPassword: string;
  };
  onboarding: {
    organizationEyebrow: string;
    organizationTitle: string;
    organizationSubtitle: string;
    summaryEyebrow: string;
    summaryTitle: string;
    summaryBody: string;
    summaryItems: [string, string, string];
    statusReady: string;
    statusPending: string;
    organizationStatus: string;
    providersStatus: string;
    desktopStatus: string;
    organizationName: string;
    organizationSlug: string;
    organizationNamePlaceholder: string;
    organizationSlugPlaceholder: string;
    saveOrganization: string;
    savingOrganization: string;
    providersEyebrow: string;
    providersTitle: string;
    providersSubtitle: string;
    provider: string;
    secret: string;
    secretPlaceholder: string;
    addProvider: string;
    addingProvider: string;
    noProvider: string;
    secretPrefix: string;
    desktopEyebrow: string;
    desktopTitle: string;
    desktopSubtitle: string;
    openDesktop: string;
    backToPortal: string;
    plans: [
      { label: string; detail: string },
      { label: string; detail: string },
      { label: string; detail: string },
    ];
  };
  forgotPassword: {
    eyebrow: string;
    title: string;
    subtitle: string;
    email: string;
    emailPlaceholder: string;
    submit: string;
    pending: string;
    success: string;
    backToLogin: string;
  };
  resetPassword: {
    eyebrow: string;
    title: string;
    subtitle: string;
    newPassword: string;
    confirmPassword: string;
    newPasswordPlaceholder: string;
    confirmPasswordPlaceholder: string;
    missingToken: string;
    mismatch: string;
    submit: string;
    pending: string;
    success: string;
    backToLogin: string;
  };
  verifyEmail: {
    eyebrow: string;
    title: string;
    subtitle: string;
    pending: string;
    success: string;
    missingToken: string;
    continueToLogin: string;
  };
};

const en: CloudCopy = {
  nav: { home: "Home", pricing: "Pricing", signUp: "Sign up", logIn: "Log in" },
  shared: {
    authPanelEyebrow: "Chatons Cloud",
    authPanelTitle: "A cloud workspace built for real team continuity.",
    authPanelBody:
      "Keep projects, conversations, and organization-managed access in one place while the desktop stays fast and focused.",
    authPanelItems: [
      {
        title: "Shared workspaces",
        body: "Teams collaborate in the same projects, threads, and environment.",
      },
      {
        title: "Persistent conversations",
        body: "Cloud conversations stay available across devices and working sessions.",
      },
      {
        title: "Organization-managed access",
        body: "Provider access lives with the organization instead of each individual machine.",
      },
    ],
  },
  pricing: {
    eyebrow: "Pricing",
    title: "Simple cloud pricing for durable AI work.",
    subtitle:
      "From a focused solo setup to a high-capacity shared workspace, choose the plan that fits how your team runs work in parallel.",
    monthlyLabel: "Monthly",
    annualLabel: "Annual",
    annualNote: "Save about 17% with annual billing",
    primaryCta: "Start with Chatons Cloud",
    secondaryCta: "See cloud setup",
    compareLabel: "Compare plans",
    priceSuffix: "/month",
    includedLabel: "Included with every plan",
    includedItemsIntro: "Shared workspace, shared projects, organization-managed access, and cloud conversations that stay available when your team signs off.",
    comparisonSubtitle: "A quick view of what changes as your team needs more capacity.",
    ctaTitle: "Ready to set up your cloud workspace?",
    ctaBody: "Create your organization, connect providers, and start running shared conversations in minutes.",
    ctaPrimary: "Get started",
    ctaSecondary: "View cloud overview",
    plans: [
      {
        name: "Plus",
        audience: "For solo builders and tiny teams",
        monthlyPrice: "$19",
        annualPrice: "$16",
        blurb: "A focused starting point for individuals and small teams moving one cloud workflow at a time.",
        cta: "Start on Plus",
        bullets: [
          "1 parallel cloud runtime session",
          "Shared cloud projects and conversations",
          "Organization-owned provider credentials",
          "Email support",
        ],
      },
      {
        name: "Pro",
        audience: "For active teams shipping every day",
        monthlyPrice: "$49",
        annualPrice: "$41",
        blurb: "The default choice for teams that need room for collaboration, handoffs, and long-running work.",
        highlight: "Best value",
        cta: "Choose Pro",
        bullets: [
          "3 parallel cloud runtime sessions",
          "Faster handoffs across shared threads",
          "Best for 2 to 6 active collaborators",
          "Priority email support",
        ],
      },
      {
        name: "Max",
        audience: "For larger teams and heavy runtime usage",
        monthlyPrice: "$149",
        annualPrice: "$124",
        blurb: "High-capacity cloud execution for organizations running multiple workflows and teams in parallel.",
        cta: "Talk to us about Max",
        bullets: [
          "10 parallel cloud runtime sessions",
          "Room for multiple long-running jobs at once",
          "Best for operations, support, and engineering together",
          "Priority support with onboarding help",
        ],
      },
    ],
    includedTitle: "Included in every plan",
    includedItems: [
      "Shared organizations and projects",
      "Persistent cloud conversations",
      "Organization-managed providers",
      "Desktop and browser access",
    ],
    comparisonTitle: "What changes between plans",
    comparisonRows: [
      {
        label: "Parallel cloud sessions",
        values: ["1", "3", "10"],
      },
      {
        label: "Ideal team size",
        values: ["1 to 2 people", "2 to 6 people", "6+ people"],
      },
      {
        label: "Support",
        values: ["Email", "Priority email", "Priority + onboarding"],
      },
    ],
  },
  portal: {
    title: "Chatons for teams, with a runtime that stays online.",
    subtitle:
      "Sync your workspace, collaborate on projects and conversations, and run cloud threads that keep going after your desktop closes.",
    primaryCta: "Get started",
    primaryCtaConnected: "Continue setup",
    secondaryCta: "Log in",
    quickLinks: ["Settings sync", "Shared projects", "Organization providers"],
    panelTitle: "Organization-owned cloud control plane",
    panelBody:
      "Providers, shared projects and long-running conversations live in one place.",
    steps: [
      {
        title: "Create your Chatons account",
        body: "Connect desktop Chatons to your cloud workspace.",
      },
      {
        title: "Create your organization",
        body: "Set up the shared workspace for your team.",
      },
      {
        title: "Connect providers",
        body: "Keep provider access and secrets at the organization level.",
      },
    ],
    featuresHeader: "Why cloud",
    featuresTitle: "Designed for shared, durable work.",
    featuresBody:
      "Keep the desktop fast and polished while the workspace, runtime and provider access stay in the cloud.",
    features: [
      {
        title: "Synced workspace",
        body: "Projects, settings and cloud state stay consistent across devices.",
      },
      {
        title: "Shared conversations",
        body: "Collaborate on the same projects and threads with your team.",
      },
      {
        title: "Runs after you close the laptop",
        body: "Cloud conversations continue remotely until the work is done.",
      },
    ],
  },
  signup: {
    eyebrow: "Sign up",
    title: "Create your Chatons account",
    subtitle:
      "This is the account your desktop app will connect to after browser login.",
    fullName: "Full name",
    email: "Email",
    password: "Password",
    fullNamePlaceholder: "Ada Lovelace",
    emailPlaceholder: "ada@team.dev",
    passwordPlaceholder: "At least 8 characters",
    submit: "Continue to organization setup",
    pending: "Creating account...",
  },
  login: {
    eyebrow: "Log in",
    title: "Return to your cloud workspace",
    subtitle:
      "Sign back into your Chatons Cloud workspace and continue organization onboarding from the browser.",
    email: "Email",
    password: "Password",
    emailPlaceholder: "ada@team.dev",
    passwordPlaceholder: "Your password",
    submit: "Continue",
    pending: "Signing in...",
    forgotPassword: "Forgot your password?",
  },
  onboarding: {
    organizationEyebrow: "Organization setup",
    organizationTitle: "Create your shared cloud workspace",
    organizationSubtitle:
      "Projects, permissions, runtime quotas, providers and secrets live at the organization level.",
    summaryEyebrow: "Setup progress",
    summaryTitle: "Launch your workspace in three steps",
    summaryBody:
      "Set up the organization, connect at least one provider, then attach the desktop app to complete the workflow.",
    summaryItems: [
      "Choose the plan that fits your team's workflow",
      "Connect providers once for the entire organization",
      "Open the desktop app when everything is ready",
    ],
    statusReady: "Ready",
    statusPending: "Pending",
    organizationStatus: "Organization",
    providersStatus: "Providers",
    desktopStatus: "Desktop app",
    organizationName: "Organization name",
    organizationSlug: "Slug",
    organizationNamePlaceholder: "Acme Labs",
    organizationSlugPlaceholder: "acme-labs",
    saveOrganization: "Save organization",
    savingOrganization: "Saving organization...",
    providersEyebrow: "Providers",
    providersTitle: "Add organization-owned providers",
    providersSubtitle:
      "These credentials stay in the cloud. Desktop Chatons connects to the org, not directly to the provider, for cloud projects.",
    provider: "Provider",
    secret: "Secret or token",
    secretPlaceholder: "sk-live-...",
    addProvider: "Add provider",
    addingProvider: "Adding provider...",
    noProvider: "No provider configured yet.",
    secretPrefix: "Secret prefix:",
    desktopEyebrow: "Desktop connection",
    desktopTitle: "Connect your desktop app",
    desktopSubtitle:
      "Once your org and provider are ready, the desktop app can attach through the browser and preserve the cloud session locally.",
    openDesktop: "Open in desktop Chatons",
    backToPortal: "Back to cloud portal",
    plans: [
      { label: "Plus", detail: "Great for a small shared workspace" },
      { label: "Pro", detail: "For active teams with multiple live sessions" },
      {
        label: "Max",
        detail: "For larger orgs and heavier runtime concurrency",
      },
    ],
  },
  forgotPassword: {
    eyebrow: "Password recovery",
    title: "Reset your password",
    subtitle:
      "Enter your email address and we will send you a reset link if the account exists.",
    email: "Email",
    emailPlaceholder: "ada@team.dev",
    submit: "Send reset link",
    pending: "Sending...",
    success: "If an account exists for this email, a reset link has been sent.",
    backToLogin: "Back to login",
  },
  resetPassword: {
    eyebrow: "Set a new password",
    title: "Choose a new password",
    subtitle: "This link is single-use and expires automatically.",
    newPassword: "New password",
    confirmPassword: "Confirm password",
    newPasswordPlaceholder: "At least 8 characters",
    confirmPasswordPlaceholder: "Repeat password",
    missingToken: "Missing reset token.",
    mismatch: "Passwords must match.",
    submit: "Reset password",
    pending: "Resetting...",
    success: "Your password has been reset. You can now sign in again.",
    backToLogin: "Back to login",
  },
  verifyEmail: {
    eyebrow: "Email verification",
    title: "Confirm your email",
    subtitle:
      "We use email verification to secure account recovery and desktop binding.",
    pending: "Verifying your email...",
    success: "Your email is now verified.",
    missingToken: "Missing verification token.",
    continueToLogin: "Continue to login",
  },
};

const cloudCopies: Partial<Record<LanguageCode, CloudCopy>> = {
  en,
  fr: {
    ...en,
    nav: { home: "Accueil", pricing: "Tarifs", signUp: "Créer un compte", logIn: "Se connecter" },
    portal: {
      ...en.portal,
      title: "Chatons pour les équipes, avec un runtime qui reste en ligne.",
      subtitle:
        "Retrouvez votre espace de travail, collaborez sur les projets et les conversations, et laissez les threads cloud continuer même quand votre desktop est fermé.",
      primaryCta: "Commencer",
      primaryCtaConnected: "Poursuivre la configuration",
      secondaryCta: "Se connecter",
      quickLinks: [
        "Réglages synchronisés",
        "Projets partagés",
        "Fournisseurs d'organisation",
      ],
      panelTitle: "Un control plane cloud piloté par l'organisation",
      panelBody:
        "Fournisseurs, projets partagés et conversations longues durées sont centralisés au même endroit.",
      steps: [
        {
          title: "Créer votre compte cloud",
          body: "Reliez Chatons Desktop à votre espace cloud.",
        },
        {
          title: "Créer votre organisation",
          body: "Mettez en place l'espace partagé de votre équipe.",
        },
        {
          title: "Ajouter les fournisseurs",
          body: "Gardez les accès et secrets IA au niveau de l'organisation.",
        },
      ],
      featuresHeader: "Pourquoi le cloud",
      featuresTitle: "Pensé pour un travail partagé et durable.",
      featuresBody:
        "Le desktop reste fluide pendant que l'espace de travail, le runtime et les accès fournisseurs vivent dans le cloud.",
      features: [
        {
          title: "Workspace synchronisé",
          body: "Projets, réglages et état cloud restent cohérents d'un appareil à l'autre.",
        },
        {
          title: "Conversations partagées",
          body: "Travaillez à plusieurs dans les mêmes projets et fils de discussion.",
        },
        {
          title: "Continue après fermeture",
          body: "Les conversations cloud poursuivent leur exécution à distance jusqu'au résultat.",
        },
      ],
    },
    signup: {
      ...en.signup,
      eyebrow: "Créer un compte",
      title: "Créer votre compte cloud",
      subtitle:
        "C'est ce compte que l'application desktop reliera après la connexion dans le navigateur.",
      fullName: "Nom complet",
      password: "Mot de passe",
      passwordPlaceholder: "8 caractères minimum",
      submit: "Passer à la configuration de l'organisation",
      pending: "Création du compte...",
    },
    login: {
      ...en.login,
      eyebrow: "Connexion",
      title: "Retour à votre espace cloud",
      subtitle:
        "Reconnectez-vous à votre espace Chatons Cloud et reprenez la configuration de l'organisation dans le navigateur.",
      password: "Mot de passe",
      passwordPlaceholder: "Votre mot de passe",
      submit: "Continuer",
      pending: "Connexion...",
      forgotPassword: "Mot de passe oublié ?",
    },
    onboarding: {
      ...en.onboarding,
      organizationEyebrow: "Configuration de l'organisation",
      organizationTitle: "Créez votre espace cloud partagé",
      organizationSubtitle:
        "Projets, permissions, quotas runtime, fournisseurs et secrets sont gérés au niveau de l'organisation.",
      organizationName: "Nom de l'organisation",
      saveOrganization: "Enregistrer l'organisation",
      savingOrganization: "Enregistrement...",
      providersEyebrow: "Fournisseurs",
      providersTitle: "Ajouter des fournisseurs au niveau de l'organisation",
      providersSubtitle:
        "Ces identifiants restent dans le cloud. Pour les projets cloud, Chatons Desktop se connecte à l'organisation, pas directement au fournisseur.",
      secret: "Secret ou jeton",
      addProvider: "Ajouter le fournisseur",
      addingProvider: "Ajout en cours...",
      noProvider: "Aucun fournisseur configuré pour le moment.",
      secretPrefix: "Préfixe du secret :",
      desktopEyebrow: "Connexion desktop",
      desktopTitle: "Connecter l'application desktop",
      desktopSubtitle:
        "Une fois l'organisation et le fournisseur prêts, l'application desktop peut se lier via le navigateur et conserver la session cloud localement.",
      openDesktop: "Ouvrir dans Chatons Desktop",
      backToPortal: "Retour au portail cloud",
      plans: [
        { label: "Plus", detail: "Parfait pour un petit espace partagé" },
        {
          label: "Pro",
          detail: "Pour une équipe active avec plusieurs sessions en parallèle",
        },
        {
          label: "Max",
          detail:
            "Pour des organisations plus larges et davantage de concurrence runtime",
        },
      ],
    },
    forgotPassword: {
      ...en.forgotPassword,
      eyebrow: "Récupération du mot de passe",
      title: "Réinitialiser votre mot de passe",
      subtitle:
        "Saisissez votre adresse e-mail et nous vous enverrons un lien si le compte existe.",
      submit: "Envoyer le lien",
      pending: "Envoi...",
      success:
        "Si un compte existe pour cette adresse, un lien de réinitialisation a été envoyé.",
      backToLogin: "Retour à la connexion",
    },
    resetPassword: {
      ...en.resetPassword,
      eyebrow: "Nouveau mot de passe",
      title: "Choisissez un nouveau mot de passe",
      subtitle:
        "Ce lien ne peut être utilisé qu'une fois et expire automatiquement.",
      newPassword: "Nouveau mot de passe",
      confirmPassword: "Confirmer le mot de passe",
      newPasswordPlaceholder: "8 caractères minimum",
      confirmPasswordPlaceholder: "Répéter le mot de passe",
      missingToken: "Jeton de réinitialisation manquant.",
      mismatch: "Les mots de passe doivent être identiques.",
      submit: "Réinitialiser le mot de passe",
      pending: "Réinitialisation...",
      success:
        "Votre mot de passe a bien été réinitialisé. Vous pouvez vous reconnecter.",
      backToLogin: "Retour à la connexion",
    },
    verifyEmail: {
      ...en.verifyEmail,
      eyebrow: "Vérification de l'e-mail",
      title: "Confirmez votre adresse e-mail",
      subtitle:
        "La vérification e-mail sécurise la récupération du compte et l'association avec le desktop.",
      pending: "Vérification de votre adresse...",
      success: "Votre adresse e-mail est maintenant vérifiée.",
      missingToken: "Jeton de vérification manquant.",
      continueToLogin: "Continuer vers la connexion",
    },
  },
  es: {
    ...en,
    nav: { home: "Inicio", pricing: "Precios", signUp: "Crear cuenta", logIn: "Iniciar sesión" },
    portal: {
      ...en.portal,
      title: "Chatons para equipos, con un runtime que sigue en marcha.",
      subtitle:
        "Sincroniza tu espacio de trabajo, colabora en proyectos y conversaciones, y deja que los hilos cloud sigan funcionando aunque cierres la app.",
      primaryCta: "Empezar",
      primaryCtaConnected: "Seguir con la configuración",
      secondaryCta: "Iniciar sesión",
      quickLinks: [
        "Ajustes sincronizados",
        "Proyectos compartidos",
        "Proveedores de la organización",
      ],
      panelTitle: "Plano de control cloud gestionado por la organización",
      panelBody:
        "Los proveedores, los proyectos compartidos y las conversaciones largas viven en un único sitio.",
      steps: [
        {
          title: "Crea tu cuenta cloud",
          body: "Conecta Chatons Desktop con tu espacio de trabajo cloud.",
        },
        {
          title: "Crea tu organización",
          body: "Prepara el espacio compartido para tu equipo.",
        },
        {
          title: "Conecta proveedores",
          body: "Mantén los accesos y secretos al nivel de la organización.",
        },
      ],
      featuresHeader: "Por qué cloud",
      featuresTitle: "Pensado para trabajo compartido y duradero.",
      featuresBody:
        "El escritorio sigue siendo ágil mientras el workspace, el runtime y el acceso a proveedores viven en la nube.",
      features: [
        {
          title: "Workspace sincronizado",
          body: "Proyectos, ajustes y estado cloud se mantienen consistentes entre dispositivos.",
        },
        {
          title: "Conversaciones compartidas",
          body: "Colaborad en los mismos proyectos e hilos con todo el equipo.",
        },
        {
          title: "Sigue aunque cierres el portátil",
          body: "Las conversaciones cloud continúan en remoto hasta terminar el trabajo.",
        },
      ],
    },
    signup: {
      ...en.signup,
      eyebrow: "Crear cuenta",
      title: "Crea tu cuenta cloud",
      subtitle:
        "Esta es la cuenta que enlazará tu app de escritorio después de iniciar sesión en el navegador.",
      fullName: "Nombre completo",
      password: "Contraseña",
      passwordPlaceholder: "Al menos 8 caracteres",
      submit: "Seguir con la configuración de la organización",
      pending: "Creando cuenta...",
    },
    login: {
      ...en.login,
      eyebrow: "Iniciar sesión",
      title: "Vuelve a tu espacio cloud",
      subtitle:
        "Entra de nuevo en tu workspace de Chatons Cloud y continúa la configuración de la organización desde el navegador.",
      password: "Contraseña",
      passwordPlaceholder: "Tu contraseña",
      submit: "Continuar",
      pending: "Entrando...",
      forgotPassword: "¿Has olvidado tu contraseña?",
    },
    onboarding: {
      ...en.onboarding,
      organizationEyebrow: "Configuración de la organización",
      organizationTitle: "Crea tu workspace cloud compartido",
      organizationSubtitle:
        "Proyectos, permisos, cuotas de runtime, proveedores y secretos viven a nivel de organización.",
      organizationName: "Nombre de la organización",
      saveOrganization: "Guardar organización",
      savingOrganization: "Guardando organización...",
      providersTitle: "Añade proveedores gestionados por la organización",
      providersSubtitle:
        "Estas credenciales se quedan en la nube. Para proyectos cloud, Chatons Desktop se conecta a la organización, no directamente al proveedor.",
      secret: "Secreto o token",
      addProvider: "Añadir proveedor",
      addingProvider: "Añadiendo proveedor...",
      noProvider: "Todavía no hay ningún proveedor configurado.",
      secretPrefix: "Prefijo del secreto:",
      desktopEyebrow: "Conexión con desktop",
      desktopTitle: "Conecta tu app de escritorio",
      desktopSubtitle:
        "Cuando la organización y el proveedor estén listos, la app de escritorio podrá enlazarse desde el navegador y conservar la sesión cloud localmente.",
      openDesktop: "Abrir en Chatons Desktop",
      backToPortal: "Volver al portal cloud",
      plans: [
        { label: "Plus", detail: "Ideal para un espacio compartido pequeño" },
        {
          label: "Pro",
          detail: "Para equipos activos con varias sesiones en vivo",
        },
        {
          label: "Max",
          detail: "Para organizaciones mayores y más concurrencia de runtime",
        },
      ],
    },
    forgotPassword: {
      ...en.forgotPassword,
      eyebrow: "Recuperación de contraseña",
      title: "Restablece tu contraseña",
      subtitle:
        "Escribe tu correo y te enviaremos un enlace si la cuenta existe.",
      submit: "Enviar enlace de restablecimiento",
      pending: "Enviando...",
      success:
        "Si existe una cuenta para este correo, hemos enviado un enlace de restablecimiento.",
      backToLogin: "Volver al acceso",
    },
    resetPassword: {
      ...en.resetPassword,
      eyebrow: "Nueva contraseña",
      title: "Elige una nueva contraseña",
      subtitle:
        "Este enlace solo se puede usar una vez y caduca automáticamente.",
      newPassword: "Nueva contraseña",
      confirmPassword: "Confirmar contraseña",
      newPasswordPlaceholder: "Al menos 8 caracteres",
      confirmPasswordPlaceholder: "Repite la contraseña",
      missingToken: "Falta el token de restablecimiento.",
      mismatch: "Las contraseñas deben coincidir.",
      submit: "Restablecer contraseña",
      pending: "Restableciendo...",
      success:
        "Tu contraseña se ha restablecido. Ya puedes iniciar sesión otra vez.",
      backToLogin: "Volver al acceso",
    },
    verifyEmail: {
      ...en.verifyEmail,
      eyebrow: "Verificación de correo",
      title: "Confirma tu correo electrónico",
      subtitle:
        "La verificación por correo protege la recuperación de la cuenta y el enlace con la app de escritorio.",
      pending: "Verificando tu correo...",
      success: "Tu correo ya está verificado.",
      missingToken: "Falta el token de verificación.",
      continueToLogin: "Ir al acceso",
    },
  },
  de: {
    ...en,
    nav: { home: "Start", pricing: "Preise", signUp: "Registrieren", logIn: "Anmelden" },
    portal: {
      ...en.portal,
      title: "Chatons für Teams, mit einer Runtime, die online bleibt.",
      subtitle:
        "Synchronisiert euren Workspace, arbeitet gemeinsam an Projekten und Gesprächen und lasst Cloud-Threads weiterlaufen, auch wenn der Desktop schon zu ist.",
      primaryCta: "Loslegen",
      primaryCtaConnected: "Setup fortsetzen",
      secondaryCta: "Anmelden",
      quickLinks: [
        "Synchronisierte Einstellungen",
        "Geteilte Projekte",
        "Anbieter der Organisation",
      ],
      panelTitle: "Cloud-Control-Plane auf Organisationsebene",
      panelBody:
        "Anbieter, geteilte Projekte und lang laufende Konversationen liegen zentral an einem Ort.",
      steps: [
        {
          title: "Cloud-Konto anlegen",
          body: "Verbindet Chatons Desktop mit eurem Cloud-Workspace.",
        },
        {
          title: "Organisation erstellen",
          body: "Richtet den gemeinsamen Workspace für euer Team ein.",
        },
        {
          title: "Anbieter verbinden",
          body: "Verwaltet Zugänge und Secrets auf Organisationsebene.",
        },
      ],
      featuresHeader: "Warum Cloud",
      featuresTitle: "Für gemeinsame, dauerhafte Arbeit gebaut.",
      featuresBody:
        "Der Desktop bleibt schlank, während Workspace, Runtime und Provider-Zugänge in der Cloud liegen.",
      features: [
        {
          title: "Synchronisierter Workspace",
          body: "Projekte, Einstellungen und Cloud-Status bleiben auf allen Geräten konsistent.",
        },
        {
          title: "Geteilte Konversationen",
          body: "Arbeitet gemeinsam in denselben Projekten und Threads.",
        },
        {
          title: "Läuft weiter, wenn der Laptop zu ist",
          body: "Cloud-Konversationen arbeiten remote weiter, bis das Ergebnis da ist.",
        },
      ],
    },
    signup: {
      ...en.signup,
      eyebrow: "Registrieren",
      title: "Cloud-Konto erstellen",
      subtitle:
        "Mit diesem Konto verbindet sich eure Desktop-App nach dem Browser-Login.",
      fullName: "Vollständiger Name",
      password: "Passwort",
      passwordPlaceholder: "Mindestens 8 Zeichen",
      submit: "Weiter zur Organisations-Einrichtung",
      pending: "Konto wird erstellt...",
    },
    login: {
      ...en.login,
      eyebrow: "Anmelden",
      title: "Zurück zu eurem Cloud-Workspace",
      subtitle:
        "Meldet euch wieder bei Chatons Cloud an und setzt das Organisations-Setup im Browser fort.",
      password: "Passwort",
      passwordPlaceholder: "Euer Passwort",
      submit: "Weiter",
      pending: "Anmeldung läuft...",
      forgotPassword: "Passwort vergessen?",
    },
    onboarding: {
      ...en.onboarding,
      organizationEyebrow: "Organisation einrichten",
      organizationTitle: "Euren geteilten Cloud-Workspace erstellen",
      organizationSubtitle:
        "Projekte, Rechte, Runtime-Quoten, Anbieter und Secrets werden auf Organisationsebene verwaltet.",
      organizationName: "Name der Organisation",
      saveOrganization: "Organisation speichern",
      savingOrganization: "Organisation wird gespeichert...",
      providersTitle: "Anbieter für die Organisation hinzufügen",
      providersSubtitle:
        "Diese Zugangsdaten bleiben in der Cloud. Für Cloud-Projekte verbindet sich Chatons Desktop mit der Organisation, nicht direkt mit dem Anbieter.",
      secret: "Secret oder Token",
      addProvider: "Anbieter hinzufügen",
      addingProvider: "Anbieter wird hinzugefügt...",
      noProvider: "Noch kein Anbieter eingerichtet.",
      secretPrefix: "Secret-Präfix:",
      desktopEyebrow: "Desktop-Verbindung",
      desktopTitle: "Desktop-App verbinden",
      desktopSubtitle:
        "Sobald Organisation und Anbieter bereit sind, kann sich die Desktop-App über den Browser anbinden und die Cloud-Sitzung lokal behalten.",
      openDesktop: "In Chatons Desktop öffnen",
      backToPortal: "Zurück zum Cloud-Portal",
      plans: [
        { label: "Plus", detail: "Gut für einen kleinen geteilten Workspace" },
        {
          label: "Pro",
          detail: "Für aktive Teams mit mehreren laufenden Sessions",
        },
        {
          label: "Max",
          detail: "Für größere Organisationen und mehr Runtime-Konkurrenz",
        },
      ],
    },
    forgotPassword: {
      ...en.forgotPassword,
      eyebrow: "Passwort zurücksetzen",
      title: "Passwort zurücksetzen",
      subtitle:
        "Gebt eure E-Mail-Adresse ein. Falls ein Konto existiert, senden wir euch einen Link.",
      submit: "Link senden",
      pending: "Wird gesendet...",
      success:
        "Falls es für diese E-Mail ein Konto gibt, wurde ein Reset-Link verschickt.",
      backToLogin: "Zurück zur Anmeldung",
    },
    resetPassword: {
      ...en.resetPassword,
      eyebrow: "Neues Passwort",
      title: "Neues Passwort festlegen",
      subtitle: "Dieser Link ist nur einmal gültig und läuft automatisch ab.",
      newPassword: "Neues Passwort",
      confirmPassword: "Passwort bestätigen",
      newPasswordPlaceholder: "Mindestens 8 Zeichen",
      confirmPasswordPlaceholder: "Passwort wiederholen",
      missingToken: "Reset-Token fehlt.",
      mismatch: "Die Passwörter müssen übereinstimmen.",
      submit: "Passwort zurücksetzen",
      pending: "Wird zurückgesetzt...",
      success:
        "Euer Passwort wurde zurückgesetzt. Ihr könnt euch jetzt wieder anmelden.",
      backToLogin: "Zurück zur Anmeldung",
    },
    verifyEmail: {
      ...en.verifyEmail,
      eyebrow: "E-Mail-Bestätigung",
      title: "E-Mail-Adresse bestätigen",
      subtitle:
        "Die E-Mail-Bestätigung schützt Kontowiederherstellung und Desktop-Verknüpfung.",
      pending: "E-Mail wird bestätigt...",
      success: "Eure E-Mail-Adresse ist jetzt bestätigt.",
      missingToken: "Bestätigungs-Token fehlt.",
      continueToLogin: "Weiter zur Anmeldung",
    },
  },
};

export function getCloudCopy(languageCode: LanguageCode): CloudCopy {
  return cloudCopies[languageCode] ?? en;
}
