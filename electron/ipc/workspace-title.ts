import fs from "node:fs";

type RunPiExec = (
  args: string[],
  timeoutMs?: number,
  cwd?: string,
) => Promise<{ ok: boolean; stdout: string }>;

type GetPiBinaryPath = () => string | null;

const LONGUEUR_MAX_TITRE = 60;
const NOMBRE_MOTS_MIN_TITRE = 3;
const NOMBRE_MOTS_MAX_TITRE = 7;
export const AFFINAGE_TITRE_IA_ACTIVE = true;
const MODELES_TITRE_PREFERES = [
  "openai-codex/gpt-5.3-codex",
  "openai-codex/gpt-5.2-codex",
  "openai-codex/gpt-5.1-codex",
] as const;

function normaliserTitre(raw: string): string {
  return raw
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

function compterMots(texte: string): number {
  return texte.split(/\s+/).filter((mot) => mot.trim().length > 0).length;
}

function tronquerTitreParMots(texte: string, longueurMax: number): string {
  const mots = texte.split(/\s+/).filter((mot) => mot.trim().length > 0);
  let resultat = "";
  for (const mot of mots) {
    const candidat = resultat.length === 0 ? mot : `${resultat} ${mot}`;
    if (candidat.length > longueurMax) {
      break;
    }
    resultat = candidat;
  }
  return resultat.trim();
}

function sanitiserTitreStrict(raw: string): string | null {
  const normalise = normaliserTitre(raw);
  if (!normalise) {
    return null;
  }
  const tronque = tronquerTitreParMots(normalise, LONGUEUR_MAX_TITRE);
  if (!tronque) {
    return null;
  }
  const mots = compterMots(tronque);
  if (mots < NOMBRE_MOTS_MIN_TITRE || mots > NOMBRE_MOTS_MAX_TITRE) {
    return null;
  }
  return tronque;
}

export function construireTitreDeterministe(firstMessage: string): string {
  const messageNettoye = firstMessage
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[\[\]{}()*_#>~|]/g, " ")
    .replace(/[^\p{L}\p{N}\s'’-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const mots = messageNettoye
    .split(/\s+/)
    .filter((mot) => mot.trim().length > 0);
  const base = mots.slice(0, NOMBRE_MOTS_MAX_TITRE).join(" ").trim();
  const titre = tronquerTitreParMots(base, LONGUEUR_MAX_TITRE);

  if (titre && compterMots(titre) >= NOMBRE_MOTS_MIN_TITRE) {
    return titre;
  }

  return "Nouvelle discussion";
}

function generateConversationTitlePrompt(firstMessage: string): string {
  return [
    "Tu génères un titre de fil de discussion.",
    "Contraintes strictes:",
    "- Répondre avec UN seul titre, sans guillemets.",
    "- 3 à 7 mots.",
    "- Maximum 60 caractères.",
    "- En français.",
    "",
    "Premier message utilisateur:",
    firstMessage,
  ].join("\n");
}

function extraireErreurPi(stdout: string): string | null {
  const texte = `${stdout ?? ""}`.trim();
  if (!texte) {
    return null;
  }
  const lignes = texte
    .split(/\r?\n/)
    .map((ligne) => ligne.trim())
    .filter(Boolean);
  if (lignes.length === 0) {
    return null;
  }
  const premiere = lignes[0] ?? "";
  return /^error[:\s]/i.test(premiere) ? premiere : null;
}

function choisirModelePourTitre(params: {
  preferredModelKey: string;
  availableModelKeys?: string[];
  fallbackModelKey?: string | null;
}): string[] {
  const disponibles = new Set(
    (params.availableModelKeys ?? []).filter((item) => typeof item === "string" && item.trim().length > 0),
  );
  const candidats: string[] = [];
  const ajouter = (value: string | null | undefined) => {
    const propre = typeof value === "string" ? value.trim() : "";
    if (!propre) return;
    if (disponibles.size > 0 && !disponibles.has(propre)) return;
    if (!candidats.includes(propre)) {
      candidats.push(propre);
    }
  };

  ajouter(params.preferredModelKey);
  for (const modelKey of MODELES_TITRE_PREFERES) {
    ajouter(modelKey);
  }
  ajouter(params.fallbackModelKey ?? null);

  if (candidats.length === 0 && disponibles.size > 0) {
    for (const modelKey of disponibles) {
      candidats.push(modelKey);
      break;
    }
  }

  return candidats;
}

export async function generateConversationTitleFromPi(params: {
  provider: string;
  modelId: string;
  repoPath: string;
  firstMessage: string;
  runPiExec: RunPiExec;
  getPiBinaryPath: GetPiBinaryPath;
  availableModelKeys?: string[];
  fallbackModelKey?: string | null;
  log?: (message: string, details?: Record<string, unknown>) => void;
}): Promise<string | null> {
  const piPath = params.getPiBinaryPath();
  if (!piPath || !fs.existsSync(piPath)) {
    params.log?.("Pi CLI unavailable for auto-title generation", {
      piPath,
    });
    return null;
  }

  const prompt = generateConversationTitlePrompt(params.firstMessage);
  const modelKey = `${params.provider}/${params.modelId}`;
  const modelesAChercher = choisirModelePourTitre({
    preferredModelKey: modelKey,
    availableModelKeys: params.availableModelKeys,
    fallbackModelKey: params.fallbackModelKey,
  });

  for (const modele of modelesAChercher) {
    const primaryArgs = ["--model", modele, "-p", prompt];
    const primary = await params.runPiExec(
      primaryArgs,
      20_000,
      params.repoPath,
    );
    let result = primary;
    let commandVariant = "--model";
    let fallbackResult: Awaited<ReturnType<RunPiExec>> | null = null;

    if (!primary.ok) {
      const fallbackArgs = ["-m", modele, "-p", prompt];
      fallbackResult = await params.runPiExec(
        fallbackArgs,
        20_000,
        params.repoPath,
      );
      result = fallbackResult;
      commandVariant = "-m";
    }

    if (!result.ok) {
      params.log?.("Auto-title generation command failed", {
        requestedModel: modele,
        repoPath: params.repoPath,
        attemptedVariants: primary.ok ? ["--model"] : ["--model", "-m"],
        selectedVariant: commandVariant,
        primaryOk: primary.ok,
        primaryStdoutPreview: normaliserTitre(primary.stdout).slice(0, 300),
        fallbackOk: fallbackResult?.ok ?? null,
        fallbackStdoutPreview: normaliserTitre(fallbackResult?.stdout ?? "").slice(0, 300),
        promptPreview: normaliserTitre(prompt).slice(0, 200),
      });
      continue;
    }

    const erreurPi = extraireErreurPi(result.stdout);
    if (erreurPi) {
      params.log?.("Auto-title generation returned CLI error text", {
        requestedModel: modele,
        repoPath: params.repoPath,
        commandVariant,
        primaryOk: primary.ok,
        fallbackOk: fallbackResult?.ok ?? null,
        error: erreurPi,
        rawOutputPreview: normaliserTitre(result.stdout).slice(0, 300),
      });
      continue;
    }

    const titre = sanitiserTitreStrict(result.stdout);
    if (titre) {
      return titre;
    }

    params.log?.("Auto-title generation returned unusable title", {
      requestedModel: modele,
      rawOutputPreview: normaliserTitre(result.stdout).slice(0, 160),
    });
  }

  return null;
}
