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

export async function generateConversationTitleFromPi(params: {
  provider: string;
  modelId: string;
  repoPath: string;
  firstMessage: string;
  runPiExec: RunPiExec;
  getPiBinaryPath: GetPiBinaryPath;
}): Promise<string | null> {
  const piPath = params.getPiBinaryPath();
  if (!piPath || !fs.existsSync(piPath)) {
    return null;
  }

  const prompt = generateConversationTitlePrompt(params.firstMessage);
  const modelKey = `${params.provider}/${params.modelId}`;
  const primary = await params.runPiExec(
    ["--model", modelKey, "-p", prompt],
    20_000,
    params.repoPath,
  );
  const result = primary.ok
    ? primary
    : await params.runPiExec(
      ["-m", modelKey, "-p", prompt],
      20_000,
      params.repoPath,
    );
  if (!result.ok) {
    return null;
  }

  return sanitiserTitreStrict(result.stdout);
}
